import { spawn } from "node:child_process";
import type { Task } from "../src/types/domain.ts";
import { buildArgs, isConfiguredProvider, renderPrompt, resolveCommand } from "./agentRegistry.ts";

/** Any configured provider id (free-text, validated against agents.config.json). */
export type RealAgentProvider = string;

export interface RealRunOptions {
  provider?: RealAgentProvider | "simulated";
  model?: string;
  dryRun?: boolean;
  prompt?: string;
  worktree?: string;
  timeoutMs?: number;
  /** Note recorded into run artifacts: which memory influenced this run. */
  memoryNote?: string;
}

export interface CliCommand {
  provider: RealAgentProvider;
  command: string;
  args: string[];
  cwd: string;
  display: string;
}

export interface CliExecutionResult {
  status: "success" | "failed" | "blocked" | "dry_run";
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  reason?: string;
  startedAt: string;
  completedAt: string;
}

const MAX_OUTPUT_CHARS = 12_000;

export function isRealProvider(value: unknown): value is RealAgentProvider {
  return isConfiguredProvider(value);
}

export function realAdapterEnabled(): boolean {
  return process.env.AGENTTEAM_REAL_ADAPTER_ENABLED === "1";
}

export function buildPrompt(task: Task, runId: string, provider = "claude"): string {
  return renderPrompt(provider, task, runId);
}

/**
 * Build the CLI command for any configured provider purely from its template in
 * agents.config.json. No per-provider branches: argv comes from the provider's
 * `args` template with {model}/{prompt}/{runId}/{taskId} substituted.
 */
export function buildCliCommand(input: {
  provider: RealAgentProvider;
  task: Task;
  runId: string;
  worktree: string;
  prompt?: string;
  model?: string;
  /** 自进化召回：拼在 prompt 最前面的「过往同类任务教训」段（见 server/retro.ts）。 */
  lessons?: string;
}): CliCommand {
  const base = input.prompt?.trim() || renderPrompt(input.provider, input.task, input.runId);
  const prompt = input.lessons?.trim() ? `${input.lessons.trim()}\n\n${base}` : base;
  const model = input.model ?? "";
  const args = buildArgs({
    provider: input.provider,
    model,
    prompt,
    runId: input.runId,
    taskId: input.task.id,
  });
  return toCommand(input.provider, resolveCommand(input.provider), args, input.worktree);
}

export async function executeCliCommand(
  cli: CliCommand,
  opts: { dryRun?: boolean; timeoutMs?: number } = {},
): Promise<CliExecutionResult> {
  const startedAt = new Date().toISOString();
  if (opts.dryRun) {
    return {
      status: "dry_run",
      stdout: "",
      stderr: "",
      reason: "dry_run_requested",
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
  if (!realAdapterEnabled()) {
    return {
      status: "blocked",
      stdout: "",
      stderr: "",
      reason: "real_adapter_disabled",
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(cli.command, cli.args, {
      cwd: cli.cwd,
      shell: false,
      env: process.env,
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        status: "failed",
        exitCode: null,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        reason: "timeout",
        startedAt,
        completedAt: new Date().toISOString(),
      });
    }, opts.timeoutMs ?? 25 * 60 * 1000);

    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + String(chunk));
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: "failed",
        stdout: trimOutput(stdout),
        stderr: trimOutput(`${stderr}\n${error.message}`),
        reason: "spawn_error",
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status: code === 0 ? "success" : "failed",
        exitCode: code,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        reason: code === 0 ? undefined : "non_zero_exit",
        startedAt,
        completedAt: new Date().toISOString(),
      });
    });
  });
}

function toCommand(provider: RealAgentProvider, command: string, args: string[], cwd: string): CliCommand {
  return {
    provider,
    command,
    args,
    cwd,
    display: [command, ...args.map(displayArg)].join(" "),
  };
}

function displayArg(arg: string): string {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

function trimOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return value.slice(value.length - MAX_OUTPUT_CHARS);
}
