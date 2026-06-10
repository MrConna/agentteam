import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./db.ts";
import {
  addEvent,
  addMessage,
  getRunState,
  hhmm,
  iso,
  ownerAgentId,
  touchRun,
  uid,
} from "./store.ts";
import type { AgentRole, DelegatedRun, ReviewGate } from "../src/types/domain.ts";

type SkillRole = DelegatedRun["role"];
type SkillMode = "local" | "agent" | "hybrid";
type SkillOutput = "review_gate" | "channel_message" | "changelog";
type BudgetTier = DelegatedRun["budget"]["tier"];

interface ScriptSkillCommand {
  id: string;
  label: string;
  argv: string[];
}

export interface ScriptSkill {
  id: string;
  slash: string;
  label: string;
  description: string;
  role: SkillRole;
  mode: SkillMode;
  output: SkillOutput;
  budgetTier?: BudgetTier;
  maxMinutes?: number;
  commands: ScriptSkillCommand[];
  promptTemplate: string;
}

export interface ScriptSkillSummary {
  id: string;
  slash: string;
  label: string;
  description: string;
  role: SkillRole;
  mode: SkillMode;
  output: SkillOutput;
}

export interface RunScriptSkillOptions {
  dryRun?: boolean;
  taskId?: string;
  args?: string;
}

interface CommandResult {
  id: string;
  label: string;
  command: string;
  status: "success" | "failed" | "skipped";
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(here, "..");
const CONFIG_PATH = process.env.AGENTTEAM_SCRIPT_SKILLS_CONFIG ?? join(PROJECT_ROOT, "script-skills.config.json");
const MAX_OUTPUT_CHARS = 6_000;
const J = (value: unknown) => JSON.stringify(value ?? []);

const DEFAULT_CONFIG: { skills: ScriptSkill[] } = {
  skills: [
    {
      id: "review-diff",
      slash: "/review-diff",
      label: "Review Diff",
      description: "Perform a read-only diff safety check.",
      role: "reviewer",
      mode: "local",
      output: "review_gate",
      budgetTier: "cheap",
      maxMinutes: 8,
      commands: [
        { id: "status", label: "Inspect git status", argv: ["git", "status", "--short"] },
        { id: "stat", label: "Summarize diff stat", argv: ["git", "diff", "--stat"] },
        { id: "changed", label: "List changed files", argv: ["git", "diff", "--name-only"] },
        { id: "diff-check", label: "Check diff whitespace", argv: ["git", "diff", "--check"] },
      ],
      promptTemplate: "Check changed files, scope, generated artifacts, risky patterns, and validation gaps.",
    },
  ],
};

function loadConfig(): { skills: ScriptSkill[] } {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { skills?: ScriptSkill[] };
    if (!Array.isArray(raw.skills)) return DEFAULT_CONFIG;
    const skills = raw.skills.filter(isValidSkill);
    return skills.length ? { skills } : DEFAULT_CONFIG;
  } catch (e) {
    console.error(`[script-skills] invalid ${CONFIG_PATH}, using defaults:`, e);
    return DEFAULT_CONFIG;
  }
}

function isValidSkill(value: ScriptSkill): value is ScriptSkill {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.slash === "string" &&
      Array.isArray(value.commands) &&
      value.commands.every((cmd) => Array.isArray(cmd.argv) && cmd.argv.length > 0),
  );
}

const CONFIG = loadConfig();
const SKILLS_BY_ID = new Map(CONFIG.skills.map((skill) => [skill.id, skill]));
const SKILLS_BY_SLASH = new Map(CONFIG.skills.map((skill) => [skill.slash, skill]));

export function listScriptSkills(): ScriptSkillSummary[] {
  return CONFIG.skills.map(({ id, slash, label, description, role, mode, output }) => ({
    id,
    slash,
    label,
    description,
    role,
    mode,
    output,
  }));
}

export function resolveScriptSkill(value: string): ScriptSkill | undefined {
  const key = value.trim().split(/\s+/, 1)[0];
  const normalized = key.startsWith("/") ? key : key.replace(/^/, "/");
  return SKILLS_BY_ID.get(key) ?? SKILLS_BY_SLASH.get(normalized);
}

export async function runScriptSkill(
  runId: string,
  skillIdOrSlash: string,
  options: RunScriptSkillOptions = {},
): Promise<{ ok: boolean; reason?: string }> {
  const skill = resolveScriptSkill(skillIdOrSlash);
  if (!skill) return { ok: false, reason: "skill_not_found" };

  const state = getRunState(runId);
  if (!state) return { ok: false, reason: "run_not_found" };

  const taskId = options.taskId || state.selectedTaskId || state.tasks[0]?.id || `skill-${skill.id}`;
  const agentId = agentForRole(runId, skill.role);
  const delegatedRunId = uid("drun");
  const startedAt = hhmm();
  const commandResults: CommandResult[] = [];

  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO delegated_runs
        (id, run_id, task_id, agent_id, provider, model, role, branch, worktree,
         status, progress, budget_tier, budget_max_minutes, budget_token_policy,
         approval_policy, current_step, next_step, evidence, assigned_at, last_heartbeat)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      delegatedRunId,
      runId,
      taskId,
      agentId,
      "script-skill",
      skill.id,
      skill.role,
      `skill/${skill.id}`,
      ".",
      "running",
      10,
      skill.budgetTier ?? "cheap",
      skill.maxMinutes ?? 10,
      "pre-registered script skill commands only",
      skill.mode === "local" ? "read_only" : "scoped_writes",
      `Running ${skill.slash}`,
      "Persist command evidence",
      J([{ skill: skill.id, slash: skill.slash, args: options.args ?? "", dryRun: !!options.dryRun }]),
      startedAt,
      startedAt,
    );
    addMessage(runId, "task_started", agentId, `Started script skill ${skill.slash}: ${skill.description}`, taskId);
    addEvent(runId, "external_call", agentId, `Script skill prepared: ${skill.slash}`, renderPrompt(skill, runId, options.args), {
      taskId,
      status: "running",
    });
    touchRun(runId);
  })();

  for (const command of skill.commands) {
    const result = runCommand(command, options.dryRun);
    commandResults.push(result);
    addEvent(runId, result.id === "test" ? "test_run" : "command_result", agentId, result.label, summarizeCommand(result), {
      taskId,
      command: result.command,
      status: result.status === "success" || result.status === "skipped" ? "success" : "failed",
    });
  }

  const failed = commandResults.some((result) => result.status === "failed");
  const completedStatus: DelegatedRun["status"] = failed ? "failed" : "completed";
  const summary = summarizeSkill(skill, commandResults, options.dryRun);

  db.transaction(() => {
    if (skill.output === "review_gate") {
      upsertReviewGate(runId, taskId, skill, commandResults, failed);
    }
    addMessage(
      runId,
      failed ? "blocker_found" : skill.output === "changelog" ? "ship_summary" : "review_completed",
      agentId,
      summary,
      taskId,
    );
    db.prepare(
      "UPDATE delegated_runs SET status = ?, progress = ?, current_step = ?, next_step = ?, evidence = ?, last_heartbeat = ?, completed_at = ? WHERE id = ?",
    ).run(
      completedStatus,
      100,
      summary,
      failed ? "Inspect failed command output" : "No action",
      J(commandResults),
      hhmm(),
      iso(),
      delegatedRunId,
    );
    touchRun(runId);
  })();

  return { ok: true };
}

export function parseSlashCommand(input: string): { skill?: ScriptSkill; args: string } {
  const trimmed = input.trim();
  const [head, ...rest] = trimmed.split(/\s+/);
  return { skill: resolveScriptSkill(head || ""), args: rest.join(" ") };
}

function runCommand(command: ScriptSkillCommand, dryRun = false): CommandResult {
  const display = command.argv.map(displayArg).join(" ");
  if (dryRun) {
    return {
      id: command.id,
      label: command.label,
      command: display,
      status: "skipped",
      stdout: "",
      stderr: "",
      exitCode: null,
    };
  }

  const [bin, ...args] = command.argv;
  const result = spawnSync(bin, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    env: process.env,
    shell: false,
    timeout: 60_000,
  });
  return {
    id: command.id,
    label: command.label,
    command: display,
    status: result.status === 0 ? "success" : "failed",
    stdout: trimOutput(result.stdout ?? ""),
    stderr: trimOutput(result.stderr ?? result.error?.message ?? ""),
    exitCode: result.status ?? null,
  };
}

function upsertReviewGate(
  runId: string,
  taskId: string,
  skill: ScriptSkill,
  results: CommandResult[],
  failed: boolean,
): void {
  const changed = findCommand(results, "changed")?.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) ?? [];
  const tests: ReviewGate["tests"] = results
    .filter((result) => result.id === "test" || result.id === "diff-check")
    .map((result) => ({
      command: result.command,
      result: result.status === "success" || result.status === "skipped" ? "passed" : "failed",
      summary: summarizeCommand(result),
    }));
  getDb()
    .prepare(
      `INSERT INTO review_gates
        (id, run_id, task_id, status, changed_files, diff_summary, tests, risk_notes, reviewer_verdict, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(run_id, task_id) DO UPDATE SET
         status='pending', changed_files=excluded.changed_files,
         diff_summary=excluded.diff_summary, tests=excluded.tests,
         risk_notes=excluded.risk_notes, reviewer_verdict=excluded.reviewer_verdict,
         updated_at=excluded.updated_at`,
    )
    .run(
      uid("gate"),
      runId,
      taskId,
      "pending",
      J(changed),
      J(results.map((result) => `${result.label}: ${result.status}`)),
      J(tests),
      J(riskNotes(skill, results, failed)),
      failed ? `${skill.slash} found failed command output.` : `${skill.slash} completed; inspect command evidence before approval.`,
      iso(),
      iso(),
    );
}

function riskNotes(skill: ScriptSkill, results: CommandResult[], failed: boolean): string[] {
  const notes = [`Script skill: ${skill.slash}`, `Mode: ${skill.mode}`];
  if (failed) notes.push("One or more pre-registered commands failed.");
  const status = findCommand(results, "status")?.stdout ?? "";
  if (/node_modules|dist|\.DS_Store|__pycache__/.test(status)) {
    notes.push("Generated or ignored-looking paths appear in git status.");
  }
  return notes;
}

function summarizeSkill(skill: ScriptSkill, results: CommandResult[], dryRun = false): string {
  const failed = results.filter((result) => result.status === "failed").length;
  const ran = results.filter((result) => result.status !== "skipped").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  if (dryRun) return `${skill.slash} dry-run prepared ${skipped} command(s).`;
  return `${skill.slash} ran ${ran} command(s); ${failed} failed.`;
}

function summarizeCommand(result: CommandResult): string {
  if (result.status === "skipped") return "Skipped by dryRun.";
  const output = result.stderr || result.stdout;
  return output.trim() || `Exit code ${result.exitCode ?? "unknown"}.`;
}

function renderPrompt(skill: ScriptSkill, runId: string, args: string | undefined): string {
  return skill.promptTemplate
    .replace(/\{runId\}/g, runId)
    .replace(/\{args\}/g, args ?? "");
}

function findCommand(results: CommandResult[], id: string): CommandResult | undefined {
  return results.find((result) => result.id === id);
}

function agentForRole(runId: string, role: SkillRole): string {
  const mapped: AgentRole = role === "reviewer" || role === "tester" || role === "planner" || role === "coder" ? role : "planner";
  return ownerAgentId(runId, mapped);
}

function displayArg(arg: string): string {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return value.slice(value.length - MAX_OUTPUT_CHARS);
}
