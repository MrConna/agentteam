-- Allow custom/config-defined providers: drop the CHECK on delegated_runs.provider.
-- SQLite cannot ALTER a CHECK constraint, so rebuild the table (no other table
-- references delegated_runs, so this is safe).

CREATE TABLE delegated_runs_new (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  task_id             TEXT NOT NULL,
  agent_id            TEXT,
  provider            TEXT NOT NULL,
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

INSERT INTO delegated_runs_new SELECT * FROM delegated_runs;
DROP TABLE delegated_runs;
ALTER TABLE delegated_runs_new RENAME TO delegated_runs;

CREATE INDEX idx_delegated_run_status ON delegated_runs(run_id, status);
CREATE INDEX idx_delegated_task       ON delegated_runs(task_id);
