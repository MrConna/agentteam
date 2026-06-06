import {
  Activity,
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Code2,
  GitPullRequest,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Terminal,
  UserCheck,
  X,
} from "lucide-react";
import { useState } from "react";

type AgentRole = "Planner" | "Coder" | "Reviewer" | "Tester";
type TaskStatus = "Backlog" | "Ready" | "Running" | "Review" | "Done";
type Risk = "Low" | "Medium" | "High";
type Tab = "channel" | "console";
type InboxState = "open" | "approved" | "changes";
type ReviewState = "waiting" | "approved" | "changes";

type Agent = {
  id: string;
  role: AgentRole;
  name: string;
  status: string;
  load: string;
};

type Task = {
  id: string;
  title: string;
  description: string;
  owner: AgentRole;
  status: TaskStatus;
  files: string[];
  risk: Risk;
  update: string;
};

type ChannelMessage = {
  id: string;
  agent: AgentRole;
  kind: string;
  text: string;
  time: string;
  taskId?: string;
};

type ConsoleEvent = {
  id: string;
  agent: AgentRole;
  kind: string;
  text: string;
  time: string;
  taskId?: string;
  severity?: "normal" | "warn" | "ok";
};

type InboxItem = {
  id: string;
  title: string;
  type: string;
  agent: AgentRole;
  taskId?: string;
  detail: string;
  state: InboxState;
};

const agents: Agent[] = [
  { id: "planner", role: "Planner", name: "Planwright", status: "Plan ready", load: "1 approval" },
  { id: "coder", role: "Coder", name: "Patch", status: "Implementing OAuth", load: "2 files" },
  { id: "reviewer", role: "Reviewer", name: "Rook", status: "Review gate armed", load: "1 verdict" },
  { id: "tester", role: "Tester", name: "Gauge", status: "Smoke checks queued", load: "3 checks" },
];

const initialTasks: Task[] = [
  {
    id: "task-audit",
    title: "Audit current auth structure",
    description: "Map the login flow, session storage, and protected-route assumptions before adding a provider.",
    owner: "Planner",
    status: "Done",
    files: ["app/layout.tsx", "lib/session.ts"],
    risk: "Low",
    update: "Auth surface mapped; no existing OAuth provider.",
  },
  {
    id: "task-oauth",
    title: "Add GitHub OAuth provider",
    description: "Add provider configuration, callback handling, and environment-variable notes.",
    owner: "Coder",
    status: "Running",
    files: ["lib/auth.ts", ".env.example", "app/api/auth/[...nextauth]/route.ts"],
    risk: "High",
    update: "Provider wired; callback path needs confirmation.",
  },
  {
    id: "task-login",
    title: "Build login screen",
    description: "Create the first authenticated entry point with GitHub sign-in and failure states.",
    owner: "Coder",
    status: "Ready",
    files: ["app/login/page.tsx", "components/auth/LoginPanel.tsx"],
    risk: "Medium",
    update: "Ready after provider approval.",
  },
  {
    id: "task-dashboard",
    title: "Protect dashboard route",
    description: "Redirect anonymous visitors and preserve the requested dashboard destination.",
    owner: "Coder",
    status: "Backlog",
    files: ["app/dashboard/layout.tsx", "middleware.ts"],
    risk: "Medium",
    update: "Blocked on auth provider.",
  },
  {
    id: "task-smoke",
    title: "Add smoke tests",
    description: "Cover login redirect, provider button rendering, and protected dashboard access.",
    owner: "Tester",
    status: "Review",
    files: ["tests/auth.spec.ts"],
    risk: "Low",
    update: "Smoke test diff is ready for review.",
  },
  {
    id: "task-env",
    title: "Review environment variables",
    description: "Confirm required GitHub client id, secret, callback URL, and session secret.",
    owner: "Reviewer",
    status: "Backlog",
    files: [".env.example", "docs/setup.md"],
    risk: "High",
    update: "Needs reviewer pass before ship.",
  },
];

const initialMessages: ChannelMessage[] = [
  { id: "m1", agent: "Planner", kind: "plan proposed", text: "Six-task plan proposed for GitHub OAuth and protected dashboard.", time: "09:12" },
  { id: "m2", agent: "Coder", kind: "task started", text: "Started provider wiring. Limiting changes to auth route and env example.", time: "09:19", taskId: "task-oauth" },
  { id: "m3", agent: "Reviewer", kind: "approval requested", text: "Review gate will require env notes, callback path, and smoke test evidence.", time: "09:27", taskId: "task-oauth" },
  { id: "m4", agent: "Tester", kind: "review completed", text: "Smoke spec is ready. No browser run yet; command approval pending.", time: "09:35", taskId: "task-smoke" },
];

const initialEvents: ConsoleEvent[] = [
  { id: "e1", agent: "Planner", kind: "reasoning", text: "Detected existing session helper and no provider registry.", time: "09:13", severity: "normal" },
  { id: "e2", agent: "Coder", kind: "file changed", text: "lib/auth.ts: added GitHub provider shell and session callback.", time: "09:22", taskId: "task-oauth", severity: "ok" },
  { id: "e3", agent: "Coder", kind: "warning", text: "Callback path must match GitHub app settings before final approval.", time: "09:24", taskId: "task-oauth", severity: "warn" },
  { id: "e4", agent: "Tester", kind: "test run", text: "Queued npm run test:smoke for auth redirect coverage.", time: "09:36", taskId: "task-smoke", severity: "normal" },
];

const initialInbox: InboxItem[] = [
  {
    id: "inbox-plan",
    title: "Approve generated task plan",
    type: "approve plan",
    agent: "Planner",
    detail: "Planner proposes six scoped tasks with explicit review gates for env and route protection.",
    state: "open",
  },
  {
    id: "inbox-env",
    title: "Approve reading .env.example",
    type: "approve file scope",
    agent: "Coder",
    taskId: "task-oauth",
    detail: "Coder needs to inspect .env.example and update only documented variable names.",
    state: "open",
  },
  {
    id: "inbox-callback",
    title: "Confirm GitHub callback path",
    type: "answer blocker",
    agent: "Reviewer",
    taskId: "task-oauth",
    detail: "Use /api/auth/callback/github for local and production GitHub app settings.",
    state: "open",
  },
  {
    id: "inbox-diff",
    title: "Review smoke test diff",
    type: "review diff",
    agent: "Tester",
    taskId: "task-smoke",
    detail: "Smoke test adds redirect and provider-button checks without touching app behavior.",
    state: "open",
  },
];

const columns: TaskStatus[] = ["Backlog", "Ready", "Running", "Review", "Done"];
const statusOrder: Record<TaskStatus, number> = {
  Backlog: 0,
  Ready: 1,
  Running: 2,
  Review: 3,
  Done: 4,
};

const riskClass = (risk: Risk) => `risk risk-${risk.toLowerCase()}`;

function App() {
  const [tasks, setTasks] = useLocalTasks();
  const [messages, setMessages] = useLocalMessages();
  const [events, setEvents] = useLocalEvents();
  const [inboxItems, setInboxItems] = useLocalInbox();
  const [selectedTaskId, setSelectedTaskId] = useStateWithDefault("task-oauth");
  const [selectedInboxId, setSelectedInboxId] = useStateWithDefault("inbox-plan");
  const [activeTab, setActiveTab] = useState<Tab>("channel");
  const [planApproved, setPlanApproved] = useState(false);
  const [reviewState, setReviewState] = useState<ReviewState>("waiting");

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const selectedInbox = inboxItems.find((item) => item.id === selectedInboxId) ?? inboxItems[0];
  const reviewTask = tasks.find((task) => task.status === "Review") ?? selectedTask;
  const openInboxCount = inboxItems.filter((item) => item.state === "open").length;
  const doneCount = tasks.filter((task) => task.status === "Done").length;

  function pushMessage(agent: AgentRole, kind: string, text: string, taskId?: string) {
    setMessages((current) => [
      ...current,
      { id: `m-${Date.now()}`, agent, kind, text, time: "now", taskId },
    ]);
  }

  function pushEvent(agent: AgentRole, kind: string, text: string, taskId?: string, severity: ConsoleEvent["severity"] = "normal") {
    setEvents((current) => [
      ...current,
      { id: `e-${Date.now()}`, agent, kind, text, time: "now", taskId, severity },
    ]);
  }

  function approvePlan() {
    setPlanApproved(true);
    setInboxItems((current) =>
      current.map((item) =>
        item.id === "inbox-plan" ? { ...item, state: "approved" } : item,
      ),
    );
    pushMessage("Planner", "plan approved", "Plan approved. Coder can continue provider and login work.");
    pushEvent("Planner", "approval", "Human approved generated six-task plan.", undefined, "ok");
  }

  function updateInbox(state: InboxState) {
    setInboxItems((current) =>
      current.map((item) =>
        item.id === selectedInbox.id ? { ...item, state } : item,
      ),
    );
    const action = state === "approved" ? "approved" : "sent back";
    pushMessage(selectedInbox.agent, state === "approved" ? "approval resolved" : "changes requested", `${selectedInbox.title} ${action}.`, selectedInbox.taskId);
    pushEvent(selectedInbox.agent, "inbox decision", `${selectedInbox.type}: ${selectedInbox.title} -> ${state}.`, selectedInbox.taskId, state === "approved" ? "ok" : "warn");
    if (selectedInbox.id === "inbox-plan" && state === "approved") {
      setPlanApproved(true);
    }
  }

  function moveTask(nextStatus: TaskStatus) {
    setTasks((current) =>
      current.map((task) =>
        task.id === selectedTask.id
          ? {
              ...task,
              status: nextStatus,
              update:
                nextStatus === "Review"
                  ? "Implementation handed to review gate."
                  : nextStatus === "Done"
                    ? "Approved and closed by human operator."
                    : task.update,
            }
          : task,
      ),
    );
    pushMessage(selectedTask.owner, nextStatus === "Review" ? "handoff" : "task updated", `${selectedTask.title} moved to ${nextStatus}.`, selectedTask.id);
    pushEvent(selectedTask.owner, "task state", `${selectedTask.id}: ${selectedTask.status} -> ${nextStatus}.`, selectedTask.id, nextStatus === "Done" ? "ok" : "normal");
  }

  function decideReview(state: ReviewState) {
    setReviewState(state);
    if (state === "approved") {
      setTasks((current) =>
        current.map((task) =>
          task.id === reviewTask.id
            ? { ...task, status: "Done", update: "Review gate approved; task is done." }
            : task,
        ),
      );
      setSelectedTaskId(reviewTask.id);
      pushMessage("Reviewer", "approved", `${reviewTask.title} approved through review gate.`, reviewTask.id);
      pushEvent("Reviewer", "review gate", "Human approved diff, tests, and risk notes.", reviewTask.id, "ok");
      return;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === reviewTask.id
          ? { ...task, status: "Ready", update: "Changes requested; returned to ready queue." }
          : task,
      ),
    );
    setSelectedTaskId(reviewTask.id);
    pushMessage("Reviewer", "changes requested", `${reviewTask.title} returned for follow-up changes.`, reviewTask.id);
    pushEvent("Reviewer", "review gate", "Human requested changes before approval.", reviewTask.id, "warn");
  }

  return (
    <div className="app-shell">
      <aside className="left-rail" aria-label="Workspace navigation">
        <div className="brand-mark">AT</div>
        <button className="rail-button active" title="Command center" aria-label="Command center">
          <LayoutDashboard size={18} />
        </button>
        <button className="rail-button" title="Agents" aria-label="Agents">
          <Bot size={18} />
        </button>
        <button className="rail-button" title="Inbox" aria-label="Inbox">
          <Inbox size={18} />
        </button>
        <button className="rail-button" title="Review gates" aria-label="Review gates">
          <ShieldCheck size={18} />
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="project-title">
            <span className="eyebrow">AgentTeam / Personal CRM</span>
            <h1>Operator Console</h1>
          </div>
          <div className="run-strip" aria-label="Run status">
            <span className="status-pill live"><Activity size={14} /> Run active</span>
            <span className="metric"><Clock3 size={14} /> 42m elapsed</span>
            <span className="metric"><Inbox size={14} /> {openInboxCount} open</span>
            <span className="metric"><ClipboardCheck size={14} /> {doneCount}/{tasks.length} done</span>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="Pause run" aria-label="Pause run">
              <Pause size={15} />
            </button>
            <button className="icon-button" title="Replan" aria-label="Replan">
              <RotateCcw size={15} />
            </button>
            <button className="primary-button small">
              <Play size={15} /> Run
            </button>
          </div>
        </header>

        <section className="goal-bar" aria-label="Current goal">
          <div>
            <span className="label">Current goal</span>
            <strong>Add GitHub OAuth login and a protected dashboard.</strong>
          </div>
          <button
            className={planApproved ? "success-button" : "primary-button"}
            onClick={approvePlan}
            disabled={planApproved}
          >
            <Check size={15} />
            {planApproved ? "Plan approved" : "Approve plan"}
          </button>
        </section>

        <section className="agent-row" aria-label="Agent team status">
          {agents.map((agent) => (
            <article className="agent-tile" key={agent.id}>
              <div className={`agent-avatar ${agent.role.toLowerCase()}`}>{agent.role.slice(0, 1)}</div>
              <div>
                <div className="agent-name">{agent.name}</div>
                <div className="agent-meta">{agent.role} · {agent.status}</div>
              </div>
              <span>{agent.load}</span>
            </article>
          ))}
        </section>

        <div className="console-grid">
          <section className="board-panel" aria-label="Task board">
            <div className="panel-header">
              <div>
                <span className="label">Task board</span>
                <h2>Personal CRM run</h2>
              </div>
              <span className="hint">Select a card to inspect scope and actions</span>
            </div>
            <div className="task-board">
              {columns.map((column) => (
                <div className="task-column" key={column}>
                  <div className="column-header">
                    <span>{column}</span>
                    <span>{tasks.filter((task) => task.status === column).length}</span>
                  </div>
                  {tasks
                    .filter((task) => task.status === column)
                    .map((task) => (
                      <button
                        key={task.id}
                        className={`task-card ${selectedTask.id === task.id ? "selected" : ""}`}
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <div className="task-card-top">
                          <span className={riskClass(task.risk)}>{task.risk}</span>
                          <span className="owner">{task.owner}</span>
                        </div>
                        <strong>{task.title}</strong>
                        <p>{task.update}</p>
                        <div className="file-scope">{task.files[0]}</div>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </section>

          <section className="timeline-panel" aria-label="Project evidence">
            <div className="tabs" role="tablist">
              <button
                className={activeTab === "channel" ? "active" : ""}
                onClick={() => setActiveTab("channel")}
                role="tab"
                aria-selected={activeTab === "channel"}
              >
                <MessageSquare size={15} /> Project channel
              </button>
              <button
                className={activeTab === "console" ? "active" : ""}
                onClick={() => setActiveTab("console")}
                role="tab"
                aria-selected={activeTab === "console"}
              >
                <Terminal size={15} /> Run console
              </button>
            </div>
            {activeTab === "channel" ? (
              <div className="message-list">
                {messages.map((message) => (
                  <article className="message" key={message.id}>
                    <div className="message-icon"><Bot size={14} /></div>
                    <div>
                      <div className="message-meta">
                        <strong>{message.agent}</strong>
                        <span>{message.kind}</span>
                        <time>{message.time}</time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="event-list">
                {events.map((event) => (
                  <article className={`event ${event.severity ?? "normal"}`} key={event.id}>
                    <span className="event-time">{event.time}</span>
                    <span className="event-kind">{event.kind}</span>
                    <p>{event.text}</p>
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
                    className={`inbox-item ${selectedInbox.id === item.id ? "selected" : ""} ${item.state}`}
                    key={item.id}
                    onClick={() => setSelectedInboxId(item.id)}
                  >
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.type} · {item.agent}</span>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
              <div className="decision-detail">
                <span className="label">{selectedInbox.type}</span>
                <h3>{selectedInbox.title}</h3>
                <p>{selectedInbox.detail}</p>
                <div className="button-row">
                  <button className="success-button" onClick={() => updateInbox("approved")}>
                    <Check size={15} /> Approve
                  </button>
                  <button className="danger-button" onClick={() => updateInbox("changes")}>
                    <X size={15} /> Changes
                  </button>
                </div>
              </div>
            </section>

            <section className="detail-panel" aria-label="Selected task details">
              <div className="panel-header tight">
                <div>
                  <span className="label">Selected task</span>
                  <h2>{selectedTask.title}</h2>
                </div>
                <span className={`status-badge status-${selectedTask.status.toLowerCase()}`}>{selectedTask.status}</span>
              </div>
              <p>{selectedTask.description}</p>
              <div className="detail-grid">
                <span>Owner</span><strong>{selectedTask.owner}</strong>
                <span>Risk</span><strong className={riskClass(selectedTask.risk)}>{selectedTask.risk}</strong>
                <span>Scope</span><strong>{selectedTask.files.length} files</strong>
              </div>
              <div className="file-list">
                {selectedTask.files.map((file) => (
                  <span key={file}><Code2 size={13} /> {file}</span>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => moveTask("Review")}
                  disabled={statusOrder[selectedTask.status] >= statusOrder.Review}
                >
                  <GitPullRequest size={15} /> Move to review
                </button>
                <button
                  className="success-button"
                  onClick={() => moveTask("Done")}
                  disabled={selectedTask.status === "Done"}
                >
                  <Check size={15} /> Done
                </button>
              </div>
            </section>

            <section className="review-panel" aria-label="Review gate">
              <div className="panel-header tight">
                <div>
                  <span className="label">Review gate</span>
                  <h2>{reviewTask.title}</h2>
                </div>
                <span className={`review-state ${reviewState}`}>{reviewState}</span>
              </div>
              <div className="review-summary">
                <div>
                  <span>Changed files</span>
                  <strong>{reviewTask.files.join(", ")}</strong>
                </div>
                <div>
                  <span>Diff summary</span>
                  <strong>Provider setup, route guard, and smoke coverage prepared.</strong>
                </div>
                <div>
                  <span>Tests</span>
                  <strong>Smoke checks queued; tester confidence 78%.</strong>
                </div>
                <div>
                  <span>Risk note</span>
                  <strong>OAuth callback and env secrets require operator confirmation.</strong>
                </div>
              </div>
              <div className="button-row">
                <button className="success-button" onClick={() => decideReview("approved")}>
                  <UserCheck size={15} /> Approve
                </button>
                <button className="danger-button" onClick={() => decideReview("changes")}>
                  <AlertTriangle size={15} /> Request changes
                </button>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function useStateWithDefault(initial: string) {
  return useState(initial);
}

function useLocalTasks() {
  return useState<Task[]>(initialTasks);
}

function useLocalMessages() {
  return useState<ChannelMessage[]>(initialMessages);
}

function useLocalEvents() {
  return useState<ConsoleEvent[]>(initialEvents);
}

function useLocalInbox() {
  return useState<InboxItem[]>(initialInbox);
}

export default App;
