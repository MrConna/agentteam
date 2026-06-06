# AgentTeam Data Schema (SQLite)

Phase 4 deliverable: the local state store for the AgentTeam MVP.

This schema is the durable backing for the prototype state currently held in
`src/types/domain.ts` and `src/data/mockData.ts`, plus the delegated-run model
from `docs/multi-agent-team-architecture.md`.

## Principles

- **Local-first.** One SQLite file per machine at `.agentteam/state.db`. No server.
- **One source of truth.** The UI reads the same tables the orchestrator writes.
- **Evidence is append-only.** `activity_events` and `channel_messages` are never
  mutated; task/run status rows are updated in place.
- **Enums as TEXT + CHECK.** SQLite has no native enum. Keep the union types from
  `domain.ts` honest with `CHECK` constraints so bad states fail loudly.
- **IDs are app-generated TEXT** (uuid-ish short ids), matching the prototype.
- **Timestamps are ISO-8601 TEXT (UTC).** Matches `memory/*.jsonl` convention.
- **Arrays are JSON TEXT.** `fileScope`, `diffSummary`, `evidence`, etc. are stored
  as JSON arrays; small, read-mostly, and not independently queried in the MVP.

## Entity-to-table map

| Domain type (`domain.ts`) | Table |
|---|---|
| `PrototypeState` (top-level run) | `runs` |
| `Agent` | `agents` |
| `Task` | `tasks` |
| `ChannelMessage` | `channel_messages` |
| `ActivityEvent` | `activity_events` |
| `InboxItem` | `inbox_items` |
| `ReviewGate` | `review_gates` |
| `DelegatedRun` | `delegated_runs` |

Everything is scoped to a `run_id` so multiple project runs can coexist later
(the MVP keeps one active run, per `docs/spec.md` §2).

## Schema

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- One row per project run. Mirrors PrototypeState's scalar fields.
CREATE TABLE runs (
  id                 TEXT PRIMARY KEY,
  workspace_name     TEXT NOT NULL,
  project_name       TEXT NOT NULL,
  project_root       TEXT NOT NULL,              -- absolute path of the local repo
  goal               TEXT NOT NULL,
  run_status         TEXT NOT NULL DEFAULT 'planning'
                       CHECK (run_status IN
                       ('planning','running','paused','review','ready_to_ship')),
  plan_approved      INTEGER NOT NULL DEFAULT 0, -- boolean 0/1
  active_timeline_tab TEXT NOT NULL DEFAULT 'channel'
                       CHECK (active_timeline_tab IN ('channel','console')),
  selected_task_id   TEXT,
  selected_inbox_id  TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE agents (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL
                    CHECK (role IN ('planner','coder','reviewer','tester')),
  status          TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN
                    ('idle','planning','running','reviewing','blocked','done')),
  responsibility  TEXT NOT NULL DEFAULT '',
  current_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  last_update     TEXT NOT NULL
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  owner_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'backlog'
                  CHECK (status IN ('backlog','ready','running','review','done')),
  file_scope    TEXT NOT NULL DEFAULT '[]',   -- JSON array of glob/path strings
  risk          TEXT NOT NULL DEFAULT 'low'
                  CHECK (risk IN ('low','medium','high')),
  dependencies  TEXT NOT NULL DEFAULT '[]',   -- JSON array of task ids
  last_update   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE channel_messages (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type       TEXT NOT NULL
               CHECK (type IN
               ('plan_proposed','task_started','blocker_found',
                'approval_requested','review_completed',
                'follow_up_suggested','ship_summary')),
  agent_id   TEXT REFERENCES agents(id) ON DELETE SET NULL,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  timestamp  TEXT NOT NULL
);

-- Append-only evidence stream shown in the Run Console.
CREATE TABLE activity_events (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type      TEXT NOT NULL
              CHECK (type IN
              ('reasoning','command_run','command_result','file_changed',
               'test_run','warning','external_call')),
  agent_id  TEXT REFERENCES agents(id) ON DELETE SET NULL,
  task_id   TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  run_ref   TEXT REFERENCES delegated_runs(id) ON DELETE SET NULL, -- which run emitted it
  title     TEXT NOT NULL,
  summary   TEXT NOT NULL DEFAULT '',
  command   TEXT,
  files     TEXT NOT NULL DEFAULT '[]',  -- JSON array
  status    TEXT NOT NULL DEFAULT 'success'
              CHECK (status IN ('pending','running','success','warning','failed')),
  timestamp TEXT NOT NULL
);

CREATE TABLE inbox_items (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type      TEXT NOT NULL
              CHECK (type IN
              ('approve_plan','approve_command','approve_file_scope',
               'review_diff','answer_blocker','accept_follow_up')),
  title     TEXT NOT NULL,
  summary   TEXT NOT NULL DEFAULT '',
  agent_id  TEXT REFERENCES agents(id) ON DELETE SET NULL,
  task_id   TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  priority  TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  status    TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','approved','rejected','answered')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- One gate per task that reaches review. tests/diff stored as JSON.
CREATE TABLE review_gates (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','changes_requested')),
  changed_files    TEXT NOT NULL DEFAULT '[]',  -- JSON array
  diff_summary     TEXT NOT NULL DEFAULT '[]',  -- JSON array of lines
  tests            TEXT NOT NULL DEFAULT '[]',  -- JSON array of {command,result,summary}
  risk_notes       TEXT NOT NULL DEFAULT '[]',  -- JSON array
  reviewer_verdict TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (task_id)
);

-- The execution layer: each delegated agent process. Backs the Delegation Tracker.
CREATE TABLE delegated_runs (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id      TEXT REFERENCES agents(id) ON DELETE SET NULL,
  provider      TEXT NOT NULL
                  CHECK (provider IN ('claude','codex','antigravity','pi-agent')),
  model         TEXT NOT NULL,
  role          TEXT NOT NULL
                  CHECK (role IN
                  ('planner','coder','reviewer','tester','scout','scribe')),
  branch        TEXT NOT NULL,
  worktree      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN
                  ('queued','running','blocked','completed','merged','failed')),
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  -- budget (flattened from DelegatedRun.budget)
  budget_tier        TEXT NOT NULL DEFAULT 'standard'
                       CHECK (budget_tier IN ('cheap','standard','premium')),
  budget_max_minutes INTEGER NOT NULL DEFAULT 30,
  budget_token_policy TEXT NOT NULL DEFAULT '',
  -- approval policy gates writes/escalation (architecture doc, AgentTask.approvalPolicy)
  approval_policy TEXT NOT NULL DEFAULT 'approval_required'
                  CHECK (approval_policy IN
                  ('read_only','scoped_writes','approval_required')),
  current_step  TEXT NOT NULL DEFAULT '',
  next_step     TEXT NOT NULL DEFAULT '',
  evidence      TEXT NOT NULL DEFAULT '[]',  -- JSON array of artifact paths
  assigned_at   TEXT NOT NULL,
  last_heartbeat TEXT NOT NULL,
  completed_at  TEXT
);

-- Project memory bridge: high-confidence learnings injected per task.
-- The canonical store stays in memory/learnings.jsonl (git-reviewable); this is
-- a cache so the UI can show "prior learning applied" without shelling out.
CREATE TABLE applied_learnings (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  learning_id   TEXT NOT NULL,        -- id from learnings.jsonl
  pattern       TEXT NOT NULL,
  confidence    INTEGER NOT NULL,
  applied_at    TEXT NOT NULL
);
```

## Indexes

```sql
CREATE INDEX idx_tasks_run_status        ON tasks(run_id, status);
CREATE INDEX idx_events_run_ts           ON activity_events(run_id, timestamp);
CREATE INDEX idx_events_task             ON activity_events(task_id);
CREATE INDEX idx_messages_run_ts         ON channel_messages(run_id, timestamp);
CREATE INDEX idx_inbox_run_status        ON inbox_items(run_id, status);
CREATE INDEX idx_delegated_run_status    ON delegated_runs(run_id, status);
CREATE INDEX idx_delegated_task          ON delegated_runs(task_id);
```

## Lifecycle write paths

These mirror the handlers already wired in `src/App.tsx`, so swapping mock state
for SQLite is a one-to-one replacement.

| UI action (`App.tsx`) | Writes |
|---|---|
| `approvePlan()` | `runs.plan_approved=1`; `inbox_items` plan row → `approved`; append `channel_messages` + `activity_events` |
| `updateInbox(state)` | `inbox_items.status`, `resolved_at`; append message + event |
| `moveTask(status)` | `tasks.status`, `last_update`; append message + event |
| `decideReview(state)` | `review_gates.status`; `tasks.status` (`done`/`ready`); append message + event |
| orchestrator spawns agent | insert `delegated_runs` (`queued`) |
| heartbeat tick | `delegated_runs.progress`, `current_step`, `next_step`, `last_heartbeat`, `status` |
| agent emits evidence | append `activity_events` with `run_ref` |

## Progress sources (delegated_runs.status)

Per `docs/multi-agent-team-architecture.md`, status is derived from, in order:

1. CLI process state (queued/running/exited) → `status`, `progress`
2. Heartbeat file `.agentteam/runs/<id>/heartbeat.json` → `last_heartbeat`, `current_step`
3. Git state (branch/changed files/commit/merged) → `status` (`completed`/`merged`)
4. Artifact state (`summary.md`, `result.json`) → `evidence`
5. Human state (inbox blocker/approval) → `status='blocked'`

## Migration approach

- Plain numbered SQL files under `migrations/` (`0001_init.sql`, …); a tiny
  runner records applied versions in a `schema_migrations(version, applied_at)`
  table. No ORM for the MVP — `better-sqlite3` (synchronous, local) is enough.
- Seed path: `src/data/mockData.ts` → `0002_seed_demo.sql` for the Personal CRM
  demo so the prototype and the real DB show identical state.

## Open items deferred past MVP

- Multi-run history UI (schema already supports it via `run_id`).
- Full-text search over `activity_events`/`channel_messages` (FTS5) if the
  console grows large.
- Normalizing `tests` / `file_scope` into child tables if they become queryable.
</content>
</invoke>
