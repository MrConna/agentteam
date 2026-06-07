import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChatArgs, getProfile, listProviders, resolveCommand } from "./agentRegistry.ts";

/**
 * Chat-style agent sessions. Each message runs the provider's CLI in
 * non-interactive (print) mode and streams the response back over WebSocket.
 * Continuity uses each CLI's resume flag (--continue / -c / --session-dir) when
 * configured. This is robust across agents because it never depends on a
 * full-screen TUI rendering inside a web terminal.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(here, "..");

export type ChatRole = "user" | "assistant" | "system";
export interface ChatMessage {
  role: ChatRole;
  text: string;
  ts: string;
}

type ChatEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; exitCode: number | null }
  | { type: "error"; message: string }
  | { type: "status"; busy: boolean };

interface ChatSession {
  id: string;
  provider: string;
  label: string;
  model: string;
  status: "idle" | "thinking";
  turns: number;
  messages: ChatMessage[];
  listeners: Set<(e: ChatEvent) => void>;
}

const sessions = new Map<string, ChatSession>();
const uid = () => `chat-${randomUUID().slice(0, 8)}`;
const now = () => new Date().toISOString();

export function createChatSession(input: { provider: string; model?: string }): ChatSession | null {
  const profile = getProfile(input.provider);
  if (!profile) return null;
  const session: ChatSession = {
    id: uid(),
    provider: input.provider,
    label: profile.label,
    model: input.model?.trim() || profile.defaultModel,
    status: "idle",
    turns: 0,
    messages: [],
    listeners: new Set(),
  };
  sessions.set(session.id, session);
  return session;
}

function emit(s: ChatSession, e: ChatEvent) {
  for (const fn of s.listeners) fn(e);
}

export function sendMessage(id: string, text: string): { ok: boolean; reason?: string } {
  const s = sessions.get(id);
  if (!s) return { ok: false, reason: "session_not_found" };
  if (s.status === "thinking") return { ok: false, reason: "busy" };
  const message = text.trim();
  if (!message) return { ok: false, reason: "empty" };

  const args = buildChatArgs({
    provider: s.provider,
    model: s.model,
    message,
    sessionId: s.id,
    first: s.turns === 0,
  });
  if (!args) return { ok: false, reason: "bad_provider" };

  s.messages.push({ role: "user", text: message, ts: now() });
  s.status = "thinking";
  s.turns += 1;
  emit(s, { type: "status", busy: true });

  const command = resolveCommand(s.provider);
  let assistant = "";
  let stderr = "";

  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: process.env,
    shell: false,
  });

  child.stdout.on("data", (d) => {
    const t = String(d);
    assistant += t;
    emit(s, { type: "chunk", text: t });
  });
  child.stderr.on("data", (d) => {
    stderr += String(d);
  });
  child.on("error", (err) => {
    s.status = "idle";
    const msg = `Failed to launch ${command}: ${err.message}. Set AGENTTEAM_CMD_${s.provider
      .toUpperCase()
      .replace(/-/g, "_")} to a real executable.`;
    s.messages.push({ role: "system", text: msg, ts: now() });
    emit(s, { type: "error", message: msg });
    emit(s, { type: "status", busy: false });
  });
  child.on("close", (code) => {
    if (s.status !== "thinking") return; // error already handled
    const finalText = assistant.trim() || (stderr.trim() ? `[stderr] ${stderr.trim()}` : "[no output]");
    s.messages.push({ role: "assistant", text: finalText, ts: now() });
    s.status = "idle";
    emit(s, { type: "done", exitCode: code });
    emit(s, { type: "status", busy: false });
  });

  return { ok: true };
}

export function attachChat(id: string, onEvent: (e: ChatEvent) => void): (() => void) | null {
  const s = sessions.get(id);
  if (!s) return null;
  s.listeners.add(onEvent);
  return () => s.listeners.delete(onEvent);
}

export function getChatSession(id: string) {
  const s = sessions.get(id);
  if (!s) return undefined;
  return {
    id: s.id,
    provider: s.provider,
    label: s.label,
    model: s.model,
    status: s.status,
    messages: s.messages,
  };
}

export function killChatSession(id: string): boolean {
  return sessions.delete(id);
}

export function listChatSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    provider: s.provider,
    label: s.label,
    model: s.model,
    status: s.status,
    messageCount: s.messages.length,
  }));
}

/** Providers that can back a chat session, with their selectable models. */
export function chatProviders() {
  return listProviders().map((p) => ({ id: p.id, label: p.label, models: p.models, defaultModel: p.defaultModel }));
}
