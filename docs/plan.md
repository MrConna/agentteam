# AgentTeam Execution Plan

## Phase 0: Project Kickoff

Status: complete

Deliverables:

- create project directory
- define goal
- write product spec
- write execution plan

Files:

- `README.md`
- `docs/goal.md`
- `docs/spec.md`
- `docs/plan.md`

## Phase 1: Prototype Brief Lock

Goal:

Confirm the exact visual and interaction brief for the first clickable prototype.

Default decision:

- visual direction: Operator Console
- density: Dense
- tone: Serious
- platform: browser-first, desktop-wrapper compatible
- user: solo developer

Tasks:

- finalize screen list
- define mock data
- define primary demo flow
- define component inventory

Acceptance criteria:

- prototype can be built without further product ambiguity
- screen hierarchy is clear
- demo scenario is locked

## Phase 2: Clickable Prototype

Goal:

Build a browser-first clickable prototype that demonstrates the core product experience.

Recommended stack:

- Vite + React + TypeScript
- CSS modules or plain CSS
- local mock data
- no backend

Screens/components:

- Project Command Center
- left rail
- agent team panel
- task board
- project channel
- run console
- agent inbox
- review gate
- selected task detail panel

Required interactions:

- select task
- approve plan
- open inbox item
- switch channel/console
- view diff summary
- approve or request changes
- simulate task moving to review/done

Acceptance criteria:

- app runs locally
- primary flow works end to end with mock data
- no visible layout overlap at desktop and mobile-ish widths
- UI feels like a professional developer tool

## Phase 3: Design QA

Goal:

Verify the prototype visually and ergonomically.

Checks:

- desktop screenshot
- narrow viewport screenshot
- text overflow
- button label fit
- status colors readable
- review gate discoverable
- inbox discoverable
- project channel not confused with generic chatbot

Acceptance criteria:

- main screen is not blank
- layout is usable at common viewport sizes
- controls are discoverable
- primary flow is understandable without explanation copy

## Phase 4: MVP Architecture Spike

Status: complete

Goal:

Decide how real agent execution will work after the prototype.

Questions answered:

- adapter target: Codex CLI + Claude Code first, then Antigravity/pi-agent scouts (`docs/multi-agent-team-architecture.md`, "First Integration Target")
- execution model: isolated git worktree per agent task, merge through review gate ("Worktree Policy")
- state store: SQLite at `.agentteam/state.db` (`docs/data-schema.md`)
- command approval model: per-run `approval_policy` enum `read_only|scoped_writes|approval_required`
- diff collection model: git state + heartbeat + artifacts captured as `activity_events` and surfaced in Run Console
- task ownership model: roles on `tasks`/`agents`; live execution tracked separately in `delegated_runs`

Deliverables:

- architecture note: `docs/multi-agent-team-architecture.md`
- data schema draft: `docs/data-schema.md` (DDL validated against sqlite3)
- integration plan: "Practical MVP Path" (Phase A/B/C) in the architecture note

## Phase 5: Minimal Working MVP

Goal:

Connect one real agent adapter to one local project run.

MVP flow:

1. user selects local repo
2. user enters goal
3. system creates task plan
4. user approves plan
5. one agent executes a scoped task
6. activity events are captured
7. diff summary appears
8. user approves or rejects

Acceptance criteria:

- one real coding task can be run safely
- all commands and file changes are logged
- user approval gates work
- state survives reload

## Milestone Timeline

### Milestone 1: Docs

Output:

- goal/spec/plan complete

Estimated effort:

- done

### Milestone 2: Prototype

Output:

- clickable frontend prototype

Estimated effort:

- 0.5-1 day

### Milestone 3: Architecture Spike

Output:

- execution adapter and local state design

Estimated effort:

- 0.5 day

### Milestone 4: Real Agent MVP

Output:

- one real local project run through AgentTeam

Estimated effort:

- 2-4 days depending on chosen agent adapter

## Risks

### Risk: Product Becomes Too IDE-Like

Mitigation:

- keep first version focused on task orchestration, channel, inbox, and review gate
- avoid building a full editor

### Risk: Multi-Agent Chaos

Mitigation:

- start with fixed roles
- one running task per agent
- explicit task ownership
- file scope shown on cards

### Risk: Unsafe Execution

Mitigation:

- approval gates before risky commands
- command log
- diff review
- optional copied workspace before direct writes

### Risk: Generic Chat UI

Mitigation:

- project channel must be operational timeline, not open-ended assistant chat
- primary UI surface is task and review state

## Immediate Next Step

Build Phase 2 clickable prototype using the Operator Console direction.

