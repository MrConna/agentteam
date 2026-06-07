import http from "node:http";
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";
import { runNextReadyTask, runTask } from "./adapter.ts";
import { providerOptions } from "./agentRegistry.ts";
import {
  attachChat,
  chatProviders,
  createChatSession,
  getChatSession,
  killChatSession,
  listChatSessions,
  sendMessage,
} from "./chat.ts";
import { getDb } from "./db.ts";
import {
  attach,
  createSession,
  getSession,
  kill,
  launchableProviders,
  listSessions,
  resize,
  write,
} from "./terminals.ts";
import {
  acceptFollowUp,
  approvePlan,
  createRun,
  decideInbox,
  decideReview,
  getLatestRunId,
  getRunState,
  listRuns,
  moveTask,
} from "./store.ts";

const app = express();
app.use(cors());
app.use(express.json());

getDb(); // open + migrate on boot

const PORT = Number(process.env.PORT ?? 4000);

const ok = (res: express.Response, runId: string) => {
  const state = getRunState(runId);
  if (!state) return res.status(404).json({ error: "run_not_found" });
  return res.json(state);
};

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/providers", (_req, res) => res.json(providerOptions()));

app.get("/api/runs", (_req, res) => res.json(listRuns()));

app.get("/api/state", (req, res) => {
  const runId = (req.query.runId as string) || getLatestRunId();
  if (!runId) return res.json(null);
  return ok(res, runId);
});

app.post("/api/runs", (req, res) => {
  const { goal, projectName, workspaceName, projectRoot } = req.body ?? {};
  if (!goal || typeof goal !== "string" || !goal.trim()) {
    return res.status(400).json({ error: "goal_required" });
  }
  const runId = createRun({ goal, projectName, workspaceName, projectRoot });
  return ok(res, runId);
});

app.post("/api/runs/:runId/approve-plan", (req, res) => {
  approvePlan(req.params.runId);
  return ok(res, req.params.runId);
});

app.post("/api/runs/:runId/inbox/:inboxId/decide", (req, res) => {
  const { decision } = req.body ?? {};
  const map: Record<string, "approved" | "rejected" | "answered"> = {
    approve: "approved",
    approved: "approved",
    reject: "rejected",
    rejected: "rejected",
    changes: "rejected",
    answer: "answered",
    answered: "answered",
  };
  decideInbox(req.params.runId, req.params.inboxId, map[decision] ?? "approved");
  return ok(res, req.params.runId);
});

app.post("/api/runs/:runId/inbox/:inboxId/accept-follow-up", (req, res) => {
  acceptFollowUp(req.params.runId, req.params.inboxId);
  return ok(res, req.params.runId);
});

app.post("/api/runs/:runId/tasks/:taskId/move", (req, res) => {
  const { status } = req.body ?? {};
  const allowed = ["backlog", "ready", "running", "review", "done"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "bad_status" });
  moveTask(req.params.runId, req.params.taskId, status);
  return ok(res, req.params.runId);
});

app.post("/api/runs/:runId/tasks/:taskId/run", async (req, res) => {
  const result = await runTask(req.params.runId, req.params.taskId, req.body ?? {});
  if (!result.ok) return res.status(409).json({ error: result.reason });
  return ok(res, req.params.runId);
});

app.post("/api/runs/:runId/run-next", async (req, res) => {
  const result = await runNextReadyTask(req.params.runId, req.body ?? {});
  if (!result.ok) return res.status(409).json({ error: result.reason });
  return ok(res, req.params.runId);
});

app.post("/api/runs/:runId/tasks/:taskId/review", (req, res) => {
  const { decision } = req.body ?? {};
  const value = decision === "approved" || decision === "approve" ? "approved" : "changes_requested";
  decideReview(req.params.runId, req.params.taskId, value);
  return ok(res, req.params.runId);
});

// --- Live terminal sessions -------------------------------------------------

app.get("/api/sessions", (_req, res) => res.json(listSessions()));
app.get("/api/sessions/launchable", (_req, res) => res.json(launchableProviders()));

app.post("/api/sessions", (req, res) => {
  const { provider, cols, rows } = req.body ?? {};
  if (!provider || typeof provider !== "string") return res.status(400).json({ error: "provider_required" });
  try {
    const s = createSession({ provider, cols, rows });
    return res.json({ id: s.id, provider: s.provider, label: s.label, command: s.command, status: s.status });
  } catch (e) {
    return res.status(500).json({ error: "spawn_failed", detail: e instanceof Error ? e.message : String(e) });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  kill(req.params.id);
  return res.json({ ok: true });
});

// --- Chat-style agent sessions ----------------------------------------------

app.get("/api/chat/providers", (_req, res) => res.json(chatProviders()));
app.get("/api/chat", (_req, res) => res.json(listChatSessions()));
app.get("/api/chat/:id", (req, res) => {
  const s = getChatSession(req.params.id);
  return s ? res.json(s) : res.status(404).json({ error: "not_found" });
});
app.post("/api/chat", (req, res) => {
  const { provider, model } = req.body ?? {};
  const s = createChatSession({ provider, model });
  return s ? res.json(getChatSession(s.id)) : res.status(400).json({ error: "bad_provider" });
});
app.delete("/api/chat/:id", (req, res) => {
  killChatSession(req.params.id);
  return res.json({ ok: true });
});

const server = http.createServer(app);

// Two WS endpoints share one HTTP server. Using `noServer` + a single upgrade
// router avoids the path-conflict where one WebSocketServer 400s the other's path.
const wss = new WebSocketServer({ noServer: true });
const chatWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url ?? "", "http://localhost").pathname;
  if (path === "/ws/terminal") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else if (path === "/ws/chat") {
    chatWss.handleUpgrade(req, socket, head, (ws) => chatWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

// WebSocket: /ws/terminal?id=<sessionId> streams pty output and accepts input.
wss.on("connection", (ws, req) => {
  const id = new URL(req.url ?? "", "http://localhost").searchParams.get("id") ?? "";
  const session = getSession(id);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", message: "session_not_found" }));
    ws.close();
    return;
  }
  const detach = attach(id, (data) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "data", data }));
  });
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === "input") write(id, msg.data);
      else if (msg.type === "resize") resize(id, msg.cols, msg.rows);
    } catch {
      /* ignore malformed frames */
    }
  });
  ws.on("close", () => detach?.());
});

// Chat WS: streams chat events; client sends {type:"message", text}.
chatWss.on("connection", (ws, req) => {
  const id = new URL(req.url ?? "", "http://localhost").searchParams.get("id") ?? "";
  const session = getChatSession(id);
  if (!session) {
    ws.send(JSON.stringify({ type: "error", message: "session_not_found" }));
    ws.close();
    return;
  }
  // Replay transcript so a (re)connecting client sees history.
  ws.send(JSON.stringify({ type: "history", messages: session.messages }));
  const detach = attachChat(id, (e) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
  });
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === "message") {
        const r = sendMessage(id, String(msg.text ?? ""));
        if (!r.ok) ws.send(JSON.stringify({ type: "error", message: r.reason }));
      }
    } catch {
      /* ignore */
    }
  });
  ws.on("close", () => detach?.());
});

server.listen(PORT, () => {
  console.log(`[server] AgentTeam API + WS on http://localhost:${PORT}`);
});
