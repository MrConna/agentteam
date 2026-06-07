import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

type SessionMeta = { id: string; provider: string; label: string; command: string; status: string };

/**
 * Live agent terminal sessions in a tiled grid. Each tile is a real interactive
 * CLI/TUI (claude, codex, agy, pi…) running under a PTY on the server, streamed
 * over WebSocket. You can watch output and type into it like a real terminal.
 */
export function Terminals() {
  const [launchable, setLaunchable] = useState<{ id: string; label: string }[]>([]);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [l, s] = await Promise.all([api.launchableProviders(), api.listSessions()]);
    setLaunchable(l);
    setSessions(s);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function spawn(provider: string) {
    setBusy(true);
    try {
      await api.createSession(provider, 100, 30);
      await refresh();
    } catch (e) {
      alert(`Could not start session: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function close(id: string) {
    await api.killSession(id).catch(() => {});
    setSessions((cur) => cur.filter((s) => s.id !== id));
  }

  return (
    <section className="terminals" aria-label="Agent sessions">
      <div className="terminals-bar">
        <span className="label">Agent sessions</span>
        <div className="spawn-buttons">
          {launchable.map((p) => (
            <button key={p.id} className="secondary-button" disabled={busy} onClick={() => spawn(p.id)}>
              <Plus size={14} /> {p.label}
            </button>
          ))}
        </div>
        <span className="hint">Each tile is a live CLI session — click in and type</span>
      </div>

      {sessions.length === 0 ? (
        <p className="empty-hint terminals-empty">
          No sessions yet. Start one above. Sessions run the real agent CLI under a PTY on the server.
        </p>
      ) : (
        <div className="terminal-grid">
          {sessions.map((s) => (
            <TerminalTile key={s.id} session={s} onClose={() => close(s.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function TerminalTile({ session, onClose }: { session: SessionMeta; onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      theme: { background: "#0d0f12", foreground: "#e7eaee" },
      cursorBlink: true,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try {
      fit.fit();
    } catch {
      /* ignore */
    }

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?id=${session.id}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "data") term.write(msg.data);
        else if (msg.type === "error") term.write(`\r\n[${msg.message}]\r\n`);
      } catch {
        /* ignore */
      }
    };
    const sendResize = () => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      }
    };
    ws.onopen = sendResize;
    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    const ro = new ResizeObserver(() => sendResize());
    ro.observe(host);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [session.id]);

  return (
    <article className={`terminal-tile ${session.status}`}>
      <div className="terminal-tile-head">
        <span className={`provider-chip provider-${session.provider}`}>{session.label}</span>
        <code className="terminal-cmd">{session.command}</code>
        <button className="icon-button" title="Kill session" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </article>
  );
}
