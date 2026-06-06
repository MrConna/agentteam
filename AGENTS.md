# AgentTeam Agent Instructions

## Project Memory

This repository has a lightweight memory module.

- Before starting non-trivial work, check relevant prior learnings with `bin/memory apply --query "<task keywords>"`.
- When you discover a durable project rule, bug pattern, product decision, or failed approach, record it with `bin/memory add`.
- Save resumable state before long pauses or after meaningful milestones with `bin/context save`.
- Use `bin/context restore` when resuming work after an interruption.

High-confidence learnings (`confidence >= 7`) are treated as project guidance. Low-confidence learnings are notes, not rules.

## Delegated Work Standard

For multi-agent work, follow [docs/agent-development-standard.md](docs/agent-development-standard.md).

Every delegated agent must keep its work observable:

- Before starting: retrieve relevant memory, read the task contract, confirm read/write scope.
- Before edits: write or return a short plan with expected files and validation commands.
- During work: update heartbeat/progress at meaningful milestones.
- When blocked: record the blocker, why it blocks progress, options, and recommended option.
- Before handoff: provide summary, changed files, commands run, validation result, risks, and recommended next agent.

If the agent can write files, use `.agentteam/runs/<run-id>/` artifacts:

- `task.json`
- `plan.md`
- `heartbeat.json`
- `progress.md`
- `decisions.md`
- `blockers.md`
- `evidence.md`
- `summary.md`
- `result.json`

If the agent cannot write files, return those sections in the final response so AgentTeam can persist them.

Task status and delegated run status are separate:

- Task status: `backlog`, `ready`, `running`, `review`, `done`
- Run status: `queued`, `running`, `blocked`, `completed`, `merged`, `failed`

Do not expand write scope, run risky commands, or escalate to a premium model without a recorded reason.

## Examples

```bash
bin/memory add "Review gates must remain explicit before agents hand work back" \
  --confidence 8 \
  --source implementation \
  --tags review,agents,workflow \
  --context "AgentTeam product thesis emphasizes governable AI teammates."

bin/context save \
  --description "Implemented operator console shell" \
  --decisions "Use dense developer-first UI|Keep review gate visible" \
  --remaining "Add task filters|Test mobile layout" \
  --failed "Marketing-style landing page"
```
