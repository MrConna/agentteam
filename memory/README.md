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

## Optional Cross-Project Brain

`bin/brain` indexes learnings across projects with sentence-transformer embeddings. It is optional and requires:

```bash
pip install sentence-transformers
bin/brain init
bin/brain register "$(pwd)"
bin/brain sync
```
