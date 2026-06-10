# Real Agent Adapter — Safety Review (T7-05)

**Scope:** Read-only security/design review of the real (non-simulated) agent execution path.
**Reviewed at:** 2026-06-09
**Type:** Inspection only — no business code modified.

## Files reviewed

| File | Role in the real path |
|---|---|
| `server/realAdapter.ts` | Orchestrates a real delegated run: build command → worktree → execute → import diff → write artifacts → review gate |
| `server/agentCli.ts` | `buildCliCommand`, `executeCliCommand` (the actual `spawn`), enable/dry-run gates |
| `server/agentRegistry.ts` | Config-driven command/arg/prompt templating (`buildArgs`, `resolveCommand`, `renderPrompt`) |
| `agents.config.json` | Provider definitions (executables, argv templates, models) |
| `server/worktree.ts` | `ensureWorktree`, `collectChangedFiles`, `removeWorktree` (git isolation) |
| `server/artifacts.ts`, `server/runArtifacts.ts` | File-backed run evidence under `.agentteam/runs/` |
| `server/index.ts` | HTTP/WS API surface that drives the adapter |
| `server/adapter.validation.ts` | Guardrail regression tests |

---

## Findings (ordered by severity)

### HIGH

**H1 — The execution sandbox is git-isolation only, while delegated agents are granted full shell + skipped permissions.**
`executeCliCommand` runs the child with `cwd: cli.cwd` (the worktree). But the configured providers are deliberately powerful:
- `claude` (`agents.config.json:19`) runs with `--dangerously-skip-permissions`.
- `pi-agent` (`agents.config.json:48`) runs with `--tools read,grep,find,ls,bash,edit,write`.

A worktree is a *git* boundary (separate branch/index), **not** a filesystem sandbox. An agent with `bash` + skipped permissions can use absolute paths, `cd ..`, or `git -C` to read/write the operator's main checkout, the sibling worktrees, and anything else the server user can touch. The protection that "real agents write here, never on the operator's main checkout" (`worktree.ts:35-39`) holds for *honest* agents only; it is not enforced.
**Impact:** A misbehaving or prompt-injected agent escapes the intended scope. **Mitigation:** Run real agents inside an OS-level sandbox (container/VM, seccomp, or filesystem jail) — not just a worktree — before treating this as a hard boundary.

**H2 — The full operator environment is handed to every spawned CLI.**
`agentCli.ts:109` spawns with `env: process.env`. Every child (and any `bash` it spawns) inherits all of the operator's secrets — `ANTHROPIC_API_KEY`, cloud tokens, etc. Combined with H1 (the agent has `bash`), those secrets are trivially exfiltratable.
**Mitigation:** Pass an explicit allowlisted env containing only the keys a given provider needs.

### MEDIUM

**M3 — Run parameters are caller-controlled over an unauthenticated API.**
`POST /api/runs/:runId/tasks/:taskId/run` forwards `req.body` straight into the adapter (`index.ts:107-111`), so `provider`, `prompt`, `worktree`, `model`, and `timeoutMs` are all client-supplied. The server uses `cors()` with no origin restriction and no auth middleware (`index.ts:40`). The provided `worktree` flows into `ensureWorktree` → `git worktree add <path>` (`realAdapter.ts:50,101` → `worktree.ts:40-58`) with no allowlist or path validation, so an absolute or `../../` path lets a caller create a git worktree (and thus have the agent write) at an arbitrary location.
**Mitigation:** Require auth on the run endpoints; reject/normalize `worktree` to a fixed parent dir; bind the listener to localhost.

**M4 — Prompt injection from task content into a high-privilege agent.**
`renderPrompt` (`agentRegistry.ts:120-130`) interpolates the task `title`/`description` (ultimately derived from the operator's free-text goal) into the agent prompt with no sanitization, and the caller can also pass `prompt` directly. Because the receiving agent has `bash` + skipped permissions (H1), instructions embedded in an untrusted goal become a code-execution vector, not just a text-quality issue.
**Mitigation:** Treat goals/descriptions as untrusted; constrain the agent's tool/permission set; do not pair untrusted prompts with `--dangerously-skip-permissions`.

**M5 — Captured stdout/stderr is persisted in plaintext.**
`stdoutTail`/`stderrTail` (`runArtifacts.ts:107-108`) are written to `.agentteam/runs/<id>/evidence.md`, `result.json`, and into SQLite JSON columns. CLI tools frequently echo tokens/keys; those land on disk and in the DB. The directory is gitignored (`artifacts.ts:10`) so it won't be committed, but it is not access-controlled or redacted.
**Mitigation:** Redact known secret patterns before persisting; document that artifacts may contain sensitive output.

### LOW

**L6 — No worktree/branch cleanup.** `removeWorktree` (`worktree.ts:91-98`) exists but is never called in `runRealTask`. Each real run leaves a sibling `../agentteam-<provider>-<taskId>` worktree and `agent/*` branch behind → accumulation over time.

**L7 — `timeoutMs` is unbounded.** The client-supplied `timeoutMs` (`agentCli.ts:124`) has no upper clamp; a very large value effectively disables the kill timer, leaving a long-lived child process.

**L8 — No concurrency cap.** Nothing limits how many real runs execute in parallel; many concurrent `spawn`s could exhaust resources.

**L9 — `AGENTTEAM_CMD_<ID>` overrides the executable.** `resolveCommand` (`agentRegistry.ts:104-109`) lets any env var redirect a provider to an arbitrary binary. Env is trusted in the normal deployment, so this is informational — but it widens the trust surface and is worth documenting.

---

## Area-by-area assessment

### Command construction — SOUND
The strongest part of the design.
- `spawn(cli.command, cli.args, { shell: false })` (`agentCli.ts:106-110`): argv is passed as an array with **no shell**, so classic command injection via the prompt (`;`, `$()`, backticks, `&&`) is **not possible** — the prompt is a single argv element, never re-parsed by a shell.
- Args are produced purely by token substitution into a static template (`buildArgs`, `agentRegistry.ts:132-150`); there is no string-built shell line and no `eval`.
- `command.display` quotes whitespace args via `JSON.stringify` (`agentCli.ts:172-174`) but is used only for logging/UI, never executed.
- Branch name is `agent/<provider>-<taskId.slice(-6)>` where provider is a validated config id and taskId is internal — not injectable.

### Guardrails — STRONG (layered, opt-in by default)
Reaching real execution requires **all** of:
1. A configured provider — `isRealProvider` / `isConfiguredProvider` (`agentCli.ts:39-41`, `agentRegistry.ts:100-102`); `bad-provider` is rejected before any state change (verified in `adapter.validation.ts:95-106`).
2. `AGENTTEAM_REAL_ADAPTER_ENABLED=1` — checked twice: gating worktree creation (`realAdapter.ts:97`) and again inside `executeCliCommand` (`agentCli.ts:91-100`). Defense in depth.
3. `dryRun` not set — dry-run returns before spawning and before worktree creation (`agentCli.ts:81-90`, `realAdapter.ts:97`), confirmed by `testDryRunBlocksWithoutExecutingCli`.
4. `plan_approved` on the run (`realAdapter.ts:41-42`) and task not already `review`/`done` (`realAdapter.ts:43-45`).

The default path stays simulated; output is capped to a 12k tail (`agentCli.ts:37,176-179`) to bound memory. These gates are well covered by `adapter.validation.ts`.

### Worktree — CORRECT for git isolation, NOT a sandbox
- `ensureWorktree` (`worktree.ts:40-59`) reuses an existing worktree (checks `.git`), attaches to an existing branch or creates a new one, and throws a clear error on git failure — handled gracefully in `realAdapter.ts:99-105` (failure becomes a blocked run, not a crash).
- `collectChangedFiles` stages with `git add -A` then reads `git diff --cached --numstat` **without committing** (`worktree.ts:66-88`) — non-destructive to history; the human review gate decides integration.
- Caveats: the path is caller-influenced (M3) and there is no filesystem-level confinement (H1) or cleanup (L6).

### Artifacts — SAFE FROM PATH ABUSE, but unredacted
- Output dir is `.agentteam/runs/<delegatedRunId>/` (`artifacts.ts:22-24`); `delegatedRunId` is an internally generated `uid("drun")`, so there is no path-traversal vector from user input. `mkdirSync(..., { recursive: true })` then `writeFileSync` of JSON/markdown — no shell, no templating into paths.
- Gitignored under `.agentteam/`. Residual concern is content sensitivity, not path safety (M5).

---

## Positives worth preserving
- `shell: false` + argv templates — the decisive choice that closes command injection.
- Triple/quadruple-gated real execution with a simulated-by-default posture.
- Real-adapter-disabled and dry-run both short-circuit *before* touching the filesystem or spawning.
- Work confined to a dedicated git worktree + branch; diff imported by staging, never auto-committed.
- Output size capped; failures degrade to "blocked" inbox items rather than crashing.
- Config-driven providers (no per-provider hand-built command strings) with regression tests for the guardrails.

---

## Verdict

**Conditionally safe — approved for trusted, local, single-operator use; NOT safe to expose to untrusted networks or untrusted goals without further hardening.**

The command-construction layer is genuinely solid: `shell: false` with array argv eliminates the highest-frequency vulnerability class (shell injection), and real execution is opt-in behind several independent gates that are properly tested. For the intended deployment — a developer running it on their own machine with the real adapter explicitly enabled — the residual risk is acceptable.

The boundary that does **not** hold is *containment of the delegated agent itself*. By design the agents receive `bash`, `edit/write`, and `--dangerously-skip-permissions`, while their only isolation is a git worktree and the full operator environment (H1, H2). That is fine when the operator trusts both the agent and the goal, but it means the worktree must not be marketed or relied upon as a security sandbox.

**Required before any multi-user or network-exposed deployment:**
1. Authenticate the run/session endpoints and bind to localhost (M3).
2. Allowlist/normalize the `worktree` path (M3).
3. Run agents under an OS-level sandbox and pass a scoped, allowlisted env (H1, H2).
4. Treat goals/descriptions as untrusted input when paired with high-privilege agents (M4).

**Recommended hardening (non-blocking for local use):** redact secrets in persisted output (M5), call `removeWorktree` after integration (L6), clamp `timeoutMs` (L7), and add a concurrency cap (L8).
