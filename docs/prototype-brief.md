# AgentTeam Prototype Brief

## Demo Scenario

Project: Personal CRM

Goal: Add GitHub OAuth login and a protected dashboard.

The prototype starts after the Planner has generated a task board and the user is reviewing the first plan. The main story is not "chat with an AI"; it is "manage a small accountable AI project team through visible tasks, evidence, and approvals."

## Primary Flow

1. Planner proposes the implementation plan.
2. User approves the plan.
3. Coder audits the auth structure and begins GitHub OAuth work.
4. Risky or decision-heavy actions appear in the inbox.
5. Console shows commands, file changes, warnings, and tests.
6. Reviewer and Tester evaluate the result.
7. Review Gate summarizes changed files, test evidence, risks, and the final decision.

## Screen Inventory

- Left rail: workspace, projects, agents, inbox, settings.
- Top bar: current project, goal, run state, global run controls.
- Agent team strip: Planner, Coder, Reviewer, Tester status.
- Task board: Backlog, Ready, Running, Review, Done.
- Project channel: short operational updates only.
- Run console: execution evidence, command/file/test events.
- Agent inbox: human decisions and approvals.
- Right panel: selected task details and review gate.

## Interaction Contract

- Selecting a task updates the right panel and highlights related evidence.
- Project Channel and Run Console are tabs over the same work timeline.
- Approving the plan changes the plan inbox item and opens the first execution step.
- Moving a task to review makes Review Gate the dominant right-panel surface.
- Approve marks the reviewed task done.
- Request changes creates a visible follow-up decision.

## Tone Rules

- Messages are terse and operational.
- Agents report state, evidence, blockers, and decisions.
- Avoid assistant-like filler such as "happy to help" or broad explanations.
- Approval language should be explicit: approve plan, approve command, review diff, request changes.

## Locked Demo Tasks

- Audit current auth structure
- Add GitHub OAuth provider
- Build login screen
- Protect dashboard route
- Add smoke tests
- Review environment variables

## Acceptance Notes

The prototype should let a new user identify in one glance:

- the active goal
- which agent owns each task
- what is currently running
- what changed
- what needs approval
- whether the work is safe to ship
