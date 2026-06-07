import cors from "cors";
import express from "express";
import { runNextReadyTask, runTask } from "./adapter.ts";
import { providerOptions } from "./agentRegistry.ts";
import { getDb } from "./db.ts";
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

app.listen(PORT, () => {
  console.log(`[server] AgentTeam API on http://localhost:${PORT}`);
});
