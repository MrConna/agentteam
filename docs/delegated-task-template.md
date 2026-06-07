# Delegated Task Template

Use this template when assigning work to any agent.

```md
# Delegated Task

## Task

- Task id:
- Run id:
- Role:
- Provider/model:
- Branch:
- Worktree:
- Base commit:

## Goal

## Context Packet

## Relevant Memory

Run before starting:

```bash
bin/memory apply --query "<task keywords>"
```

Record the memory entries used in `progress.md`.

## Read Scope

- 

## Write Scope

- 

Do not edit outside this scope without approval.

## Development Constraints

- Test-first requirement:
- Expected change size:
- If expected change size is over 100 lines, stop after `plan.md` and wait for review before edits.
- Exact files allowed:
- Shared files requiring explicit approval:

## Required Artifacts

Create or return:

- `.agentteam/runs/<run-id>/task.json`
- `.agentteam/runs/<run-id>/plan.md`
- `.agentteam/runs/<run-id>/heartbeat.json`
- `.agentteam/runs/<run-id>/progress.md`
- `.agentteam/runs/<run-id>/decisions.md`
- `.agentteam/runs/<run-id>/blockers.md`
- `.agentteam/runs/<run-id>/evidence.md`
- `.agentteam/runs/<run-id>/summary.md`
- `.agentteam/runs/<run-id>/result.json`

## Validation

- 

## Budget

- Max model tier:
- Max minutes:
- Token policy:
- Escalation rule:

## Commit Rule

Commit only when:

- assigned scope is complete
- validation passed or failure is documented
- artifacts are updated
- memory candidates are handled
- only assigned files are staged

Commit message:

```text
<role>: <outcome>
```

If this message is unclear, stop and clarify the work before handoff.

## Handoff Requirements

Final response must include:

- completed work
- files changed
- commands run
- validation result
- memory added or not added
- context checkpoint needed or not
- proposed commit message
- blockers/follow-ups
- recommended next agent
```
