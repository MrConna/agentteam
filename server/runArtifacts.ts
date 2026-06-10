import type { Task } from "../src/types/domain.ts";
import type { CliCommand, CliExecutionResult, RealAgentProvider } from "./agentCli.ts";

export interface RealTaskPacket {
  schema: "agentteam.realTaskPacket.v1";
  runId: string;
  taskId: string;
  title: string;
  description: string;
  provider: RealAgentProvider;
  model: string;
  branch: string;
  worktree: string;
  fileScope: string[];
  risk: Task["risk"];
  command: {
    provider: RealAgentProvider;
    display: string;
    cwd: string;
  };
  createdAt: string;
}

export interface RealRunResult {
  schema: "agentteam.realRunResult.v1";
  runId: string;
  taskId: string;
  provider: RealAgentProvider;
  status: "completed" | "blocked" | "failed";
  command: string;
  exitCode?: number | null;
  startedAt: string;
  completedAt: string;
  summary: string;
  stdoutTail: string;
  stderrTail: string;
  blockers: string[];
  changedFiles: string[];
  validation: {
    command: string;
    result: "passed" | "failed" | "not_run";
    summary: string;
  }[];
  /** Self-evolution: the agent's self-reported retrospective, parsed from stdout. */
  retro?: AgentRetro;
}

/** Agent's self-critique block (see docs/agent-self-evolution-loop.md, 钩子B). */
export interface AgentRetro {
  wentWell?: string;
  wentWrong?: string;
  nextTime?: string;
}

/**
 * Best-effort extraction of a `RETROSPECTIVE` JSON block the agent prints at
 * handoff: `{ "went_well": "...", "went_wrong": "...", "next_time": "..." }`.
 * Tolerates ``` fences, a leading "RETROSPECTIVE" marker, and surrounding noise.
 * Returns undefined when no block with any retro key is found.
 */
export function parseRetro(stdout: string): AgentRetro | undefined {
  if (!stdout) return undefined;

  const candidates: string[] = [];
  const fences = stdout.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (fences) {
    for (const f of fences) candidates.push(f.replace(/```(?:json)?/i, "").replace(/```\s*$/, ""));
  }
  // Prefer the region after a RETROSPECTIVE marker, else scan the whole output.
  const markerIdx = stdout.search(/RETROSPECTIVE/i);
  candidates.push(markerIdx >= 0 ? stdout.slice(markerIdx) : stdout);

  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const obj = JSON.parse(c.slice(start, end + 1));
      if (obj && (obj.went_well || obj.went_wrong || obj.next_time)) {
        const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
        return { wentWell: str(obj.went_well), wentWrong: str(obj.went_wrong), nextTime: str(obj.next_time) };
      }
    } catch {
      /* try next candidate */
    }
  }
  return undefined;
}

export function createTaskPacket(input: {
  runId: string;
  task: Task;
  provider: RealAgentProvider;
  model: string;
  branch: string;
  worktree: string;
  command: CliCommand;
}): RealTaskPacket {
  return {
    schema: "agentteam.realTaskPacket.v1",
    runId: input.runId,
    taskId: input.task.id,
    title: input.task.title,
    description: input.task.description,
    provider: input.provider,
    model: input.model,
    branch: input.branch,
    worktree: input.worktree,
    fileScope: input.task.fileScope,
    risk: input.task.risk,
    command: {
      provider: input.provider,
      display: input.command.display,
      cwd: input.command.cwd,
    },
    createdAt: new Date().toISOString(),
  };
}

export function createRunResult(input: {
  runId: string;
  task: Task;
  provider: RealAgentProvider;
  command: CliCommand;
  execution: CliExecutionResult;
  /** Real changed files collected from the worktree after execution. */
  changedFiles?: string[];
  /** Optional extra diff summary lines (e.g. per-file +/- counts). */
  diffSummary?: string[];
}): RealRunResult {
  const blocked = input.execution.status === "blocked" || input.execution.status === "dry_run";
  const failed = input.execution.status === "failed";
  const blockers = blocked ? [input.execution.reason ?? "blocked"] : [];
  const changedFiles = input.changedFiles ?? [];
  const baseSummary = summarizeExecution(input.execution);
  const summary =
    input.execution.status === "success" && changedFiles.length
      ? `${baseSummary} ${changedFiles.length} file(s) changed.`
      : baseSummary;
  return {
    schema: "agentteam.realRunResult.v1",
    runId: input.runId,
    taskId: input.task.id,
    provider: input.provider,
    status: blocked ? "blocked" : failed ? "failed" : "completed",
    command: input.command.display,
    exitCode: input.execution.exitCode,
    startedAt: input.execution.startedAt,
    completedAt: input.execution.completedAt,
    summary,
    stdoutTail: input.execution.stdout,
    stderrTail: input.execution.stderr,
    blockers,
    changedFiles,
    validation: [
      {
        command: input.command.display,
        result: input.execution.status === "success" ? "passed" : "not_run",
        summary: baseSummary,
      },
    ],
    retro: parseRetro(input.execution.stdout),
  };
}

function summarizeExecution(execution: CliExecutionResult): string {
  if (execution.status === "success") return "Real CLI command completed successfully.";
  if (execution.status === "dry_run") return "Real CLI command was constructed but not executed because dryRun was requested.";
  if (execution.status === "blocked") return "Real CLI command was not executed because the real adapter is disabled.";
  return `Real CLI command failed: ${execution.reason ?? "unknown failure"}.`;
}
