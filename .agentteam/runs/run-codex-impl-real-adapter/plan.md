# Plan

## Understanding

The existing `POST /api/runs/:runId/tasks/:taskId/run` path must remain simulated by default. Real CLI-backed execution needs an explicit provider option and should update the same task/delegated-run/activity/review/inbox surfaces that the simulated adapter already uses.

## Steps

1. Read current adapter, API, store helpers, schema, and delegated-run standard.
2. Add small server modules for real provider selection, CLI command construction, task/result artifacts, and guarded execution.
3. Route `runTask` and `runNextReadyTask` through simulated default or explicit real provider handling.
4. Persist real-run disabled/failure/blocker states into delegated runs, activity, channel, review gates, and inbox items.
5. Document implementation and remaining integration steps.
6. Run validation and commit assigned files only.

## Write Scope

`server/`, `src/api.ts` if needed, `docs/real-agent-adapter-implementation.md`, and `.agentteam/runs/run-codex-impl-real-adapter/`.

## Validation

Run `git diff --check` and `npm run build`.

## Risks

Real CLI execution can mutate the repository. Default behavior will stay simulated; real execution will be disabled unless explicitly requested and enabled.
