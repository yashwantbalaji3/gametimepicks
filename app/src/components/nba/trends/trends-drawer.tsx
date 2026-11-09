"use client";
/**
 * The /trends player drawer. Opens on `#p-<playerId>` (the table's links), fetches /data/nba-trends.json once, and
 * shows that player's last 20 games with tonight's MODEL PROJECTION median. Escape or the close button returns focus
 * to the table. No storage, no third-party call.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TrendsDrawerPayload } from "@/lib/sports/nba/trends";

const DATA = "/data/nba-trends.json";
const STATS = [["pts", "PTS"], ["reb", "REB"], ["ast", "AST"]] as const;
const idFromHash = () => (typeof window === "undefined" ? null : /^#p-(\d+)$/.exec(window.location.hash)?.[1] ?? null);

export default function TrendsDrawer() {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<TrendsDrawerPayload | null>(null);
  const [failed, setFailed] = useState(false);
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
  useEffect(() => { if (id) closeRef.current?.focus(); }, [id]);

  const close = useCallback(() => {
    const was = id;
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setId(null);
    if (was) document.querySelector<HTMLElement>(`[data-trn-open="${was}"]`)?.focus();
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, close]);

  if (!id) return null;
  const p = data?.players[id] ?? null;
  return (
    <div className="trn-drawer-layer" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <aside className="trn-drawer" role="dialog" aria-modal="true" aria-labelledby="trn-drawer-h" data-trn-drawer={id}>
        <header className="trn-drawer-head">
          <div>
            <h2 id="trn-drawer-h">{p?.name ?? "Player"}</h2>
            {p ? <p className="trn-sub">{p.team} {p.home ? "vs" : "@"} {p.opp} · {p.availabilityNote}</p> : null}
          </div>
          <button ref={closeRef} type="button" className="trn-close" onClick={close} aria-label="Close player trends">✕</button>
        </header>
        {!p ? (
          <p className="trn-fine">{failed ? "Trends could not be loaded. Close and try again." : "Loading…"}</p>
        ) : (
          <>
            <p className="trn-fine">
              {p.reference ? <>Tonight&apos;s MODEL PROJECTION medians: {STATS.map(([k, l]) => `${l} ${p.reference![k].toFixed(1)}`).join(" · ")}. ▲ marks a game above the median. </> : "No official projection tonight, so no reference is shown. "}
              {data!.note}
            </p>
            {p.games.length ? (
              <div className="trn-scroll" role="region" aria-label={`${p.name}: last ${p.games.length} games`} tabIndex={0}>
                <table className="trn-games">
                  <thead><tr><th scope="col">Date</th><th scope="col">Opp</th><th scope="col">MIN</th>{STATS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
                  <tbody>
                    {p.games.map((g) => (
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
          </>
        )}
      </aside>
    </div>
  );
}
