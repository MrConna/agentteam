# AgentTeam

AgentTeam is a personal agent-team workspace for solo builders.

It combines the developer-workbench feel of BridgeSpace with the AI-teammate model of Helio: agents do not live as a side chat. They own tasks, report progress in project channels, ask for approvals, and hand work back through review gates.

## Run the app

```bash
npm install
npm run seed     # optional: seed the Personal CRM demo run
npm run dev:all  # API on :4000, web on :5173
```

Open http://localhost:5173. Enter a goal, approve the generated plan, press Run to
execute a task into the review gate, then approve or request changes. State is
stored in SQLite at `.agentteam/state.db` and survives reload.

## Project Status

Stage: minimal working MVP (Phase 5)

- Goal -> task board via a planner, persisted in SQLite
- Fixed 4-agent team, delegation tracker, project channel, run console
- Agent execution drives tasks to a review gate with diff + tests + risk
- Approval gates for plan, inbox, and review; follow-up task creation
- Simulated agent adapter; real Codex/Claude CLI adapter is a drop-in (see `docs/multi-agent-team-architecture.md`)

Current deliverables:

- [docs/goal.md](docs/goal.md): product goal, positioning, principles, success criteria
- [docs/spec.md](docs/spec.md): MVP product specification
- [docs/plan.md](docs/plan.md): execution plan and milestones
- [memory/README.md](memory/README.md): project memory, session context, and optional cross-project brain tooling

## Project Memory

AgentTeam includes a project-local memory module initialized from `agent-memory-tools`.

```bash
bin/memory list
bin/memory apply --query "task keywords"
bin/context restore
```

Use `bin/memory add` for durable project learnings and `bin/context save` for resumable work state.

## Product Thesis

Solo developers do not need another AI chat box. They need a small, visible, governable project team:

- Planner turns goals into tasks.
- Coder implements scoped changes.
- Reviewer catches risks and regressions.
- Tester validates behavior.
- The human approves what ships.

## First Prototype Direction

Operator Console:

- Dense, professional, developer-first UI
- Project channel + task board + agent activity + review gate
- Browser-first prototype, desktop-wrapper compatible later
