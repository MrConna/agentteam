# Agent Memory Tools

Project-local memory tooling adapted from:

`/Users/luffy/Downloads/code/Github/my_note/无记录不过程/与AI交流/agent-memory-tools`

## Layers

- `memory`: structured project learnings in `memory/learnings.jsonl`.
- `context`: session save/restore records in `memory/contexts.jsonl`.
- `brain`: optional cross-project semantic search in `~/.brain`.

Use the wrappers in `bin/` from the repository root:

```bash
bin/memory list
bin/context list
bin/brain status
```
