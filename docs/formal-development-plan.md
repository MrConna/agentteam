# Formal Development Plan

## Current Goal Status

The previous goal is complete: AgentTeam now has a persistent full-stack MVP with a SQLite-backed run console and a simulated adapter.

Formal development starts by replacing the simulated-only execution path with a governed real-agent orchestration layer while keeping simulation as the safe default and test fixture.

## Phase 6 Objective

Implement the first real adapter loop for Claude Code, Codex CLI, and pi-agent:

- create isolated git worktrees per delegated write-capable task
- generate compact task packets from existing task/run state
- invoke the selected CLI in non-interactive mode
- persist run artifacts under `.agentteam/runs/<run-id>/`
- import summaries, changed files, commands, validation, blockers, and result status
- keep review gates explicit before merge

Phase 6 has landed. The next development batch is tracked in
[Phase 7 Task Assignments](phase-7-task-assignments.md).

## First Task Split

| Task | Owner | Role | Branch | Worktree | Output |
|---|---|---|---|---|---|
| Define real adapter contract and safety gates | Claude sonnet4.6 | planner/reviewer | `agent/claude-plan-real-adapter` | `../agentteam-claude-plan-real-adapter` | `docs/real-agent-adapter-plan.md` |
| Scout pi-agent CLI integration | pi-agent Kimi/DeepSeek | scout/scribe | `agent/pi-scout-real-adapter` | `../agentteam-pi-scout-real-adapter` | `docs/pi-agent-integration-scout.md` |
| Implement adapter foundation | Codex GPT-5.4/GPT-5.5 | coder | `agent/codex-impl-real-adapter` | `../agentteam-codex-impl-real-adapter` | server adapter modules + tests/build evidence |

## Routing Rules

Use Claude for ambiguity and risk review. It should clarify adapter boundaries, approval gates, and failure modes before large code changes.

Use pi-agent first for cheap inspection. It should validate command templates and session behavior with read-only tools before we allow edits.

Use Codex for repository-grounded implementation. Codex owns TypeScript changes, build loops, and integration with current Express/SQLite/React patterns.

## Merge Order

1. Merge the Claude planning branch if it cleanly documents the adapter contract.
2. Merge the pi-agent scout branch if it adds command templates and limitations.
3. Merge the Codex implementation branch after build validation and review.
4. Run `npm run build` on `main`.
5. Save context and memory learnings after Phase 6 lands.

## Acceptance Criteria

- Existing simulated adapter path still works.
- At least one real CLI adapter can be invoked behind an explicit mode or provider selection.
- Every delegated run has observable artifacts matching `docs/agent-development-standard.md`.
- Failed or blocked external CLI calls are imported as blocked/failed delegated runs, not silent errors.
- No agent branch is merged without a review gate or explicit skip reason.

## Non-Goals For This Phase

- Full Antigravity automation, unless a stable CLI/API is available.
- Automatic cross-agent conflict resolution.
- Background daemon scheduling.
- Cost accounting beyond basic duration/status fields.
