import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Code2,
  Cpu,
  GitPullRequest,
  Inbox,
  LayoutDashboard,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Terminal,
  TerminalSquare,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Terminals } from "./Terminals";
import type {
  Agent,
  AgentRole,
  DelegatedRun,
  ServerState,
  Task,
} from "./types/domain";

type Tab = "channel" | "console";

const COLUMNS: Task["status"][] = ["backlog", "ready", "running", "review", "done"];
const COLUMN_LABEL: Record<Task["status"], string> = {
  backlog: "Backlog",
  ready: "Ready",
  running: "Running",
  review: "Review",
  done: "Done",
};
const ROLE_LABEL: Record<AgentRole, string> = {
  planner: "Planner",
  coder: "Coder",
  reviewer: "Reviewer",
  tester: "Tester",
};
const AGENT_LOAD: Record<Agent["status"], string> = {
  idle: "Standing by",
  planning: "Plan active",
  running: "Execution active",
  reviewing: "Review active",
  blocked: "Blocked",
  done: "Complete",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const labelize = (s: string) => s.replace(/_/g, " ");

type ProviderUi = { id: string; label: string; models: string[] };
// Fallback until /api/providers loads; the server (agents.config.json) is the
// source of truth, so adding an agent there shows up here with no code change.
const PROVIDER_UI_FALLBACK: ProviderUi[] = [{ id: "simulated", label: "Simulated (no CLI)", models: [] }];

export default function App() {
  const [state, setState] = useState<ServerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getState()
      .then((s) => setState(s))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <CenterCard title="Loading workspace…" />;
  }
  if (error) {
    return <CenterCard title="Cannot reach the AgentTeam API" detail={`${error}\n\nStart it with: npm run server`} />;
  }
  if (!state) {
    return <CreateRun onCreated={setState} />;
  }
  return <Console state={state} setState={setState} />;
}

// ---------------------------------------------------------------------------
// Create-run screen (goal -> task board)
// ---------------------------------------------------------------------------

function CreateRun({ onCreated }: { onCreated: (s: ServerState) => void }) {
  const [goal, setGoal] = useState("");
  const [project, setProject] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!goal.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const s = await api.createRun({ goal, projectName: project || undefined });
      onCreated(s);
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="create-run">
      <div className="create-card">
        <div className="create-head">
          <span className="brand-mark">AT</span>
          <div>
            <h1>Start a project run</h1>
            <p>Describe the goal. The Planner turns it into a task board for your agent team.</p>
          </div>
        </div>
        <label className="field">
          <span>Project name</span>
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Personal CRM"
          />
        </label>
        <label className="field">
          <span>Goal</span>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Add GitHub OAuth login and a protected dashboard."
            rows={3}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
        </label>
        {err && <p className="create-error">{err}</p>}
        <button className="primary-button" onClick={submit} disabled={busy || !goal.trim()}>
          <Sparkles size={15} /> {busy ? "Planning…" : "Generate task board"}
        </button>
      </div>
    </div>
  );
}

function CenterCard({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="create-run">
      <div className="create-card">
        <h1>{title}</h1>
        {detail && <pre className="create-detail">{detail}</pre>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operator console
// ---------------------------------------------------------------------------

function Console({
  state,
  setState,
}: {
  state: ServerState;
  setState: (s: ServerState) => void;
}) {
  const runId = state.runId;
  const [selectedTaskId, setSelectedTaskId] = useState(state.selectedTaskId);
  const [selectedInboxId, setSelectedInboxId] = useState(state.selectedInboxItemId);
  const [activeTab, setActiveTab] = useState<Tab>(state.activeTimelineTab);
  const [view, setView] = useState<"console" | "agents" | "inbox" | "review" | "sessions">("console");
  const [pending, setPending] = useState(false);
  const [provider, setProvider] = useState<string>("simulated");
  const [model, setModel] = useState<string>("");
  const [dryRun, setDryRun] = useState(true);
  const [providerList, setProviderList] = useState<ProviderUi[]>(PROVIDER_UI_FALLBACK);

  useEffect(() => {
    api.listProviders().then(setProviderList).catch(() => setProviderList(PROVIDER_UI_FALLBACK));
  }, []);

  const providerUi = providerList.find((p) => p.id === provider) ?? providerList[0];
  const runOptions = () =>
    provider === "simulated"
      ? undefined
      : {
          provider,
          model: model || undefined,
          dryRun,
        };

  const roleByAgent = useMemo(
    () => new Map(state.agents.map((a) => [a.id, ROLE_LABEL[a.role]])),
    [state.agents],
  );
  const nameByAgent = useMemo(
    () => new Map(state.agents.map((a) => [a.id, a.name])),
    [state.agents],
  );
  const titleByTask = useMemo(
    () => new Map(state.tasks.map((t) => [t.id, t.title])),
    [state.tasks],
  );

  const tasks = state.tasks;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? tasks[0];
  const inboxItems = state.inboxItems;
  const selectedInbox =
    inboxItems.find((i) => i.id === selectedInboxId) ??
    inboxItems.find((i) => i.status === "open") ??
    inboxItems[0];
  const openInboxCount = inboxItems.filter((i) => i.status === "open").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const reviewTask = tasks.find((t) => t.status === "review");
  const gate =
    state.reviewGates.find((g) => g.taskId === reviewTask?.id) ??
    state.reviewGates[state.reviewGates.length - 1];
  const gateTaskTitle = gate ? titleByTask.get(gate.taskId) ?? gate.taskId : "No task in review";

  async function act(fn: () => Promise<ServerState>) {
    setPending(true);
    try {
      setState(await fn());
    } catch (e) {
      console.error(e);
      alert(`Action failed: ${e}`);
    } finally {
      setPending(false);
    }
  }

  const canRunTask =
    selectedTask && state.planApproved && (selectedTask.status === "ready" || selectedTask.status === "backlog");

  return (
    <div className="app-shell">
      <aside className="left-rail" aria-label="Workspace navigation">
        <div className="brand-mark">AT</div>
        <button className={`rail-button ${view === "console" ? "active" : ""}`} title="Command center" onClick={() => setView("console")}>
          <LayoutDashboard size={18} />
        </button>
        <button className={`rail-button ${view === "agents" ? "active" : ""}`} title="Agents" onClick={() => setView("agents")}>
          <Bot size={18} />
        </button>
        <button className={`rail-button ${view === "inbox" ? "active" : ""}`} title="Inbox" onClick={() => setView("inbox")}>
          <Inbox size={18} />
          {openInboxCount > 0 && <span className="rail-badge">{openInboxCount}</span>}
        </button>
        <button className={`rail-button ${view === "review" ? "active" : ""}`} title="Review gates" onClick={() => setView("review")}>
          <ShieldCheck size={18} />
        </button>
        <button className={`rail-button ${view === "sessions" ? "active" : ""}`} title="Agent sessions (live terminals)" onClick={() => setView("sessions")}>
          <TerminalSquare size={18} />
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="project-title">
            <span className="eyebrow">{state.workspaceName} / {state.projectName}</span>
            <h1>Operator Console</h1>
          </div>
          <div className="run-strip" aria-label="Run status">
            <span className={`status-pill ${state.runStatus === "running" || state.runStatus === "review" ? "live" : ""}`}>
              <Activity size={14} /> {labelize(state.runStatus)}
            </span>
            <span className="metric"><Clock3 size={14} /> {state.delegatedRuns.length} runs</span>
            <span className="metric"><Inbox size={14} /> {openInboxCount} open</span>
            <span className="metric"><ClipboardCheck size={14} /> {doneCount}/{tasks.length} done</span>
          </div>
          <div className="top-actions">
            <div className="agent-picker" title="Each TUI runs its own best model">
              <Cpu size={14} />
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel("");
                }}
                aria-label="Agent provider"
              >
                {providerList.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {(providerUi?.models.length ?? 0) > 0 && (
                <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
                  <option value="">{providerUi!.models[0]} (best)</option>
                  {providerUi!.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
              {provider !== "simulated" && (
                <label className="dry-toggle" title="Dry run builds the command without executing the CLI">
                  <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> dry-run
                </label>
              )}
            </div>
            <button className="icon-button" title="New run" onClick={() => setState(null as unknown as ServerState)}>
              <Plus size={15} />
            </button>
            <button className="icon-button" title="Refresh" onClick={() => act(() => api.getState(runId).then((s) => s!))}>
              <RotateCcw size={15} />
            </button>
            <button
              className="primary-button small"
              disabled={pending || !state.planApproved}
              title={state.planApproved ? "Run next ready task with the selected agent" : "Approve the plan first"}
              onClick={() => act(() => api.runNext(runId, runOptions()))}
            >
              <Play size={15} /> Run
            </button>
          </div>
        </header>

        {view !== "sessions" && (
        <>
        <section className="goal-bar" aria-label="Current goal">
          <div>
            <span className="label">Current goal</span>
            <strong>{state.goal}</strong>
          </div>
          <button
            className={state.planApproved ? "success-button" : "primary-button"}
            onClick={() => act(() => api.approvePlan(runId))}
            disabled={state.planApproved || pending}
          >
            <Check size={15} />
            {state.planApproved ? "Plan approved" : "Approve plan"}
          </button>
        </section>

        <section className="agent-row" aria-label="Agent team status">
          {state.agents.map((agent) => (
            <article className="agent-tile" key={agent.id}>
              <div className={`agent-avatar ${agent.role}`}>{ROLE_LABEL[agent.role].slice(0, 1)}</div>
              <div>
                <div className="agent-name">{agent.name}</div>
                <div className="agent-meta">{ROLE_LABEL[agent.role]} · {agent.lastUpdate}</div>
              </div>
              <span>{AGENT_LOAD[agent.status]}</span>
            </article>
          ))}
        </section>

        {state.delegatedRuns.length > 0 && (
          <section className="delegation-panel" aria-label="Delegated agent work">
            <div className="panel-header">
              <div>
                <span className="label">Delegation tracker</span>
                <h2>Assigned work and progress</h2>
              </div>
              <span className="hint">Provider, model, branch, budget, heartbeat</span>
            </div>
            <div className="delegation-grid">
              {state.delegatedRuns.map((run) => (
                <DelegatedRunCard
                  key={run.id}
                  run={run}
                  taskTitle={titleByTask.get(run.taskId) ?? run.taskId}
                  agentName={nameByAgent.get(run.agentId) ?? run.agentId}
                />
              ))}
            </div>
          </section>
        )}
        </>
        )}

        {view === "console" && (
        <div className="console-grid">
          <section className="board-panel" aria-label="Task board">
            <div className="panel-header">
              <div>
                <span className="label">Task board</span>
                <h2>{state.projectName} run</h2>
              </div>
              <span className="hint">Select a card to inspect scope and actions</span>
            </div>
            <div className="task-board">
              {COLUMNS.map((column) => (
                <div className="task-column" key={column}>
                  <div className="column-header">
                    <span>{COLUMN_LABEL[column]}</span>
                    <span>{tasks.filter((t) => t.status === column).length}</span>
                  </div>
                  {tasks
                    .filter((t) => t.status === column)
                    .map((task) => (
                      <button
                        key={task.id}
                        className={`task-card ${selectedTask?.id === task.id ? "selected" : ""}`}
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <div className="task-card-top">
                          <span className={`risk risk-${task.risk}`}>{cap(task.risk)}</span>
                          <span className="owner">{roleByAgent.get(task.ownerAgentId) ?? "—"}</span>
                        </div>
                        <strong>{task.title}</strong>
                        <p>{task.lastUpdate}</p>
                        {task.fileScope[0] && <div className="file-scope">{task.fileScope[0]}</div>}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </section>

          <section className="timeline-panel" aria-label="Project evidence">
            <div className="tabs" role="tablist">
              <button className={activeTab === "channel" ? "active" : ""} onClick={() => setActiveTab("channel")}>
                <MessageIcon /> Project channel
              </button>
              <button className={activeTab === "console" ? "active" : ""} onClick={() => setActiveTab("console")}>
                <Terminal size={15} /> Run console
              </button>
            </div>
            {activeTab === "channel" ? (
              <div className="message-list">
                {state.channelMessages.map((m) => (
                  <article className="message" key={m.id}>
                    <div className="message-icon"><Bot size={14} /></div>
                    <div>
                      <div className="message-meta">
                        <strong>{roleByAgent.get(m.agentId) ?? "Agent"}</strong>
                        <span>{labelize(m.type)}</span>
                        <time>{m.timestamp}</time>
                      </div>
                      <p>{m.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="event-list">
                {state.activityEvents.map((ev) => (
                  <article className={`event ${ev.status === "warning" ? "warn" : ev.status === "success" ? "ok" : "normal"}`} key={ev.id}>
                    <span className="event-time">{ev.timestamp}</span>
                    <span className="event-kind">{labelize(ev.type)}</span>
                    <p>{ev.command ? `${ev.summary} (${ev.command})` : ev.summary}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="right-stack">
            <section className="inbox-panel" aria-label="Agent inbox">
              <div className="panel-header tight">
                <div>
                  <span className="label">Agent inbox</span>
                  <h2>Decision queue</h2>
                </div>
                <span className="count-badge">{openInboxCount}</span>
              </div>
              <div className="inbox-list">
                {inboxItems.map((item) => (
                  <button
                    className={`inbox-item ${selectedInbox?.id === item.id ? "selected" : ""} ${item.status}`}
                    key={item.id}
                    onClick={() => setSelectedInboxId(item.id)}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <span>{labelize(item.type)} · {roleByAgent.get(item.agentId) ?? "Agent"}</span>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
              {selectedInbox && (
                <div className="decision-detail">
                  <span className="label">{labelize(selectedInbox.type)}</span>
                  <h3>{selectedInbox.title}</h3>
                  <p>{selectedInbox.summary}</p>
                  <div className="button-row">
                    {selectedInbox.type === "accept_follow_up" ? (
                      <button
                        className="success-button"
                        disabled={pending || selectedInbox.status !== "open"}
                        onClick={() => act(() => api.acceptFollowUp(runId, selectedInbox.id))}
                      >
                        <Plus size={15} /> Accept follow-up
                      </button>
                    ) : (
                      <>
                        <button
                          className="success-button"
                          disabled={pending || selectedInbox.status !== "open"}
                          onClick={() => act(() => api.decideInbox(runId, selectedInbox.id, "approve"))}
                        >
                          <Check size={15} /> Approve
                        </button>
                        <button
                          className="danger-button"
                          disabled={pending || selectedInbox.status !== "open"}
                          onClick={() => act(() => api.decideInbox(runId, selectedInbox.id, "changes"))}
                        >
                          <X size={15} /> Changes
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>

            {selectedTask && (
              <section className="detail-panel" aria-label="Selected task details">
                <div className="panel-header tight">
                  <div>
                    <span className="label">Selected task</span>
                    <h2>{selectedTask.title}</h2>
                  </div>
                  <span className={`status-badge status-${selectedTask.status}`}>{COLUMN_LABEL[selectedTask.status]}</span>
                </div>
                <p>{selectedTask.description}</p>
                <div className="detail-grid">
                  <span>Owner</span><strong>{roleByAgent.get(selectedTask.ownerAgentId) ?? "—"}</strong>
                  <span>Risk</span><strong className={`risk risk-${selectedTask.risk}`}>{cap(selectedTask.risk)}</strong>
                  <span>Scope</span><strong>{selectedTask.fileScope.length} files</strong>
                </div>
                <div className="file-list">
                  {selectedTask.fileScope.map((file) => (
                    <span key={file}><Code2 size={13} /> {file}</span>
                  ))}
                </div>
                <div className="button-row">
                  {canRunTask ? (
                    <button className="primary-button" disabled={pending} onClick={() => act(() => api.runTask(runId, selectedTask.id, runOptions()))}>
                      <Play size={15} /> Run task
                    </button>
                  ) : (
                    <button
                      className="secondary-button"
                      disabled={pending || selectedTask.status === "review" || selectedTask.status === "done"}
                      onClick={() => act(() => api.moveTask(runId, selectedTask.id, "review"))}
                    >
                      <GitPullRequest size={15} /> Move to review
                    </button>
                  )}
                  <button
                    className="success-button"
                    disabled={pending || selectedTask.status === "done"}
                    onClick={() => act(() => api.moveTask(runId, selectedTask.id, "done"))}
                  >
                    <Check size={15} /> Done
                  </button>
                </div>
              </section>
            )}

            <section className="review-panel" aria-label="Review gate">
              <div className="panel-header tight">
                <div>
                  <span className="label">Review gate</span>
                  <h2>{gateTaskTitle}</h2>
                </div>
                {gate && <span className={`review-state ${gate.status === "approved" ? "approved" : gate.status === "changes_requested" ? "changes" : "waiting"}`}>{labelize(gate.status)}</span>}
              </div>
              {gate ? (
                <>
                  <div className="review-summary">
                    <div><span>Changed files</span><strong>{gate.changedFiles.join(", ")}</strong></div>
                    <div><span>Diff summary</span><strong>{gate.diffSummary.join(" ")}</strong></div>
                    <div><span>Tests</span><strong>{gate.tests.map((t) => `${t.command}: ${t.result}`).join(" · ")}</strong></div>
                    <div><span>Risk note</span><strong>{gate.riskNotes.join(" ")}</strong></div>
                  </div>
                  <div className="button-row">
                    <button
                      className="success-button"
                      disabled={pending || !reviewTask || gate.status !== "pending"}
                      onClick={() => reviewTask && act(() => api.decideReview(runId, reviewTask.id, "approved"))}
                    >
                      <UserCheck size={15} /> Approve
                    </button>
                    <button
                      className="danger-button"
                      disabled={pending || !reviewTask || gate.status !== "pending"}
                      onClick={() => reviewTask && act(() => api.decideReview(runId, reviewTask.id, "changes"))}
                    >
                      <AlertTriangle size={15} /> Request changes
                    </button>
                  </div>
                </>
              ) : (
                <p className="empty-hint">No task is at the review gate yet. Approve the plan and run a task.</p>
              )}
            </section>
          </aside>
        </div>
        )}

        {view === "sessions" && <Terminals />}

        {view === "agents" && (
          <section className="view-panel" aria-label="Agents">
            <div className="panel-header"><div><span className="label">Agents</span><h2>Team and delegated work</h2></div></div>
            <div className="agents-detail">
              {state.agents.map((a) => {
                const runs = state.delegatedRuns.filter((d) => d.agentId === a.id);
                return (
                  <article className="agent-detail-card" key={a.id}>
                    <div className="agent-detail-head">
                      <div className={`agent-avatar ${a.role}`}>{ROLE_LABEL[a.role].slice(0, 1)}</div>
                      <div>
                        <strong>{a.name}</strong>
                        <span>{ROLE_LABEL[a.role]} · {AGENT_LOAD[a.status]}</span>
                      </div>
                    </div>
                    <p>{a.responsibility}</p>
                    <div className="agent-detail-update">{a.lastUpdate}</div>
                    {runs.length > 0 && (
                      <ul className="agent-run-list">
                        {runs.map((r) => (
                          <li key={r.id}>
                            <span className={`provider-chip provider-${r.provider}`}>{r.provider}</span>
                            {r.model} · {titleByTask.get(r.taskId) ?? r.taskId} · {labelize(r.status)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === "inbox" && (
          <section className="view-panel" aria-label="Inbox">
            <div className="panel-header"><div><span className="label">Agent inbox</span><h2>Decision queue ({openInboxCount} open)</h2></div></div>
            <div className="inbox-detail-list">
              {inboxItems.map((item) => (
                <article className={`inbox-detail-card ${item.status}`} key={item.id}>
                  <div className="inbox-detail-top">
                    <span className="label">{labelize(item.type)}</span>
                    <span className={`status-badge status-${item.status === "open" ? "review" : "done"}`}>{item.status}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                  {item.status === "open" && (
                    <div className="button-row">
                      {item.type === "accept_follow_up" ? (
                        <button className="success-button" disabled={pending} onClick={() => act(() => api.acceptFollowUp(runId, item.id))}>
                          <Plus size={15} /> Accept follow-up
                        </button>
                      ) : (
                        <>
                          <button className="success-button" disabled={pending} onClick={() => act(() => api.decideInbox(runId, item.id, "approve"))}>
                            <Check size={15} /> Approve
                          </button>
                          <button className="danger-button" disabled={pending} onClick={() => act(() => api.decideInbox(runId, item.id, "changes"))}>
                            <X size={15} /> Changes
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
              {inboxItems.length === 0 && <p className="empty-hint">Inbox is empty.</p>}
            </div>
          </section>
        )}

        {view === "review" && (
          <section className="view-panel" aria-label="Review gates">
            <div className="panel-header"><div><span className="label">Review gates</span><h2>All task gates</h2></div></div>
            <div className="gates-list">
              {state.reviewGates.length === 0 && <p className="empty-hint">No review gates yet. Run a task to produce one.</p>}
              {state.reviewGates.map((g) => {
                const t = state.tasks.find((tk) => tk.id === g.taskId);
                return (
                  <article className="gate-card" key={g.id}>
                    <div className="inbox-detail-top">
                      <strong>{titleByTask.get(g.taskId) ?? g.taskId}</strong>
                      <span className={`review-state ${g.status === "approved" ? "approved" : g.status === "changes_requested" ? "changes" : "waiting"}`}>{labelize(g.status)}</span>
                    </div>
                    <div className="review-summary">
                      <div><span>Changed files</span><strong>{g.changedFiles.join(", ") || "(none)"}</strong></div>
                      <div><span>Diff</span><strong>{g.diffSummary.join(" ")}</strong></div>
                      <div><span>Tests</span><strong>{g.tests.map((tt) => `${tt.command}: ${tt.result}`).join(" · ")}</strong></div>
                    </div>
                    {g.status === "pending" && t && (
                      <div className="button-row">
                        <button className="success-button" disabled={pending} onClick={() => act(() => api.decideReview(runId, g.taskId, "approved"))}>
                          <UserCheck size={15} /> Approve
                        </button>
                        <button className="danger-button" disabled={pending} onClick={() => act(() => api.decideReview(runId, g.taskId, "changes"))}>
                          <AlertTriangle size={15} /> Request changes
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function MessageIcon() {
  return <Bot size={15} />;
}

function DelegatedRunCard({ run, taskTitle, agentName }: { run: DelegatedRun; taskTitle: string; agentName: string }) {
  return (
    <article className={`delegation-card ${run.status}`}>
      <div className="delegation-topline">
        <span className={`provider-chip provider-${run.provider}`}>{run.provider}</span>
        <span className={`run-status run-status-${run.status}`}>{labelize(run.status)}</span>
      </div>
      <div>
        <h3>{taskTitle}</h3>
        <p>{agentName} · {run.role} · {run.model}</p>
      </div>
      <div className="progress-track" aria-label={`${run.progress}% complete`}>
        <span style={{ width: `${run.progress}%` }} />
      </div>
      <dl className="run-meta">
        <div><dt>Branch</dt><dd>{run.branch}</dd></div>
        <div><dt>Worktree</dt><dd>{run.worktree}</dd></div>
        <div><dt>Budget</dt><dd>{run.budget.tier} · {run.budget.maxMinutes}m</dd></div>
        <div><dt>Heartbeat</dt><dd>{run.lastHeartbeat}</dd></div>
      </dl>
      <div className="run-step"><span>Now</span><strong>{run.currentStep}</strong></div>
      <div className="run-step"><span>Next</span><strong>{run.nextStep}</strong></div>
    </article>
  );
}
