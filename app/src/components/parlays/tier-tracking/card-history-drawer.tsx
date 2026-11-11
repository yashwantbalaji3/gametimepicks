"use client";
/**
 * The per-card history drawer (Parlay Lab tier performance, 2026-11-11). Opens on `#card-<id>`, fetches
 * /data/parlay-card-history.json once, and shows the card exactly as frozen: each leg's game (crests where the repo has
 * them), the pick, the frozen forecast version (model + stamp), the eligibility recorded at freeze, and the leg's official
 * outcome — then the card's result. No price, payout or odds exists in the file. Shared keyboard contract (useDialogFocus).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import TeamLogo from "@/components/team-logo";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";
import { etStamp } from "@/lib/et-stamp.mjs";

type Leg = { sport: string; eventId: string; eventLabel: string | null; startUtc: string | null; selection: string | null; forecast: { modelId: string | null; stampedAt: string | null }; eligibility: { state: string | null; contractVersion: string | null } | null; outcome: string; final: string | null };
type Card = { id: string; productDay: string; tierLabel: string; label: string | null; status: string; shownAt: string | null; source: string | null; revisionOf: string | null; gradedAt: string | null; legs: Leg[] };
type Payload = { schema: string; cards: Record<string, Card> };

const DATA = "/data/parlay-card-history.json";
const idFromHash = () => (typeof window === "undefined" ? null : /^#card-([0-9a-f]{8,})$/.exec(window.location.hash)?.[1] ?? null);
// etStamp: formatToParts values with ASCII joins (Intl's own date-time joiner differs by engine — WebKit writes " at ")
const ET = (iso: string | null) => (iso ? etStamp(iso.replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z")) ?? "—" : "—");
const WORD: Record<string, string> = { WON: "Won", LOST: "Lost", VOID: "Void", PENDING: "Pending" };
const ELIG: Record<string, string> = { ELIGIBLE: "cleared to play", INELIGIBLE: "not eligible to play", UNKNOWN: "availability not confirmed" };
const crestSport = (s: string) => (s === "nba" || s === "nfl" ? s : null);

function Crests({ leg }: { leg: Leg }) {
  const sport = crestSport(leg.sport);
  const sides = /^(.+?) @ (.+)$/.exec(leg.eventLabel ?? "");
  if (!sport || !sides) return null;
  return <span className="ptt-crests"><TeamLogo team={sides[1]} sport={sport} size="sm" ariaLabel="" /><TeamLogo team={sides[2]} sport={sport} size="sm" ariaLabel="" /></span>;
}

export default function CardHistoryDrawer() {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const sync = () => setId(idFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!id || data || failed) return;
    fetch(DATA).then((r) => (r.ok ? r.json() : null)).then((d) => (d?.cards ? setData(d) : setFailed(true))).catch(() => setFailed(true));
  }, [id, data, failed]);
  const close = useCallback(() => {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setId(null);
  }, []);
  useDialogFocus(panelRef, { onClose: close, active: Boolean(id), initialFocus: closeRef });

  if (!id) return null;
  const c = data?.cards[id] ?? null;
  return (
    <div className="ptt-drawer-layer" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside ref={panelRef} className="ptt-drawer" role="dialog" aria-modal="true" aria-labelledby="ptt-drawer-h" data-ptt-drawer={id}>
        <header className="ptt-drawer-head">
          <div>
            <h2 id="ptt-drawer-h">{c ? `${c.tierLabel} card · ${c.productDay}` : "Card history"}</h2>
            {c ? <p className="ptt-sub">{c.label ?? ""} · <span className={`ptt-status is-${c.status.toLowerCase()}`}>{WORD[c.status] ?? c.status}</span></p> : null}
          </div>
          <button ref={closeRef} type="button" className="ptt-close" onClick={close} aria-label="Close card history">✕</button>
        </header>
        {!c ? <p className="ptt-note">{failed ? "The card history could not be loaded. Close and try again." : "Loading…"}</p> : (
          <>
            <p className="ptt-note">Frozen and shown {ET(c.shownAt)}{c.source ? ` by ${c.source}` : ""}{c.revisionOf ? ` · a later revision of card ${c.revisionOf}` : ""}{c.gradedAt ? ` · graded ${ET(c.gradedAt)}` : " · not graded yet"}.</p>
            <ol className="ptt-legs">
              {c.legs.map((l) => (
                <li key={`${l.sport}-${l.eventId}`} className="ptt-leg" data-ptt-leg={l.eventId}>
                  <p className="ptt-leg-h"><Crests leg={l} /><b>{l.eventLabel ?? l.eventId}</b> <span className="ptt-sub">{l.sport.toUpperCase()} · {ET(l.startUtc)}</span></p>
                  <p>Pick: {l.selection ?? "—"}</p>
                  <p className="ptt-sub">Frozen forecast: {l.forecast.modelId ?? "model not recorded"}{l.forecast.stampedAt ? `, stamped ${ET(l.forecast.stampedAt)}` : ""}</p>
                  <p className="ptt-sub">Eligibility at freeze: {l.eligibility?.state ? `${ELIG[l.eligibility.state] ?? l.eligibility.state} (${l.eligibility.contractVersion ?? "eligibility@1"})` : "not recorded (frozen before eligibility@1 was recorded on legs)"}</p>
                  <p>Outcome: <span className={`ptt-status is-${l.outcome.toLowerCase()}`}>{WORD[l.outcome] ?? l.outcome}</span>{l.final ? <span className="ptt-sub"> · {l.final}</span> : null}</p>
                </li>
              ))}
            </ol>
            <p className="ptt-note">Paper suggestion: no price, stake or payout was ever attached to this card, so returns are not tracked.</p>
          </>
        )}
      </aside>
    </div>
  );
}
