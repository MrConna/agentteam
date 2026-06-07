# CLI Output Parsing Scout

> Task T7-03 — Owner: pi-agent — Status: completed  
> Scope: compare non-interactive output shapes for the three real adapter providers and recommend how the adapter should consume results.

## Executive Summary

Do **not** rely on stdout parsing for structured results. All three providers emit noise (metadata, logs, transport diagnostics, or retry messages) alongside the assistant response. The only reliable contract is:

1. The CLI exits (or times out).
2. The agent writes deterministic artifacts to `.agentteam/runs/<run-id>/`.
3. The adapter imports `result.json`, `summary.md`, `blockers.md`, and `changedFiles` from those artifacts.

| Provider | Command | Stdout parseability | Structured mode | Artifact support |
|---|---|---|---|---|
| pi-agent | `pi -p` | Clean plain text | `--mode json` (NDJSON) | `--session-dir` writes JSONL |
| Codex | `codex exec` | Mixed logs + metadata | `--json` (JSON events) | None native; rely on agent files |
| Claude | `claude -p` | Plain text (when working) | None native | None native; rely on agent files |

## Provider Output Shapes

### pi-agent (`pi -p`)

**Plain mode (default)**

```
$ pi -p "say hello in one word"
Hello
```

- Exit code `0` on completion.
- Stdout contains **only** the final assistant text (no framing markers).
- Stderr is empty on success.
- Fast and deterministic.

**JSON mode (`--mode json`)**

Outputs NDJSON (one JSON object per line). Relevant event types:

| Event type | Meaning |
|---|---|
| `agent_start` | Session initialized |
| `turn_start` | Turn beginning |
| `message_start` | Message object created |
| `message_update` | Incremental `text_delta` |
| `message_end` | Final message with full `content[].text` |
| `turn_end` | Turn complete |
| `agent_end` | Session complete |

Extracting the final answer:

```js
const finalText = jsonLines
  .find(e => e.type === 'message_end')
  ?.message?.content?.find(c => c.type === 'text')?.text;
```

**Caveat:** `--mode json` also embeds large encrypted `thinkingSignature` blobs and `diagnostics` arrays. A transport failure (e.g., WebSocket error) can appear inside `message.diagnostics` while the exit code remains `0`. Do not assume exit `0` means zero errors.

**Session artifacts**

When `--session-dir <dir>` is provided, pi writes:

```
<session-dir>/<iso-timestamp>_<uuid>.jsonl
```

This file contains the full conversation graph but is **not** the delegated-run artifact contract. Instruct the agent to still write `.agentteam/runs/<run-id>/result.json`.

### Codex (`codex exec`)

```
$ codex exec "say hello in one word"
OpenAI Codex v0.137.0-alpha.4
--------
workdir: /...
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write
--------
user
say hello in one word

[warnings...]
{"type":"thread.started",...}
```

- Stdout starts with a human-readable session header, then interleaves JSON events if `--json` is used.
- Stderr is noisy with plugin/skill warnings.
- `--json` emits events like `turn.started`, `turn.completed`, `message.completed`, etc., but the schema is not formally documented and may change between alpha releases.
- **Recommendation:** avoid parsing Codex stdout. Treat it as opaque logs.

### Claude (`claude -p`)

```
$ claude -p "say hello in one word"
[assistant plain-text response]
```

- In theory, stdout is clean assistant text (similar to `pi -p` plain mode).
- No native JSON mode.
- **Current status on this machine:** blocked. Either hangs indefinitely or returns `401 Invalid authentication credentials`. Documented as a known failure mode pending a first-party TLS/proxy fix.

## Minimum Structured Prompt Convention

To make artifact import reliable, prepend every prompt with an explicit instruction:

```markdown
Before exiting, write the following artifacts to `.agentteam/runs/<run-id>/`:
- result.json with schema agentteam.realRunResult.v1
- summary.md with changed files, commands run, validation, and blockers
- blockers.md if any blockers exist
- evidence.md with key observations

If you cannot complete the task, still write result.json with status "failed"
and blockers.md explaining why.
```

Per-provider nuances:

- **pi-agent:** `--tools read,grep,find,ls,bash,edit,write` is required for file I/O. `--session-dir` is optional but useful for local debugging.
- **Codex:** `--sandbox workspace-write` is default; no extra flags needed for file writes. `--json` is **not** recommended for adapter parsing because the event schema is unstable.
- **Claude:** `--allowedTools Bash,Read,Edit,Write` or equivalent may be needed depending on the installation's permission profile.

## Stdout Parseability vs Artifact Fields

| Field | Can parse from stdout? | Recommended source |
|---|---|---|
| `changedFiles` | No | `result.json.changedFiles` |
| `commandsRun` | No | `result.json.commandsRun` |
| `validation` | No | `result.json.validation` |
| `blockers` | No | `blockers.md` |
| `exitCode` | Yes (process) | Process exit code |
| `stdoutTail` | Yes (capture) | Captured stdout buffer |
| `stderrTail` | Yes (capture) | Captured stderr buffer |
| `summary` | Partially | `summary.md` |

**Why stdout is insufficient:**
- pi NDJSON requires a streaming parser and may contain transport errors.
- Codex stdout mixes human-readable headers, JSON events, and stderr logs.
- Claude stdout is plain text but unstructured; there is no guarantee the agent will format a JSON block at the end.

## Failure Modes

### 1. Command timeout

**Observed:** `claude -p` hangs indefinitely on this machine (exit `124` under `timeout`). `codex exec` retries 5 times before failing, which can exceed a short timeout.

**Mitigation:**
- Always wrap CLI execution with a configurable timeout (default 25 min).
- On timeout, `SIGTERM` the child, record `reason: "timeout"`, and do **not** treat partial stdout as success.

### 2. Non-zero exit

**Observed:** `codex exec` exits non-zero on certificate or network failure. `pi -p --mode json` can exit `0` despite WebSocket errors in `diagnostics`.

**Mitigation:**
- Treat non-zero exit as `status: "failed"`.
- For pi, additionally inspect `message.diagnostics` for provider transport failures even when exit is `0`.

### 3. Missing artifact

**Scenario:** The agent crashed, was killed, or ignored the prompt instruction to write artifacts.

**Mitigation:**
- After CLI exits, check for `.agentteam/runs/<run-id>/result.json`.
- If missing, degrade to a synthetic `result.json` with `status: "failed"`, `reason: "missing_artifact"`, and populate `stdoutTail` / `stderrTail` from captured buffers.

### 4. Partial artifact

**Scenario:** The agent started writing `result.json` but the process was killed mid-write, leaving truncated JSON.

**Mitigation:**
- Validate JSON with `JSON.parse` before importing.
- On parse failure, treat as missing artifact and log the parse error.

### 5. Tool unavailable

**Scenario:** `claude`, `codex`, or `pi` is not in `PATH`, or the binary exists but fails immediately (e.g., `spawn ENOENT`).

**Mitigation:**
- Detect during preflight (e.g., `which claude`).
- In the adapter, `child.on('error', ...)` catches spawn errors and should produce `status: "failed"`, `reason: "spawn_error"`.

## Recommendations for T7-01 / T7-02

1. **Adapter tests** (T7-01) should cover:
   - `executeCliCommand` timeout handling
   - `executeCliCommand` spawn-error handling
   - Non-zero exit mapping to `status: "failed"`
   - Zero exit with missing artifact mapping to `status: "failed"`

2. **Artifact import helpers** (T7-02) should:
   - Read `.agentteam/runs/<run-id>/result.json`
   - Fallback to `summary.md` and `blockers.md` for human-readable detail
   - Validate JSON before importing
   - Return a `RealRunResult` even when artifacts are missing or invalid

3. **Real adapter** should:
   - Construct provider-specific commands exactly as documented above.
   - Never attempt to parse stdout for structured data.
   - Import artifacts only after the child process has exited or timed out.

## Environment Notes

- **codex** version `0.137.0-alpha.4`
- **claude** version `2.1.168` (blocked on this Mac by TLS/proxy issue)
- **pi** version `0.75.4`
- All commands tested from cwd `/Users/luffy/Downloads/code/ClaudeProject/github/agentteam-pi-scout-cli-output`
