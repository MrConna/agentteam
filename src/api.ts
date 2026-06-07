import type { RunSummary, ServerState } from "./types/domain";

export type RunTaskOptions = {
  provider?: string;
  model?: string;
  dryRun?: boolean;
  prompt?: string;
  worktree?: string;
  timeoutMs?: number;
};

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status} ${res.statusText} ${detail}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getState: (runId?: string) =>
    http<ServerState | null>(`/api/state${runId ? `?runId=${runId}` : ""}`),

  listRuns: () => http<RunSummary[]>("/api/runs"),

  listProviders: () =>
    http<{ id: string; label: string; models: string[] }[]>("/api/providers"),

  listSessions: () =>
    http<{ id: string; provider: string; label: string; command: string; status: string }[]>("/api/sessions"),

  launchableProviders: () =>
    http<{ id: string; label: string }[]>("/api/sessions/launchable"),

  createSession: (provider: string, cols?: number, rows?: number) =>
    http<{ id: string; provider: string; label: string; command: string; status: string }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ provider, cols, rows }),
    }),

  killSession: (id: string) => http<{ ok: boolean }>(`/api/sessions/${id}`, { method: "DELETE" }),

  // Chat-style sessions
  chatProviders: () =>
    http<{ id: string; label: string; models: string[]; defaultModel: string }[]>("/api/chat/providers"),
  listChat: () =>
    http<{ id: string; provider: string; label: string; model: string; status: string }[]>("/api/chat"),
  createChat: (provider: string, model: string) =>
    http<{ id: string; provider: string; label: string; model: string; status: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ provider, model }),
    }),
  killChat: (id: string) => http<{ ok: boolean }>(`/api/chat/${id}`, { method: "DELETE" }),

  createRun: (input: { goal: string; projectName?: string; workspaceName?: string }) =>
    http<ServerState>("/api/runs", { method: "POST", body: JSON.stringify(input) }),

  approvePlan: (runId: string) =>
    http<ServerState>(`/api/runs/${runId}/approve-plan`, { method: "POST" }),

  decideInbox: (runId: string, inboxId: string, decision: "approve" | "changes" | "answer") =>
    http<ServerState>(`/api/runs/${runId}/inbox/${inboxId}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),

  acceptFollowUp: (runId: string, inboxId: string) =>
    http<ServerState>(`/api/runs/${runId}/inbox/${inboxId}/accept-follow-up`, { method: "POST" }),

  runTask: (runId: string, taskId: string, options?: RunTaskOptions) =>
    http<ServerState>(`/api/runs/${runId}/tasks/${taskId}/run`, {
      method: "POST",
      body: options ? JSON.stringify(options) : undefined,
    }),

  runNext: (runId: string, options?: RunTaskOptions) =>
    http<ServerState>(`/api/runs/${runId}/run-next`, {
      method: "POST",
      body: options ? JSON.stringify(options) : undefined,
    }),

  moveTask: (runId: string, taskId: string, status: string) =>
    http<ServerState>(`/api/runs/${runId}/tasks/${taskId}/move`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  decideReview: (runId: string, taskId: string, decision: "approved" | "changes") =>
    http<ServerState>(`/api/runs/${runId}/tasks/${taskId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};
