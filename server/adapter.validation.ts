import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "../src/types/domain.ts";

const tempRoot = mkdtempSync(join(tmpdir(), "agentteam-adapter-validation-"));
process.env.AGENTTEAM_DB = join(tempRoot, "state.db");
delete process.env.AGENTTEAM_REAL_ADAPTER_ENABLED;

const { buildCliCommand } = await import("./agentCli.ts");
const { runTask } = await import("./adapter.ts");
const { getDb } = await import("./db.ts");
const { createRun, approvePlan, getRunState } = await import("./store.ts");

type EvidenceItem = {
  schema?: string;
  provider?: string;
  status?: string;
  summary?: string;
  command?: string | { display?: string; provider?: string };
  blockers?: string[];
  validation?: { command: string; result: string; summary: string }[];
};

try {
  await testSimulatedDefaultPathStillWorks();
  await testExplicitRealProviderDisabledBlocks();
  await testDryRunBlocksWithoutExecutingCli();
  await testBadProviderRejected();
  await testPiAgentCommandShape();
  console.log("adapter validation passed");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

async function testSimulatedDefaultPathStillWorks(): Promise<void> {
  const { runId, taskId } = createApprovedReadyRun("validate simulated default");

  const result = await runTask(runId, taskId);
  const state = getRunState(runId);
  const task = state?.tasks.find((item) => item.id === taskId);
  const delegated = state?.delegatedRuns.find((item) => item.taskId === taskId && item.status === "completed");

  assert.deepEqual(result, { ok: true });
  assert.equal(state?.runStatus, "review");
  assert.equal(task?.status, "review");
  assert.equal(delegated?.provider, "codex");
  assert.equal(delegated?.model, "GPT-5.4");
  assert.equal(delegated?.status, "completed");
}

async function testExplicitRealProviderDisabledBlocks(): Promise<void> {
  const { runId, taskId } = createApprovedReadyRun("validate disabled real adapter");

  const result = await runTask(runId, taskId, { provider: "codex", prompt: "noop" });
  const state = getRunState(runId);
  const task = state?.tasks.find((item) => item.id === taskId);
  const delegated = state?.delegatedRuns.find((item) => item.taskId === taskId && item.status === "blocked");
  const evidence = delegated?.evidence as EvidenceItem[] | undefined;
  const runResult = evidence?.find((item) => item.schema === "agentteam.realRunResult.v1");
  const blocker = state?.inboxItems.find((item) => item.taskId === taskId && item.type === "answer_blocker");

  assert.deepEqual(result, { ok: true });
  assert.equal(task?.status, "ready");
  assert.equal(delegated?.provider, "codex");
  assert.equal(delegated?.status, "blocked");
  assert.equal(runResult?.status, "blocked");
  assert.deepEqual(runResult?.blockers, ["real_adapter_disabled"]);
  assert.match(String(runResult?.validation?.[0]?.summary), /disabled/);
  assert.equal(blocker?.status, "open");
}

async function testDryRunBlocksWithoutExecutingCli(): Promise<void> {
  const { runId, taskId } = createApprovedReadyRun("validate dry run");

  const result = await runTask(runId, taskId, {
    provider: "claude",
    dryRun: true,
    prompt: "this prompt must not execute",
    worktree: "/definitely/not/a/real/worktree",
  });
  const state = getRunState(runId);
  const delegated = state?.delegatedRuns.find((item) => item.taskId === taskId && item.status === "blocked");
  const evidence = delegated?.evidence as EvidenceItem[] | undefined;
  const runResult = evidence?.find((item) => item.schema === "agentteam.realRunResult.v1");

  assert.deepEqual(result, { ok: true });
  assert.equal(delegated?.status, "blocked");
  assert.equal(runResult?.status, "blocked");
  assert.deepEqual(runResult?.blockers, ["dry_run_requested"]);
  assert.match(String(runResult?.summary), /dryRun/);
}

async function testBadProviderRejected(): Promise<void> {
  const { runId, taskId } = createApprovedReadyRun("validate bad provider");
  const before = getRunState(runId)?.delegatedRuns.length;

  const result = await runTask(runId, taskId, { provider: "bad-provider" as never });
  const state = getRunState(runId);
  const task = state?.tasks.find((item) => item.id === taskId);

  assert.deepEqual(result, { ok: false, reason: "bad_provider" });
  assert.equal(task?.status, "ready");
  assert.equal(state?.delegatedRuns.length, before);
}

async function testPiAgentCommandShape(): Promise<void> {
  const { runId, taskId } = createApprovedReadyRun("validate pi-agent command");
  const task = getRunState(runId)?.tasks.find((item) => item.id === taskId);
  assert.ok(task);

  const command = buildCliCommand({
    provider: "pi-agent",
    task: task as Task,
    runId,
    worktree: "../agentteam-pi-agent-validation",
    prompt: "noop",
    model: "deepseek/deepseek-v4-flash",
  });

  assert.equal(command.command, "pi");
  assert.equal(command.args[0], "-p");
  assert.match(command.display, /^pi -p\b/);
  assert.doesNotMatch(command.display, /pi-agent run/);
}

function createApprovedReadyRun(goal: string): { runId: string; taskId: string } {
  getDb().prepare("DELETE FROM runs").run();
  const runId = createRun({
    goal,
    projectName: "Adapter Validation",
    workspaceName: "AgentTeam",
    projectRoot: tempRoot,
  });
  approvePlan(runId);
  const task = getRunState(runId)?.tasks.find((item) => item.status === "ready");
  assert.ok(task, "expected generated plan to contain a ready task");
  return { runId, taskId: task.id };
}
