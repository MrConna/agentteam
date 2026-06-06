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
}): RealRunResult {
  const blocked = input.execution.status === "blocked" || input.execution.status === "dry_run";
  const failed = input.execution.status === "failed";
  const blockers = blocked ? [input.execution.reason ?? "blocked"] : [];
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
    summary: summarizeExecution(input.execution),
    stdoutTail: input.execution.stdout,
    stderrTail: input.execution.stderr,
    blockers,
    changedFiles: [],
    validation: [
      {
        command: input.command.display,
        result: input.execution.status === "success" ? "passed" : "not_run",
        summary: summarizeExecution(input.execution),
      },
    ],
  };
}

function summarizeExecution(execution: CliExecutionResult): string {
  if (execution.status === "success") return "Real CLI command completed successfully.";
  if (execution.status === "dry_run") return "Real CLI command was constructed but not executed because dryRun was requested.";
  if (execution.status === "blocked") return "Real CLI command was not executed because the real adapter is disabled.";
  return `Real CLI command failed: ${execution.reason ?? "unknown failure"}.`;
}
