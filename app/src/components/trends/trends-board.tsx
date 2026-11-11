/**
 * SHARED TRENDS BOARD (trends-shared, 2026-11-11) — the one Trends table for every sport: a server component fed by a
 * sport adapter's TrendsModel (lib/trends/contract.ts) and the sport's words (TrendsSpec). The NBA page renders exactly
 * what it rendered before the split (frozen in lib/sports/nba/__fixtures__/trends-nba-snapshot.json, parity-tested).
 *
 * Labels: the reference is the sport's MODEL PROJECTION; each cell is a count of past games above it — history, never a
 * probability. Only ranked players carry a number (#); everyone else is listed under their eligibility state, unranked.
 * Each player's gated lines (only authorized families, line + capture time) are written once, hidden, for the panel —
 * the only place a line is ever written: page HTML, never the drawer file, never a price.
 *
 * TWO RECORDS, NEVER MIXED (founder 2026-11-11): the table's counts are MODEL-THRESHOLD records (games above the MODEL
 * PROJECTION); a sportsbook-line record lives only in the line block (data-trn-record="line", badge SPORTSBOOK LINE) and
 * the panel's "Sportsbook line record" section. No count, filter or label ever combines the two: the 5/5 · 4/5 · 3/5
 * filter reads only the model-threshold count, with or without a line.
 */
import type React from "react";
import Link from "next/link";
import PageHero from "@/components/page-hero";
import TrendsFilters from "./trends-filters";
import TrendsPanel from "./trends-panel";
import type { TrendsAvailability, TrendsFilterSpec, TrendsModel, TrendsPanelSpec, TrendsRow } from "@/lib/trends/contract";

export const AVAILABILITY_LABEL: Record<TrendsAvailability, string> = { eligible: "Eligible", "not-verified": "Not verified", ineligible: "Ineligible" };
const GLYPH: Record<TrendsAvailability, string> = { eligible: "✓", "not-verified": "?", ineligible: "✕" };

/** A sport's words and options for the shared board. Functions and nodes stay on the server. */
export type TrendsSpec = {
  eyebrow: string;
  title: string;
  heroSub: React.ReactNode;
  emptyText: string;
  meta: (m: TrendsModel) => React.ReactNode;
  caption: string;
  stats: readonly (readonly [string, string])[];
  /** the stat header's second line ("median · games above") */
  thSub: string;
  /** the reference as printed (NBA 1 dp) */
  fmt: (v: number) => string;
  /** NFL: Opp and H/A as their own columns */
  matchupColumns: boolean;
  minutesReviewNote: string;
  lineNote: string;
  fine: React.ReactNode;
  filters: TrendsFilterSpec;
  panel: TrendsPanelSpec;
};

/** The sportsbook-line record's badge — printed on line records only, never on a model-threshold count. */
export const LINE_BADGE = "SPORTSBOOK LINE";

const etTime = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";

/** The gated lines for one player, written once into the page (hidden) for the panel. Nothing when there is no line. */
function HitBlock({ row, spec }: { row: TrendsRow; spec: TrendsSpec }) {
  if (!row.lines.length) return null;
  return (
    <div hidden data-trn-hit={row.playerId} data-trn-record="line">
      <span className="trn-badge is-line">{LINE_BADGE}</span>
      <ul className="trn-hits">
        {row.lines.map((l) => (
          <li key={l.stat}>
            <b>{spec.stats.find(([k]) => k === l.stat)![1]} at {l.line}</b>{" "}
            {l.hits.map((h) => `hit ${h.hit} of ${h.played === h.size ? h.size : `${h.played} (last ${h.size})`}`).join(" · ")}
            <span className="trn-sub">line captured {etTime(l.capturedAt)}</span>
          </li>
        ))}
      </ul>
      <p className="trn-fine">{spec.lineNote[0].toUpperCase() + spec.lineNote.slice(1)}: games above the line, not a chance to go over it.</p>
    </div>
  );
}

function Cell({ row, stat, spec }: { row: TrendsRow; stat: string; spec: TrendsSpec }) {
  if (!row.reference) return <td className="trn-na" data-trn-col={stat}>—</td>;
  return (
    <td data-trn-stat={stat} data-trn-col={stat}>
      <b className="trn-ref">{spec.fmt(row.reference[stat])}</b>
      <span className="trn-counts">
        {row.windows.map((w) => (
          <span key={w.size} title={`${w.above![stat]} of the last ${w.played} games played were above ${spec.fmt(row.reference![stat])}`}>
            L{w.size} {w.above![stat]}/{w.played}
          </span>
        ))}
      </span>
    </td>
  );
}

/** NFL's 5/5 · 4/5 · 3/5 filter: MODEL-THRESHOLD games above the projection in the first window — never a line's count. */
const h5Attrs = (r: TrendsRow, stats: TrendsSpec["stats"]) => Object.fromEntries(stats.map(([k]) => {
  // no game played → no count (never "0 of 0")
  const n = !r.windows[0]?.played ? null : r.windows[0]?.above?.[k];
  return [`data-h5-${k.toLowerCase()}`, n == null ? "" : String(n)];
}));

export default function TrendsBoard({ model, spec }: { model: TrendsModel; spec: TrendsSpec }) {
  const { rows, slateDate } = model;
  return (
    <div className="trn-root flex flex-col gap-5">
      <PageHero eyebrow={spec.eyebrow} title={spec.title} sub={spec.heroSub} />
      {!slateDate ? (
        <p className="trn-empty" data-trn-empty="">{spec.emptyText}</p>
      ) : (
        <>
          <p className="trn-meta">{spec.meta(model)}</p>
          <TrendsFilters teams={[...new Set(rows.map((r) => r.team))].sort()} positions={[...new Set(rows.map((r) => r.position).filter((x): x is string => !!x))].sort()} spec={spec.filters} />
          <div className="trn-scroll" role="region" aria-label="Player trends table" tabIndex={0}>
            <table className="trn-table" id="trends-table">
              <caption className="sr-only">{spec.caption}</caption>
              <thead>
                <tr><th scope="col">Player</th>{spec.matchupColumns ? <><th scope="col">Opp</th><th scope="col">H/A</th></> : null}{spec.stats.map(([k, l]) => <th key={k} scope="col" data-trn-col={k}>{l}<span className="trn-th-sub">{spec.thSub}</span></th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.playerId} data-trn-player={r.playerId} data-trn-availability={r.availability} data-trn-i={i} data-team={r.team} data-pos={r.position ?? ""} data-home={r.home ? "1" : "0"}
                    {...Object.fromEntries(spec.stats.map(([k]) => [`data-${k.toLowerCase()}`, r.reference?.[k] ?? ""]))}
                    {...(spec.filters.hitFilter ? h5Attrs(r, spec.stats) : {})}>
                    <th scope="row">
                      <a href={`#p-${r.playerId}`} className="trn-name" data-trn-open={r.playerId}>
                        {r.rank != null ? <span className="trn-rank">{r.rank}</span> : null}{r.name}
                      </a>
                      {spec.matchupColumns ? <span className="trn-sub">{r.team}{r.position ? ` · ${r.position}` : ""}</span> : <span className="trn-sub">{r.team} {r.home ? "vs" : "@"} {r.opp}</span>}
                      <span className={`trn-avail is-${r.availability}`} title={r.availabilityNote}>{GLYPH[r.availability]} {AVAILABILITY_LABEL[r.availability]}</span>
                      {r.minutesUnderReview ? <span className="trn-review" data-trn-minutes-review="">{spec.minutesReviewNote}</span> : null}
                      <HitBlock row={r} spec={spec} />
                    </th>
                    {spec.matchupColumns ? <><td data-trn-opp="">{r.opp}</td><td data-trn-ha="">{r.home ? "Home" : "Away"}</td></> : null}
                    {spec.stats.map(([k]) => <Cell key={k} row={r} stat={k} spec={spec} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="trn-fine">{spec.fine}</p>
          <TrendsPanel spec={spec.panel} />
        </>
      )}
    </div>
  );
}
