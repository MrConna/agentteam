import { Bot, Plus, Send, User, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

type Provider = { id: string; label: string; models: string[]; defaultModel: string };
type SessionMeta = { id: string; provider: string; label: string; model: string; status: string };
type Msg = { role: "user" | "assistant" | "system"; text: string };

/**
 * Chat-style agent sessions in a tiled grid. Each tile talks to one agent CLI in
 * non-interactive mode: type a message, the server runs the CLI and streams the
 * reply back over WebSocket. Per-session model is chosen at creation.
 */
export function Terminals() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [p, s] = await Promise.all([api.chatProviders(), api.listChat()]);
    setProviders(p);
    setSessions(s);
    if (!provider && p[0]) {
      setProvider(p[0].id);
      setModel(p[0].defaultModel);
    }
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const current = providers.find((p) => p.id === provider);

  async function create() {
    if (!provider) return;
    setBusy(true);
    try {
      await api.createChat(provider, model || current?.defaultModel || "");
      await refresh();
    } catch (e) {
      alert(`Could not start session: ${e}`);
    } finally {
      setBusy(false);
    }
  }
  async function close(id: string) {
    await api.killChat(id).catch(() => {});
    setSessions((cur) => cur.filter((s) => s.id !== id));
  }

  return (
    <section className="chat-sessions" aria-label="Agent chat sessions">
      <div className="chat-bar">
        <span className="label">Agent sessions</span>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel(providers.find((p) => p.id === e.target.value)?.defaultModel ?? "");
          }}
          aria-label="Provider"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
          {current?.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button className="primary-button small" disabled={busy || !provider} onClick={create}>
          <Plus size={14} /> New session
        </button>
        <span className="hint">Each tile chats with one agent CLI — pick model, then send</span>
      </div>

      {sessions.length === 0 ? (
        <p className="empty-hint chat-empty">No sessions yet. Pick a provider + model and click New session.</p>
      ) : (
        <div className="chat-grid">
          {sessions.map((s) => (
            <ChatTile key={s.id} session={s} onClose={() => close(s.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChatTile({ session, onClose }: { session: SessionMeta; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [runningCmd, setRunningCmd] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Elapsed timer while the agent is working, so a slow (10-15s) reply looks
  // alive instead of stuck.
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/chat?id=${session.id}`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const e = JSON.parse(ev.data);
      if (e.type === "history") {
        setMessages(e.messages.map((m: Msg) => ({ role: m.role, text: m.text })));
      } else if (e.type === "status") {
        setBusy(e.busy);
        if (e.busy) {
          streamRef.current = "";
          setMessages((cur) => [...cur, { role: "assistant", text: "" }]);
        } else {
          setRunningCmd("");
        }
      } else if (e.type === "running") {
        setRunningCmd(e.command);
      } else if (e.type === "chunk") {
        streamRef.current += e.text;
        setMessages((cur) => {
          const next = [...cur];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === "assistant") {
              next[i] = { role: "assistant", text: streamRef.current };
              break;
            }
          }
          return next;
        });
      } else if (e.type === "error") {
        setMessages((cur) => {
          // drop the trailing empty assistant placeholder, then add the error
          const trimmed = cur.length && cur[cur.length - 1].role === "assistant" && !cur[cur.length - 1].text
            ? cur.slice(0, -1)
            : cur;
          return [...trimmed, { role: "system", text: e.message }];
        });
        setBusy(false);
        setRunningCmd("");
      }
    };
    return () => ws.close();
  }, [session.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  function send() {
    const text = input.trim();
    const ws = wsRef.current;
    if (!text || !ws || ws.readyState !== ws.OPEN || busy) return;
    setMessages((cur) => [...cur, { role: "user", text }]);
    ws.send(JSON.stringify({ type: "message", text }));
    setInput("");
  }

  return (
    <article className="chat-tile">
      <div className="chat-tile-head">
        <span className={`provider-chip provider-${session.provider}`}>{session.label}</span>
        <code className="chat-model">{session.model}</code>
        {busy && <span className="chat-thinking">running {elapsed}s…</span>}
        <button className="icon-button" title="Close session" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {busy && runningCmd && <div className="chat-running" title={runningCmd}>$ {runningCmd}</div>}
      <div className="chat-transcript" ref={scrollRef}>
        {messages.length === 0 && <p className="empty-hint">Say hello to {session.label}.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-${m.role}`}>
            <span className="chat-avatar">{m.role === "user" ? <User size={13} /> : <Bot size={13} />}</span>
            <pre className="chat-text">{m.text || (busy && m.role === "assistant" ? "…" : "")}</pre>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message ${session.label}…`}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="primary-button small" disabled={busy || !input.trim()} onClick={send}>
          <Send size={14} /> Send
        </button>
      </div>
    </article>
  );
}
