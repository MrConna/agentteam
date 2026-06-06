# Real Agent Adapter Implementation

## Current State

AgentTeam still defaults to the simulated adapter for existing calls:

```http
POST /api/runs/:runId/tasks/:taskId/run
POST /api/runs/:runId/run-next
```

Those requests continue to drive the existing ready -> running -> review path in SQLite.

Real CLI-backed execution is opt-in through the request body:

```json
{
  "provider": "codex",
  "dryRun": true
}
```

Supported provider values are `claude`, `codex`, and `pi-agent`. The frontend API type also accepts `simulated` for callers that want to be explicit.

## Modules

- `server/agentCli.ts` validates real providers, builds CLI commands, and executes them with `spawn` and `shell: false`.
- `server/runArtifacts.ts` defines task packet and run result helpers:
  - `agentteam.realTaskPacket.v1`
  - `agentteam.realRunResult.v1`
- `server/realAdapter.ts` imports real adapter outcomes into the existing AgentTeam surfaces:
  - `delegated_runs`
  - `activity_events`
  - `channel_messages`
  - `review_gates`
  - `inbox_items`
- `server/adapter.ts` remains the public adapter entrypoint and selects real execution only when the body provider is one of the real providers.

## Guarded Execution

Real execution is disabled by default. A real provider request without `dryRun: true` returns a persisted blocker unless the server process has:

```bash
AGENTTEAM_REAL_ADAPTER_ENABLED=1
```

Disabled execution is imported as:

- delegated run status: `blocked`
- task status: returned to `ready`
- coder status: `blocked`
- activity event: warning command result
- review gate: pending with no diff imported
- inbox item: `answer_blocker`

Dry runs use the same import path and are also treated as blocked because no repository changes or validation occurred.

## Command Construction

The initial command forms are:

- Claude: `claude [--model value] -p <prompt>` as argv `["--model", value, "-p", prompt]` when a model is supplied.
- Codex: `codex exec [--model value] <prompt>`
- Pi Agent: `pi-agent run --prompt <prompt> [--model value]`

Commands are represented as argv arrays and displayed as a string for audit evidence. They are not run through a shell.

## Remaining Integration Steps

1. Create and verify isolated task worktrees before enabling real execution.
2. Write task packets and result artifacts to each delegated run directory on disk.
3. Import actual changed files from `git diff --name-only` after CLI completion.
4. Import validation commands from agent output or run a controlled validation command list.
5. Add a review policy for real diff approval before task status can become `done`.
6. Add provider-specific CLI availability checks and clearer setup guidance.
7. Add automated tests for simulated default, disabled real execution, dry run, and command construction.

## Memory Usage

Applied memory entries:

- Simulated adapter in `server/adapter.ts` owns the current run contract; real adapters should implement the same contract.
- Delegated runs must maintain observable artifacts.
- Backend is Express + SQLite; frontend talks through `src/api.ts`.
