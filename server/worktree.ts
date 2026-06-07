import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(join(here, ".."));

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

export interface DiffResult {
  changedFiles: ChangedFile[];
  fileNames: string[];
  summaryLines: string[];
}

function git(args: string[], cwd: string = PROJECT_ROOT) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}

function absoluteWorktree(worktree: string): string {
  return isAbsolute(worktree) ? worktree : resolve(PROJECT_ROOT, worktree);
}

/**
 * Create (or reuse) an isolated git worktree + branch for a delegated run.
 * Real agents write here, never on the operator's main checkout. Returns the
 * absolute worktree path. Throws with a clear message on git failure.
 */
export function ensureWorktree(input: { branch: string; worktree: string; base?: string }): {
  path: string;
  created: boolean;
} {
  const path = absoluteWorktree(input.worktree);
  if (existsSync(join(path, ".git"))) {
    return { path, created: false };
  }
  const base = input.base ?? "HEAD";
  // If the branch already exists, attach the worktree to it; otherwise create it.
  const branchExists = git(["rev-parse", "--verify", "--quiet", input.branch]).ok;
  const args = branchExists
    ? ["worktree", "add", path, input.branch]
    : ["worktree", "add", "-b", input.branch, path, base];
  const res = git(args);
  if (!res.ok) {
    throw new Error(`git worktree add failed: ${res.stderr || res.stdout || "unknown error"}`);
  }
  return { path, created: true };
}

/**
 * Stage everything in the worktree and report the real changed files with
 * per-file add/remove counts. Staging (not committing) lets us read the diff
 * without mutating history; the integrator commits/merges through the gate.
 */
export function collectChangedFiles(worktree: string): DiffResult {
  const path = absoluteWorktree(worktree);
  git(["add", "-A"], path);
  const numstat = git(["diff", "--cached", "--numstat"], path);
  const changedFiles: ChangedFile[] = [];
  if (numstat.ok && numstat.stdout) {
    for (const line of numstat.stdout.split("\n")) {
      const [added, removed, ...rest] = line.split("\t");
      const file = rest.join("\t").trim();
      if (!file) continue;
      changedFiles.push({
        path: file,
        added: added === "-" ? 0 : Number(added) || 0,
        removed: removed === "-" ? 0 : Number(removed) || 0,
      });
    }
  }
  const fileNames = changedFiles.map((c) => c.path);
  const summaryLines = changedFiles.map(
    (c) => `${c.path} (+${c.added}/-${c.removed})`,
  );
  return { changedFiles, fileNames, summaryLines };
}

/** Remove a worktree created for a delegated run. Best-effort; never throws. */
export function removeWorktree(worktree: string, opts: { force?: boolean } = {}): boolean {
  const path = absoluteWorktree(worktree);
  if (!existsSync(path)) return false;
  const args = ["worktree", "remove", path];
  if (opts.force) args.push("--force");
  const res = git(args);
  return res.ok;
}

export { git as _git };
