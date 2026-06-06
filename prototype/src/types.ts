export type AgentRole = "planner" | "coder" | "reviewer" | "tester";
export type AgentStatus = "idle" | "working" | "waiting" | "blocked";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  currentTaskId?: string;
}

export type TaskStatus = "backlog" | "ready" | "running" | "review" | "done";
export type RiskLevel = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  description: string;
  ownerAgentId: string;
  status: TaskStatus;
  riskLevel: RiskLevel;
  fileScope: string[];
  createdAt: string;
  updatedAt: string;
}

export type ChannelMessageType =
  | "plan_proposed"
  | "task_started"
  | "blocker"
  | "approval_requested"
  | "review_completed"
  | "follow_up"
  | "ship_summary";

export interface ChannelMessage {
  id: string;
  agentId: string;
  type: ChannelMessageType;
  body: string;
  taskId?: string;
  timestamp: string;
}

export type ActivityType =
  | "reasoning"
  | "command"
  | "result"
  | "file_change"
  | "test"
  | "warning"
  | "external_call";

export interface ActivityEvent {
  id: string;
  taskId: string;
  agentId: string;
  type: ActivityType;
  summary: string;
  detail?: string;
  timestamp: string;
}

export type InboxItemType =
  | "approve_plan"
  | "approve_command"
  | "approve_write"
  | "review_diff"
  | "answer_blocker"
  | "accept_follow_up";

export type InboxStatus = "open" | "resolved" | "dismissed";

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  description: string;
  relatedTaskId?: string;
  actionLabel: string;
  status: InboxStatus;
  createdAt: string;
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  preview: string;
}

export interface ReviewGate {
  taskId: string;
  changedFiles: DiffFile[];
  testStatus: "passing" | "failing" | "skipped";
  testSummary: string;
  riskNotes: string;
  reviewerVerdict: "approve" | "request_changes" | "pending";
  verdictDetail: string;
}

export interface Project {
  id: string;
  name: string;
  goal: string;
  planApproved: boolean;
}
