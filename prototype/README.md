# AgentTeam Prototype — Operator Console

Phase 2 clickable prototype for [AgentTeam](../README.md).

## Run

```bash
cd prototype
npm install
npm run dev       # http://localhost:5173
npm run build
```

## What's wired

- Top bar with workspace › project, run status, global Pause / Replan / Run
- Left rail with Command Center, Agents, Inbox (badge), Review (badge), Settings
- Goal strip with plan-pending state and "Approve plan" action
- Task board with 5 columns (Backlog / Ready / Running / Review / Done) and per-card "→ next" advance
- Selected task detail in right panel (status, owner, risk, file scope, description)
- Project Channel ↔ Run Console toggle
- Agent Team panel with role + status + current task
- Agent Inbox with approve / dismiss + scenario-aware actions:
  - Approve plan → flips goal strip + posts channel message
  - Review diff → selects target task
  - Accept follow-up → creates a new backlog task
- Review Gate (visible when selected task is in `review`) with changed files, test badge, verdict, Approve & ship / Request changes / Discard

## Mock scenario

Personal CRM project; goal: *Add GitHub OAuth login and a protected dashboard.* Six seeded tasks across the board, one running, one in review with a full review gate.

## Notes

- No backend, no real agents — state lives in `App.tsx` `useState`.
- Styling is dense, dark, monospace-leaning per [docs/spec.md §9](../docs/spec.md).
- Layout collapses left rail labels under ~1100px wide.
