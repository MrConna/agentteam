import type { AgentRole } from "../src/types/domain.ts";

/**
 * Agent registry — the single source of truth for "which TUI runs which model".
 *
 * AgentTeam does not run one big model for everything. Each provider is a real
 * CLI/TUI that is strongest with its own model, so we route work to the best
 * tool per role and let each one use its top model:
 *
 *   claude code   -> Opus        (judgment: planning, review; CLI binary is `claude-official`)
 *   codex         -> GPT-5       (repo-grounded implementation, tests)
 *   antigravity   -> Gemini      (fast scouting; CLI binary is `agy`)
 *   pi-agent      -> DeepSeek / Kimi / local (cheap scout + scribe)
 *
 * Models here are sensible defaults; every field is overridable per run via the
 * API (RunTaskOptions.model) or the UI. Real execution stays guarded by
 * AGENTTEAM_REAL_ADAPTER_ENABLED=1 regardless of what is selected here.
 */

export type RealProvider = "claude" | "codex" | "antigravity" | "pi-agent";
export type AnyProvider = RealProvider | "simulated";

export interface ProviderProfile {
  /** Domain provider id (matches DelegatedRun.provider). */
  id: RealProvider;
  /** Human label for the UI. */
  label: string;
  /** Actual executable invoked on the host. */
  command: string;
  /** Best/default model for this provider. */
  defaultModel: string;
  /** Selectable models surfaced in the UI (first is the strongest). */
  models: string[];
  /** What this TUI is best at — shown as a hint. */
  bestFor: string;
}

export const PROVIDERS: Record<RealProvider, ProviderProfile> = {
  claude: {
    id: "claude",
    label: "Claude Code",
    command: "claude-official",
    defaultModel: "opus",
    models: ["opus", "sonnet", "haiku"],
    bestFor: "Planning and review judgment",
  },
  codex: {
    id: "codex",
    label: "Codex",
    command: "codex",
    defaultModel: "gpt-5-codex",
    models: ["gpt-5-codex", "gpt-5", "o4-mini"],
    bestFor: "Repo-grounded implementation and tests",
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity (Gemini)",
    command: "agy",
    defaultModel: "gemini-3.5-flash",
    models: ["gemini-3.5-flash", "gemini-3.1-pro"],
    bestFor: "Fast scouting and exploration",
  },
  "pi-agent": {
    id: "pi-agent",
    label: "pi-agent",
    command: "pi",
    // Provider-qualified ids are required by the pi CLI; short aliases fail.
    defaultModel: "deepseek/deepseek-v4-flash",
    models: [
      "deepseek/deepseek-v4-flash",
      "moonshotai-cn/kimi-k2.6",
      "local/llama",
    ],
    bestFor: "Cheap scout, scribe, and local models",
  },
};

/**
 * Recommended provider per fixed team role. Mirrors the routing table in
 * docs/multi-agent-team-architecture.md.
 */
export const ROLE_ROUTING: Record<AgentRole, RealProvider> = {
  planner: "claude",
  coder: "codex",
  reviewer: "claude",
  tester: "codex",
};

/** Extra roles used by delegated runs beyond the fixed board roles. */
export const EXTENDED_ROLE_ROUTING: Record<string, RealProvider> = {
  ...ROLE_ROUTING,
  scout: "antigravity",
  scribe: "pi-agent",
};

export function isRealProvider(value: unknown): value is RealProvider {
  return (
    value === "claude" ||
    value === "codex" ||
    value === "antigravity" ||
    value === "pi-agent"
  );
}

export function profileFor(provider: RealProvider): ProviderProfile {
  return PROVIDERS[provider];
}

/**
 * Resolve the executable to spawn for a provider. An env override wins so the
 * operator can point a provider at the real binary or a wrapper script without
 * editing code, e.g.:
 *   AGENTTEAM_CMD_CLAUDE=/Users/me/.local/bin/claude
 *   AGENTTEAM_CMD_ANTIGRAVITY=agy
 *   AGENTTEAM_CMD_PI_AGENT=pi
 * This is the supported fix for shell aliases (e.g. `claude-official`), which a
 * bare child_process spawn cannot resolve.
 */
export function resolveCommand(provider: RealProvider): string {
  const envKey = `AGENTTEAM_CMD_${provider.toUpperCase().replace(/-/g, "_")}`;
  const override = process.env[envKey]?.trim();
  return override || PROVIDERS[provider].command;
}

/** Best provider+model for a role, e.g. routeForRole("coder") -> codex/gpt-5-codex. */
export function routeForRole(role: string): { provider: RealProvider; model: string } {
  const provider = EXTENDED_ROLE_ROUTING[role] ?? "codex";
  return { provider, model: PROVIDERS[provider].defaultModel };
}

export function defaultModelFor(provider: RealProvider): string {
  return PROVIDERS[provider].defaultModel;
}

/** UI-facing list including the simulated default. */
export function providerOptions(): { id: AnyProvider; label: string }[] {
  return [
    { id: "simulated", label: "Simulated (no CLI)" },
    ...Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label })),
  ];
}
