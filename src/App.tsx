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
import { prototypeState } from "./data/mockData";
import type {
  ActivityEventType,
  AgentRole,
  AgentStatus,
  InboxItemType,
  RiskLevel,
  TaskStatus as DomainTaskStatus,
} from "./types/domain";

type DisplayAgentRole = "Planner" | "Coder" | "Reviewer" | "Tester";
type TaskStatus = "Backlog" | "Ready" | "Running" | "Review" | "Done";
type Risk = "Low" | "Medium" | "High";
type Tab = "channel" | "console";
type InboxState = "open" | "approved" | "changes";
type ReviewState = "waiting" | "approved" | "changes";

type Agent = {
  id: string;
  role: DisplayAgentRole;
  name: string;
  status: string;
  load: string;
};

type Task = {
  id: string;
  title: string;
  description: string;
  owner: DisplayAgentRole;
  status: TaskStatus;
  files: string[];
  risk: Risk;
  update: string;
};

type ChannelMessage = {
  id: string;
  agent: DisplayAgentRole;
  kind: string;
  text: string;
  time: string;
  taskId?: string;
};

type ConsoleEvent = {
  id: string;
  agent: DisplayAgentRole;
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
  agent: DisplayAgentRole;
  taskId?: string;
  detail: string;
  state: InboxState;
};

const roleLabels: Record<AgentRole, DisplayAgentRole> = {
  planner: "Planner",
  coder: "Coder",
  reviewer: "Reviewer",
  tester: "Tester",
};

const statusLabels: Record<DomainTaskStatus, TaskStatus> = {
  backlog: "Backlog",
  ready: "Ready",
  running: "Running",
  review: "Review",
  done: "Done",
};

const riskLabels: Record<RiskLevel, Risk> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const agentLoadLabels: Record<AgentStatus, string> = {
  idle: "Standing by",
  planning: "Plan active",
  running: "Execution active",
  reviewing: "Review active",
  blocked: "Blocked",
  done: "Complete",
};

const eventSeverity: Record<ActivityEventType, ConsoleEvent["severity"]> = {
  reasoning: "normal",
  command_run: "normal",
  command_result: "ok",
  file_changed: "ok",
  test_run: "normal",
  warning: "warn",
  external_call: "normal",
};

const inboxStateLabels = {
  open: "open",
  approved: "approved",
  rejected: "changes",
  answered: "approved",
} satisfies Record<string, InboxState>;

const inboxTypeLabels: Record<InboxItemType, string> = {
  approve_plan: "approve plan",
  approve_command: "approve command",
  approve_file_scope: "approve file scope",
  review_diff: "review diff",
  answer_blocker: "answer blocker",
  accept_follow_up: "accept follow-up",
};

const labelize = (value: string) => value.replace(/_/g, " ");

const agents: Agent[] = prototypeState.agents.map((agent) => ({
  id: agent.id,
  role: roleLabels[agent.role],
  name: agent.name,
  status: agent.lastUpdate,
  load: agentLoadLabels[agent.status],
}));

const ownerByAgentId = new Map(
  prototypeState.agents.map((agent) => [agent.id, roleLabels[agent.role]]),
);

const initialTasks: Task[] = prototypeState.tasks.map((task) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  owner: ownerByAgentId.get(task.ownerAgentId) ?? "Planner",
  status: statusLabels[task.status],
  files: task.fileScope,
  risk: riskLabels[task.risk],
  update: task.lastUpdate,
}));

const initialMessages: ChannelMessage[] = prototypeState.channelMessages.map((message) => ({
  id: message.id,
  agent: ownerByAgentId.get(message.agentId) ?? "Planner",
  kind: labelize(message.type),
  text: message.body,
  time: message.timestamp,
  taskId: message.taskId,
}));

const initialEvents: ConsoleEvent[] = prototypeState.activityEvents.map((event) => ({
  id: event.id,
  agent: ownerByAgentId.get(event.agentId) ?? "Planner",
  kind: labelize(event.type),
  text: event.command ? `${event.summary} (${event.command})` : event.summary,
  time: event.timestamp,
  taskId: event.taskId,
  severity: eventSeverity[event.type],
}));

const initialInbox: InboxItem[] = prototypeState.inboxItems.map((item) => ({
  id: item.id,
  title: item.title,
  type: inboxTypeLabels[item.type],
  agent: ownerByAgentId.get(item.agentId) ?? "Planner",
  taskId: item.taskId,
  detail: item.summary,
  state: inboxStateLabels[item.status],
}));

const planInboxId =
  prototypeState.inboxItems.find((item) => item.type === "approve_plan")?.id ?? "";
const reviewGate = prototypeState.reviewGate;
const initialReviewState: ReviewState =
  reviewGate.status === "approved"
    ? "approved"
    : reviewGate.status === "changes_requested"
      ? "changes"
      : "waiting";

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
  const [selectedTaskId, setSelectedTaskId] = useStateWithDefault(prototypeState.selectedTaskId);
  const [selectedInboxId, setSelectedInboxId] = useStateWithDefault(prototypeState.selectedInboxItemId);
  const [activeTab, setActiveTab] = useState<Tab>(prototypeState.activeTimelineTab);
  const [planApproved, setPlanApproved] = useState(prototypeState.planApproved);
  const [reviewState, setReviewState] = useState<ReviewState>(initialReviewState);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];
  const selectedInbox = inboxItems.find((item) => item.id === selectedInboxId) ?? inboxItems[0];
  const reviewTask = tasks.find((task) => task.status === "Review") ?? selectedTask;
  const openInboxCount = inboxItems.filter((item) => item.state === "open").length;
  const doneCount = tasks.filter((task) => task.status === "Done").length;

  function pushMessage(agent: DisplayAgentRole, kind: string, text: string, taskId?: string) {
    setMessages((current) => [
      ...current,
      { id: `m-${Date.now()}`, agent, kind, text, time: "now", taskId },
    ]);
  }

  function pushEvent(agent: DisplayAgentRole, kind: string, text: string, taskId?: string, severity: ConsoleEvent["severity"] = "normal") {
    setEvents((current) => [
      ...current,
      { id: `e-${Date.now()}`, agent, kind, text, time: "now", taskId, severity },
    ]);
  }

  function approvePlan() {
    setPlanApproved(true);
    setInboxItems((current) =>
      current.map((item) =>
        item.id === planInboxId ? { ...item, state: "approved" } : item,
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
    if (selectedInbox.id === planInboxId && state === "approved") {
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
            <span className="eyebrow">AgentTeam / {prototypeState.projectName}</span>
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
            <strong>{prototypeState.goal}</strong>
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
                  <strong>{reviewGate.changedFiles.join(", ")}</strong>
                </div>
                <div>
                  <span>Diff summary</span>
                  <strong>{reviewGate.diffSummary.join(" ")}</strong>
                </div>
                <div>
                  <span>Tests</span>
                  <strong>{reviewGate.tests.map((test) => `${test.command}: ${test.summary}`).join(" ")}</strong>
                </div>
                <div>
                  <span>Risk note</span>
                  <strong>{reviewGate.riskNotes.join(" ")}</strong>
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
