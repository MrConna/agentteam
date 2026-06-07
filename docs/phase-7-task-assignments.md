# Phase 7 Task Assignments

## Objective

Turn the Phase 6 real adapter foundation into a usable delegated-agent runtime.

Phase 6 proved the routing shape:

- simulated execution remains the default
- explicit providers route to real adapter code
- real execution is guarded by `AGENTTEAM_REAL_ADAPTER_ENABLED=1`
- pi-agent command shape is verified

Phase 7 should make the real path observable, testable, and ready for carefully scoped dry runs.

## Current Constraints

Original Anthropic Claude Code is temporarily blocked on this Mac by a Bun/Shadowrocket certificate path issue. Do not use `~/.claude/settings-deepseek.json` as a substitute for Claude review work. Claude tasks remain assigned but blocked until original first-party Claude Code can run.

pi-agent and Codex are usable for this phase. pi-agent should stay mostly read-only unless a narrow write scope is explicitly approved.

## Worktree Plan

| Task | Owner | Role | Branch | Worktree | Status |
|---|---|---|---|---|---|
| Add adapter tests and fixtures | Codex | coder/tester | `agent/codex-test-real-adapter` | `../agentteam-codex-test-real-adapter` | ready |
| Implement worktree and artifact import helpers | Codex | coder | `agent/codex-impl-run-artifacts` | `../agentteam-codex-impl-run-artifacts` | ready |
| Scout CLI output parsing conventions | pi-agent | scout | `agent/pi-scout-cli-output` | `../agentteam-pi-scout-cli-output` | ready |
| Draft operator runbook for real adapter dry runs | pi-agent | scribe | `agent/pi-scribe-real-adapter-runbook` | `../agentteam-pi-scribe-real-adapter-runbook` | ready |
| Review real adapter safety and merge gates | Claude Code | reviewer | `agent/claude-review-real-adapter` | `../agentteam-claude-review-real-adapter` | blocked: original Claude Code TLS/proxy issue |

## Task Packets

### T7-01: Adapter Tests And Fixtures

Owner: Codex

Role: coder/tester

Branch: `agent/codex-test-real-adapter`

Worktree: `../agentteam-codex-test-real-adapter`

Write scope:

- `server/`
- `src/api.ts` only if type fixes are required
- test/config files only if needed
- `docs/real-agent-adapter-implementation.md` only for test notes

Required outputs:

- Tests or executable validation covering:
  - simulated default path still works
  - explicit real provider with adapter disabled creates blocked delegated run
  - `dryRun: true` creates blocked evidence without executing CLI
  - bad provider is rejected
  - pi-agent command is `pi -p`, not `pi-agent run`
- Updated evidence in run artifacts
- Build/test command output summarized

Validation:

- `git diff --check`
- `npm run build`
- relevant test command

Acceptance:

- No change to existing simulated default behavior.
- Failing or blocked real runs are persisted, not swallowed.
- No `.agentteam/`, `dist/`, or `node_modules/` files are tracked.

### T7-02: Worktree And Artifact Import Helpers

Owner: Codex

Role: coder

Branch: `agent/codex-impl-run-artifacts`

Worktree: `../agentteam-codex-impl-run-artifacts`

Write scope:

- `server/`
- `docs/real-agent-adapter-implementation.md`
- `docs/agent-development-standard.md` only if the artifact contract needs a clarification

Required outputs:

- Helper for deterministic delegated run directories:
  - `.agentteam/runs/<delegated-run-id>/task.json`
  - `plan.md`
  - `heartbeat.json`
  - `progress.md`
  - `evidence.md`
  - `summary.md`
  - `result.json`
- Helper for importing:
  - `result.json.changedFiles`
  - `result.json.commandsRun`
  - `result.json.validation`
  - `blockers.md`
- Clear failure behavior when artifacts are missing or invalid.

Validation:

- `git diff --check`
- `npm run build`
- focused tests if T7-01 has landed

Acceptance:

- Real adapter evidence is file-backed, not only stored inside a SQLite JSON field.
- Missing artifacts degrade to a warning/blocker instead of a silent success.
- Artifact paths stay ignored by git.

### T7-03: CLI Output Parsing Scout

Owner: pi-agent

Role: scout

Branch: `agent/pi-scout-cli-output`

Worktree: `../agentteam-pi-scout-cli-output`

Write scope:

- `docs/cli-output-parsing-scout.md`
- local ignored `.agentteam/runs/run-pi-scout-cli-output/`

Required outputs:

- Compare output shapes for:
  - `codex exec`
  - `claude -p`
  - `pi -p`
- Recommend the minimum structured prompt convention for each provider.
- Identify which fields can be parsed from stdout and which should be written as artifacts.
- List failure modes:
  - command timeout
  - non-zero exit
  - missing artifact
  - partial artifact
  - tool unavailable

Validation:

- Read-only inspection only.
- `git diff --check`.

Acceptance:

- Report is compact and actionable for Codex.
- No implementation files are touched.

### T7-04: Real Adapter Dry-Run Runbook

Owner: pi-agent

Role: scribe

Branch: `agent/pi-scribe-real-adapter-runbook`

Worktree: `../agentteam-pi-scribe-real-adapter-runbook`

Write scope:

- `docs/real-adapter-dry-run-runbook.md`
- local ignored `.agentteam/runs/run-pi-scribe-real-adapter-runbook/`

Required outputs:

- Operator checklist for enabling and testing real adapter dry runs.
- Preflight checklist:
  - clean git status
  - dedicated worktree exists
  - provider CLI available
  - model name verified
  - write scope approved
  - memory applied
- Rollback checklist.
- What to inspect before approving a review gate.

Validation:

- `git diff --check`.

Acceptance:

- Human operator can run one safe dry-run without reading internal code.
- Runbook explicitly says real execution remains disabled unless `AGENTTEAM_REAL_ADAPTER_ENABLED=1`.

### T7-05: Real Adapter Safety Review

Owner: original Claude Code

Role: reviewer

Branch: `agent/claude-review-real-adapter`

Worktree: `../agentteam-claude-review-real-adapter`

Status: blocked until original Anthropic Claude Code runs without `UNKNOWN_CERTIFICATE_VERIFICATION_ERROR`.

Write scope:

- `docs/real-agent-adapter-safety-review.md`
- local ignored `.agentteam/runs/run-claude-review-real-adapter/`

Required outputs:

- Findings first, ordered by severity.
- Review of:
  - real adapter guardrails
  - worktree assumptions
  - artifact import failure modes
  - merge/review gate behavior
  - provider command construction
- Verdict:
  - safe to enable dry-run
  - safe to enable real execution
  - blocked pending changes

Validation:

- Read-only review.
- `git diff --check`.

Acceptance:

- No implementation changes.
- Findings reference exact files and lines.

## Merge Order

1. Merge T7-03 scout report.
2. Merge T7-01 tests.
3. Merge T7-02 artifact import helpers.
4. Merge T7-04 runbook.
5. Run original Claude Code safety review after environment is fixed.
6. Run `npm run build` on `main`.
7. Save memory and context.

## Routing Notes

Use Codex for implementation and validation loops.

Use pi-agent for scout/scribe work that compresses context for Codex.

Do not substitute DeepSeek-backed Claude settings for original Claude Code review. If original Claude remains blocked, mark the review gate blocked and continue only with low-risk implementation tasks that have Codex validation.

## Open Decisions

- Whether to add a first-class test runner dependency or use lightweight executable validation first.
- Whether real adapter execution should create worktrees itself or require pre-created worktrees from the integrator.
- ~~Whether UI provider selection belongs in Phase 7 or after the CLI path is fully validated.~~ Resolved: shipped. Topbar agent picker (provider + model + dry-run) drives `runTask`/`runNext`; antigravity (gemini) added as a 4th real provider; per-provider best model + role routing live in `server/agentRegistry.ts`. See `docs/agent-providers.md`.
