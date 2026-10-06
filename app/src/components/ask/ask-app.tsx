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

import { askPrefillFromSearch } from "@/lib/ask/prefill.mjs";
import { ASK_STARTER_GROUPS } from "@/lib/ask/prompts.mjs";

import { AssistantAnswer, renderMarkdown, type AnswerDisplay } from "./ask-answer";

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
  display?: AnswerDisplay | null;
}

interface Preferences {
  riskProfile: "LOW" | "MEDIUM" | "HIGH" | "LONGSHOT" | null;
  entertainmentBankroll: number | null;
}

const ENDPOINT = "/api/ask/";

/* STARTERS ARE PROMISES (Session 2) — and follow-ups now come from the same verified list (lib/ask/prompts.mjs). */
const STARTER_GROUPS = ASK_STARTER_GROUPS;

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

  /* `/ask/?q=…` types the question in for the reader; it is never sent until they press Ask (lib/ask/prefill.mjs). */
  useEffect(() => {
    const q = askPrefillFromSearch(window.location.search);
    if (!q) return;
    setDraft(q);
    inputRef.current?.focus();
  }, []);

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

  /*
   * EMPTY: THE COMPOSER COMES FIRST (Session 2). At 390px the old empty state put a repeated intro line and six
   * tall starter chips above the input, so a first-time reader on a phone had to scroll to find where to type.
   * Before the first question the composer leads and the starters sit under it; once a conversation exists the
   * usual chat order (log, then composer) returns.
   */
  const composer = (
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
        placeholder="Ask GameTime anything…"
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
  );

  return (
    <div className="ask-app">
      {empty ? composer : null}
      <div
        ref={logRef}
        className={`ask-log${empty ? " ask-log-empty" : ""}`}
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

      {empty ? null : composer}

      <WageringBar prefs={prefs} onChange={setPrefs} />

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
      <p className="ask-empty-lead">Try asking</p>
      <div className="ask-starter-groups">
        {STARTER_GROUPS.map((g) => (
          <section key={g.label} className="ask-starter-group" aria-label={g.label}>
            <h2 className="ask-starter-label">{g.label}</h2>
            <ul className="ask-starters">
              {g.prompts.map((s) => (
                <li key={s}>
                  <button type="button" className="ask-starter" onClick={() => onPick(s)}>{s}</button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Bubble({ message, onFollowUp }: { message: Message; onFollowUp: (s: string) => void }) {
  const isUser = message.role === "user";
  return (
    <article className={`ask-bubble ask-bubble-${message.role}${message.error ? " ask-bubble-error" : ""}`}>
      <p className="ask-sr">{isUser ? "You said" : "Ask GameTime replied"}</p>
      {isUser || message.error
        ? <div className="ask-text">{renderMarkdown(message.text)}</div>
        : <AssistantAnswer message={message} onFollowUp={onFollowUp} />}
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
  display?: AnswerDisplay | null;
}): Message {
  return {
    id: `a${Date.now()}`,
    role: "assistant",
    text: payload.answer.answerMarkdown,
    links: payload.answer.links ?? [],
    followUps: payload.answer.followUps ?? [],
    sources: payload.evidence?.sources ?? [],
    verified: payload.verified !== false,
    display: payload.display ?? null,
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

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
