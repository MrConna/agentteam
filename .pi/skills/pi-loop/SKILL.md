---
name: pi-loop
description: Execute pre-built agent loops with a Goal / Max iterations / Exit-when contract. Use when the user types `/loop`, pastes a loops.elorm.xyz kickoff prompt, or asks to "run a loop", "build/test until green", "keep fixing until X passes", "loop until <command> succeeds". Expands the loop into a single `delegate({ acceptance })` call where Goal→acceptance.criteria[], Max iterations→acceptance.maxFinalizationTurns, Check command→acceptance.verify[].command. Triggers: "/loop", "until green", "loops.elorm.xyz", "kickoff prompt", "build until", "test until".
---

# pi-loop

Turn a **loop spec** into one delegated, self-verifying agent run.

A loop = *do work, run a check, repeat until the check passes or you run out of
iterations*. This skill parses the loop spec and expands it into a single
`delegate(...)` call carrying an **acceptance contract**. The sub-agent does the
work and verifies itself; the leader does not babysit it.

## The acceptance contract

This is the canonical shape every loop maps to (the loops.elorm.xyz format and
the `/loop` flags both reduce to it):

```jsonc
{
  "agent": "worker",
  "task": "<full task description with all context>",
  "acceptance": {
    "criteria": ["<Goal, as one or more pass/fail statements>"],
    "verify": [{ "command": "<Check command>", "expect": "exit 0" }],
    "maxFinalizationTurns": 10            // Max iterations
  }
}
```

### Mapping (memorize this)

| loops.elorm.xyz / `/loop` field | acceptance field                |
| ------------------------------- | ------------------------------- |
| **Goal**                        | `acceptance.criteria[]`         |
| **Max iterations**              | `acceptance.maxFinalizationTurns` |
| **Check / Exit when** command   | `acceptance.verify[].command`   |

## Usage

### a) Flag form

```
/loop "Test Until Green" --check "npm test" --max 10
```

Parse into:
- `criteria`   ← the quoted name/goal → `["Test Until Green: the suite passes"]`
- `verify`     ← `--check` → `[{ command: "npm test", expect: "exit 0" }]`
- `maxFinalizationTurns` ← `--max` → `10`

Flags: `--check <cmd>` (required unless a registry loop supplies it),
`--max <n>` (default 10), `--cwd <dir>`, `--model <id>`.

### b) Paste a loops.elorm.xyz kickoff prompt

The user pastes a block like:

```
Goal: All integration tests pass on CI.
Max iterations: 8
Exit when: `pnpm test:int` exits 0
Notes: don't touch the snapshot fixtures.
```

Recognize the labels case-insensitively and map them:
- `Goal:`        → `criteria[]` (split multi-line goals into multiple criteria)
- `Max iterations:` → `maxFinalizationTurns`
- `Exit when:` / `Check:` / `Done when:` → `verify[].command` (extract the
  command, usually in backticks or after "exits 0")
- `Notes:` / `Constraints:` → fold into the `task` description as guardrails.

If a field is missing: `Max iterations` defaults to `10`; if no `Exit when`
command can be found, ask the user for the check command (a loop without a
verifiable exit condition is not a loop).

### c) List available loops

```
/loop ls
```

Read [assets/loops.json](assets/loops.json) and print the registry (id, name,
default check command, default max). The user can then run one by name:
`/loop "Build Until Green"` pulls Goal + check + max from the registry, and any
explicit `--check`/`--max` flag overrides the registry default.

## Expansion procedure

1. **Identify the form** (a/b/c above) and extract Goal, Check, Max.
2. **Resolve defaults** from `assets/loops.json` when the user named a registry
   loop; explicit flags win over registry values.
3. **Build the acceptance object** using the mapping table.
4. **Compose the `task`** string — the sub-agent has no conversation context, so
   embed everything it needs (see encoding note below).
5. **Call `delegate`** once and report the result. Do not loop in the leader.

## Encoding for today's `delegate` tool

⚠️ The project's current `delegate` tool
(`agent-memory-tools/extensions/delegate.ts`) accepts **`task`, `cwd`, `model`,
`timeout`** — it does **not yet** have a native `acceptance` parameter. So the
acceptance contract is **compiled into the `task` string** as an explicit
self-verifying loop instruction. This works now and stays forward-compatible: if
`delegate` later gains a native `acceptance` field, pass the object directly.

Compile the acceptance into `task` like this:

```
delegate({
  cwd: "<--cwd or project dir>",
  model: "<--model, optional>",
  timeout: 600,
  task: `
You are running an iterative "Build Until Green"-style loop.

GOAL (acceptance criteria — all must hold):
- <criteria[0]>
- <criteria[1]>

EXIT CONDITION (verify): run `<verify[0].command>`; success = exit code 0.

LOOP (max <maxFinalizationTurns> iterations):
  1. Run the verify command.
  2. If it exits 0 → STOP and report SUCCESS with the final command output.
  3. Otherwise, read the failure, make the smallest fix that addresses a real
     cause, and go to step 1.
  4. If you reach iteration <maxFinalizationTurns> still failing → STOP and
     report FAILURE: what's still broken, what you tried, and the last output.

CONSTRAINTS:
- <any Notes/Constraints from the kickoff>
- Do not weaken the check to make it pass (no deleting/skipping tests, no
  --no-verify, no silencing errors). Fix the underlying problem.

Report: final status (SUCCESS/FAILURE), iterations used, and the last verify output.
`
})
```

Set `timeout` generously (loops are multi-iteration): default to `600` unless
the user asked otherwise.

## Worked example

Input:

```
/loop "Test Until Green" --check "npm test" --max 10
```

Canonical acceptance:

```jsonc
{
  "agent": "worker",
  "task": "Test Until Green — make `npm test` pass.",
  "acceptance": {
    "criteria": ["The test suite passes: `npm test` exits 0 with no failures."],
    "verify": [{ "command": "npm test", "expect": "exit 0" }],
    "maxFinalizationTurns": 10
  }
}
```

Then issue the single `delegate(...)` call with that acceptance compiled into the
`task` (per the encoding section) and report the sub-agent's final status.

## Guardrails

- A loop **must** have a verifiable check command. No check → ask for one.
- One `/loop` invocation = **one** `delegate` call. The sub-agent owns the
  iteration; the leader does not poll or re-run.
- Never satisfy the check by weakening it. The criteria describe *real* success.
- `maxFinalizationTurns` is a hard ceiling — surface FAILURE honestly when hit.
