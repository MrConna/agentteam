export type AgentRole = "planner" | "coder" | "reviewer" | "tester";

export type AgentStatus = "idle" | "planning" | "running" | "reviewing" | "blocked" | "done";

export type TaskStatus = "backlog" | "ready" | "running" | "review" | "done";

export type RiskLevel = "low" | "medium" | "high";

export type ChannelMessageType =
  | "plan_proposed"
  | "task_started"
  | "blocker_found"
  | "approval_requested"
  | "review_completed"
  | "follow_up_suggested"
  | "ship_summary";

export type ActivityEventType =
  | "reasoning"
  | "command_run"
  | "command_result"
  | "file_changed"
  | "test_run"
  | "warning"
  | "external_call";

export type InboxItemType =
  | "approve_plan"
  | "approve_command"
  | "approve_file_scope"
  | "review_diff"
  | "answer_blocker"
  | "accept_follow_up";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  responsibility: string;
  currentTaskId?: string;
  lastUpdate: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  ownerAgentId: string;
  status: TaskStatus;
  fileScope: string[];
  risk: RiskLevel;
  lastUpdate: string;
  dependencies: string[];
}

export interface ChannelMessage {
  id: string;
  type: ChannelMessageType;
  agentId: string;
  taskId?: string;
  timestamp: string;
  body: string;
}

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  agentId: string;
  taskId?: string;
  timestamp: string;
  title: string;
  summary: string;
  command?: string;
  files?: string[];
  status: "pending" | "running" | "success" | "warning" | "failed";
}

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  summary: string;
  agentId: string;
  taskId?: string;
  priority: "normal" | "high";
  status: "open" | "approved" | "rejected" | "answered";
}

export interface ReviewGate {
  id: string;
  taskId: string;
  status: "pending" | "approved" | "changes_requested";
  changedFiles: string[];
  diffSummary: string[];
  tests: {
    command: string;
    result: "passed" | "failed" | "not_run";
    summary: string;
  }[];
  riskNotes: string[];
  reviewerVerdict: string;
}

export interface DelegatedRun {
  id: string;
  taskId: string;
  agentId: string;
  provider: string;
  model: string;
  role: "planner" | "coder" | "reviewer" | "tester" | "scout" | "scribe";
  branch: string;
  worktree: string;
  status: "queued" | "running" | "blocked" | "completed" | "merged" | "failed";
  progress: number;
  budget: {
    tier: "cheap" | "standard" | "premium";
    maxMinutes: number;
    tokenPolicy: string;
  };
  assignedAt: string;
  lastHeartbeat: string;
  currentStep: string;
  nextStep: string;
  evidence: string[];
}

export interface PrototypeState {
  workspaceName: string;
  projectName: string;
  goal: string;
  runStatus: "planning" | "running" | "paused" | "review" | "ready_to_ship";
  selectedTaskId: string;
  selectedInboxItemId: string;
  activeTimelineTab: "channel" | "console";
  planApproved: boolean;
  agents: Agent[];
  tasks: Task[];
  channelMessages: ChannelMessage[];
  activityEvents: ActivityEvent[];
  inboxItems: InboxItem[];
  reviewGate: ReviewGate;
  delegatedRuns: DelegatedRun[];
}

/**
 * State assembled by the backend for one run. Same shape as the prototype state
 * but carries a runId and a list of review gates (one per task that reaches
 * review) instead of a single hard-coded gate.
 */
export interface ServerState {
  runId: string;
  workspaceName: string;
  projectName: string;
  goal: string;
  runStatus: "planning" | "running" | "paused" | "review" | "ready_to_ship";
  selectedTaskId: string;
  selectedInboxItemId: string;
  activeTimelineTab: "channel" | "console";
  planApproved: boolean;
  agents: Agent[];
  tasks: Task[];
  channelMessages: ChannelMessage[];
  activityEvents: ActivityEvent[];
  inboxItems: InboxItem[];
  reviewGates: ReviewGate[];
  delegatedRuns: DelegatedRun[];
}

export interface RunSummary {
  id: string;
  projectName: string;
  goal: string;
  runStatus: string;
  updatedAt: string;
}
