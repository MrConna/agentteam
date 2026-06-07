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

## 2. Add a brand-new provider/TUI — edit one JSON file

Agents are declared in **`agents.config.json`** at the repo root. Adding one is
zero code and no migration: add an entry to `providers`. Example — `ollama`:

```json
{
  "id": "ollama",
  "label": "Ollama (local)",
  "command": "ollama",
  "defaultModel": "llama3.1",
  "models": ["llama3.1", "qwen2.5-coder"],
  "args": ["run", "{model}", "{prompt}"],
  "bestFor": "Offline local models"
}
```

Optionally route a role to it in the same file:

```json
"roleRouting": { "scribe": "ollama" }
```

That is the whole change. On restart:

- the provider shows up in the UI picker (served from `GET /api/providers`),
- `isRealProvider("ollama")` is true, so it routes to the real adapter,
- `buildCliCommand` renders the argv from `args` (no per-provider code),
- the DB accepts the new provider id (no CHECK constraint since migration 0002),
- `resolveCommand("ollama")` honors `AGENTTEAM_CMD_OLLAMA` to point at a binary.

### Field reference

| Field | Meaning |
|---|---|
| `id` | provider id used in API/UI/DB |
| `label` | shown in the picker |
| `command` | executable to spawn (override at runtime with `AGENTTEAM_CMD_<ID>`) |
| `defaultModel` | used when no model is selected |
| `models` | dropdown options (first = "best") |
| `args` | argv template; tokens `{model}` `{prompt}` `{runId}` `{taskId}` are substituted |
| `promptTemplate` | optional; per-provider prompt. Falls back to `defaultPromptTemplate` |
| `bestFor` | hint text |

### Prompt templates

The top-level `defaultPromptTemplate` applies to every provider; a provider can
override it with its own `promptTemplate`. Tokens: `{runId}` `{taskId}` `{title}`
`{description}` `{fileScope}`.

> If `agents.config.json` is missing or invalid, the server falls back to a
> built-in default (claude/codex/antigravity/pi-agent) so the app always boots.

### Checklist

- [ ] Add a provider entry to `agents.config.json`
- [ ] (optional) route a role to it in `roleRouting`
- [ ] (optional) `AGENTTEAM_CMD_<ID>` if the binary isn't on PATH by that name
- [ ] Restart (`npm run dev:all`)
- [ ] (optional) add a command-shape test in `server/_tests/run.ts` (see §3)

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
