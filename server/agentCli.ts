import { spawn } from "node:child_process";
import type { Task } from "../src/types/domain.ts";
import { resolveCommand } from "./agentRegistry.ts";

export type RealAgentProvider = "claude" | "codex" | "antigravity" | "pi-agent";

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
  return (
    value === "claude" ||
    value === "codex" ||
    value === "antigravity" ||
    value === "pi-agent"
  );
}

export function realAdapterEnabled(): boolean {
  return process.env.AGENTTEAM_REAL_ADAPTER_ENABLED === "1";
}

export function buildPrompt(task: Task, runId: string): string {
  const scope = task.fileScope.length ? task.fileScope.join(", ") : "No file scope declared";
  return [
    "You are an AgentTeam delegated coding agent.",
    `Run ID: ${runId}`,
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Description: ${task.description}`,
    `Write scope: ${scope}`,
    "Follow AGENTS.md and docs/agent-development-standard.md.",
    "Before handoff, report changed files, commands run, validation, blockers, and follow-ups.",
  ].join("\n");
}

export function buildCliCommand(input: {
  provider: RealAgentProvider;
  task: Task;
  runId: string;
  worktree: string;
  prompt?: string;
  model?: string;
}): CliCommand {
  const prompt = input.prompt?.trim() || buildPrompt(input.task, input.runId);
  if (input.provider === "claude") {
    const args = ["-p", prompt];
    if (input.model) args.unshift("--model", input.model);
    return toCommand(input.provider, resolveCommand("claude"), args, input.worktree);
  }
  if (input.provider === "codex") {
    const args = ["exec", prompt];
    if (input.model) args.splice(1, 0, "--model", input.model);
    return toCommand(input.provider, resolveCommand("codex"), args, input.worktree);
  }
  if (input.provider === "antigravity") {
    // Antigravity/Gemini is driven through the `agy` CLI in non-interactive mode.
    const args = ["-p", prompt];
    if (input.model) args.unshift("-m", input.model);
    return toCommand(input.provider, resolveCommand("antigravity"), args, input.worktree);
  }
  const args = [
    "-p",
    "--tools",
    "read,grep,find,ls,bash,edit,write",
    "--session-dir",
    `.agentteam/sessions/${input.runId}`,
  ];
  if (input.model) args.push("--model", input.model);
  args.push(prompt);
  return toCommand(input.provider, resolveCommand("pi-agent"), args, input.worktree);
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
