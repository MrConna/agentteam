import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Task } from "../src/types/domain.ts";

/**
 * Agent registry — config-driven single source of truth for "which TUI runs
 * which model, with which command and prompt".
 *
 * Providers are declared in agents.config.json at the repo root. Adding a new
 * agent is zero-code: add an entry there. Each provider is a real CLI/TUI that
 * is strongest with its own model, so work is routed per role and each runs its
 * top model. If the config file is missing or invalid, a built-in default
 * (claude/codex/antigravity/pi-agent) is used so the app always boots.
 *
 * Every field is overridable at runtime:
 *  - command:  env AGENTTEAM_CMD_<ID>  (e.g. AGENTTEAM_CMD_CLAUDE=/path/to/claude)
 *  - model:    per-run via API/UI
 * Real execution stays guarded by AGENTTEAM_REAL_ADAPTER_ENABLED=1 regardless.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.AGENTTEAM_AGENTS_CONFIG ?? join(here, "..", "agents.config.json");

export interface ProviderProfile {
  id: string;
  label: string;
  command: string;
  defaultModel: string;
  models: string[];
  /** argv template; tokens {model} {prompt} {runId} {taskId} {sessionId} are substituted. */
  args: string[];
  /** optional argv for follow-up chat turns (continuity, e.g. --continue). */
  resumeArgs?: string[];
  /** optional per-provider prompt template; falls back to defaultPromptTemplate. */
  promptTemplate?: string;
  bestFor: string;
}

export interface AgentsConfig {
  defaultPromptTemplate: string;
  roleRouting: Record<string, string>;
  providers: ProviderProfile[];
}

const DEFAULT_PROMPT =
  "You are an AgentTeam delegated coding agent.\nRun ID: {runId}\nTask ID: {taskId}\nTitle: {title}\nDescription: {description}\nWrite scope: {fileScope}\nFollow AGENTS.md and docs/agent-development-standard.md.\nIf a \"过往同类任务教训\" section is shown above, read it first and apply the lessons.\nBefore handoff, report changed files, commands run, validation, blockers, and follow-ups.\nThen, as the very last line, print a self-retrospective so future runs can learn:\nRETROSPECTIVE {\"went_well\":\"...\",\"went_wrong\":\"...\",\"next_time\":\"...\"}\nEach value is one short sentence; next_time must be a concrete, actionable improvement (use \"\" if truly none).";

const DEFAULT_CONFIG: AgentsConfig = {
  defaultPromptTemplate: DEFAULT_PROMPT,
  roleRouting: {
    planner: "claude",
    coder: "codex",
    reviewer: "claude",
    tester: "codex",
    scout: "antigravity",
    scribe: "pi-agent",
  },
  providers: [
    { id: "claude", label: "Claude Code", command: "claude", defaultModel: "opus", models: ["opus", "sonnet", "haiku"], args: ["--model", "{model}", "-p", "{prompt}"], resumeArgs: ["-p", "{prompt}", "--continue"], bestFor: "Planning and review judgment" },
    { id: "codex", label: "Codex", command: "codex", defaultModel: "gpt-5-codex", models: ["gpt-5-codex", "gpt-5", "o4-mini"], args: ["exec", "--model", "{model}", "{prompt}"], bestFor: "Repo-grounded implementation and tests" },
    { id: "antigravity", label: "Antigravity (Gemini)", command: "agy", defaultModel: "gemini-3.5-flash", models: ["gemini-3.5-flash", "gemini-3.1-pro"], args: ["--model", "{model}", "-p", "{prompt}"], resumeArgs: ["-p", "{prompt}", "-c"], bestFor: "Fast scouting and exploration" },
    { id: "pi-agent", label: "pi-agent", command: "pi", defaultModel: "deepseek/deepseek-v4-flash", models: ["deepseek/deepseek-v4-flash", "moonshotai-cn/kimi-k2.6", "local/llama"], args: ["-p", "--tools", "read,grep,find,ls,bash,edit,write", "--session-dir", ".agentteam/sessions/{sessionId}", "--model", "{model}", "{prompt}"], resumeArgs: ["-p", "--session-dir", ".agentteam/sessions/{sessionId}", "--continue", "{prompt}"], bestFor: "Cheap scout, scribe, and local models" },
  ],
};

function loadConfig(): AgentsConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<AgentsConfig>;
    if (!Array.isArray(raw.providers) || raw.providers.length === 0) return DEFAULT_CONFIG;
    return {
      defaultPromptTemplate: raw.defaultPromptTemplate || DEFAULT_PROMPT,
      roleRouting: { ...DEFAULT_CONFIG.roleRouting, ...(raw.roleRouting ?? {}) },
      providers: raw.providers as ProviderProfile[],
    };
  } catch (e) {
    console.error(`[registry] invalid ${CONFIG_PATH}, using defaults:`, e);
    return DEFAULT_CONFIG;
  }
}

const CONFIG = loadConfig();
const PROVIDER_MAP = new Map(CONFIG.providers.map((p) => [p.id, p]));

/** Back-compat: a record-like view some callers used. */
export const PROVIDERS: Record<string, ProviderProfile> = Object.fromEntries(
  CONFIG.providers.map((p) => [p.id, p]),
);

export function listProviders(): ProviderProfile[] {
  return CONFIG.providers;
}

export function getProfile(provider: string): ProviderProfile | undefined {
  return PROVIDER_MAP.get(provider);
}

/** A provider is "real" if it is a configured id (anything but the simulated default). */
export function isConfiguredProvider(value: unknown): value is string {
  return typeof value === "string" && value !== "simulated" && PROVIDER_MAP.has(value);
}

/** Resolve the executable to spawn. Env override AGENTTEAM_CMD_<ID> wins. */
export function resolveCommand(provider: string): string {
  const envKey = `AGENTTEAM_CMD_${provider.toUpperCase().replace(/-/g, "_")}`;
  const override = process.env[envKey]?.trim();
  return override || PROVIDER_MAP.get(provider)?.command || provider;
}

export function defaultModelFor(provider: string): string {
  return PROVIDER_MAP.get(provider)?.defaultModel ?? "";
}

function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

/** Render the prompt for a task using the provider's (or default) template. */
export function renderPrompt(provider: string, task: Task, runId: string): string {
  const profile = PROVIDER_MAP.get(provider);
  const template = profile?.promptTemplate || CONFIG.defaultPromptTemplate;
  return substitute(template, {
    runId,
    taskId: task.id,
    title: task.title,
    description: task.description,
    fileScope: task.fileScope.length ? task.fileScope.join(", ") : "No file scope declared",
  });
}

/** Build argv from the provider's template, substituting {model}/{prompt}/{runId}/{taskId}. */
export function buildArgs(input: {
  provider: string;
  model: string;
  prompt: string;
  runId: string;
  taskId: string;
}): string[] {
  const profile = PROVIDER_MAP.get(input.provider);
  const template = profile?.args ?? ["-p", "{prompt}"];
  return template.map((tok) =>
    substitute(tok, {
      model: input.model,
      prompt: input.prompt,
      runId: input.runId,
      taskId: input.taskId,
    }),
  );
}

/**
 * Build argv for a chat turn. First turn uses `args`; follow-ups use `resumeArgs`
 * (continuity) when the provider defines them, else fall back to `args`.
 * Tokens {model} {prompt} {message} {sessionId} are substituted.
 */
export function buildChatArgs(input: {
  provider: string;
  model: string;
  message: string;
  sessionId: string;
  first: boolean;
}): string[] | null {
  const profile = PROVIDER_MAP.get(input.provider);
  if (!profile) return null;
  const template = input.first ? profile.args : profile.resumeArgs ?? profile.args;
  return template.map((tok) =>
    substitute(tok, {
      model: input.model,
      prompt: input.message,
      message: input.message,
      sessionId: input.sessionId,
      runId: input.sessionId,
    }),
  );
}

/** Best provider+model for a role, e.g. routeForRole("coder") -> codex/gpt-5-codex. */
export function routeForRole(role: string): { provider: string; model: string } {
  const provider = CONFIG.roleRouting[role] ?? CONFIG.providers[1]?.id ?? CONFIG.providers[0].id;
  return { provider, model: defaultModelFor(provider) };
}

/** UI-facing list including the simulated default. */
export function providerOptions(): { id: string; label: string; models: string[] }[] {
  return [
    { id: "simulated", label: "Simulated (no CLI)", models: [] },
    ...CONFIG.providers.map((p) => ({ id: p.id, label: p.label, models: p.models })),
  ];
}
