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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolate state BEFORE importing modules that open the DB / read the guard.
process.env.AGENTTEAM_DB = join(mkdtempSync(join(tmpdir(), "at-db-")), "state.db");
process.env.AGENTTEAM_REAL_ADAPTER_ENABLED = "0";
// Keep the self-evolution recall/retro hooks out of the test run so they never
// spawn bin/memory or mutate the real memory/learnings.jsonl during `npm test`.
process.env.AGENTTEAM_MEMORY_DISABLED = "1";

const { createRun, approvePlan, getRunState } = await import("../store.ts");
const { runTask } = await import("../adapter.ts");
const { runRealTask } = await import("../realAdapter.ts");
const { buildCliCommand } = await import("../agentCli.ts");
const { createRunResult, createTaskPacket, parseRetro } = await import("../runArtifacts.ts");
const { runArtifactDir, writeRunArtifacts } = await import("../artifacts.ts");
const { PROJECT_ROOT, collectChangedFiles, ensureWorktree } = await import("../worktree.ts");
const { listScriptSkills, parseSlashCommand, runScriptSkill } = await import("../scriptSkills.ts");
const { recallLessons, recordRetro } = await import("../retro.ts");

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

await check("collectChangedFiles reports an empty diff for a clean repo", () => {
  const repo = mkdtempSync(join(tmpdir(), "at-clean-repo-"));
  git(["init", "-q"], repo);
  git(["config", "user.email", "t@t"], repo);
  git(["config", "user.name", "t"], repo);
  writeFileSync(join(repo, "base.txt"), "base\n");
  git(["add", "-A"], repo);
  git(["commit", "-qm", "base"], repo);
  const diff = collectChangedFiles(repo);
  assert.deepEqual(diff.fileNames, []);
  assert.deepEqual(diff.summaryLines, []);
  rmSync(repo, { recursive: true, force: true });
});

await check("collectChangedFiles throws on a non-git path", () => {
  const dir = mkdtempSync(join(tmpdir(), "at-not-git-"));
  assert.throws(
    () => collectChangedFiles(dir),
    /git add failed/,
  );
  rmSync(dir, { recursive: true, force: true });
});

await check("ensureWorktree fails clearly for an occupied target directory", () => {
  const target = mkdtempSync(join(tmpdir(), "at-occupied-worktree-"));
  const branch = `agent/test-occupied-${Date.now()}`;
  writeFileSync(join(target, "occupied.txt"), "occupied\n");
  try {
    assert.throws(
      () => ensureWorktree({ branch, worktree: target }),
      /git worktree add failed/,
    );
  } finally {
    spawnSync("git", ["branch", "-D", branch], { cwd: PROJECT_ROOT, encoding: "utf8" });
    rmSync(target, { recursive: true, force: true });
  }
});

await check("writeRunArtifacts writes the delegated run artifact set", async () => {
  const runId = createRun({ goal: "Write artifacts", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  const command = buildCliCommand({
    provider: "codex",
    task,
    runId,
    worktree: "../agentteam-artifact-validation",
    prompt: "noop",
    model: "gpt-5-codex",
  });
  const packet = createTaskPacket({
    runId,
    task,
    provider: "codex",
    model: "gpt-5-codex",
    branch: "agent/artifact-validation",
    worktree: "../agentteam-artifact-validation",
    command,
  });
  const result = createRunResult({
    runId,
    task,
    provider: "codex",
    command,
    execution: {
      status: "success",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    changedFiles: ["server/example.ts"],
    diffSummary: ["server/example.ts (+1/-0)"],
  });
  const delegatedRunId = `test-${Date.now()}`;
  const { dir, files } = writeRunArtifacts({
    delegatedRunId,
    packet,
    result,
    plan: ["Validate artifact output"],
    heartbeat: {
      status: "completed",
      progress: 100,
      currentStep: "done",
      updatedAt: new Date().toISOString(),
    },
    memoryNote: "test memory note",
  });
  const expected = [
    "task.json",
    "result.json",
    "heartbeat.json",
    "plan.md",
    "progress.md",
    "evidence.md",
    "summary.md",
    "blockers.md",
    "decisions.md",
  ];
  for (const file of expected) {
    assert.ok(files.includes(file), `${file} should be reported`);
    assert.ok(existsSync(join(dir, file)), `${file} should exist`);
  }
  const parsed = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
  assert.equal(parsed.schema, "agentteam.realRunResult.v1");
  assert.deepEqual(parsed.changedFiles, ["server/example.ts"]);
  rmSync(runArtifactDir(delegatedRunId), { recursive: true, force: true });
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

await check("worktree creation failure records a failed real run blocker", async () => {
  const occupied = mkdtempSync(join(tmpdir(), "at-real-worktree-blocked-"));
  writeFileSync(join(occupied, "occupied.txt"), "occupied\n");
  const previous = process.env.AGENTTEAM_REAL_ADAPTER_ENABLED;
  process.env.AGENTTEAM_REAL_ADAPTER_ENABLED = "1";
  try {
    const runId = createRun({ goal: "Exercise worktree failure", projectName: "T" });
    approvePlan(runId);
    const tid = readyTaskIds(runId)[0];
    await runTask(runId, tid, { provider: "codex", worktree: occupied });
    const s = getRunState(runId)!;
    const dr = s.delegatedRuns.find((d) => d.provider === "codex");
    assert.ok(dr, "codex delegated run recorded");
    assert.equal(dr!.status, "failed");
    assert.equal(s.tasks.find((t) => t.id === tid)!.status, "ready");
    assert.ok(s.inboxItems.some((i) => i.type === "answer_blocker"), "blocker inbox item created");
    assert.match(JSON.stringify(dr!.evidence), /worktree_error|git worktree add failed/);
  } finally {
    process.env.AGENTTEAM_REAL_ADAPTER_ENABLED = previous ?? "0";
    rmSync(occupied, { recursive: true, force: true });
  }
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
  assert.equal(dr!.model, "gemini-3.5-flash");
});

// --- antigravity command shape --------------------------------------------
await check("antigravity provider uses agy command", async () => {
  const runId = createRun({ goal: "Validate agy command", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  const command = buildCliCommand({
    provider: "antigravity",
    task,
    runId,
    worktree: "../agentteam-antigravity-validation",
    prompt: "noop",
    model: "gemini-3.5-flash",
  });

  assert.equal(command.command, "agy");
  assert.equal(command.args[0], "--model");
  assert.match(command.display, /^agy --model gemini-3\.5-flash -p\b/);
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

// --- script skills ----------------------------------------------------------
await check("script skill registry exposes the three pre-registered slash commands", () => {
  const slashes = listScriptSkills().map((skill) => skill.slash).sort();
  assert.deepEqual(slashes, ["/changelog", "/review-diff", "/test"]);
});

await check("parseSlashCommand resolves registered commands and rejects unknown commands", () => {
  const parsed = parseSlashCommand("/test changed files only");
  assert.equal(parsed.skill?.id, "test");
  assert.equal(parsed.args, "changed files only");
  assert.equal(parseSlashCommand("/nope").skill, undefined);
});

await check("dry-run /test creates script delegated run and command events", async () => {
  const runId = createRun({ goal: "Validate script test skill", projectName: "T" });
  approvePlan(runId);
  const result = await runScriptSkill(runId, "/test", { dryRun: true });
  assert.equal(result.ok, true);
  const s = getRunState(runId)!;
  const dr = s.delegatedRuns.find((run) => run.provider === "script-skill" && run.model === "test");
  assert.ok(dr, "script skill delegated run recorded");
  assert.equal(dr!.status, "completed");
  assert.ok(s.activityEvents.some((event) => event.title.includes("Run test suite")), "test command event recorded");
});

await check("/review-diff creates a review gate from pre-registered git checks", async () => {
  const runId = createRun({ goal: "Validate script review skill", projectName: "T" });
  approvePlan(runId);
  const result = await runScriptSkill(runId, "review-diff");
  assert.equal(result.ok, true);
  const s = getRunState(runId)!;
  const dr = s.delegatedRuns.find((run) => run.provider === "script-skill" && run.model === "review-diff");
  assert.ok(dr, "review-diff delegated run recorded");
  assert.ok(["completed", "failed"].includes(dr!.status));
  assert.ok(s.reviewGates.length > 0, "review gate created");
  assert.ok(s.activityEvents.some((event) => event.command === "git diff --check"), "diff-check event recorded");
});

// --- self-evolution: recall side ------------------------------------------
await check("buildCliCommand prepends recalled lessons before the base prompt", async () => {
  const runId = createRun({ goal: "Validate lessons injection", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  const lessons = "## 过往同类任务教训（开工前先读）\n- [7/10] LESSON_MARKER 下次记得配置超时";
  const command = buildCliCommand({
    provider: "codex",
    task,
    runId,
    worktree: "../agentteam-lessons-validation",
    prompt: "BASE_PROMPT",
    model: "gpt-5-codex",
    lessons,
  });
  const promptArg = command.args.find((a) => a.includes("BASE_PROMPT"));
  assert.ok(promptArg, "prompt arg should be present");
  assert.match(promptArg!, /LESSON_MARKER/);
  // 教训必须排在 base prompt 之前。
  assert.ok(
    promptArg!.indexOf("LESSON_MARKER") < promptArg!.indexOf("BASE_PROMPT"),
    "lessons should precede the base prompt",
  );
});

await check("buildCliCommand without lessons leaves the base prompt unchanged", async () => {
  const runId = createRun({ goal: "Validate no-lessons path", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  const command = buildCliCommand({
    provider: "codex",
    task,
    runId,
    worktree: "../agentteam-no-lessons",
    prompt: "BASE_PROMPT",
    model: "gpt-5-codex",
  });
  assert.ok(command.args.includes("BASE_PROMPT"), "base prompt passed through verbatim");
});

await check("recallLessons is a no-op when memory is disabled", () => {
  const runId = createRun({ goal: "Validate recall guard", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  // AGENTTEAM_MEMORY_DISABLED=1 is set in this test harness.
  assert.equal(recallLessons({ role: "coder", task }), "");
});

// --- self-evolution: retro side -------------------------------------------
await check("parseRetro extracts a fenced RETROSPECTIVE block from stdout", () => {
  const stdout = [
    "...work done...",
    "RETROSPECTIVE",
    "```json",
    '{ "went_well": "复用了既有适配器", "went_wrong": "超时硬编码", "next_time": "把超时做成可配置" }',
    "```",
  ].join("\n");
  const retro = parseRetro(stdout);
  assert.ok(retro, "retro should be parsed");
  assert.equal(retro!.wentWell, "复用了既有适配器");
  assert.equal(retro!.nextTime, "把超时做成可配置");
});

await check("parseRetro returns undefined when no retro block is present", () => {
  assert.equal(parseRetro("just some normal CLI output, no retro here"), undefined);
  assert.equal(parseRetro(""), undefined);
});

await check("createRunResult surfaces the parsed retro from execution stdout", async () => {
  const runId = createRun({ goal: "Validate retro plumbing", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  const command = buildCliCommand({
    provider: "codex", task, runId, worktree: "../agentteam-retro-validation", prompt: "noop", model: "gpt-5-codex",
  });
  const result = createRunResult({
    runId, task, provider: "codex", command,
    execution: {
      status: "success", exitCode: 0,
      stdout: '{"went_well":"ok","went_wrong":"x","next_time":"do y"}',
      stderr: "", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    },
  });
  assert.equal(result.retro?.nextTime, "do y");
});

await check("recordRetro is a no-op when memory is disabled", () => {
  const runId = createRun({ goal: "Validate retro guard", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  // AGENTTEAM_MEMORY_DISABLED=1 → must not spawn bin/memory or write learnings.
  const res = recordRetro({ role: "coder", task, provider: "codex", status: "failed", blockers: ["timeout"] });
  assert.equal(res.ok, false);
});

await check("rendered task prompt asks for a RETROSPECTIVE block parseable by parseRetro", async () => {
  const runId = createRun({ goal: "Validate retro prompt instruction", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  // No explicit prompt → buildCliCommand renders from the template.
  const command = buildCliCommand({ provider: "codex", task, runId, worktree: "../agentteam-retro-prompt", model: "gpt-5-codex" });
  const promptArg = command.args.find((a) => a.includes("RETROSPECTIVE"));
  assert.ok(promptArg, "rendered prompt should instruct the agent to emit a RETROSPECTIVE block");
  // The exact shape the prompt asks for must roundtrip through the parser.
  const example = 'RETROSPECTIVE {"went_well":"a","went_wrong":"b","next_time":"c"}';
  assert.equal(parseRetro(example)?.nextTime, "c");
});

console.log(`\n${passed} checks passed.`);
