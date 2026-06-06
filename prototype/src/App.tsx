import { useMemo, useState } from "react";
import {
  agents as seedAgents,
  channelMessages as seedMessages,
  activity as seedActivity,
  inboxItems as seedInbox,
  project as seedProject,
  reviewGates,
  tasks as seedTasks,
} from "./mockData";
import type {
  Agent,
  ChannelMessage,
  ActivityEvent,
  InboxItem,
  ReviewGate,
  Task,
  TaskStatus,
} from "./types";

type ActivityTab = "channel" | "console";
type RailNav = "board" | "agents" | "inbox" | "settings";

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "running", label: "Running" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

function fmtTime(ts: string) {
  return ts.slice(11, 16);
}

function agentName(id: string, agents: Agent[]) {
  return agents.find((a) => a.id === id)?.name ?? id;
}

export default function App() {
  const [project, setProject] = useState(seedProject);
  const [tasks, setTasks] = useState<Task[]>(seedTasks);
  const [agents] = useState<Agent[]>(seedAgents);
  const [messages, setMessages] = useState<ChannelMessage[]>(seedMessages);
  const [activity] = useState<ActivityEvent[]>(seedActivity);
  const [inbox, setInbox] = useState<InboxItem[]>(seedInbox);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("t_login");
  const [activityTab, setActivityTab] = useState<ActivityTab>("channel");
  const [nav, setNav] = useState<RailNav>("board");

  const openInboxCount = inbox.filter((i) => i.status === "open").length;
  const reviewCount = tasks.filter((t) => t.status === "review").length;

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId),
    [tasks, selectedTaskId],
  );
  const selectedGate = selectedTask ? reviewGates[selectedTask.id] : undefined;

  const approvePlan = () => {
    setProject((p) => ({ ...p, planApproved: true }));
    setInbox((items) =>
      items.map((i) =>
        i.type === "approve_plan" ? { ...i, status: "resolved" } : i,
      ),
    );
    setMessages((m) => [
      ...m,
      {
        id: `m_${Date.now()}`,
        agentId: "a_plan",
        type: "plan_proposed",
        body: "Plan approved by operator. Coder picking up t_oauth.",
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const moveTask = (taskId: string, next: TaskStatus) => {
    setTasks((ts) =>
      ts.map((t) =>
        t.id === taskId
          ? { ...t, status: next, updatedAt: new Date().toISOString() }
          : t,
      ),
    );
  };

  const resolveInbox = (id: string) => {
    setInbox((items) =>
      items.map((i) => (i.id === id ? { ...i, status: "resolved" } : i)),
    );
  };

  const handleInboxAction = (item: InboxItem) => {
    if (item.type === "approve_plan") {
      approvePlan();
      return;
    }
    if (item.type === "review_diff" && item.relatedTaskId) {
      setSelectedTaskId(item.relatedTaskId);
      resolveInbox(item.id);
      return;
    }
    if (item.type === "accept_follow_up" && item.relatedTaskId) {
      const newTask: Task = {
        id: `t_followup_${Date.now()}`,
        title: "Surface session expiry messaging",
        description:
          "Show user-friendly message when session expires; ensure login redirect preserves intent.",
        ownerAgentId: "a_code",
        status: "backlog",
        riskLevel: "low",
        fileScope: ["app/login/**", "app/dashboard/**"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setTasks((ts) => [...ts, newTask]);
      resolveInbox(item.id);
      return;
    }
    resolveInbox(item.id);
  };

  const approveReview = (taskId: string) => {
    moveTask(taskId, "done");
    setMessages((m) => [
      ...m,
      {
        id: `m_${Date.now()}`,
        agentId: "a_rev",
        type: "ship_summary",
        body: `Approved ${taskId}. Marked done.`,
        taskId,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const requestChanges = (taskId: string) => {
    moveTask(taskId, "running");
    setMessages((m) => [
      ...m,
      {
        id: `m_${Date.now()}`,
        agentId: "a_rev",
        type: "review_completed",
        body: `Changes requested on ${taskId}. Sent back to running.`,
        taskId,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="app">
      <TopBar
        project={project.name}
        running={tasks.some((t) => t.status === "running")}
      />
      <div className="body">
        <LeftRail
          nav={nav}
          onNav={setNav}
          inboxCount={openInboxCount}
          reviewCount={reviewCount}
        />
        <main className="main">
          <GoalStrip
            goal={project.goal}
            planApproved={project.planApproved}
            onApprovePlan={approvePlan}
          />
          <Board
            tasks={tasks}
            agents={agents}
            selectedTaskId={selectedTaskId}
            onSelect={setSelectedTaskId}
            onAdvance={moveTask}
          />
          <ActivityPane
            tab={activityTab}
            onTab={setActivityTab}
            messages={messages}
            activity={activity}
            agents={agents}
          />
        </main>
        <RightPanel
          agents={agents}
          tasks={tasks}
          inbox={inbox}
          onInboxAction={handleInboxAction}
          selectedTask={selectedTask}
          gate={selectedGate}
          onApproveReview={approveReview}
          onRequestChanges={requestChanges}
        />
      </div>
    </div>
  );
}

function TopBar({ project, running }: { project: string; running: boolean }) {
  return (
    <header className="topbar">
      <span className="workspace">workspace/solo</span>
      <span>›</span>
      <span className="project">{project}</span>
      <span className="spacer" />
      <span className="run-status">
        <span className="dot" />
        {running ? "agents running" : "idle"}
      </span>
      <div className="global-actions">
        <button>Pause</button>
        <button>Replan</button>
        <button className="primary">Run</button>
      </div>
    </header>
  );
}

function LeftRail({
  nav,
  onNav,
  inboxCount,
  reviewCount,
}: {
  nav: RailNav;
  onNav: (n: RailNav) => void;
  inboxCount: number;
  reviewCount: number;
}) {
  const item = (key: RailNav, label: string, count?: number) => (
    <div
      key={key}
      className={`nav-item ${nav === key ? "active" : ""}`}
      onClick={() => onNav(key)}
    >
      <span className="label">{label}</span>
      {count !== undefined && count > 0 ? (
        <span className="count">{count}</span>
      ) : null}
    </div>
  );
  return (
    <nav className="rail">
      <div className="section">Project</div>
      {item("board", "Command Center")}
      {item("agents", "Agents")}
      {item("inbox", "Inbox", inboxCount)}
      <div className="section">Gates</div>
      {item("board", "Review", reviewCount)}
      <div className="section">System</div>
      {item("settings", "Settings")}
    </nav>
  );
}

function GoalStrip({
  goal,
  planApproved,
  onApprovePlan,
}: {
  goal: string;
  planApproved: boolean;
  onApprovePlan: () => void;
}) {
  return (
    <div className="goal-strip">
      <span className="label">Goal</span>
      <span className="goal-text">{goal}</span>
      <span className={`plan-state ${planApproved ? "approved" : ""}`}>
        {planApproved ? "plan approved" : "plan pending approval"}
      </span>
      {!planApproved && (
        <button className="primary" onClick={onApprovePlan}>
          Approve plan
        </button>
      )}
    </div>
  );
}

function Board({
  tasks,
  agents,
  selectedTaskId,
  onSelect,
  onAdvance,
}: {
  tasks: Task[];
  agents: Agent[];
  selectedTaskId: string;
  onSelect: (id: string) => void;
  onAdvance: (id: string, next: TaskStatus) => void;
}) {
  return (
    <section className="board">
      {COLUMNS.map((col) => {
        const cards = tasks.filter((t) => t.status === col.key);
        return (
          <div className="column" key={col.key}>
            <div className="column-head">
              {col.label}
              <span className="pill">{cards.length}</span>
            </div>
            <div className="column-body">
              {cards.length === 0 && <div className="empty">empty</div>}
              {cards.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  owner={agentName(t.ownerAgentId, agents)}
                  selected={t.id === selectedTaskId}
                  onClick={() => onSelect(t.id)}
                  onAdvance={onAdvance}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TaskCard({
  task,
  owner,
  selected,
  onClick,
  onAdvance,
}: {
  task: Task;
  owner: string;
  selected: boolean;
  onClick: () => void;
  onAdvance: (id: string, next: TaskStatus) => void;
}) {
  const nextMap: Partial<Record<TaskStatus, TaskStatus>> = {
    backlog: "ready",
    ready: "running",
    running: "review",
    review: "done",
  };
  const nextStatus = nextMap[task.status];
  return (
    <div
      className={`task-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="title">{task.title}</div>
      <div className="meta">
        <span>{owner}</span>
        <span>·</span>
        <span className={`risk ${task.riskLevel}`}>{task.riskLevel}</span>
        <span style={{ marginLeft: "auto" }}>
          {nextStatus && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(task.id, nextStatus);
              }}
            >
              → {nextStatus}
            </button>
          )}
        </span>
      </div>
      <div className="files">{task.fileScope.join("  ")}</div>
    </div>
  );
}

function ActivityPane({
  tab,
  onTab,
  messages,
  activity,
  agents,
}: {
  tab: ActivityTab;
  onTab: (t: ActivityTab) => void;
  messages: ChannelMessage[];
  activity: ActivityEvent[];
  agents: Agent[];
}) {
  return (
    <section className="activity">
      <div className="activity-tabs">
        <div
          className={`tab ${tab === "channel" ? "active" : ""}`}
          onClick={() => onTab("channel")}
        >
          Project Channel
        </div>
        <div
          className={`tab ${tab === "console" ? "active" : ""}`}
          onClick={() => onTab("console")}
        >
          Run Console
        </div>
      </div>
      <div className="activity-body">
        {tab === "channel"
          ? messages.map((m) => (
              <div className="channel-msg" key={m.id}>
                <span className="agent">{agentName(m.agentId, agents)}</span>
                <span className="kind">{m.type}</span>
                <span className="body">{m.body}</span>
              </div>
            ))
          : activity.map((e) => (
              <div className={`event-row ${e.type}`} key={e.id}>
                <span className="time">{fmtTime(e.timestamp)}</span>
                <span className="agent">{agentName(e.agentId, agents)}</span>
                <span className="type">{e.type}</span>
                <span>{e.summary}</span>
              </div>
            ))}
      </div>
    </section>
  );
}

function RightPanel({
  agents,
  tasks,
  inbox,
  onInboxAction,
  selectedTask,
  gate,
  onApproveReview,
  onRequestChanges,
}: {
  agents: Agent[];
  tasks: Task[];
  inbox: InboxItem[];
  onInboxAction: (item: InboxItem) => void;
  selectedTask?: Task;
  gate?: ReviewGate;
  onApproveReview: (id: string) => void;
  onRequestChanges: (id: string) => void;
}) {
  return (
    <aside className="right">
      <div>
        <div className="section-title">Agent Team</div>
        <div className="agent-team">
          {agents.map((a) => {
            const task = tasks.find((t) => t.id === a.currentTaskId);
            return (
              <div className="agent-row" key={a.id}>
                <div>
                  <div className="name">{a.name}</div>
                  <div className="role">{a.role}</div>
                  {task && (
                    <div className="files" style={{ marginTop: 4 }}>
                      ↳ {task.title}
                    </div>
                  )}
                </div>
                <div className={`status ${a.status}`}>{a.status}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="section-title">
          {selectedTask ? "Selected Task" : "Inbox"}
        </div>
        {selectedTask ? (
          <div className="detail">
            <h3>{selectedTask.title}</h3>
            <div className="kv">
              <span className="k">status</span>
              <span>
                <span className={`status-chip ${selectedTask.status}`}>
                  {selectedTask.status}
                </span>
              </span>
              <span className="k">owner</span>
              <span>{agentName(selectedTask.ownerAgentId, agents)}</span>
              <span className="k">risk</span>
              <span className={`risk ${selectedTask.riskLevel}`}>
                {selectedTask.riskLevel}
              </span>
              <span className="k">updated</span>
              <span>{fmtTime(selectedTask.updatedAt)}</span>
            </div>
            <div className="description">{selectedTask.description}</div>
            <div className="files">
              <div className="section-title" style={{ padding: "10px 0 4px" }}>
                File scope
              </div>
              {selectedTask.fileScope.map((f) => (
                <div className="file" key={f}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty">No task selected.</div>
        )}
      </div>

      <div>
        <div className="section-title">
          Inbox ({inbox.filter((i) => i.status === "open").length} open)
        </div>
        <div className="inbox">
          {inbox.map((i) => (
            <div
              key={i.id}
              className={`inbox-item ${i.status === "resolved" ? "resolved" : ""}`}
            >
              <div className="head">
                <span className="kind">{i.type.replace(/_/g, " ")}</span>
                <span className="title">{i.title}</span>
              </div>
              <div className="desc">{i.description}</div>
              {i.status === "open" && (
                <div className="actions">
                  <button
                    className="primary"
                    onClick={() => onInboxAction(i)}
                  >
                    {i.actionLabel}
                  </button>
                  <button onClick={() => onInboxAction(i)}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>

        {gate && selectedTask?.status === "review" && (
          <div className="review-gate">
            <div className="gate-head">
              <strong>Review Gate</strong>
              <span className={`badge ${gate.testStatus}`}>
                tests {gate.testStatus}
              </span>
              <span className={`verdict ${gate.reviewerVerdict}`}>
                {gate.reviewerVerdict.replace("_", " ")}
              </span>
            </div>
            <div className="diff-files">
              {gate.changedFiles.map((f) => (
                <div className="diff-file" key={f.path}>
                  <span className="path">{f.path}</span>
                  <span className="delta">
                    <span className="add">+{f.additions}</span>{" "}
                    <span className="del">−{f.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="diff-preview">
              {gate.changedFiles[0]?.preview}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {gate.riskNotes}
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {gate.verdictDetail}
            </div>
            <div className="gate-actions">
              <button
                className="primary"
                onClick={() => onApproveReview(selectedTask.id)}
              >
                Approve & ship
              </button>
              <button onClick={() => onRequestChanges(selectedTask.id)}>
                Request changes
              </button>
              <button className="danger">Discard</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
