# AgentTeam Memory

This directory stores project-local memory for AgentTeam agents.

## Files

- `learnings.jsonl`: durable project learnings, decisions, patterns, and gotchas.
- `contexts.jsonl`: saved session state for restoring interrupted work.

Both files use JSONL so they stay reviewable in Git and easy to edit by hand.

## Quick Commands

```bash
bin/memory add "Agents report progress in project channels, not side chat" --confidence 9 --source kickoff --tags product,agentteam
bin/memory search "project channels"
bin/memory list --confidence-min 7

bin/context save --description "Initialized memory module" --decisions "Use JSONL project memory" --remaining "Wire automation hooks later"
bin/context restore
```

## Sync Rules

Use memory for durable knowledge, not ordinary progress.

Add to `learnings.jsonl` when a future agent should know it without rereading a full run:

- architecture decisions
- validated development rules
- recurring bug patterns
- failed approaches to avoid
- model-routing lessons
- safety and approval policies

Use `contexts.jsonl` for resumable session state:

- what was done
- decisions made
- remaining work
- blockers
- artifacts

Before non-trivial work:

```bash
bin/memory apply --query "<task keywords>"
```

After meaningful milestones:

```bash
bin/context save --description "<checkpoint>" --decisions "<d1>|<d2>" --remaining "<r1>|<r2>"
```

After several high-confidence learnings or reusable routing lessons, optionally update the cross-project index:

```bash
bin/brain sync
```

Do not store secrets, raw logs, noisy progress updates, or low-confidence guesses as high-confidence memory.

## Optional Cross-Project Brain

`bin/brain` indexes learnings across projects with sentence-transformer embeddings. It is optional and requires:

```bash
pip install sentence-transformers
bin/brain init
bin/brain register "$(pwd)"
bin/brain sync
```
