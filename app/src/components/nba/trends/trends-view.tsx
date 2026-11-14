/**
 * /trends — NBA player trends: ONE table (tonight's players) + a player drawer (trends-drawer.tsx, fetched on demand).
 * Server component; every figure comes from lib/sports/nba/trends.ts. Labels: the reference is the official
 * MODEL PROJECTION median; each cell is a count of past games — history, never a probability. Only eligible players
 * carry a number (#); not-verified and ineligible players are listed under their state, unranked.
 * Slice 2 (2026-11-10): filters + sort (trends-filters.tsx, client, acting on these rows' data attributes), and per
 * player a HIDDEN gated-line block (`data-trn-hit`) the drawer shows — the only place a line is ever written: page HTML,
 * built from TrendRow.lines (display + direction authorized families only), never the drawer file, never a price.
 */
import Link from "next/link";
import PageHero from "@/components/page-hero";
import TrendsDrawer from "./trends-drawer";
import TrendsFilters from "./trends-filters";
import { MINUTES_REVIEW_NOTE, TRENDS_LINE_NOTE, TRENDS_HISTORY_NOTE, TRENDS_REFERENCE_LABEL, TRENDS_STATS, type NbaTrends, type TrendAvailability, type TrendRow } from "@/lib/sports/nba/trends";

export const AVAILABILITY_LABEL: Record<TrendAvailability, string> = { eligible: "Eligible", "not-verified": "Not verified", ineligible: "Ineligible" };
const GLYPH: Record<TrendAvailability, string> = { eligible: "✓", "not-verified": "?", ineligible: "✕" };

const etTime = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";

/** The gated lines for one player, written once into the page (hidden) for the drawer. Nothing when there is no line. */
function HitBlock({ row }: { row: TrendRow }) {
  if (!row.lines.length) return null;
  return (
    <div hidden data-trn-hit={row.playerId}>
      <ul className="trn-hits">
        {row.lines.map((l) => (
          <li key={l.stat}>
            <b>{TRENDS_STATS.find(([k]) => k === l.stat)![1]} at {l.line}</b>{" "}
            {l.hits.map((h) => `hit ${h.hit} of ${h.played === h.size ? h.size : `${h.played} (last ${h.size})`}`).join(" · ")}
            <span className="trn-sub">line captured {etTime(l.capturedAt)}</span>
          </li>
        ))}
      </ul>
      <p className="trn-fine">{TRENDS_LINE_NOTE[0].toUpperCase() + TRENDS_LINE_NOTE.slice(1)}: games above the line, not a chance to go over it.</p>
    </div>
  );
}

function Cell({ row, stat }: { row: TrendRow; stat: (typeof TRENDS_STATS)[number][0] }) {
  if (!row.reference) return <td className="trn-na" data-trn-col={stat}>—</td>;
  return (
    <td data-trn-stat={stat} data-trn-col={stat}>
      <b className="trn-ref">{row.reference[stat].toFixed(1)}</b>
      <span className="trn-counts">
        {row.windows.map((w) => (
          <span key={w.size} title={`${w.above![stat]} of the last ${w.played} games played were above ${row.reference![stat].toFixed(1)}`}>
            L{w.size} {w.above![stat]}/{w.played}
          </span>
        ))}
      </span>
    </td>
  );
}

export default function TrendsView({ trends }: { trends: NbaTrends }) {
  const { rows, slateDate, slateIsToday } = trends;
  return (
    <div className="trn-root flex flex-col gap-5">
      <PageHero
        eyebrow="NBA · player trends"
        title="Player trends"
        sub={<>Each player&apos;s last 5, 10 and 20 games played against tonight&apos;s <b>{TRENDS_REFERENCE_LABEL}</b> median (the official forecast). {TRENDS_HISTORY_NOTE} Tap a player for game logs.</>}
      />
      {!slateDate ? (
        <p className="trn-empty" data-trn-empty="">No official NBA projection is published yet. Trends return with the next slate.</p>
      ) : (
        <>
          <p className="trn-meta">
            <span className="gtp-kind-chip-lite">{TRENDS_REFERENCE_LABEL}</span> slate {slateDate}{slateIsToday ? "" : " · not tonight's slate, so no player is ranked"} · {trends.gamesRead} regular-season games read · <Link href="/nba/projections/">Top Boards →</Link>
          </p>
          <TrendsFilters teams={[...new Set(rows.map((r) => r.team))].sort()} positions={[...new Set(rows.map((r) => r.position).filter((x): x is string => !!x))].sort()} />
          <div className="trn-scroll" role="region" aria-label="Player trends table" tabIndex={0}>
            <table className="trn-table" id="trends-table">
              <caption className="sr-only">Player trends: tonight&apos;s MODEL PROJECTION median and how many of the last 5, 10 and 20 games played were above it</caption>
              <thead>
                <tr><th scope="col">Player</th>{TRENDS_STATS.map(([k, l]) => <th key={k} scope="col" data-trn-col={k}>{l}<span className="trn-th-sub">median · games above</span></th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.playerId} data-trn-player={r.playerId} data-trn-availability={r.availability} data-trn-i={i} data-team={r.team} data-pos={r.position ?? ""} data-home={r.home ? "1" : "0"}
                    data-pts={r.reference?.pts ?? ""} data-reb={r.reference?.reb ?? ""} data-ast={r.reference?.ast ?? ""}>
                    <th scope="row">
                      <a href={`#p-${r.playerId}`} className="trn-name" data-trn-open={r.playerId}>
                        {r.rank != null ? <span className="trn-rank">{r.rank}</span> : null}{r.name}
                      </a>
                      <span className="trn-sub">{r.team} {r.home ? "vs" : "@"} {r.opp}</span>
                      <span className={`trn-avail is-${r.availability}`} title={r.availabilityNote}>{GLYPH[r.availability]} {AVAILABILITY_LABEL[r.availability]}</span>
                      {r.minutesUnderReview ? <span className="trn-review" data-trn-minutes-review="">{MINUTES_REVIEW_NOTE}</span> : null}
                      <HitBlock row={r} />
                    </th>
                    {TRENDS_STATS.map(([k]) => <Cell key={k} row={r} stat={k} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="trn-fine">
            # orders players cleared to play (eligibility@1) by tonight&apos;s expected minutes, never by these counts; a minutes projection under review is not numbered. A game counts only when its official final is recorded
            and the box score agrees with it; a game a player did not play is not counted, never read as 0. Not betting advice.
          </p>
          <TrendsDrawer />
        </>
      )}
    </div>
  );
}
