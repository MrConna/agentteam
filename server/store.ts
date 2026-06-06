import { randomUUID } from "node:crypto";
import { getDb } from "./db.ts";
import { generatePlan } from "./planner.ts";
import type {
  ActivityEvent,
  ActivityEventType,
  Agent,
  AgentRole,
  ChannelMessage,
  ChannelMessageType,
  DelegatedRun,
  InboxItem,
  ReviewGate,
  ServerState,
  Task,
} from "../src/types/domain.ts";

const uid = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;
const iso = () => new Date().toISOString();
const hhmm = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const J = (value: unknown) => JSON.stringify(value ?? []);
const P = <T>(value: string): T => JSON.parse(value || "[]") as T;

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapAgent(r: any): Agent {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    status: r.status,
    responsibility: r.responsibility,
    currentTaskId: r.current_task_id ?? undefined,
    lastUpdate: r.last_update,
  };
}

function mapTask(r: any): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    ownerAgentId: r.owner_agent_id ?? "",
    status: r.status,
    fileScope: P<string[]>(r.file_scope),
    risk: r.risk,
    lastUpdate: r.last_update,
    dependencies: P<string[]>(r.dependencies),
  };
}

function mapMessage(r: any): ChannelMessage {
  return {
    id: r.id,
    type: r.type,
    agentId: r.agent_id ?? "",
    taskId: r.task_id ?? undefined,
    timestamp: r.timestamp,
    body: r.body,
  };
}

function mapEvent(r: any): ActivityEvent {
  return {
    id: r.id,
    type: r.type,
    agentId: r.agent_id ?? "",
    taskId: r.task_id ?? undefined,
    timestamp: r.timestamp,
    title: r.title,
    summary: r.summary,
    command: r.command ?? undefined,
    files: P<string[]>(r.files),
    status: r.status,
  };
}

function mapInbox(r: any): InboxItem {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    summary: r.summary,
    agentId: r.agent_id ?? "",
    taskId: r.task_id ?? undefined,
    priority: r.priority,
    status: r.status,
  };
}

function mapGate(r: any): ReviewGate {
  return {
    id: r.id,
    taskId: r.task_id,
    status: r.status,
    changedFiles: P<string[]>(r.changed_files),
    diffSummary: P<string[]>(r.diff_summary),
    tests: P<ReviewGate["tests"]>(r.tests),
    riskNotes: P<string[]>(r.risk_notes),
    reviewerVerdict: r.reviewer_verdict,
  };
}

function mapDelegated(r: any): DelegatedRun {
  return {
    id: r.id,
    taskId: r.task_id,
    agentId: r.agent_id ?? "",
    provider: r.provider,
    model: r.model,
    role: r.role,
    branch: r.branch,
    worktree: r.worktree,
    status: r.status,
    progress: r.progress,
    budget: {
      tier: r.budget_tier,
      maxMinutes: r.budget_max_minutes,
      tokenPolicy: r.budget_token_policy,
    },
    assignedAt: r.assigned_at,
    lastHeartbeat: r.last_heartbeat,
    currentStep: r.current_step,
    nextStep: r.next_step,
    evidence: P<string[]>(r.evidence),
  };
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export interface CreateRunInput {
  goal: string;
  projectName?: string;
  workspaceName?: string;
  projectRoot?: string;
}

export function createRun(input: CreateRunInput): string {
  const db = getDb();
  const plan = generatePlan(input.goal);
  const runId = uid("run");
  const ts = iso();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO runs
        (id, workspace_name, project_name, project_root, goal, run_status,
         plan_approved, active_timeline_tab, selected_task_id, selected_inbox_id,
         created_at, updated_at)
       VALUES (@id,@workspace,@project,@root,@goal,'planning',0,'channel',
               @selTask,@selInbox,@ts,@ts)`,
    ).run({
      id: runId,
      workspace: input.workspaceName?.trim() || "Solo Builder",
      project: input.projectName?.trim() || "New Project",
      root: input.projectRoot?.trim() || "",
      goal: input.goal.trim(),
      selTask: plan.tasks[1]?.id ?? plan.tasks[0]?.id ?? null,
      selInbox: null,
      ts,
    });

    const insAgent = db.prepare(
      `INSERT INTO agents
        (id, run_id, name, role, status, responsibility, current_task_id, last_update)
       VALUES (@id,@run,@name,@role,@status,@resp,@task,@upd)`,
    );
    for (const a of plan.agents) {
      insAgent.run({
        id: a.id,
        run: runId,
        name: a.name,
        role: a.role,
        status: a.status,
        resp: a.responsibility,
        task: a.currentTaskId ?? null,
        upd: a.lastUpdate,
      });
    }

    const ownerByRole = new Map<AgentRole, string>(
      plan.agents.map((a) => [a.role, a.id]),
    );
    const insTask = db.prepare(
      `INSERT INTO tasks
        (id, run_id, title, description, owner_agent_id, status, file_scope,
         risk, dependencies, last_update, created_at, sort_order)
       VALUES (@id,@run,@title,@desc,@owner,@status,@scope,@risk,@deps,@upd,@ts,@ord)`,
    );
    plan.tasks.forEach((t, i) => {
      insTask.run({
        id: t.id,
        run: runId,
        title: t.title,
        desc: t.description,
        owner: ownerByRole.get(t.ownerRole) ?? null,
        status: t.status,
        scope: J(t.fileScope),
        risk: t.risk,
        deps: J(t.dependencies),
        upd: t.status === "ready" ? "Ready to start" : "Queued in plan",
        ts,
        ord: i,
      });
    });

    const planInboxId = uid("inbox");
    db.prepare(
      `INSERT INTO channel_messages (id, run_id, type, agent_id, body, timestamp)
       VALUES (?,?,?,?,?,?)`,
    ).run(uid("msg"), runId, "plan_proposed", "agent-planner", plan.planSummary, hhmm());
    db.prepare(
      `INSERT INTO inbox_items
        (id, run_id, type, title, summary, agent_id, priority, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      planInboxId,
      runId,
      "approve_plan",
      `Approve ${plan.tasks.length}-task plan`,
      plan.planSummary,
      "agent-planner",
      "high",
      "open",
      ts,
    );
    db.prepare("UPDATE runs SET selected_inbox_id = ? WHERE id = ?").run(
      planInboxId,
      runId,
    );

    // Planner's own delegated run, already merged (the plan itself).
    db.prepare(
      `INSERT INTO delegated_runs
        (id, run_id, task_id, agent_id, provider, model, role, branch, worktree,
         status, progress, budget_tier, budget_max_minutes, budget_token_policy,
         approval_policy, current_step, next_step, evidence, assigned_at, last_heartbeat, completed_at)
       VALUES (@id,@run,@task,@agent,'claude','sonnet4.6','planner',@branch,@wt,
               'merged',100,'standard',12,'brief + task contract only',
               'read_only','Plan merged into task board','No action','[]',@ts,@ts,@ts)`,
    ).run({
      id: uid("drun"),
      run: runId,
      task: plan.tasks[0].id,
      agent: "agent-planner",
      branch: "agent/claude-plan",
      wt: "../agentteam-claude-plan",
      ts: hhmm(),
    });

    db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(iso(), runId);
  });
  tx();
  return runId;
}

export function listRuns(): { id: string; projectName: string; goal: string; runStatus: string; updatedAt: string }[] {
  return getDb()
    .prepare(
      "SELECT id, project_name, goal, run_status, updated_at FROM runs ORDER BY updated_at DESC",
    )
    .all()
    .map((r: any) => ({
      id: r.id,
      projectName: r.project_name,
      goal: r.goal,
      runStatus: r.run_status,
      updatedAt: r.updated_at,
    }));
}

export function getLatestRunId(): string | null {
  const row = getDb()
    .prepare("SELECT id FROM runs ORDER BY updated_at DESC LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function getRunState(runId: string): ServerState | null {
  const db = getDb();
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as any;
  if (!run) return null;
  const by = (sql: string) => db.prepare(sql).all(runId);
  return {
    runId: run.id,
    workspaceName: run.workspace_name,
    projectName: run.project_name,
    goal: run.goal,
    runStatus: run.run_status,
    planApproved: !!run.plan_approved,
    activeTimelineTab: run.active_timeline_tab,
    selectedTaskId: run.selected_task_id ?? "",
    selectedInboxItemId: run.selected_inbox_id ?? "",
    agents: by("SELECT * FROM agents WHERE run_id = ? ORDER BY rowid").map(mapAgent),
    tasks: by("SELECT * FROM tasks WHERE run_id = ? ORDER BY sort_order, rowid").map(mapTask),
    channelMessages: by("SELECT * FROM channel_messages WHERE run_id = ? ORDER BY rowid").map(mapMessage),
    activityEvents: by("SELECT * FROM activity_events WHERE run_id = ? ORDER BY rowid").map(mapEvent),
    inboxItems: by("SELECT * FROM inbox_items WHERE run_id = ? ORDER BY rowid").map(mapInbox),
    reviewGates: by("SELECT * FROM review_gates WHERE run_id = ? ORDER BY rowid").map(mapGate),
    delegatedRuns: by("SELECT * FROM delegated_runs WHERE run_id = ? ORDER BY rowid").map(mapDelegated),
  };
}

// ---------------------------------------------------------------------------
// Low-level append helpers (shared with the adapter)
// ---------------------------------------------------------------------------

export function addMessage(
  runId: string,
  type: ChannelMessageType,
  agentId: string,
  body: string,
  taskId?: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO channel_messages (id, run_id, type, agent_id, task_id, body, timestamp)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(uid("msg"), runId, type, agentId, taskId ?? null, body, hhmm());
}

export function addEvent(
  runId: string,
  type: ActivityEventType,
  agentId: string,
  title: string,
  summary: string,
  opts: { taskId?: string; command?: string; files?: string[]; status?: ActivityEvent["status"] } = {},
): void {
  getDb()
    .prepare(
      `INSERT INTO activity_events
        (id, run_id, type, agent_id, task_id, title, summary, command, files, status, timestamp)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      uid("evt"),
      runId,
      type,
      agentId,
      opts.taskId ?? null,
      title,
      summary,
      opts.command ?? null,
      J(opts.files ?? []),
      opts.status ?? "success",
      hhmm(),
    );
}

export function touchRun(runId: string): void {
  getDb().prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(iso(), runId);
}

export function getTask(runId: string, taskId: string): Task | null {
  const r = getDb()
    .prepare("SELECT * FROM tasks WHERE run_id = ? AND id = ?")
    .get(runId, taskId);
  return r ? mapTask(r) : null;
}

export function setTaskStatus(
  runId: string,
  taskId: string,
  status: Task["status"],
  lastUpdate: string,
): void {
  getDb()
    .prepare("UPDATE tasks SET status = ?, last_update = ? WHERE run_id = ? AND id = ?")
    .run(status, lastUpdate, runId, taskId);
}

export function setAgentStatus(agentId: string, status: Agent["status"], lastUpdate: string, currentTaskId?: string): void {
  getDb()
    .prepare("UPDATE agents SET status = ?, last_update = ?, current_task_id = ? WHERE id = ?")
    .run(status, lastUpdate, currentTaskId ?? null, agentId);
}

export function ownerAgentId(runId: string, role: AgentRole): string {
  const r = getDb()
    .prepare("SELECT id FROM agents WHERE run_id = ? AND role = ?")
    .get(runId, role) as { id: string } | undefined;
  return r?.id ?? "agent-planner";
}

// ---------------------------------------------------------------------------
// Mutations (mirror the UI handlers)
// ---------------------------------------------------------------------------

export function approvePlan(runId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("UPDATE runs SET plan_approved = 1, run_status = 'running' WHERE id = ?").run(runId);
    db.prepare(
      "UPDATE inbox_items SET status = 'approved', resolved_at = ? WHERE run_id = ? AND type = 'approve_plan'",
    ).run(iso(), runId);
    setAgentStatus("agent-coder", "running", "Cleared to start ready tasks");
    addMessage(runId, "plan_proposed", "agent-planner", "Plan approved. Coder is cleared to start ready tasks.");
    addEvent(runId, "reasoning", "agent-planner", "Plan approved", "Human approved the generated plan.", { status: "success" });
    touchRun(runId);
  });
  tx();
}

export function decideInbox(runId: string, inboxId: string, decision: "approved" | "rejected" | "answered"): void {
  const db = getDb();
  const item = db.prepare("SELECT * FROM inbox_items WHERE run_id = ? AND id = ?").get(runId, inboxId) as any;
  if (!item) return;
  const tx = db.transaction(() => {
    db.prepare("UPDATE inbox_items SET status = ?, resolved_at = ? WHERE id = ?").run(decision, iso(), inboxId);
    if (item.type === "approve_plan" && decision === "approved") {
      db.prepare("UPDATE runs SET plan_approved = 1, run_status = 'running' WHERE id = ?").run(runId);
    }
    const verb = decision === "approved" ? "approved" : decision === "answered" ? "answered" : "sent back";
    addMessage(runId, "approval_requested", item.agent_id ?? "agent-planner", `${item.title} ${verb}.`, item.task_id ?? undefined);
    addEvent(runId, "reasoning", item.agent_id ?? "agent-planner", "Inbox decision", `${item.type}: ${item.title} -> ${decision}.`, {
      taskId: item.task_id ?? undefined,
      status: decision === "rejected" ? "warning" : "success",
    });
    touchRun(runId);
  });
  tx();
}

export function moveTask(runId: string, taskId: string, status: Task["status"]): void {
  const task = getTask(runId, taskId);
  if (!task) return;
  const note =
    status === "review"
      ? "Implementation handed to review gate."
      : status === "done"
        ? "Approved and closed by operator."
        : task.lastUpdate;
  const tx = getDb().transaction(() => {
    setTaskStatus(runId, taskId, status, note);
    addMessage(runId, status === "review" ? "review_completed" : "task_started", task.ownerAgentId || "agent-coder", `${task.title} moved to ${status}.`, taskId);
    addEvent(runId, "reasoning", task.ownerAgentId || "agent-coder", "Task state", `${task.title}: -> ${status}.`, {
      taskId,
      status: status === "done" ? "success" : "running",
    });
    touchRun(runId);
  });
  tx();
}

export function decideReview(runId: string, taskId: string, decision: "approved" | "changes_requested"): void {
  const db = getDb();
  const task = getTask(runId, taskId);
  if (!task) return;
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE review_gates SET status = ?, updated_at = ? WHERE run_id = ? AND task_id = ?",
    ).run(decision, iso(), runId, taskId);
    if (decision === "approved") {
      setTaskStatus(runId, taskId, "done", "Review gate approved; task is done.");
      addMessage(runId, "ship_summary", "agent-reviewer", `${task.title} approved through review gate.`, taskId);
      addEvent(runId, "reasoning", "agent-reviewer", "Review gate", "Operator approved diff, tests, and risk notes.", { taskId, status: "success" });
    } else {
      setTaskStatus(runId, taskId, "ready", "Changes requested; returned to ready queue.");
      addMessage(runId, "review_completed", "agent-reviewer", `${task.title} returned for changes.`, taskId);
      addEvent(runId, "warning", "agent-reviewer", "Review gate", "Operator requested changes before approval.", { taskId, status: "warning" });
    }
    touchRun(runId);
  });
  tx();
}

export function acceptFollowUp(runId: string, inboxId: string): void {
  const db = getDb();
  const item = db.prepare("SELECT * FROM inbox_items WHERE run_id = ? AND id = ?").get(runId, inboxId) as any;
  const tx = db.transaction(() => {
    const ts = iso();
    const ord = (db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM tasks WHERE run_id = ?").get(runId) as any).n;
    const newTaskId = uid("task");
    const title = item ? item.title.replace(/^Accept\s+/i, "").replace(/\s+follow-?up$/i, "") || "Follow-up work" : "Follow-up work";
    db.prepare(
      `INSERT INTO tasks
        (id, run_id, title, description, owner_agent_id, status, file_scope, risk, dependencies, last_update, created_at, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      newTaskId,
      runId,
      `Follow-up: ${title}`,
      item?.summary ?? "Follow-up task accepted from review.",
      ownerAgentId(runId, "coder"),
      "ready",
      "[]",
      "medium",
      "[]",
      "Accepted from review follow-up",
      ts,
      ord,
    );
    if (item) {
      db.prepare("UPDATE inbox_items SET status = 'approved', resolved_at = ? WHERE id = ?").run(ts, inboxId);
    }
    addMessage(runId, "follow_up_suggested", "agent-tester", `Follow-up accepted: ${title}.`, newTaskId);
    addEvent(runId, "reasoning", "agent-tester", "Follow-up accepted", `Created follow-up task: ${title}.`, { taskId: newTaskId, status: "success" });
    touchRun(runId);
  });
  tx();
}

export { uid, iso, hhmm };
