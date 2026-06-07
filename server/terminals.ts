import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pty from "node-pty";
import { getProfile, listProviders, resolveCommand } from "./agentRegistry.ts";

/**
 * Live interactive terminal sessions — each agent is a real CLI/TUI process
 * (claude, codex, agy, pi…) running under a PTY. Output streams to the browser
 * over WebSocket and keystrokes stream back, so a session behaves like a real
 * terminal pane. This is the BridgeSpace-style workbench: roles are live agent
 * CLI sessions, not one-shot batch commands.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(here, "..");

// node-pty's prebuilt spawn-helper (macOS/Linux) sometimes ships without the
// exec bit, which makes spawn fail with "posix_spawnp failed". Fix it once.
(function ensureSpawnHelperExecutable() {
  for (const arch of ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]) {
    const helper = join(PROJECT_ROOT, "node_modules", "node-pty", "prebuilds", arch, "spawn-helper");
    try {
      if (existsSync(helper)) chmodSync(helper, 0o755);
    } catch {
      /* best effort */
    }
  }
})();

export interface TermSession {
  id: string;
  provider: string;
  label: string;
  command: string;
  cols: number;
  rows: number;
  status: "running" | "exited";
  exitCode?: number;
  startedAt: string;
  proc: pty.IPty;
  buffer: string; // recent output for late-joining / reconnecting clients
  listeners: Set<(data: string) => void>;
}

const MAX_BUFFER = 200_000;
const sessions = new Map<string, TermSession>();

function uid() {
  return `term-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSession(input: { provider: string; cols?: number; rows?: number }): TermSession {
  const profile = getProfile(input.provider);
  const command = resolveCommand(input.provider);
  const cols = input.cols ?? 100;
  const rows = input.rows ?? 30;

  // Interactive launch = the bare command (no -p/exec), so the real TUI starts.
  const proc = pty.spawn(command, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: PROJECT_ROOT,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  const session: TermSession = {
    id: uid(),
    provider: input.provider,
    label: profile?.label ?? input.provider,
    command,
    cols,
    rows,
    status: "running",
    startedAt: new Date().toISOString(),
    proc,
    buffer: "",
    listeners: new Set(),
  };

  proc.onData((data) => {
    session.buffer = (session.buffer + data).slice(-MAX_BUFFER);
    for (const fn of session.listeners) fn(data);
  });
  proc.onExit(({ exitCode }) => {
    session.status = "exited";
    session.exitCode = exitCode;
    const note = `\r\n\x1b[33m[session exited: code ${exitCode}]\x1b[0m\r\n`;
    session.buffer += note;
    for (const fn of session.listeners) fn(note);
  });

  sessions.set(session.id, session);
  return session;
}

export function write(id: string, data: string): boolean {
  const s = sessions.get(id);
  if (!s || s.status !== "running") return false;
  s.proc.write(data);
  return true;
}

export function resize(id: string, cols: number, rows: number): void {
  const s = sessions.get(id);
  if (!s || s.status !== "running") return;
  try {
    s.proc.resize(cols, rows);
    s.cols = cols;
    s.rows = rows;
  } catch {
    /* ignore resize on a dying pty */
  }
}

export function kill(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    if (s.status === "running") s.proc.kill();
  } catch {
    /* ignore */
  }
  sessions.delete(id);
  return true;
}

export function attach(id: string, onData: (data: string) => void): (() => void) | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.buffer) onData(s.buffer); // replay recent output to the new client
  s.listeners.add(onData);
  return () => s.listeners.delete(onData);
}

export function getSession(id: string): TermSession | undefined {
  return sessions.get(id);
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    provider: s.provider,
    label: s.label,
    command: s.command,
    status: s.status,
    exitCode: s.exitCode,
    startedAt: s.startedAt,
  }));
}

/** Providers that can be launched as a session (everything but simulated). */
export function launchableProviders() {
  return listProviders().map((p) => ({ id: p.id, label: p.label }));
}
