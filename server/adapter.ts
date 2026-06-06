import { getDb } from "./db.ts";
import {
  addEvent,
  addMessage,
  getTask,
  hhmm,
  iso,
  ownerAgentId,
  setAgentStatus,
  setTaskStatus,
  touchRun,
  uid,
} from "./store.ts";
import type { RealRunOptions } from "./agentCli.ts";
import { isRealProvider } from "./agentCli.ts";
import { runRealTask } from "./realAdapter.ts";

const J = (v: unknown) => JSON.stringify(v ?? []);

/**
 * Simulated coding agent. Drives one task from ready -> running -> review,
 * producing a full evidence trail (delegated run + activity events + channel
 * messages + a review gate + inbox decisions) that persists in SQLite.
 *
 * This is the "mocked execution" path the MVP ships with. A real adapter would
 * implement the same contract by shelling out to `codex exec` / `claude -p`
 * inside an isolated worktree and importing the resulting diff and test output.
 */
export async function runTask(
  runId: string,
  taskId: string,
  options: RealRunOptions = {},
): Promise<{ ok: boolean; reason?: string }> {
  if (isRealProvider(options.provider)) {
    return runRealTask(runId, taskId, options);
  }
  return runSimulatedTask(runId, taskId);
}

function runSimulatedTask(runId: string, taskId: string): { ok: boolean; reason?: string } {
  const db = getDb();
  const task = getTask(runId, taskId);
  if (!task) return { ok: false, reason: "task_not_found" };

  const run = db.prepare("SELECT plan_approved FROM runs WHERE id = ?").get(runId) as any;
  if (!run?.plan_approved) return { ok: false, reason: "plan_not_approved" };
  if (task.status === "review" || task.status === "done") {
    return { ok: false, reason: "already_handled" };
  }

  const coder = ownerAgentId(runId, "coder");
  const files = task.fileScope.length ? task.fileScope : ["src/index.ts"];
  const drunId = uid("drun");

  const tx = db.transaction(() => {
    // 1. Delegated run record (Codex worker in an isolated worktree).
    db.prepare(
      `INSERT INTO delegated_runs
        (id, run_id, task_id, agent_id, provider, model, role, branch, worktree,
         status, progress, budget_tier, budget_max_minutes, budget_token_policy,
         approval_policy, current_step, next_step, evidence, assigned_at, last_heartbeat)
       VALUES (@id,@run,@task,@agent,'codex','GPT-5.4','coder',@branch,@wt,
               'running',10,'standard',25,'scout report + file scope + current errors',
               'scoped_writes',@step,'Run build and tests',@ev,@ts,@ts)`,
    ).run({
      id: drunId,
      run: runId,
      task: taskId,
      agent: coder,
      branch: `agent/codex-impl-${taskId.slice(-6)}`,
      wt: `../agentteam-codex-${taskId.slice(-6)}`,
      step: `Editing ${files[0]}`,
      ev: J(files),
      ts: hhmm(),
    });

    // 2. Task + agent move to running.
    setTaskStatus(runId, taskId, "running", `Coder implementing ${task.title}.`);
    setAgentStatus(coder, "running", `Implementing ${task.title}`, taskId);
    addMessage(runId, "task_started", coder, `Started ${task.title}. Writing only inside declared scope.`, taskId);

    // 3. Evidence trail.
    addEvent(runId, "reasoning", coder, "Plan of attack", `Identified change points for ${task.title}.`, { taskId });
    addEvent(runId, "command_run", coder, "Searched code", "Located insertion points and dependencies.", {
      taskId,
      command: `rg --files-with-matches "${task.title.split(" ")[0]}" src`,
    });
    addEvent(runId, "command_result", coder, "Search complete", `${files.length} file(s) in scope.`, { taskId, status: "success" });
    addEvent(runId, "file_changed", coder, "Applied edits", `Edited ${files.length} file(s) for ${task.title}.`, {
      taskId,
      files,
      status: "success",
    });
    addEvent(runId, "test_run", ownerAgentId(runId, "tester"), "Ran checks", "Build passed; smoke test simulated.", {
      taskId,
      command: "npm run build && npm test",
      status: "success",
    });

    // 4. Review gate with diff + tests + risk.
    db.prepare(
      `INSERT INTO review_gates
        (id, run_id, task_id, status, changed_files, diff_summary, tests, risk_notes, reviewer_verdict, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(run_id, task_id) DO UPDATE SET
         status='pending', changed_files=excluded.changed_files,
         diff_summary=excluded.diff_summary, tests=excluded.tests,
         risk_notes=excluded.risk_notes, reviewer_verdict=excluded.reviewer_verdict,
         updated_at=excluded.updated_at`,
    ).run(
      uid("gate"),
      runId,
      taskId,
      "pending",
      J(files),
      J([
        `Implemented ${task.title}.`,
        `Touched ${files.length} file(s) within declared scope.`,
        "Added guard for the primary failure path.",
      ]),
      J([
        { command: "npm run build", result: "passed", summary: "Type check and build succeeded." },
        { command: "npm test", result: "passed", summary: "Smoke checks passed." },
      ]),
      J([
        task.risk === "high" ? "High-risk change: verify edge cases before ship." : "Standard-risk change.",
        "Confirm no writes leaked outside the declared file scope.",
      ]),
      "Approve if diff matches scope and tests stay green.",
      iso(),
      iso(),
    );

    // 5. Task -> review; reviewer active.
    setTaskStatus(runId, taskId, "review", "Implementation handed to review gate.");
    setAgentStatus(coder, "idle", "Handed off to review");
    setAgentStatus(ownerAgentId(runId, "reviewer"), "reviewing", `Reviewing ${task.title}`, taskId);
    addMessage(runId, "review_completed", ownerAgentId(runId, "reviewer"), `${task.title} ready for review. Diff and tests attached.`, taskId);

    // 6. Inbox: review the diff + accept a follow-up.
    db.prepare(
      `INSERT INTO inbox_items (id, run_id, type, title, summary, agent_id, task_id, priority, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      uid("inbox"),
      runId,
      "review_diff",
      `Review diff: ${task.title}`,
      `Coder finished ${task.title}. Diff and tests are ready at the review gate.`,
      ownerAgentId(runId, "reviewer"),
      taskId,
      "high",
      "open",
      iso(),
    );
    db.prepare(
      `INSERT INTO inbox_items (id, run_id, type, title, summary, agent_id, task_id, priority, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      uid("inbox"),
      runId,
      "accept_follow_up",
      `Accept follow-up for ${task.title}`,
      "Tester suggests a follow-up task to harden an uncovered edge case.",
      ownerAgentId(runId, "tester"),
      taskId,
      "normal",
      "open",
      iso(),
    );

    // 7. Delegated run completed.
    db.prepare(
      "UPDATE delegated_runs SET status = 'completed', progress = 100, current_step = ?, next_step = 'Awaiting review gate', last_heartbeat = ?, completed_at = ? WHERE id = ?",
    ).run("Diff and tests ready", hhmm(), iso(), drunId);

    db.prepare("UPDATE runs SET run_status = 'review', selected_task_id = ? WHERE id = ?").run(taskId, runId);
    touchRun(runId);
  });
  tx();
  return { ok: true };
}

/** Start the first ready task (used by the global Run action). */
export async function runNextReadyTask(
  runId: string,
  options: RealRunOptions = {},
): Promise<{ ok: boolean; reason?: string; taskId?: string }> {
  const row = getDb()
    .prepare(
      "SELECT id FROM tasks WHERE run_id = ? AND status = 'ready' ORDER BY sort_order, rowid LIMIT 1",
    )
    .get(runId) as { id: string } | undefined;
  if (!row) return { ok: false, reason: "no_ready_task" };
  const result = await runTask(runId, row.id, options);
  return { ...result, taskId: row.id };
}
