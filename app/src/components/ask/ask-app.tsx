"use client";

/**
 * ASK GAMETIME — the chat surface.
 *
 * WHAT THIS COMPONENT DELIBERATELY DOES NOT DO
 * --------------------------------------------
 * It does not persist anything. No localStorage key, no sessionStorage, no cookie, no account. The
 * message list lives in React state for the lifetime of this tab, and a reload starts a fresh
 * conversation — including the entertainment bankroll, which is the point (§20, §74). Clearing the
 * conversation clears the messages, the resolved identities and the stated preferences together,
 * because a "cleared" chat that remembers a bankroll is not cleared.
 *
 * It does not render model-authored HTML. The server sanitises the markdown before it is sent, and
 * this renders a SMALL SAFE SUBSET of what arrives — bold, inline code, and links whose href came from
 * the approved link list the server attached. A model-written URL never becomes an anchor because the
 * renderer has no path that turns arbitrary text into one (§98).
 *
 * It does not show reasoning. Tool activity is human copy — "Checking Game Finder…" — and nothing
 * else about how an answer was reached crosses the wire (§51).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type LinkRef = { id: string; label: string; href: string };
type Entity = { id: string; kind: string; sport: string | null; label: string | null };

interface Message {
  id: string;
  role: Role;
  text: string;
  links?: LinkRef[];
  sources?: string[];
  followUps?: string[];
  verified?: boolean;
  error?: boolean;
}

interface Preferences {
  riskProfile: "LOW" | "MEDIUM" | "HIGH" | "LONGSHOT" | null;
  entertainmentBankroll: number | null;
}

const ENDPOINT = "/api/ask/";

const STARTERS = [
  "What are today's GameTime forecasts?",
  "Find Mets games where they scored at least five runs",
  "How does Research Lab work?",
  "What does Confidence mean?",
  "Build parlay candidates",
  "Which sports does GameTime cover?",
];

/** Friendly names for the tools an answer used. The reader sees what was consulted, not how. */
const SOURCE_LABEL: Record<string, string> = {
  runGameFinder: "Game Finder",
  runPlayerResearchQuery: "Player Research",
  getSeasonExplorer: "Season Explorer",
  getPlayerRecentGames: "Player Research",
  getTeamComparison: "Team Compare",
  getPlayerComparison: "Player Compare",
  getMatchupContext: "Matchup",
  getPublishedForecasts: "GameTime Forecast",
  getParlayCandidates: "Parlay candidates",
  getLiveSlate: "Live",
  searchGameTimeHelp: "GameTime guide",
  resolveEntity: "GameTime Research",
  getGameTimeNow: "GameTime clock",
  calculate: "Calculator",
};

export default function AskApp({ context }: { context?: { pageType: string; id?: string; sport?: string } | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences>({ riskProfile: null, entertainmentBankroll: null });
  const [entities, setEntities] = useState<Entity[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  /* Focus returns to the composer when an answer completes, so a keyboard user can simply keep typing. */
  useEffect(() => {
    if (!busy && messages.length) inputRef.current?.focus();
  }, [busy, messages.length]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const userMsg: Message = { id: `u${Date.now()}`, role: "user", text: question };
      const history = [...messages, userMsg];
      setMessages(history);
      setDraft("");
      setBusy(true);
      setStatus("Thinking…");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          signal: controller.signal,
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, text: m.text })),
            preferences: prefs,
            // Canonical ids established earlier travel forward, so "compare him with…" resolves without
            // guessing. Only ids — never the evidence behind them.
            entities,
            context: context ?? null,
          }),
        });

        if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
          const body = await res.json();
          return push({ id: `a${Date.now()}`, role: "assistant", text: body.reason ?? "Ask GameTime could not answer that right now.", error: true });
        }

        if (res.headers.get("content-type")?.includes("text/event-stream")) {
          await readStream(res, {
            onStatus: setStatus,
            onAnswer: (payload) => push(answerMessage(payload)),
            onError: (payload) => push({ id: `a${Date.now()}`, role: "assistant", text: payload.reason ?? "Something went wrong.", error: true }),
            onEntities: setEntities,
          });
        } else {
          const payload = await res.json();
          if (payload.ok) { push(answerMessage(payload)); setEntities(payload.entities ?? []); }
          else push({ id: `a${Date.now()}`, role: "assistant", text: payload.reason ?? "Something went wrong.", error: true });
        }
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          push({ id: `a${Date.now()}`, role: "assistant", text: "Ask GameTime is temporarily unavailable. The rest of the site still works.", error: true });
        }
      } finally {
        setBusy(false);
        setStatus(null);
        abortRef.current = null;
      }

      function push(m: Message) {
        setMessages((prev) => [...prev, m]);
      }
    },
    [busy, messages, prefs, entities, context],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setBusy(false);
    setStatus(null);
  }, []);

  /* CLEARING CLEARS EVERYTHING. Messages, identities and the stated bankroll go together (§141). */
  const clear = useCallback(() => {
    stop();
    setMessages([]);
    setEntities([]);
    setPrefs({ riskProfile: null, entertainmentBankroll: null });
    setDraft("");
  }, [stop]);

  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => prev.slice(0, prev.findIndex((m) => m.id === lastUser.id) + 1).slice(0, -1));
    void send(lastUser.text);
  }, [messages, send]);

  const empty = messages.length === 0;

  return (
    <div className="ask-app">
      <div
        ref={logRef}
        className="ask-log"
        role="log"
        aria-label="Conversation with Ask GameTime"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {empty ? <EmptyState onPick={(s) => void send(s)} /> : messages.map((m) => <Bubble key={m.id} message={m} onFollowUp={(f) => void send(f)} />)}

        {/*
          The tool-activity line is its own polite region rather than part of the log, so a screen
          reader announces "Checking Game Finder…" once without re-reading the whole conversation
          every time it changes (§151).
        */}
        {status ? (
          <p className="ask-status" role="status" aria-live="polite">
            <span className="ask-status-dot" aria-hidden="true" />
            {status}
          </p>
        ) : null}
      </div>

      <WageringBar prefs={prefs} onChange={setPrefs} />

      <form
        className="ask-composer"
        onSubmit={(e) => { e.preventDefault(); void send(draft); }}
      >
        <label htmlFor="ask-input" className="ask-sr">Ask GameTime a question</label>
        <textarea
          id="ask-input"
          ref={inputRef}
          className="ask-input"
          value={draft}
          rows={1}
          placeholder="Ask about games, players, matchups, forecasts or the site…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline. Standard, and the hint says so below.
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); }
          }}
          disabled={busy}
          maxLength={2000}
        />
        {busy ? (
          <button type="button" className="ask-btn ask-btn-stop" onClick={stop}>Stop</button>
        ) : (
          <button type="submit" className="ask-btn ask-btn-send" disabled={!draft.trim()}>Ask</button>
        )}
      </form>

      <div className="ask-toolbar">
        <span className="ask-hint">Enter to send · Shift+Enter for a new line</span>
        <span className="ask-toolbar-actions">
          {messages.some((m) => m.error) ? <button type="button" className="ask-link-btn" onClick={retry}>Retry</button> : null}
          {!empty ? <button type="button" className="ask-link-btn" onClick={clear}>Clear conversation</button> : null}
        </span>
      </div>

      <p className="ask-foot">
        Ask GameTime answers from GameTimePicks&apos; own research, published forecasts and live data. It does not search the
        web and does not answer from memory. Nothing you type here is stored — reloading starts a new conversation.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────  pieces  ───────────────────────────────────── */

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="ask-empty">
      <p className="ask-empty-lead">
        Ask about games, players, matchups, forecasts, research and GameTimePicks.
      </p>
      <ul className="ask-starters">
        {STARTERS.map((s) => (
          <li key={s}>
            <button type="button" className="ask-starter" onClick={() => onPick(s)}>{s}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({ message, onFollowUp }: { message: Message; onFollowUp: (s: string) => void }) {
  const isUser = message.role === "user";
  return (
    <article className={`ask-bubble ask-bubble-${message.role}${message.error ? " ask-bubble-error" : ""}`}>
      <p className="ask-sr">{isUser ? "You said" : "Ask GameTime replied"}</p>
      <div className="ask-text">{renderMarkdown(message.text)}</div>

      {message.sources?.length ? (
        <p className="ask-sources">
          <span className="ask-sources-label">Used:</span>{" "}
          {message.sources.map((s) => SOURCE_LABEL[s] ?? s).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
        </p>
      ) : null}

      {message.links?.length ? (
        <ul className="ask-links">
          {message.links.map((l) => (
            <li key={l.id}><a className="ask-chip" href={l.href}>{l.label}</a></li>
          ))}
        </ul>
      ) : null}

      {message.followUps?.length ? (
        <ul className="ask-followups">
          {message.followUps.map((f) => (
            <li key={f}><button type="button" className="ask-followup" onClick={() => onFollowUp(f)}>{f}</button></li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/**
 * The wagering preference controls (§151).
 *
 * A real radio group, so arrow keys move between options and a screen reader announces the group name.
 * Risk is never conveyed by colour alone — each option carries its word — because a colour-only risk
 * scale is unreadable to a third of the people who most need to read it.
 */
function WageringBar({ prefs, onChange }: { prefs: Preferences; onChange: (p: Preferences) => void }) {
  const [open, setOpen] = useState(false);
  const profiles = ["LOW", "MEDIUM", "HIGH", "LONGSHOT"] as const;

  if (!open) {
    return (
      <div className="ask-prefs-closed">
        <button type="button" className="ask-link-btn" onClick={() => setOpen(true)} aria-expanded={false}>
          Set a risk style{prefs.riskProfile ? ` (currently ${title(prefs.riskProfile)})` : ""}
        </button>
      </div>
    );
  }

  return (
    <div className="ask-prefs">
      <fieldset className="ask-fieldset">
        <legend className="ask-legend">Risk style</legend>
        <div className="ask-risk-row">
          {profiles.map((p) => (
            <label key={p} className={`ask-risk${prefs.riskProfile === p ? " ask-risk-on" : ""}`}>
              <input
                type="radio"
                name="ask-risk"
                className="ask-sr"
                checked={prefs.riskProfile === p}
                onChange={() => onChange({ ...prefs, riskProfile: p })}
              />
              {title(p)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="ask-bankroll">
        <label htmlFor="ask-bankroll" className="ask-legend">Entertainment bankroll (optional)</label>
        <input
          id="ask-bankroll"
          className="ask-bankroll-input"
          type="number"
          min={1}
          max={100000}
          inputMode="decimal"
          value={prefs.entertainmentBankroll ?? ""}
          placeholder="e.g. 100"
          onChange={(e) => {
            const n = Number(e.target.value);
            // An unparseable value CLEARS the limit rather than becoming NaN — a NaN here would be
            // sent as null anyway, but clearing explicitly keeps the control and the state honest.
            onChange({ ...prefs, entertainmentBankroll: Number.isFinite(n) && n > 0 ? n : null });
          }}
        />
        <p className="ask-help-text">
          The amount you&apos;ve set aside for betting entertainment — not money needed for bills or expenses. It stays in
          this conversation and is never stored. GameTime does not calculate stake sizes.
        </p>
      </div>

      <button type="button" className="ask-link-btn" onClick={() => setOpen(false)} aria-expanded>Done</button>
    </div>
  );
}

/* ─────────────────────────────────────  helpers  ───────────────────────────────────── */

function answerMessage(payload: {
  answer: { answerMarkdown: string; links?: LinkRef[]; followUps?: string[] };
  evidence?: { sources?: string[] } | null;
  verified?: boolean;
}): Message {
  return {
    id: `a${Date.now()}`,
    role: "assistant",
    text: payload.answer.answerMarkdown,
    links: payload.answer.links ?? [],
    followUps: payload.answer.followUps ?? [],
    sources: payload.evidence?.sources ?? [],
    verified: payload.verified !== false,
  };
}

async function readStream(
  res: Response,
  handlers: {
    onStatus: (s: string | null) => void;
    onAnswer: (p: never) => void;
    onError: (p: { reason?: string }) => void;
    onEntities: (e: Entity[]) => void;
  },
) {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx).replace(/^data: /, "");
      buffer = buffer.slice(idx + 2);
      if (!raw.trim()) continue;
      let event: Record<string, unknown>;
      try { event = JSON.parse(raw); } catch { continue; }

      if (event.type === "status") handlers.onStatus(String(event.text ?? ""));
      else if (event.type === "answer") {
        handlers.onStatus(null);
        handlers.onAnswer(event as never);
        handlers.onEntities((event.entities as Entity[]) ?? []);
      } else if (event.type === "error") handlers.onError(event as { reason?: string });
      else if (event.type === "done") return;
    }
  }
}

/**
 * A DELIBERATELY SMALL MARKDOWN RENDERER.
 *
 * Paragraphs, list items, `**bold**` and `` `code` ``. That is the whole grammar. There is no link
 * syntax here on purpose: an answer's links arrive as a separate approved list and are rendered as
 * chips, so there is no code path by which text the model wrote becomes an anchor (§98, §99).
 */
function renderMarkdown(text: string) {
  const blocks = String(text ?? "").split(/\n{2,}/);
  return blocks.map((block, bi) => {
    const lines = block.split("\n");
    const isList = lines.every((l) => /^\s*[-•]\s+/.test(l)) && lines.length > 0;
    if (isList) {
      return (
        <ul key={bi} className="ask-md-list">
          {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-•]\s+/, ""))}</li>)}
        </ul>
      );
    }
    return <p key={bi} className="ask-md-p">{inline(block)}</p>;
  });
}

function inline(s: string) {
  const parts: Array<string | JSX.Element> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) parts.push(<strong key={`${m.index}b`}>{token.slice(2, -2)}</strong>);
    else parts.push(<code key={`${m.index}c`} className="ask-md-code">{token.slice(1, -1)}</code>);
    last = m.index + token.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
