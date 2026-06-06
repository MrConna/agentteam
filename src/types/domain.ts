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
}
