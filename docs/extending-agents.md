# 新增与测试 Agent (Extending & Testing Agents)

How to add your own agent (a new provider/TUI) and how to test any agent.

There are two kinds of "add an agent":

- **A. Reuse an existing provider** — just point it at a different binary/model.
  No code changes. See §1.
- **B. Add a brand-new provider/TUI** (a 5th tool) — small code change across a
  few files. See §2.

---

## 1. Reuse an existing provider (no code)

Each provider's binary and model are overridable at runtime:

```bash
# point Claude at a real binary (or wrapper), pick any model the CLI accepts
AGENTTEAM_CMD_CLAUDE=/Users/you/.local/bin/claude \
AGENTTEAM_REAL_ADAPTER_ENABLED=1 npm run dev:all
```

In the UI top-right picker choose the provider + model. Or via API:

```bash
curl -X POST localhost:4000/api/runs/<run>/tasks/<task>/run \
  -H 'content-type: application/json' \
  -d '{"provider":"pi-agent","model":"local/llama","dryRun":true}'
```

`agy models`, `pi --help`, etc. show what model ids each CLI accepts.

---

## 2. Add a brand-new provider/TUI

Example: add `ollama` (local models). A provider needs (a) an id, (b) a CLI
command shape, (c) a default model. Touch these files — grep `pi-agent` to see
every spot, since the new one mirrors it:

### 2.1 Domain + DB

`src/types/domain.ts` — add to the `DelegatedRun.provider` union:

```ts
provider: "claude" | "codex" | "antigravity" | "pi-agent" | "ollama";
```

`migrations/000X_add_ollama.sql` (new file — the `delegated_runs.provider`
column has a CHECK constraint, so a new provider needs a migration):

```sql
-- SQLite can't ALTER a CHECK; rebuild the constraint or, simplest for dev,
-- recreate the column check. For local dev you can also just delete
-- .agentteam/state.db and re-seed. For a real migration, see note below.
```

> Dev shortcut: during development, `rm -rf .agentteam` and `npm run seed`
> recreates the DB from the latest schema. For a durable migration that keeps
> data, add a numbered SQL file that rebuilds `delegated_runs` with the new
> CHECK (SQLite requires create-new-table + copy + drop for CHECK changes).

### 2.2 Registry — `server/agentRegistry.ts`

Add the id to `RealProvider`, an entry to `PROVIDERS`, and (optionally) route a
role to it:

```ts
export type RealProvider = "claude" | "codex" | "antigravity" | "pi-agent" | "ollama";

export const PROVIDERS = {
  // ...existing...
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    command: "ollama",
    defaultModel: "llama3.1",
    models: ["llama3.1", "qwen2.5-coder"],
    bestFor: "Offline local models",
  },
};

// optional: EXTENDED_ROLE_ROUTING.scribe = "ollama";
```

`resolveCommand("ollama")` then honors `AGENTTEAM_CMD_OLLAMA` automatically.

### 2.3 CLI command shape — `server/agentCli.ts`

Add the id to `RealAgentProvider` and `isRealProvider`, then a branch in
`buildCliCommand` that builds the right argv for that CLI:

```ts
export type RealAgentProvider = "claude" | "codex" | "antigravity" | "pi-agent" | "ollama";

// inside buildCliCommand, before the pi-agent fallback:
if (input.provider === "ollama") {
  // ollama run <model> <prompt>
  const args = ["run", input.model ?? "llama3.1", prompt];
  return toCommand(input.provider, resolveCommand("ollama"), args, input.worktree);
}
```

### 2.4 Frontend — `src/api.ts` and `src/App.tsx`

`src/api.ts` — add to the `RunTaskOptions.provider` union.

`src/App.tsx` — add to `PROVIDER_UI` so it shows in the picker:

```ts
{ id: "ollama", label: "Ollama (local)", models: ["llama3.1", "qwen2.5-coder"] },
```

That's it. The real adapter (`server/realAdapter.ts`) is provider-agnostic: it
already creates the worktree, runs `buildCliCommand(...)`, imports the diff, and
writes artifacts — no change needed.

### Checklist

- [ ] `src/types/domain.ts` provider union
- [ ] migration / `rm -rf .agentteam` for dev
- [ ] `server/agentRegistry.ts` `RealProvider` + `PROVIDERS` (+ routing)
- [ ] `server/agentCli.ts` `RealAgentProvider` + `isRealProvider` + `buildCliCommand` branch
- [ ] `src/api.ts` `RunTaskOptions.provider`
- [ ] `src/App.tsx` `PROVIDER_UI`
- [ ] a test in `server/_tests/run.ts` (see §3)

---

## 3. 测试 agent Testing an agent

Three levels, cheapest first.

### 3.1 Command-shape test (no execution) — `npm test`

`server/_tests/run.ts` is a plain assertion script. Add a check that the argv is
built correctly — this catches wrong flags (like the agy `-m` vs `--model` bug)
without running anything:

```ts
await check("ollama builds 'ollama run <model>'", async () => {
  const runId = createRun({ goal: "x", projectName: "T" });
  approvePlan(runId);
  const tid = readyTaskIds(runId)[0];
  const task = getRunState(runId)!.tasks.find((t) => t.id === tid)!;
  const cmd = buildCliCommand({ provider: "ollama", task, runId, worktree: "/tmp/wt", model: "llama3.1" });
  assert.equal(cmd.command, "ollama");
  assert.match(cmd.display, /^ollama run llama3\.1\b/);
});
```

Run all checks:

```bash
npm test
```

### 3.2 Dry-run (constructs the command, records evidence, does not execute)

Guard stays off, or pass `dryRun: true`. The delegated run is persisted as
`blocked` and the exact command is recorded as an `external_call` event:

```bash
curl -X POST localhost:4000/api/runs/<run>/tasks/<task>/run \
  -H 'content-type: application/json' \
  -d '{"provider":"ollama","model":"llama3.1","dryRun":true}'
```

Inspect: open the run in the UI → Run console shows the command; the delegated
run shows `blocked`. Or read `.agentteam/runs/<delegated-run-id>/` (after a real
run) for `task.json` / `result.json` / `evidence.md`.

### 3.3 Real end-to-end run

Verify the CLI is reachable, then enable the guard and uncheck dry-run:

```bash
command -v ollama
AGENTTEAM_CMD_OLLAMA=ollama AGENTTEAM_REAL_ADAPTER_ENABLED=1 npm run dev:all
```

On success the adapter creates a git worktree, runs the CLI there, imports the
real `git diff` into the review gate, and writes file-backed artifacts under
`.agentteam/runs/<delegated-run-id>/`. On failure it records the blocker and
returns the task to `ready` — failures are persisted, never swallowed.

### What "good" looks like

- Command-shape test passes (`npm test`).
- Dry-run produces a `blocked` delegated run + an `external_call` event with the
  exact argv.
- Real run produces a `completed` delegated run, a review gate with real changed
  files, and artifacts on disk.

---

## Note: lowering the friction

Adding a provider currently edits ~6 spots plus a migration. If you plan to add
many agents, ask for a generic "custom" provider driven entirely by config
(command template + model list via env/JSON), so a new agent needs zero code and
no migration. Not built yet — say the word.
