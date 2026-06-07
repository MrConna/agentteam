# Agent Development Standard

## Purpose

This standard defines what every agent must update while doing assigned work in AgentTeam.

It prevents four failure modes:

- hidden progress
- unclear ownership
- duplicated work
- expensive models receiving noisy context

Every delegated agent must leave behind compact, structured artifacts that another agent or the human can inspect without reading the full transcript.

Memory sync is part of the work, not an optional cleanup step. Agents must keep durable learnings current so later agents do not spend premium tokens rediscovering the same context.

## Core Development Principles

These rules apply to every write-capable agent session.

### Test First

When behavior changes, the agent should write or update the validation before implementing the behavior. The validation can be a unit test, integration test, executable script, or explicit manual check when no test harness exists.

Passing validation is the proof that the agent understood the requirement. A clean-looking implementation without a test or validation result is incomplete.

### Plan Before Large Edits

Any task expected to change more than 100 lines must stop after planning and wait for review before editing code.

The plan must include:

- requirement understanding
- expected files to edit
- expected validation commands
- risk notes
- estimated size of the change

If the agent discovers mid-task that the change will exceed 100 lines, it must pause, update `plan.md`, and ask for approval before continuing.

### Strict File Scope

Every delegated task must define an explicit write scope before work starts.

Good:

```text
Only edit server/adapter.ts and server/adapter.validation.ts.
```

Bad:

```text
Fix the adapter however you think is best.
```

Agents must not add files outside the scope, broaden directories, or modify shared files such as `package.json`, migrations, schemas, or global styles without an explicit scope update.

### Commit Message As Understanding Check

Every session handoff must include the commit message the agent would use for its work.

If the agent cannot write a concise commit message that names the actual outcome, the work is not ready for handoff. This applies even when the agent is not allowed to commit.

## Required Artifacts

Each delegated run must have a run directory:

```text
.agentteam/runs/<run-id>/
├── task.json
├── plan.md
├── heartbeat.json
├── progress.md
├── decisions.md
├── blockers.md
├── evidence.md
├── summary.md
└── result.json
```

If the run is read-only, it still writes these artifacts. If the run cannot write files, it must return the same sections in its final response so AgentTeam can persist them.

## Run Lifecycle

### 1. Assigned

AgentTeam creates:

- task id
- run id
- role
- provider/model
- branch/worktree
- read scope
- write scope
- budget
- required outputs
- approval policy

Agent must not expand the write scope without asking for approval.

All write-capable agents must work in a dedicated git worktree. Direct edits on `main` are reserved for the human integrator or tiny documentation-only fixes explicitly approved by the human.

### 2. Started

Agent must update:

- `heartbeat.json`
- `plan.md`
- `progress.md`

Minimum `heartbeat.json`:

```json
{
  "runId": "run-codex-impl-oauth",
  "status": "running",
  "progress": 10,
  "currentStep": "Reading assigned files",
  "nextStep": "Draft implementation plan",
  "lastHeartbeat": "2026-06-06T11:00:00Z"
}
```

Minimum `plan.md`:

```md
# Plan

## Understanding

## Steps

## Write Scope

## Validation

## Risks
```

### 3. In Progress

Agent must update progress at meaningful milestones:

- after reading context
- after selecting an approach
- before making file edits
- after file edits
- after running commands/tests
- when blocked
- before final handoff

Minimum `progress.md` format:

```md
# Progress

## Current Status

## Completed

## In Progress

## Next

## Files Touched

## Commands Run
```

### 4. Blocked

Agent must update:

- `heartbeat.json` with `status: "blocked"`
- `blockers.md`
- Agent Inbox item if human input is required

Minimum blocker format:

```md
# Blockers

## Blocking Question

## Why It Blocks Progress

## Options

## Recommended Option

## Safe Work Still Possible
```

Agents should continue safe non-blocked work when possible.

### 5. Completed

Agent must update:

- `summary.md`
- `result.json`
- `evidence.md`
- `heartbeat.json` with `status: "completed"` or `status: "failed"`

Minimum final summary:

```md
# Summary

## Completed Work

## Files Changed

## Commands Run

## Validation

## Decisions Made

## Risks / Follow-Ups

## Recommended Next Agent
```

Minimum `result.json`:

```json
{
  "runId": "run-codex-impl-oauth",
  "status": "completed",
  "changedFiles": [],
  "commandsRun": [],
  "validation": [],
  "blockers": [],
  "followUps": [],
  "recommendedNextAgent": "reviewer"
}
```

## Role-Specific Requirements

### Planner

Must update:

- plan summary
- task decomposition
- dependencies
- assumptions
- risk list
- recommended routing
- approval items

Must not:

- write implementation files
- hide ambiguity
- assign broad write scopes

Best default model:

- Claude sonnet4.6
- Claude opus only for high-ambiguity planning

### Scout

Must update:

- relevant files
- current behavior
- key risks
- unknowns
- compact report for the next agent

Must not:

- make code edits by default
- ask premium models to re-read large directories
- produce long narrative summaries

Best default tools:

- Antigravity Gemini 3.5 Flash
- pi-agent DeepSeek v4 Flash

### Coder

Must update:

- tests or executable validation before implementation when behavior changes
- implementation plan before edits
- files touched
- commands run
- test/build results
- diff summary
- any scope expansion request

Must not:

- edit outside assigned write scope
- start a >100 line change before plan review
- hand off without a proposed commit message
- silently skip validation
- overwrite another agent's work

Best default model:

- Codex GPT-5.4
- Codex GPT-5.5 for complex integration

### Tester

Must update:

- test plan
- commands run
- outputs summarized
- pass/fail status
- missing coverage
- confidence level

Must not:

- claim validation without commands or explicit simulation
- bury failures in raw logs

Best default tools:

- Codex GPT-5.4
- pi-agent for log triage

### Reviewer

Must update:

- findings ordered by severity
- affected files
- regression risks
- missing tests
- verdict
- follow-up tasks

Must not:

- summarize before findings
- approve without checking evidence
- review its own implementation as final review

Best default model:

- Claude opus4.7 or Codex GPT-5.5
- double review for auth/security/data loss

### Scribe

Must update:

- release notes
- context summary
- docs draft
- memory candidates
- handoff summary

Must not:

- make product decisions
- change implementation without assignment

Best default tools:

- pi-agent Kimi 2.6
- Claude sonnet4.6 for polished external docs

## Worktree, Commit, and Merge Standard

Use [delegated-task-template.md](delegated-task-template.md) when assigning work to any agent.

### Worktree Rule

Every write-capable delegated agent must use an isolated worktree:

```bash
git worktree add -b agent/<provider>-<role>-<task-slug> ../agentteam-<provider>-<role>-<task-slug> main
```

Examples:

- `agent/claude-plan-oauth`
- `agent/codex-impl-oauth`
- `agent/pi-scribe-test-summary`
- `agent/antigravity-scout-auth`

The run artifact must record:

- branch
- worktree path
- base commit
- assigned write scope
- expected merge target

### Branch Naming

Use:

```text
agent/<provider>-<role>-<short-task>
```

Provider values:

- `claude`
- `codex`
- `antigravity`
- `pi`

Role values:

- `plan`
- `scout`
- `impl`
- `test`
- `review`
- `scribe`

### Commit Timing

Agents should commit only at stable handoff points.

Commit when:

- assigned scope is complete
- validation has passed, or failure is documented
- run artifacts are updated
- summary/result are written
- memory candidates are handled
- no unrelated files are staged

Do not commit:

- half-written implementation
- failing state without marking it as failed/blocked
- generated dependency/build folders
- files outside write scope
- unrelated user changes

For long tasks, an agent may create checkpoint commits only when all are true:

- the checkpoint builds or is clearly marked as WIP in `summary.md`
- the checkpoint helps handoff or recovery
- the branch remains isolated in its worktree

Checkpoint commits must not be merged until review gate approval.

### Commit Message Format

Use concise, role-aware messages:

```text
<role>: <outcome>
```

Examples:

- `planner: define oauth task plan`
- `scout: map auth surface`
- `coder: add github oauth provider`
- `tester: add auth smoke coverage`
- `reviewer: record oauth review verdict`
- `scribe: summarize run context`

Every handoff must include the proposed commit message, even when the agent is not permitted to commit. Treat unclear commit messages as a sign that the agent's understanding is still fuzzy.

### Staging Rule

Before committing:

```bash
git status --short
git diff --check
```

Stage only assigned files. Never use broad staging if the worktree contains unrelated files:

```bash
git add <explicit-file-1> <explicit-file-2>
```

`git add .` is allowed only when the worktree was created solely for the task and `git status --short` has been inspected.

### Forbidden Commit Contents

Never commit:

- `node_modules/`
- `dist/` unless explicitly requested for deploy artifacts
- `__pycache__/`
- `.DS_Store`
- secrets or `.env` files
- raw transcripts with secrets
- unreviewed generated binaries
- unrelated local prototypes

Generated artifacts must either be ignored or explicitly justified in `evidence.md`.

### Dependency Changes

Dependency changes require an explicit reason.

If an agent changes `package.json`, lockfiles, or tool config, it must record:

- why the dependency/config is needed
- alternatives considered
- install command run
- build/test result
- risk or size impact

Dependency changes should be reviewed before merge.

### Merge Rule

Only the human integrator or assigned integration agent merges branches into `main`.

Before merge:

- source branch has final summary/result
- source branch status is `completed`
- review gate exists or is explicitly skipped with reason
- build/tests relevant to the change passed
- no uncommitted files in source worktree

After merge:

- run build/tests on `main`
- update delegated run status to `merged`
- update task status if appropriate
- save context checkpoint for meaningful milestones

### Conflict Handling

If merge conflicts occur:

- stop and mark the delegated run as `blocked`
- record conflicted files
- record likely cause
- recommend owner for resolution
- do not resolve conflicts by deleting another agent's work

Only an integration agent should resolve cross-agent conflicts.

### Validation Gate

Each role has minimum validation:

- Planner: task plan reviewed for scope, dependencies, ambiguity.
- Scout: report includes relevant files, risks, and unknowns.
- Coder: build/test command run when available.
- Tester: test command output summarized.
- Reviewer: findings first, verdict last.
- Scribe: summary checked against artifacts.

If validation cannot run, the agent must explain why and record residual risk.

### Permission and Escalation Rule

Agents must request approval before:

- expanding write scope
- running destructive commands
- adding dependencies
- touching secrets/env files
- escalating to premium models
- merging into `main`
- changing standards or routing rules

Every escalation must include:

- reason
- expected benefit
- cheaper alternative considered
- budget impact

### Parallel Work Rule

Parallel agents must have disjoint write scopes.

If two agents need the same file:

- one agent owns the file
- the other produces a patch suggestion or review note
- integration agent applies final changes

Shared files such as `package.json`, lockfiles, schema files, and global CSS should be assigned carefully because they create merge pressure.

### Cleanup Rule

After successful merge and validation:

- leave source branch available until human confirms cleanup
- remove stale worktrees only after merge is accepted
- keep `.agentteam/runs/<run-id>/` artifacts
- do not delete evidence needed for audit or review

Suggested cleanup command after approval:

```bash
git worktree remove ../agentteam-<provider>-<role>-<task-slug>
```

## Standard Update Checklist

Before starting:

- retrieve relevant memory
- read task contract
- confirm write scope
- create run directory or return artifact sections
- record which memory entries influenced the plan

Before edits:

- write plan
- list files expected to change
- note validation commands

During work:

- update heartbeat
- update progress
- record commands
- record decisions
- record blockers

Before handoff:

- run validation or explain why not
- write summary
- write result
- sync durable memory candidates
- recommend next agent
- mark status completed/failed/blocked

## Memory Sync Protocol

### Memory Layers

AgentTeam uses three memory layers:

- `memory/learnings.jsonl`: durable project rules, decisions, traps, routing lessons, and verified patterns.
- `memory/contexts.jsonl`: resumable session checkpoints and remaining work.
- `~/.brain`: optional cross-project semantic index for reusable learnings.

Progress artifacts answer "what happened in this run." Memory answers "what should future runs know without rereading this run."

### Before Starting Work

Every non-trivial delegated run must retrieve relevant memory:

```bash
bin/memory apply --query "<task keywords>"
```

The agent must record memory usage in `.agentteam/runs/<run-id>/progress.md`:

```md
## Memory Used

- [9/10] Review gates must remain explicit before agents hand work back.
- [8/10] Use cheap scouts before premium model review.
```

If no relevant memory is found, record:

```md
## Memory Used

- No matching high-confidence memory found.
```

### During Work

Agents should collect memory candidates in `decisions.md`, but should not immediately add every note to project memory.

Use this format:

```md
## Memory Candidates

- Candidate: Real Codex adapter should write heartbeat before spawning CLI.
  - Type: implementation pattern
  - Confidence: 7
  - Evidence: server/adapter.ts run lifecycle
  - Keep? yes
```

### Before Handoff

At final handoff, add durable learnings with `bin/memory add` when they meet at least one condition:

- future agents should follow the rule
- a failed approach should not be repeated
- routing/model choice was validated
- an architecture decision was made
- a recurring bug pattern was found
- a safety or approval rule was clarified

Example:

```bash
bin/memory add "Codex workers must update heartbeat.json before running long CLI tasks so Delegation Tracker can show live state" \
  --confidence 8 \
  --source "coder/run-codex-impl-oauth" \
  --tags delegation,heartbeat,codex \
  --files docs/agent-development-standard.md \
  --context "Discovered while defining delegated run observability."
```

### What Not To Store

Do not store:

- ordinary progress updates
- raw command output
- secrets, tokens, credentials, or private customer data
- one-off preferences with no future value
- low-confidence guesses as high-confidence memory
- huge summaries that belong in `summary.md`

### Confidence Rules

- 9-10: verified rule or decision future agents should apply automatically.
- 7-8: strong lesson, useful for routing and planning.
- 4-6: hypothesis or early pattern, retrieve but do not auto-apply.
- 0-3: weak note, normally keep out of memory.

High-confidence memory should be concise. If the explanation is long, put the detail in a doc and link the file in `--files`.

### Context Checkpoints

Use context saves for resumable work, not durable rules:

```bash
bin/context save \
  --description "<what happened>" \
  --decisions "<decision 1>|<decision 2>" \
  --remaining "<next 1>|<next 2>" \
  --failed "<failed approach>" \
  --artifacts "<file1>,<file2>"
```

Save context:

- after major merges
- before pausing a long run
- after architecture decisions
- after a blocked state is reached
- before handing off to another human session

### Cross-Project Brain Sync

Project memory is local by default. Cross-project search is optional and should be deliberate.

Use:

```bash
bin/brain register "$(pwd)"
bin/brain sync
```

Run `bin/brain sync` after:

- adding multiple high-confidence learnings
- completing a milestone
- discovering a broadly reusable agent-routing pattern
- changing standard protocols

Do not require `brain sync` for every small task; that wastes time and may index noisy early learnings.

### Memory Sync Checklist

Every delegated run final summary must answer:

- Did this run retrieve memory before starting?
- Which memory entries affected the plan?
- Were any durable learnings discovered?
- Were those learnings added with `bin/memory add`?
- Is a context checkpoint needed?
- Is cross-project `brain sync` useful now?

## Human-Visible Status Rules

Task status and delegated run status are different.

Task status:

- `backlog`
- `ready`
- `running`
- `review`
- `done`

Delegated run status:

- `queued`
- `running`
- `blocked`
- `completed`
- `merged`
- `failed`

A task can have multiple delegated runs. Example:

- Antigravity scout completed
- Codex coder running
- pi-agent scribe queued
- Claude reviewer queued

The Delegation Tracker shows runs. The Task Board shows product work.

## Progress Percent Guide

Use coarse, stable progress values:

- 0: queued
- 10: started and context read
- 25: plan written
- 40: first implementation or scout report draft
- 60: main work complete
- 75: validation running
- 90: summary/result written
- 100: completed, failed, or merged

Do not update progress every few seconds. Update when the state meaningfully changes.

## Token Budget Rules

Agents must keep handoffs compact.

Required compression:

- summarize logs instead of pasting full logs
- list file paths instead of dumping full files
- pass scout reports before premium review
- include only relevant memory
- prefer structured bullets over narrative

Escalation requires a reason:

- ambiguous requirement
- failing validation with unclear root cause
- security-sensitive change
- broad architectural change
- merge conflict across agent branches

## Memory Updates

Add project memory only for durable facts:

- repeated traps
- routing decisions
- architecture decisions
- validation lessons
- failed approaches worth avoiding

Do not add memory for ordinary task progress.

Use:

```bash
bin/memory add "<durable learning>" \
  --confidence 8 \
  --source "<role>/<run-id>" \
  --tags routing,agentteam \
  --files docs/agent-development-standard.md
```

## Review Gate Entry Requirements

A task can enter review only when it has:

- final summary
- changed files list
- validation result
- known risks
- follow-up recommendations
- delegated run status completed or failed with explanation

Review Gate must show missing evidence as a risk, not hide it.
