"use client";
/**
 * The /trends player panel. Opens on `#p-<playerId>` (the table's links), fetches /data/nba-trends.json once, and
 * shows that player's card — portrait and crest (the repo's existing PlayerAvatar / TeamLogo, ESPN CDN by id; initials
 * when absent), eligibility@1 state, tonight's MODEL PROJECTION medians — and his last 5 / 10 / 20 games (date,
 * opponent, home/away, minutes, PTS/REB/AST). Escape or the close button returns focus to the table. No storage.
 * LINES (slice 2): the drawer file never carries a line. The page's own hidden `[data-trn-hit=<id>]` block — written at
 * build time only for display- and direction-authorized families — is shown as is; without it: "No line shown".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrendsDrawerPayload } from "@/lib/sports/nba/trends";
import PlayerAvatar from "@/components/player-avatar";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";
import TeamLogo from "@/components/team-logo";

const DATA = "/data/nba-trends.json";
const STATS = [["pts", "PTS"], ["reb", "REB"], ["ast", "AST"]] as const;
const WINDOWS = [5, 10, 20] as const;
const STATE_LABEL = { eligible: "✓ Cleared to play", "not-verified": "? Not verified", ineligible: "✕ Not eligible" } as const;
const idFromHash = () => (typeof window === "undefined" ? null : /^#p-(\d+)$/.exec(window.location.hash)?.[1] ?? null);

export default function TrendsDrawer() {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<TrendsDrawerPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [win, setWin] = useState<number>(10);
  const [hit, setHit] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const sync = () => setId(idFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    if (!id || data || failed) return;
    fetch(DATA).then((r) => (r.ok ? r.json() : null)).then((d) => (d?.players ? setData(d) : setFailed(true))).catch(() => setFailed(true));
  }, [id, data, failed]);
  const panelRef = useRef<HTMLElement>(null);
  // the gated line block is part of the page (server HTML), never of the drawer file
  useEffect(() => { setHit(id ? document.querySelector(`[data-trn-hit="${id}"]`)?.innerHTML ?? null : null); }, [id]);

  const close = useCallback(() => {
    const was = id;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setId(null);
    if (was) document.querySelector<HTMLElement>(`[data-trn-open="${was}"]`)?.focus();
  }, [id]);
  // the shared keyboard contract: focus in (the close button), Tab contained, Escape closes, focus back to the opener
  useDialogFocus(panelRef, { onClose: close, active: Boolean(id), initialFocus: closeRef });

  if (!id) return null;
  const p = data?.players[id] ?? null;
  return (
    <div className="trn-drawer-layer" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside ref={panelRef} className="trn-drawer" role="dialog" aria-modal="true" aria-labelledby="trn-drawer-h" data-trn-drawer={id}>
        <header className="trn-drawer-head">
          <div className="trn-pcard">
            {p ? <PlayerAvatar playerId={Number(id)} playerName={p.name} team={p.team} sport="nba" size="lg" decorative /> : <span />}
            <div>
              <h2 id="trn-drawer-h">{p?.name ?? "Player"}</h2>
              {p ? (
                <p className="trn-pmeta">
                  <TeamLogo team={p.team} sport="nba" size="sm" ariaLabel="" />
                  <span>{p.team} {p.home ? "vs" : "@"} {p.opp}{p.position ? ` · ${p.position}` : ""}{p.expectedMinutes != null ? ` · ${p.expectedMinutes.toFixed(1)} expected min` : ""}{p.rank != null ? ` · #${p.rank}` : ""}</span>
                </p>
              ) : null}
            </div>
          </div>
          <button ref={closeRef} type="button" className="trn-close" onClick={close} aria-label="Close player trends">✕</button>
        </header>
        {!p ? (
          <p className="trn-fine">{failed ? "Trends could not be loaded. Close and try again." : "Loading…"}</p>
        ) : (
          <>
            <p className={`trn-avail is-${p.availability}`} data-trn-panel-state={p.availability}>{STATE_LABEL[p.availability]}</p>
            <p className="trn-fine">{p.availabilityNote}{p.minutesUnderReview ? " · minutes projection under review" : ""}</p>
            <h3 className="trn-section-h"><span className="gtp-kind-chip-lite">MODEL PROJECTION</span> tonight · median</h3>
            {p.reference ? (
              <div className="trn-refs">{STATS.map(([k, l]) => <div key={k}><b>{p.reference![k].toFixed(1)}</b><span>{l}</span></div>)}</div>
            ) : <p className="trn-fine">No official projection tonight, so no reference is shown.</p>}
            <h3 className="trn-section-h">Line record</h3>
            {hit ? <div data-trn-hit-shown="" dangerouslySetInnerHTML={{ __html: hit }} /> : <p className="trn-fine" data-trn-no-line="">No line shown.</p>}
            <h3 className="trn-section-h">Game log</h3>
            <div className="trn-win" role="group" aria-label="Games shown">
              {WINDOWS.map((w) => <button key={w} type="button" aria-pressed={win === w} onClick={() => setWin(w)}>L{w}</button>)}
            </div>
            {p.games.length ? (
              <div className="trn-scroll" role="region" aria-label={`${p.name}: last ${Math.min(win, p.games.length)} games`} tabIndex={0}>
                <table className="trn-games">
                  <thead><tr><th scope="col">Date</th><th scope="col">Opp</th><th scope="col">MIN</th>{STATS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
                  <tbody>
                    {p.games.slice(0, win).map((g) => (
                      <tr key={g.eventId}>
                        <td>{g.dateEt.slice(5)}</td><td>{g.home ? "vs" : "@"} {g.opp}</td><td>{g.minutes}</td>
                        {STATS.map(([k]) => {
                          const up = p.reference ? g[k] > p.reference[k] : null;
                          return <td key={k} className={up ? "is-above" : undefined}>{g[k]}{up ? <span aria-label="above the median"> ▲</span> : null}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="trn-fine">No regular-season game played yet this season.</p>}
            <p className="trn-fine">{p.reference ? "▲ marks a game above tonight's median. " : ""}{data!.note}</p>
          </>
        )}
      </aside>
    </div>
  );
}
