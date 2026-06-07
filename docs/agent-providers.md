# Agent Providers and Models

AgentTeam does not run one big model for everything. Each provider is a real
CLI/TUI that is strongest with its own model, so work is routed to the best tool
per role and each one runs its top model.

Source of truth: `agents.config.json` (loaded by `server/agentRegistry.ts`).

## Providers

| Provider | CLI binary | Best model | Also selectable | Best for |
|---|---|---|---|---|
| Claude Code | `claude-official` | `opus` | sonnet, haiku | Planning and review judgment |
| Codex | `codex` | `gpt-5-codex` | gpt-5, o4-mini | Repo-grounded implementation and tests |
| Antigravity (Gemini) | `agy` | `gemini-3.5-flash` | gemini-3.1-pro | Fast scouting and exploration |
| pi-agent | `pi` | `deepseek/deepseek-v4-flash` | moonshotai-cn/kimi-k2.6, local/llama | Cheap scout, scribe, local models |
| Simulated | — | — | — | Default; no CLI, deterministic evidence trail |

Notes:

- Antigravity/Gemini is driven through the installed `agy` CLI in non-interactive mode.
- pi-agent requires provider-qualified model ids (`provider/id`); short aliases fail.
- Models are defaults; every run can override the model via the API or UI.

## Role routing

Mirrors `docs/multi-agent-team-architecture.md`:

| Role | Provider / model |
|---|---|
| Planner | claude / opus |
| Coder | codex / gpt-5-codex |
| Reviewer | claude / opus |
| Tester | codex / gpt-5-codex |
| Scout | antigravity / gemini-3.5-flash |
| Scribe | pi-agent / deepseek-v4-flash |

## Command shapes

```bash
claude-official --model opus -p "<task packet>"
codex exec --model gpt-5-codex "<task packet>"
agy --model gemini-3.5-flash -p "<task packet>"
pi -p --tools read,grep,find,ls,bash,edit,write --session-dir .agentteam/sessions/<run> --model deepseek/deepseek-v4-flash "<task packet>"
```

## Safety model

- The default run path is `simulated` — no CLI is spawned.
- Choosing a real provider routes to `server/realAdapter.ts`, but execution is
  still gated by `AGENTTEAM_REAL_ADAPTER_ENABLED=1`.
- With the guard off (or `dryRun: true`), the adapter constructs the real CLI
  command and records it as an `external_call` activity event plus a `blocked` /
  `dry_run` delegated run — evidence is persisted, nothing is executed.
- Enable real execution only inside an isolated worktree with an approved write
  scope. See `docs/real-adapter-dry-run-runbook.md` when present.

## Using it

UI: the topbar agent picker selects provider + model + dry-run; `Run` and per-task
`Run task` honor the selection.

API:

```bash
# simulated (default)
curl -X POST localhost:4000/api/runs/<run>/tasks/<task>/run

# real provider, dry-run (no execution, evidence persisted)
curl -X POST localhost:4000/api/runs/<run>/tasks/<task>/run \
  -H 'content-type: application/json' \
  -d '{"provider":"antigravity","model":"gemini-3.5-flash","dryRun":true}'
```
