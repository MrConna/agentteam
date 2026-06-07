/**
 * Lightweight executable validation for the agent adapters (T7-01/T7-02).
 * Run with: npm test
 *
 * No external test runner: each check asserts and the process exits non-zero on
 * the first failure. Uses a throwaway SQLite DB and temp git repos so it never
 * touches the operator's real state.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate state BEFORE importing modules that open the DB / read the guard.
process.env.AGENTTEAM_DB = join(mkdtempSync(join(tmpdir(), "at-db-")), "state.db");
process.env.AGENTTEAM_REAL_ADAPTER_ENABLED = "0";

const { createRun, approvePlan, getRunState } = await import("../store.ts");
const { runTask } = await import("../adapter.ts");
const { runRealTask } = await import("../realAdapter.ts");
const { collectChangedFiles } = await import("../worktree.ts");

let passed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ok  ${name}`);
    })
    .catch((e) => {
      console.error(`FAIL  ${name}`);
      console.error(e);
      process.exit(1);
    });
}

function git(args: string[], cwd: string) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
}

function readyTaskIds(runId: string): string[] {
  return getRunState(runId)!.tasks.filter((t) => t.status === "ready").map((t) => t.id);
}

// --- T7-02: real diff collection from a temp git repo ---------------------
await check("collectChangedFiles reports real changed files", () => {
  const repo = mkdtempSync(join(tmpdir(), "at-repo-"));
  git(["init", "-q"], repo);
  git(["config", "user.email", "t@t"], repo);
  git(["config", "user.name", "t"], repo);
  writeFileSync(join(repo, "base.txt"), "base\n");
  git(["add", "-A"], repo);
  git(["commit", "-qm", "base"], repo);
  writeFileSync(join(repo, "feature.ts"), "export const x = 1;\n");
  const diff = collectChangedFiles(repo);
  assert.ok(diff.fileNames.includes("feature.ts"), "feature.ts should be detected");
  assert.ok(diff.changedFiles[0].added >= 1, "added lines counted");
  assert.match(diff.summaryLines[0], /feature\.ts \(\+\d+\/-\d+\)/);
  rmSync(repo, { recursive: true, force: true });
});

// --- simulated default path still works -----------------------------------
await check("simulated default drives a task to the review gate", async () => {
  const runId = createRun({ goal: "Add a settings page", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const res = await runTask(runId, tid);
  assert.equal(res.ok, true);
});

await check("simulated run creates review gate + completed delegated run", async () => {
  const runId = createRun({ goal: "Add export button", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  await runTask(runId, tid);
  const s = getRunState(runId)!;
  assert.equal(s.tasks.find((t) => t.id === tid)!.status, "review");
  assert.ok(s.reviewGates.some((g) => g.taskId === tid), "review gate exists");
  assert.ok(s.delegatedRuns.some((d) => d.status === "completed"), "delegated run completed");
});

// --- guard off: real provider must block, not execute ---------------------
await check("real provider with guard off persists a blocked run", async () => {
  const runId = createRun({ goal: "Wire OAuth", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  await runTask(runId, tid, { provider: "codex" });
  const s = getRunState(runId)!;
  const dr = s.delegatedRuns.find((d) => d.provider === "codex");
  assert.ok(dr, "codex delegated run recorded");
  assert.equal(dr!.status, "blocked");
  assert.equal(s.tasks.find((t) => t.id === tid)!.status, "ready"); // returned to queue
  assert.ok(s.inboxItems.some((i) => i.type === "answer_blocker"), "blocker inbox item created");
});

// --- dry-run blocks without executing -------------------------------------
await check("dryRun records dry_run/blocked without executing", async () => {
  const runId = createRun({ goal: "Add antigravity scout", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  await runTask(runId, tid, { provider: "antigravity", dryRun: true });
  const s = getRunState(runId)!;
  const dr = s.delegatedRuns.find((d) => d.provider === "antigravity");
  assert.ok(dr, "antigravity delegated run recorded");
  assert.equal(dr!.status, "blocked");
  assert.equal(dr!.model, "gemini-2.5-pro");
});

// --- bad provider is rejected ---------------------------------------------
await check("runRealTask rejects an unknown provider", async () => {
  const runId = createRun({ goal: "x", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const res = await runRealTask(runId, tid, { provider: "bogus" as never });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "bad_provider");
});

console.log(`\n${passed} checks passed.`);
