# AgentTeam Agent Instructions

## Project Memory

This repository has a lightweight memory module.

- Before starting non-trivial work, check relevant prior learnings with `bin/memory apply --query "<task keywords>"`.
- When you discover a durable project rule, bug pattern, product decision, or failed approach, record it with `bin/memory add`.
- Save resumable state before long pauses or after meaningful milestones with `bin/context save`.
- Use `bin/context restore` when resuming work after an interruption.

High-confidence learnings (`confidence >= 7`) are treated as project guidance. Low-confidence learnings are notes, not rules.

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
