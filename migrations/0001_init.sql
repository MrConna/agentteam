PRAGMA foreign_keys = ON;

CREATE TABLE runs (
  id                  TEXT PRIMARY KEY,
  workspace_name      TEXT NOT NULL,
  project_name        TEXT NOT NULL,
  project_root        TEXT NOT NULL DEFAULT '',
  goal                TEXT NOT NULL,
  run_status          TEXT NOT NULL DEFAULT 'planning'
                        CHECK (run_status IN
                        ('planning','running','paused','review','ready_to_ship')),
  plan_approved       INTEGER NOT NULL DEFAULT 0,
  active_timeline_tab TEXT NOT NULL DEFAULT 'channel'
                        CHECK (active_timeline_tab IN ('channel','console')),
  selected_task_id    TEXT,
  selected_inbox_id   TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
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
  current_task_id TEXT,
  last_update     TEXT NOT NULL
);

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  owner_agent_id TEXT,
  status         TEXT NOT NULL DEFAULT 'backlog'
                   CHECK (status IN ('backlog','ready','running','review','done')),
  file_scope     TEXT NOT NULL DEFAULT '[]',
  risk           TEXT NOT NULL DEFAULT 'low'
                   CHECK (risk IN ('low','medium','high')),
  dependencies   TEXT NOT NULL DEFAULT '[]',
  last_update    TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE channel_messages (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type      TEXT NOT NULL
              CHECK (type IN
              ('plan_proposed','task_started','blocker_found',
               'approval_requested','review_completed',
               'follow_up_suggested','ship_summary')),
  agent_id  TEXT,
  task_id   TEXT,
  body      TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE activity_events (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type      TEXT NOT NULL
              CHECK (type IN
              ('reasoning','command_run','command_result','file_changed',
               'test_run','warning','external_call')),
  agent_id  TEXT,
  task_id   TEXT,
  run_ref   TEXT,
  title     TEXT NOT NULL,
  summary   TEXT NOT NULL DEFAULT '',
  command   TEXT,
  files     TEXT NOT NULL DEFAULT '[]',
  status    TEXT NOT NULL DEFAULT 'success'
              CHECK (status IN ('pending','running','success','warning','failed')),
  timestamp TEXT NOT NULL
);

CREATE TABLE inbox_items (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
                CHECK (type IN
                ('approve_plan','approve_command','approve_file_scope',
                 'review_diff','answer_blocker','accept_follow_up')),
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  agent_id    TEXT,
  task_id     TEXT,
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','high')),
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','approved','rejected','answered')),
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE review_gates (
  id               TEXT PRIMARY KEY,
  run_id           TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','changes_requested')),
  changed_files    TEXT NOT NULL DEFAULT '[]',
  diff_summary     TEXT NOT NULL DEFAULT '[]',
  tests            TEXT NOT NULL DEFAULT '[]',
  risk_notes       TEXT NOT NULL DEFAULT '[]',
  reviewer_verdict TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (run_id, task_id)
);

CREATE TABLE delegated_runs (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id             TEXT NOT NULL,
  agent_id            TEXT,
  provider            TEXT NOT NULL
                        CHECK (provider IN ('claude','codex','antigravity','pi-agent')),
  model               TEXT NOT NULL,
  role                TEXT NOT NULL
                        CHECK (role IN
                        ('planner','coder','reviewer','tester','scout','scribe')),
  branch              TEXT NOT NULL,
  worktree            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN
                        ('queued','running','blocked','completed','merged','failed')),
  progress            INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  budget_tier         TEXT NOT NULL DEFAULT 'standard'
                        CHECK (budget_tier IN ('cheap','standard','premium')),
  budget_max_minutes  INTEGER NOT NULL DEFAULT 30,
  budget_token_policy TEXT NOT NULL DEFAULT '',
  approval_policy     TEXT NOT NULL DEFAULT 'approval_required'
                        CHECK (approval_policy IN
                        ('read_only','scoped_writes','approval_required')),
  current_step        TEXT NOT NULL DEFAULT '',
  next_step           TEXT NOT NULL DEFAULT '',
  evidence            TEXT NOT NULL DEFAULT '[]',
  assigned_at         TEXT NOT NULL,
  last_heartbeat      TEXT NOT NULL,
  completed_at        TEXT
);

CREATE TABLE applied_learnings (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id     TEXT,
  learning_id TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  confidence  INTEGER NOT NULL,
  applied_at  TEXT NOT NULL
);

CREATE INDEX idx_tasks_run_status     ON tasks(run_id, status);
CREATE INDEX idx_events_run_ts        ON activity_events(run_id, timestamp);
CREATE INDEX idx_events_task          ON activity_events(task_id);
CREATE INDEX idx_messages_run_ts      ON channel_messages(run_id, timestamp);
CREATE INDEX idx_inbox_run_status     ON inbox_items(run_id, status);
CREATE INDEX idx_delegated_run_status ON delegated_runs(run_id, status);
CREATE INDEX idx_delegated_task       ON delegated_runs(task_id);
