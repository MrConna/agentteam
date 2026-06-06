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
import {
  buildCliCommand,
  executeCliCommand,
  isRealProvider,
  type RealRunOptions,
} from "./agentCli.ts";
import { createRunResult, createTaskPacket } from "./runArtifacts.ts";

const J = (v: unknown) => JSON.stringify(v ?? []);

export async function runRealTask(
  runId: string,
  taskId: string,
  options: RealRunOptions,
): Promise<{ ok: boolean; reason?: string }> {
  const provider = options.provider;
  if (!isRealProvider(provider)) return { ok: false, reason: "bad_provider" };

  const db = getDb();
  const task = getTask(runId, taskId);
  if (!task) return { ok: false, reason: "task_not_found" };

  const run = db.prepare("SELECT plan_approved FROM runs WHERE id = ?").get(runId) as any;
  if (!run?.plan_approved) return { ok: false, reason: "plan_not_approved" };
  if (task.status === "review" || task.status === "done") {
    return { ok: false, reason: "already_handled" };
  }

  const coder = ownerAgentId(runId, "coder");
  const model = options.model?.trim() || defaultModel(provider);
  const branch = `agent/${provider}-${taskId.slice(-6)}`;
  const worktree = options.worktree?.trim() || `../agentteam-${provider}-${taskId.slice(-6)}`;
  const drunId = uid("drun");
  const command = buildCliCommand({
    provider,
    task,
    runId,
    worktree,
    prompt: options.prompt,
    model,
  });
  const packet = createTaskPacket({ runId, task, provider, model, branch, worktree, command });

  const startTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO delegated_runs
        (id, run_id, task_id, agent_id, provider, model, role, branch, worktree,
         status, progress, budget_tier, budget_max_minutes, budget_token_policy,
         approval_policy, current_step, next_step, evidence, assigned_at, last_heartbeat)
       VALUES (@id,@run,@task,@agent,@provider,@model,'coder',@branch,@wt,
               'running',10,'standard',25,'task packet + guarded CLI command',
               'scoped_writes',@step,'Import command result',@ev,@ts,@ts)`,
    ).run({
      id: drunId,
      run: runId,
      task: taskId,
      agent: coder,
      provider,
      model,
      branch,
      wt: worktree,
      step: options.dryRun ? "Constructing dry-run command" : `Running ${provider} CLI`,
      ev: J([packet]),
      ts: hhmm(),
    });
    setTaskStatus(runId, taskId, "running", `Real ${provider} adapter started.`);
    setAgentStatus(coder, "running", `Running ${provider} for ${task.title}`, taskId);
    addMessage(runId, "task_started", coder, `Started real ${provider} run for ${task.title}.`, taskId);
    addEvent(runId, "external_call", coder, `${provider} command prepared`, command.display, {
      taskId,
      command: command.display,
      status: "running",
    });
    touchRun(runId);
  });
  startTx();

  const execution = await executeCliCommand(command, {
    dryRun: options.dryRun,
    timeoutMs: options.timeoutMs,
  });
  const result = createRunResult({ runId, task, provider, command, execution });

  const finishTx = db.transaction(() => {
    const eventStatus = result.status === "completed" ? "success" : result.status === "blocked" ? "warning" : "failed";
    addEvent(runId, "command_result", coder, `${provider} result imported`, result.summary, {
      taskId,
      command: command.display,
      status: eventStatus,
    });

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
      J(result.changedFiles),
      J([
        result.summary,
        `Provider: ${provider}; model: ${model}.`,
        result.status === "completed" ? "CLI completed; diff import is pending integration." : "No diff imported.",
      ]),
      J(result.validation),
      J(result.blockers.length ? result.blockers : ["Verify command output and changed files before approval."]),
      result.status === "completed"
        ? "Real CLI completed; reviewer must verify diff import before approving."
        : "Blocked or failed real run; inspect blocker inbox before retrying.",
      iso(),
      iso(),
    );

    if (result.status === "completed") {
      setTaskStatus(runId, taskId, "review", "Real adapter completed; review gate requires diff verification.");
      setAgentStatus(coder, "idle", "Real run handed to review");
      setAgentStatus(ownerAgentId(runId, "reviewer"), "reviewing", `Reviewing ${task.title}`, taskId);
      addMessage(runId, "review_completed", ownerAgentId(runId, "reviewer"), `${task.title} completed by real ${provider} run. Review gate is ready.`, taskId);
      db.prepare(
        `INSERT INTO inbox_items (id, run_id, type, title, summary, agent_id, task_id, priority, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        uid("inbox"),
        runId,
        "review_diff",
        `Review real adapter result: ${task.title}`,
        result.summary,
        ownerAgentId(runId, "reviewer"),
        taskId,
        "high",
        "open",
        iso(),
      );
    } else {
      setTaskStatus(runId, taskId, "ready", `${provider} real run ${result.status}; returned to ready queue.`);
      setAgentStatus(coder, "blocked", `${provider} real run ${result.status}`, taskId);
      addMessage(runId, "blocker_found", coder, `${provider} real run ${result.status}: ${result.summary}`, taskId);
      db.prepare(
        `INSERT INTO inbox_items (id, run_id, type, title, summary, agent_id, task_id, priority, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        uid("inbox"),
        runId,
        "answer_blocker",
        `Resolve ${provider} run blocker: ${task.title}`,
        result.blockers.join("; ") || result.summary,
        coder,
        taskId,
        "high",
        "open",
        iso(),
      );
    }

    db.prepare(
      "UPDATE delegated_runs SET status = ?, progress = ?, current_step = ?, next_step = ?, evidence = ?, last_heartbeat = ?, completed_at = ? WHERE id = ?",
    ).run(
      result.status,
      result.status === "completed" ? 100 : 60,
      result.summary,
      result.status === "completed" ? "Awaiting review gate" : "Resolve blocker and retry",
      J([packet, result]),
      hhmm(),
      iso(),
      drunId,
    );
    db.prepare("UPDATE runs SET run_status = ?, selected_task_id = ? WHERE id = ?").run(
      result.status === "completed" ? "review" : "running",
      taskId,
      runId,
    );
    touchRun(runId);
  });
  finishTx();

  return { ok: true };
}

function defaultModel(provider: "claude" | "codex" | "pi-agent"): string {
  if (provider === "claude") return "sonnet4.6";
  if (provider === "codex") return "GPT-5";
  return "default";
}
