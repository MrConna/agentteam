import type {
  Agent,
  ChannelMessage,
  ActivityEvent,
  InboxItem,
  Project,
  ReviewGate,
  Task,
} from "./types";

export const project: Project = {
  id: "proj_crm",
  name: "Personal CRM",
  goal: "Add GitHub OAuth login and a protected dashboard.",
  planApproved: false,
};

export const agents: Agent[] = [
  { id: "a_plan", name: "Planner", role: "planner", status: "idle" },
  {
    id: "a_code",
    name: "Coder",
    role: "coder",
    status: "working",
    currentTaskId: "t_oauth",
  },
  { id: "a_rev", name: "Reviewer", role: "reviewer", status: "waiting" },
  { id: "a_test", name: "Tester", role: "tester", status: "idle" },
];

export const tasks: Task[] = [
  {
    id: "t_audit",
    title: "Audit current auth structure",
    description:
      "Walk through existing auth code paths and document the contract before changes.",
    ownerAgentId: "a_plan",
    status: "done",
    riskLevel: "low",
    fileScope: ["app/auth/**"],
    createdAt: "2026-06-06T09:00:00Z",
    updatedAt: "2026-06-06T09:42:00Z",
  },
  {
    id: "t_oauth",
    title: "Add GitHub OAuth provider",
    description:
      "Register GitHub provider via NextAuth and wire callback route. Surface env vars in .env.example.",
    ownerAgentId: "a_code",
    status: "running",
    riskLevel: "medium",
    fileScope: ["app/api/auth/[...nextauth]/route.ts", ".env.example"],
    createdAt: "2026-06-06T09:05:00Z",
    updatedAt: "2026-06-06T10:14:00Z",
  },
  {
    id: "t_login",
    title: "Build login screen",
    description: "GitHub sign-in button, error state, redirect after success.",
    ownerAgentId: "a_code",
    status: "review",
    riskLevel: "low",
    fileScope: ["app/login/page.tsx", "app/login/login.module.css"],
    createdAt: "2026-06-06T09:10:00Z",
    updatedAt: "2026-06-06T10:30:00Z",
  },
  {
    id: "t_protect",
    title: "Protect dashboard route",
    description: "Middleware guard for /dashboard, redirect unauthenticated users.",
    ownerAgentId: "a_code",
    status: "ready",
    riskLevel: "medium",
    fileScope: ["middleware.ts", "app/dashboard/**"],
    createdAt: "2026-06-06T09:15:00Z",
    updatedAt: "2026-06-06T09:15:00Z",
  },
  {
    id: "t_smoke",
    title: "Add smoke tests",
    description: "Playwright login + dashboard redirect smoke.",
    ownerAgentId: "a_test",
    status: "backlog",
    riskLevel: "low",
    fileScope: ["tests/e2e/**"],
    createdAt: "2026-06-06T09:20:00Z",
    updatedAt: "2026-06-06T09:20:00Z",
  },
  {
    id: "t_env",
    title: "Review environment variables",
    description: "Confirm secrets are documented and never committed.",
    ownerAgentId: "a_rev",
    status: "backlog",
    riskLevel: "high",
    fileScope: [".env.example", ".gitignore"],
    createdAt: "2026-06-06T09:25:00Z",
    updatedAt: "2026-06-06T09:25:00Z",
  },
];

export const channelMessages: ChannelMessage[] = [
  {
    id: "m1",
    agentId: "a_plan",
    type: "plan_proposed",
    body: "Proposed 6-task plan for GitHub OAuth + protected dashboard. Awaiting approval.",
    timestamp: "2026-06-06T09:01:00Z",
  },
  {
    id: "m2",
    agentId: "a_code",
    type: "task_started",
    body: "Started t_oauth. Touching app/api/auth/[...nextauth]/route.ts and .env.example.",
    taskId: "t_oauth",
    timestamp: "2026-06-06T09:32:00Z",
  },
  {
    id: "m3",
    agentId: "a_code",
    type: "approval_requested",
    body: "Need approval to read .env.example to align variable names.",
    taskId: "t_oauth",
    timestamp: "2026-06-06T09:35:00Z",
  },
  {
    id: "m4",
    agentId: "a_code",
    type: "task_started",
    body: "Login screen done in branch ot/login. Pushed for review.",
    taskId: "t_login",
    timestamp: "2026-06-06T10:25:00Z",
  },
  {
    id: "m5",
    agentId: "a_rev",
    type: "review_completed",
    body: "Reviewed t_login. One follow-up: session expiry UX missing.",
    taskId: "t_login",
    timestamp: "2026-06-06T10:32:00Z",
  },
];

export const activity: ActivityEvent[] = [
  {
    id: "e1",
    taskId: "t_oauth",
    agentId: "a_code",
    type: "reasoning",
    summary: "Identifying NextAuth provider registration path",
    timestamp: "2026-06-06T09:33:00Z",
  },
  {
    id: "e2",
    taskId: "t_oauth",
    agentId: "a_code",
    type: "command",
    summary: "rg \"providers:\" app/api/auth",
    detail: "ripgrep across app/api/auth",
    timestamp: "2026-06-06T09:33:30Z",
  },
  {
    id: "e3",
    taskId: "t_oauth",
    agentId: "a_code",
    type: "result",
    summary: "1 match in route.ts:14",
    timestamp: "2026-06-06T09:33:32Z",
  },
  {
    id: "e4",
    taskId: "t_oauth",
    agentId: "a_code",
    type: "file_change",
    summary: "edit app/api/auth/[...nextauth]/route.ts (+12 / -2)",
    timestamp: "2026-06-06T09:48:00Z",
  },
  {
    id: "e5",
    taskId: "t_oauth",
    agentId: "a_code",
    type: "warning",
    summary: "GITHUB_CLIENT_SECRET not present in .env.example",
    timestamp: "2026-06-06T09:48:10Z",
  },
  {
    id: "e6",
    taskId: "t_login",
    agentId: "a_test",
    type: "test",
    summary: "playwright e2e login.spec.ts — 3 passed",
    timestamp: "2026-06-06T10:28:00Z",
  },
];

export const inboxItems: InboxItem[] = [
  {
    id: "i1",
    type: "approve_plan",
    title: "Approve initial plan",
    description: "Planner proposed 6 tasks. Approve to let Coder start.",
    relatedTaskId: undefined,
    actionLabel: "Approve plan",
    status: "open",
    createdAt: "2026-06-06T09:01:00Z",
  },
  {
    id: "i2",
    type: "approve_command",
    title: "Read .env.example",
    description: "Coder wants to read .env.example to align OAuth variable names.",
    relatedTaskId: "t_oauth",
    actionLabel: "Allow once",
    status: "open",
    createdAt: "2026-06-06T09:35:00Z",
  },
  {
    id: "i3",
    type: "review_diff",
    title: "Review changes to app/login/page.tsx",
    description: "Login screen finished. Reviewer approved with one follow-up.",
    relatedTaskId: "t_login",
    actionLabel: "Open review gate",
    status: "open",
    createdAt: "2026-06-06T10:30:00Z",
  },
  {
    id: "i4",
    type: "accept_follow_up",
    title: "Session expiry UX follow-up",
    description: "Reviewer suggests a follow-up task for session expiry messaging.",
    relatedTaskId: "t_login",
    actionLabel: "Accept follow-up",
    status: "open",
    createdAt: "2026-06-06T10:33:00Z",
  },
];

export const reviewGates: Record<string, ReviewGate> = {
  t_login: {
    taskId: "t_login",
    changedFiles: [
      {
        path: "app/login/page.tsx",
        additions: 48,
        deletions: 6,
        preview:
          "+ <button onClick={() => signIn('github')}>Continue with GitHub</button>",
      },
      {
        path: "app/login/login.module.css",
        additions: 22,
        deletions: 0,
        preview: "+ .signin-button { background: #24292f; color: #fff; }",
      },
    ],
    testStatus: "passing",
    testSummary: "playwright login.spec.ts — 3 passed in 4.2s",
    riskNotes:
      "Low. Touches only login surface. No session storage change. No env mutation.",
    reviewerVerdict: "approve",
    verdictDetail:
      "Approved with one follow-up: surface session expiry messaging in a future task.",
  },
};
