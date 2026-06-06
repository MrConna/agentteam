# Agent Development Standard

## Purpose

This standard defines what every agent must update while doing assigned work in AgentTeam.

It prevents four failure modes:

- hidden progress
- unclear ownership
- duplicated work
- expensive models receiving noisy context

Every delegated agent must leave behind compact, structured artifacts that another agent or the human can inspect without reading the full transcript.

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

- implementation plan before edits
- files touched
- commands run
- test/build results
- diff summary
- any scope expansion request

Must not:

- edit outside assigned write scope
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

## Standard Update Checklist

Before starting:

- retrieve relevant memory
- read task contract
- confirm write scope
- create run directory or return artifact sections

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
- recommend next agent
- mark status completed/failed/blocked

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
