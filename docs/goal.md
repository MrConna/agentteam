# AgentTeam Goal

## One-Line Goal

Build a personal Agent Team OS for solo developers: a workspace where AI coding agents behave like accountable project teammates, not detached chat windows.

## Product Positioning

AgentTeam is a BridgeSpace-style alternative for personal use, with Helio-style AI teammate interaction.

BridgeSpace inspiration:

- agentic development environment
- multi-agent coding workspace
- terminals, task board, editor, and execution logs in one place

Helio inspiration:

- AI colleagues share the same channels, tasks, timeline, and approval flow
- humans stay in the loop and decide what ships
- agents surface progress and blockers instead of hiding inside tool logs

AgentTeam positioning:

> A personal project cockpit for AI coding agents.

## Target User

Primary user:

- solo developer
- indie hacker
- AI coding power user
- builder using tools like Codex, Claude Code, Cursor, OpenClaw, or local agent runners

Secondary user later:

- small product team lead
- technical founder
- AI automation builder

Not the first target:

- enterprise engineering org
- large compliance-heavy team
- non-technical workflow automation user

## Core Problem

AI coding agents are getting more capable, but personal users still lack a clear control layer.

Current pain:

- agents work in separate tabs, terminals, or chat sessions
- task state is fragmented
- file ownership is unclear
- diffs, tests, commands, and approvals are hard to monitor together
- users must constantly prompt for status
- multi-agent work feels powerful but chaotic

## Product Promise

AgentTeam makes agent work visible, assignable, reviewable, and shippable.

The user should always know:

- what goal the team is working toward
- which agent owns which task
- what is running right now
- what changed
- what needs approval
- what is safe to ship

## Product Principles

### 0. AI Native Means Rebuilding the Workflow

AI Native is not about stuffing AI into the old workflow; it is about using AI to redesign the entire workflow.

> AI Native 不是把 AI 塞进旧流程，而是用 AI 重构整个流程。

Do not bolt agents onto a human-shaped process and call it done. Start from what becomes possible when capable agents are first-class participants, then redesign task flow, ownership, review, and shipping around that. Every feature should be judged against this: does it digitize an old habit, or does it reconstruct the workflow for an AI-native team?

### 1. Agents Are Teammates, Not Sidebars

Agents should have names, roles, task ownership, progress updates, blockers, and review responsibilities.

### 2. Every Change Passes Through a Gate

Commands, file edits, external calls, and final diffs should be visible and approvable.

### 3. The Human Manages Decisions, Not Logs

The product should reduce prompt-chasing. Important decisions appear in an inbox and review gate.

### 4. Local-First Trust

The first serious version should assume local projects and local execution. Cloud collaboration can come later.

### 5. Small Team Before Swarm

The MVP should prove 3-4 agents working clearly before attempting large swarms.

## MVP Goal

Create a clickable product prototype and then a minimal working implementation that demonstrates:

1. entering a project goal
2. generating a task board
3. assigning tasks to fixed agent roles
4. showing agent progress in a project channel
5. showing command/file/test activity
6. surfacing review items in an inbox
7. approving or rejecting a final change

## Success Criteria

Prototype success:

- a new user understands the product in 30 seconds
- the relationship to BridgeSpace and Helio is visible but not copied
- the user can identify the current task, responsible agent, changed files, and approval state
- the interface feels credible for real coding work

MVP success:

- user can create a project run from a natural-language goal
- system produces editable tasks and agent assignments
- agent activity is captured in timeline form
- at least one mocked or real coding task reaches a review gate
- approval, rejection, and follow-up task creation are represented clearly

## Long-Term Vision

AgentTeam becomes the personal operating layer for AI-assisted software work:

- connect multiple coding agents
- isolate risky execution
- manage project context and memory
- coordinate task ownership
- enforce approval policies
- produce reliable delivery summaries

