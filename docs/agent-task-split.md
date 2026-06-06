# AgentTeam Agent Task Split

## Goal

Deliver Phase 2: a browser-first clickable Operator Console prototype for AgentTeam.

## Split Logic

Claude should own product clarity, scenario structure, mock state, and copy because those tasks benefit from product reasoning and information architecture.

Codex should own implementation, UI composition, interaction state, and verification because those tasks benefit from tight code execution and test feedback.

## Claude-Owned Work

Branch: `codex/claude-product-state`

Write scope:

- `docs/prototype-brief.md`
- `src/data/mockData.ts`
- `src/types/domain.ts`

Tasks:

- Lock the demo scenario from the existing spec.
- Define the task board, agent statuses, channel timeline, inbox items, console events, and review gate data.
- Keep messages operational and short, not chatbot-like.
- Define TypeScript domain types that a React prototype can consume.
- Avoid changing app layout, package metadata, or CSS.

Acceptance criteria:

- Mock data covers the primary flow from plan approval to review gate.
- All fixed roles are represented: Planner, Coder, Reviewer, Tester.
- Data includes at least one selected/running task, one review task, one inbox approval, console evidence, and final review summary.

## Codex-Owned Work

Branch: `codex/prototype-shell`

Write scope:

- `package.json`
- `index.html`
- `src/App.tsx`
- `src/main.tsx`
- `src/styles.css`
- `tsconfig.json`
- `vite.config.ts`

Tasks:

- Initialize a Vite + React + TypeScript prototype.
- Build the Operator Console shell with left rail, top bar, task board, channel/console tabs, inbox, and review gate.
- Add interactions for task selection, tab switching, plan approval, inbox item selection, moving a task to review/done, approve, and request changes.
- Use local mock data imports once available; include a temporary fallback only if needed.
- Keep the interface dense, developer-first, and usable at desktop and narrow widths.

Acceptance criteria:

- `npm install` and `npm run build` succeed.
- Prototype runs locally with `npm run dev`.
- UI has no obvious text overlap at common desktop and narrow viewport widths.
- The first screen is the usable product experience, not a landing page.

## Merge Plan

1. Merge Claude branch first to add types and mock data.
2. Merge Codex branch second and resolve import paths against Claude data.
3. Run `npm install` if needed, then `npm run build`.
4. Start the local dev server and visually inspect the prototype.
5. Save a context checkpoint after integration.
