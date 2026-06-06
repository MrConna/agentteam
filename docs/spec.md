# AgentTeam Product Spec

## 1. Overview

AgentTeam is a personal AI coding workspace. It helps a solo developer coordinate a small team of AI agents across project planning, implementation, review, testing, and shipping.

The first version should feel like:

- BridgeSpace for the workbench model
- Helio for AI teammate behavior
- Linear for task clarity
- a terminal dashboard for execution trust

## 2. MVP Scope

### In Scope

- browser-first product prototype
- single-user workspace
- one active project at a time
- fixed agent team
- generated task board
- project channel
- agent activity timeline
- command and file-change log
- review gate
- user approval flow
- mocked project data for prototype

### Out of Scope

- real multi-user collaboration
- enterprise permissions
- full code editor
- cloud sandbox
- real billing
- production MCP governance engine
- real autonomous long-running execution
- plugin marketplace

## 3. Fixed Agent Roles

### Planner

Responsibility:

- interpret user goal
- create tasks
- identify dependencies
- decide suggested order
- flag ambiguity

Outputs:

- task list
- plan summary
- risk assumptions

### Coder

Responsibility:

- implement scoped tasks
- report files touched
- request approval for risky commands

Outputs:

- implementation notes
- changed file list
- diff summary

### Reviewer

Responsibility:

- review implementation quality
- catch regressions
- find missing edge cases
- create follow-up tasks

Outputs:

- review notes
- risk level
- requested changes

### Tester

Responsibility:

- run or simulate validation
- summarize test results
- recommend missing test coverage

Outputs:

- test status
- command output summary
- confidence score

## 4. Core Screens

### 4.1 Project Command Center

The first screen after opening a project.

Must show:

- project name
- goal input or current goal
- agent team status
- task board
- project channel
- activity console
- review gate summary

### 4.2 Project Channel

Helio-inspired natural language timeline where agents report important progress.

Message types:

- plan proposed
- task started
- blocker found
- approval requested
- review completed
- follow-up suggested
- ship summary

Channel messages should be short and operational.

### 4.3 Task Board

Columns:

- Backlog
- Ready
- Running
- Review
- Done

Task card fields:

- task title
- owner agent
- status
- file scope
- risk level
- last update

### 4.4 Agent Inbox

A decision queue for the human.

Inbox item types:

- approve plan
- approve command
- approve file write scope
- review diff
- answer blocker
- accept follow-up task

### 4.5 Run Console

Execution evidence layer.

Events:

- agent reasoning summary
- command run
- command result
- file changed
- test run
- warning
- external call

The console should be filterable by agent and task in later versions.

### 4.6 Review Gate

Final decision surface before shipping a task or project run.

Must show:

- changed files
- diff summary
- tests
- risk notes
- reviewer verdict
- approve button
- request changes button
- rollback or discard option

## 5. Primary User Flow

1. User creates a project or opens an existing project.
2. User enters a goal.
3. Planner proposes a plan and task board.
4. User approves or edits the plan.
5. Coder starts the first ready task.
6. Agent progress appears in Project Channel and Run Console.
7. Risky actions appear in Agent Inbox.
8. Reviewer and Tester evaluate the result.
9. Review Gate summarizes what changed.
10. User approves, rejects, or creates follow-up work.

## 6. Prototype Demo Scenario

Project:

Personal CRM

Goal:

Add GitHub OAuth login and a protected dashboard.

Generated tasks:

- Audit current auth structure
- Add GitHub OAuth provider
- Build login screen
- Protect dashboard route
- Add smoke tests
- Review environment variables

Example inbox items:

- Approve reading `.env.example`
- Confirm GitHub OAuth callback path
- Review changes to `app/login/page.tsx`
- Accept follow-up task for session expiry state

## 7. Information Architecture

Top navigation:

- workspace switcher
- current project
- run status
- global actions: run, pause, replan

Left rail:

- projects
- agents
- inbox
- settings

Main area:

- task board
- project channel
- activity timeline

Right panel:

- selected task details
- diff summary
- tests
- review gate

## 8. Interaction Requirements

The clickable prototype should support:

- selecting a task card
- switching between project channel and run console
- opening an inbox item
- approving a plan
- moving a task into review state
- viewing review gate details
- approving or requesting changes

The prototype can use mocked state transitions.

## 9. Visual Requirements

Chosen direction:

Operator Console.

Style:

- professional
- dense
- restrained
- developer-first
- dark or dark-neutral base with clear status colors

Avoid:

- marketing landing page
- oversized hero sections
- decorative gradients
- playful consumer app tone
- generic chatbot UI

## 10. Data Model Draft

Entities:

- Workspace
- Project
- Agent
- Task
- ChannelMessage
- ActivityEvent
- InboxItem
- ReviewGate
- Artifact

Task fields:

- id
- title
- description
- ownerAgentId
- status
- riskLevel
- fileScope
- createdAt
- updatedAt

ActivityEvent fields:

- id
- taskId
- agentId
- type
- summary
- metadata
- timestamp

InboxItem fields:

- id
- type
- title
- description
- relatedTaskId
- status
- actionLabel

## 11. Technical Direction

Prototype:

- static or lightweight React app
- mocked data
- no backend required

MVP implementation:

- Next.js or Tauri + React
- local project indexer
- local SQLite state
- shell execution adapter
- agent adapter layer for Codex, Claude Code, or other CLI agents
- approval policy layer before command execution

## 12. Open Questions

- Should the first working version integrate with Codex CLI, Claude Code, or both?
- Should execution happen in the user workspace or an isolated copy?
- Should the product be browser-first, desktop-first, or Tauri-wrapped browser UI?
- How much code diff detail should the prototype show?
- What should be the first real integration target after prototype?

