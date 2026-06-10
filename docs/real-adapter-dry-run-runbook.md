# Real Adapter — Dry-Run Runbook (T7-04)

This runbook guides human operators through safely enabling, testing, and verifying dry runs of the real agent execution path. 

Real execution remains **completely disabled** by default. Reaching a dry run is a secure, multi-gated procedure designed to protect the integrity of the main codebase and terminal configuration.

---

## Safety Policy & Guardrails

> ⚠️ **CRITICAL RULE:** Real execution is blocked and will never spawn a child process unless `AGENTTEAM_REAL_ADAPTER_ENABLED=1` is explicitly set in the server's environment. Without this variable, the server defaults to simulated runs.

### What is a "Dry-Run"?
A dry run (`dryRun: true` in the API payload or UI toggle) will:
1. Build the exact command that would be executed.
2. Formulate the required task packet and plan.
3. Create a blocked delegated-run record with the command visible in the UI and stored in `.agentteam/runs/<run-id>/task.json`.
4. **Never** create a physical git worktree.
5. **Never** spawn a child process or invoke any agent CLI.

This allows you to safely test role routing, prompt templating, and command construction without any filesystem mutations.

---

## 1. Preflight Checklist

Before initiating any real adapter dry run or execution, the operator must complete the following checks:

- [ ] **Clean Git Status:** Run `git status` on the operator's checkout. There must be no uncommitted or untracked changes that could pollute or confuse worktree checkouts.
- [ ] **Dedicated Worktree Path:** Confirm that the target worktree directory (by default, `../agentteam-<provider>-<taskId>`) does not already exist as an active, non-empty directory.
- [ ] **Provider CLI Availability:** Check that the targeted provider binary is installed and globally spawnable:
  - `pi --version` (for pi-agent)
  - `codex --version` (for Codex)
  - `/Users/luffy/.local/bin/claude-official --version` (for Claude Code, if applicable)
  - `agy --version` (for Antigravity/Gemini)
- [ ] **Model ID Verification:** Confirm the requested model ID is valid and supported by the provider (e.g., `gemini-3.5-flash` for `agy`, `deepseek/deepseek-v4-flash` for `pi`).
- [ ] **Write Scope Approval:** Ensure the task's `fileScope` (in `task.json`) strictly defines the files or directories the agent is allowed to edit. Unscoped tasks should be rejected.
- [ ] **Memory Applied:** Run `bin/memory apply --query "<task keywords>"` to retrieve relevant prior learnings and avoid known failure modes.

---

## 2. Step-by-Step Dry-Run Procedure

To initiate and verify a safe dry-run:

### Step 2.1: Start the Server (with Guard Off)
Ensure the guard is **off** (so no real command can execute even if there is a bug or mistake):
```bash
# Verify the server runs with real execution blocked
export AGENTTEAM_REAL_ADAPTER_ENABLED=0
npm run dev:all
```

### Step 2.2: Trigger a Dry Run via the UI or API
1. Open the Operator Console in your browser (`http://localhost:5173`).
2. Go to your active task.
3. In the run configuration pane, select the desired **Provider**, **Model**, and check the **Dry Run** checkbox.
4. Click **Run Task**.

Alternatively, send a manual POST request:
```bash
curl -X POST http://localhost:4000/api/runs/<run-id>/tasks/<task-id>/run \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "codex",
    "model": "gpt-5.5-medium",
    "dryRun": true,
    "prompt": "Custom instruction override"
  }'
```

---

## 3. Post-Run Inspection

Once the dry run completes, inspect the following to verify proper command construction and safety boundaries:

### 3.1 inspect the Review Gate in the UI
- Navigate to the **Review Gates** board.
- Verify that the task status has stayed `ready` (returned to queue) or transitioned to `blocked` (with an explicit dry-run block reason).
- Confirm that the built CLI command is visible and matches expectations. For example:
  - For `pi-agent`: command should start with `pi -p`
  - For `agy`: command should start with `agy --model <model> -p`
  - For `codex`: command should start with `codex exec`

### 3.2 Verify Filesystem State
Confirm that no filesystem mutations occurred:
```bash
# Confirm NO worktree directory was created
ls -la ../ | grep agentteam-

# Verify the main repository stays completely clean
git status
```

### 3.3 Inspect Run Artifacts
Inspect the generated file-backed artifacts under `.agentteam/runs/<delegated-run-id>/`:
- `task.json` - should contain the full task packet and the generated dry-run command.
- `plan.md` - should outline the planned steps.
- `result.json` - should report `status: "blocked"`, with no stdout/stderr.

---

## 4. Rollback & Cleanup Checklist

If a dry run or subsequent dry-run trial fails or exhibits unexpected behavior, use the following steps to safely roll back:

- [ ] **Kill Spawned Processes:** If a CLI process somehow ran or hung, list and terminate it:
  ```bash
  ps -ef | grep -E "claude|codex|agy|pi"
  # Kill if necessary: kill -9 <pid>
  ```
- [ ] **Prune Failed Worktrees (If Created):** If a worktree was accidentally created or left behind:
  ```bash
  git worktree prune
  rm -rf ../agentteam-<provider>-<taskId>
  ```
- [ ] **Clean Up Git Branches:** Delete any temporary branches created during the run:
  ```bash
  git branch -d agent/<provider>-<taskId.slice(-6)>
  ```
- [ ] **Reset State DB:** If the local SQLite DB entered an inconsistent state, you can reset it safely (note: this wipes local history):
  ```bash
  rm .agentteam/state.db
  npm run db:seed # Recreate and seed DB
  ```
