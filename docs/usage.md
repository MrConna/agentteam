# AgentTeam 使用说明书 (Usage)

A personal cockpit for AI coding agents. This guide covers how to run it, what
each screen does, and how to make each agent TUI run on its own best model.

## 1. 启动 Start

```bash
cd agentteam
npm install        # first time
npm run seed       # optional: a Personal CRM demo run
npm run dev:all    # API on :4000, web on :5173
```

Open http://localhost:5173.

| Script | What it does |
|---|---|
| `npm run dev:all` | Backend API + web together (use this) |
| `npm run dev` | Web only (:5173) |
| `npm run server` | API only (:4000) |
| `npm run seed` | Seed a demo run if the DB is empty |
| `npm test` | Adapter tests (7 checks) |
| `npm run build` | Type check + production build |

State lives in SQLite at `.agentteam/state.db` and survives reload.

## 2. 左侧导航 Left rail

The icon column on the far left switches the main view:

| Icon | View | Shows |
|---|---|---|
| ▥ Command center | Full operator console: board + channel/console + inbox + task detail + review gate |
| 🤖 Agents | Each agent (role, status, responsibility) and its delegated runs |
| 📥 Inbox | The full decision queue; a red badge shows the open count |
| 🛡 Review gates | Every task's review gate with changed files, diff, tests, and approve / request-changes |
| ▢ Sessions | Live agent terminals — a tiled grid where each tile is a real interactive CLI session (see §7) |

## 3. 主流程 Core flow

1. Enter a goal (or open the seeded run). The Planner turns it into a task board.
2. **Approve plan** (goal bar) to let the team start.
3. Pick the agent in the **top-right picker** (provider + model + dry-run).
4. **Run** runs the next ready task; or select a task and **Run task**.
5. The task moves to the **review gate** with a diff, tests, and risk notes.
6. **Approve** to mark it done, or **Request changes** to send it back.
7. Accept any **follow-up** in the inbox to create a new task.

The **Project channel** is an operational timeline (plan proposed, task started,
review completed…). The **Run console** is the command/file/test evidence stream.

## 4. 把不同 agent 用起来 Run each TUI on its best model

AgentTeam routes work to the strongest tool per role and lets each run its top
model. Source of truth: `agents.config.json` (zero-code: add a provider there). See docs/extending-agents.md.

| Provider | Default model | CLI (default) | Best for |
|---|---|---|---|
| Claude Code | opus | `claude-official` | Planning, review judgment |
| Codex | gpt-5-codex | `codex` | Repo-grounded implementation, tests |
| Antigravity (Gemini) | gemini-3.5-flash | `agy` | Fast scouting |
| pi-agent | deepseek-v4-flash / kimi / local | `pi` | Cheap scout, scribe, local models |
| Simulated | — | — | Default; no CLI, deterministic demo |

### Safety model (read this)

- The default provider is **Simulated** — no CLI is ever spawned.
- Choosing a real provider routes to the real adapter, but execution stays
  **off** unless you set `AGENTTEAM_REAL_ADAPTER_ENABLED=1`.
- With the guard off, or with **dry-run** checked, the system only *constructs*
  the real command and records it as evidence (status `blocked`) — nothing runs.

### Enable real execution

```bash
AGENTTEAM_REAL_ADAPTER_ENABLED=1 npm run dev:all
```

Then in the UI: pick the provider, pick the model, **uncheck dry-run**, and Run.
On a real run the adapter:

1. creates an isolated git worktree (`git worktree add`),
2. runs the chosen CLI there,
3. imports the real `git diff` (changed files + per-file +/- counts) into the
   review gate,
4. writes file-backed evidence under `.agentteam/runs/<delegated-run-id>/`.

### Point a provider at the right binary (important)

A bare process spawn cannot resolve shell **aliases** (e.g. `claude-official`
defined as an alias). Override the command per provider with an env var that
points at a real executable or wrapper script:

```bash
AGENTTEAM_CMD_CLAUDE=/Users/you/.local/bin/claude \
AGENTTEAM_CMD_ANTIGRAVITY=agy \
AGENTTEAM_CMD_CODEX=codex \
AGENTTEAM_CMD_PI_AGENT=pi \
AGENTTEAM_REAL_ADAPTER_ENABLED=1 npm run dev:all
```

If Claude needs a proxy, either set the proxy env for the whole server, or make
`AGENTTEAM_CMD_CLAUDE` point at a small wrapper script that exports the proxy and
execs the real `claude` binary. Verify a CLI is reachable first:

```bash
command -v claude codex agy pi
```

Each provider's model can also be overridden per run via the UI model dropdown
or the API body (`"model": "..."`).

## 5. API (optional)

```bash
# create a run
curl -X POST localhost:4000/api/runs -H 'content-type: application/json' \
  -d '{"goal":"Add GitHub OAuth login","projectName":"CRM"}'

# approve plan, run next ready task with a real provider in dry-run
curl -X POST localhost:4000/api/runs/<run>/approve-plan
curl -X POST localhost:4000/api/runs/<run>/run-next \
  -H 'content-type: application/json' \
  -d '{"provider":"antigravity","model":"gemini-3.5-flash","dryRun":true}'
```

## 6. Troubleshooting

- **Blank screen / "Cannot reach the API"**: start the backend (`npm run server`
  or `npm run dev:all`). The web proxies `/api` to `:4000`.
- **Real run shows `blocked`**: the guard is off or dry-run is checked — that is
  the safe default. Set `AGENTTEAM_REAL_ADAPTER_ENABLED=1` and uncheck dry-run.
- **Real run shows `failed` / `spawn_error`**: the provider command is not a real
  executable on PATH (often a shell alias). Set `AGENTTEAM_CMD_<PROVIDER>`.
- **Port in use**: `PORT=4100 npm run server` (also update the proxy target in
  `vite.config.ts`).

## 7. 实时 agent 终端 Live agent sessions

The **Sessions** view (▢ in the left rail) is a tiled terminal multiplexer: each
tile is a real interactive CLI/TUI (`claude`, `codex`, `agy`, `pi`) running under
a PTY on the server, streamed to the browser. You can watch output and type into
it like a normal terminal. This is the "roles as live agent CLI sessions" model.

- Click **+ Claude Code / + Codex / + Antigravity (Gemini) / + pi-agent** to spawn
  a session. The tile launches the real CLI in interactive mode in the repo root.
- Click inside a tile and type — keystrokes go straight to the agent's TUI.
- The **✕** on a tile kills that session.
- Sessions are server-side processes; they keep running if you switch views, and
  recent output replays when a tile re-attaches.

Binaries: the same `AGENTTEAM_CMD_<PROVIDER>` overrides apply, so point a provider
at the right executable/wrapper if its name differs (e.g. a `claude` wrapper that
sets a proxy). No `AGENTTEAM_REAL_ADAPTER_ENABLED` flag is needed for sessions —
that guard only governs the batch task adapter; sessions are always live.

Implementation: `server/terminals.ts` (node-pty) + a WebSocket at
`/ws/terminal?id=<sessionId>`; the UI is `src/Terminals.tsx` (xterm.js).
