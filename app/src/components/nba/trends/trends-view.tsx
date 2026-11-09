/**
 * /trends — NBA player trends: ONE table (tonight's players) + a player drawer (trends-drawer.tsx, fetched on demand).
 * Server component; every figure comes from lib/sports/nba/trends.ts. Labels: the reference is the official
 * MODEL PROJECTION median; each cell is a count of past games — history, never a probability. Only eligible players
 * carry a number (#); not-verified and ineligible players are listed under their state, unranked.
 */
import Link from "next/link";
import PageHero from "@/components/page-hero";
import TrendsDrawer from "./trends-drawer";
import { TRENDS_HISTORY_NOTE, TRENDS_REFERENCE_LABEL, TRENDS_STATS, type NbaTrends, type TrendAvailability, type TrendRow } from "@/lib/sports/nba/trends";

export const AVAILABILITY_LABEL: Record<TrendAvailability, string> = { eligible: "Eligible", "not-verified": "Not verified", ineligible: "Ineligible" };
const GLYPH: Record<TrendAvailability, string> = { eligible: "✓", "not-verified": "?", ineligible: "✕" };

function Cell({ row, stat }: { row: TrendRow; stat: (typeof TRENDS_STATS)[number][0] }) {
  if (!row.reference) return <td className="trn-na">—</td>;
  return (
    <td data-trn-stat={stat}>
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
        sub={<>Each player&apos;s last 5, 10 and 20 games played against tonight&apos;s <b>{TRENDS_REFERENCE_LABEL}</b> median (the official forecast). {TRENDS_HISTORY_NOTE} No sportsbook lines.</>}
      />
      {!slateDate ? (
        <p className="trn-empty" data-trn-empty="">No official NBA projection is published yet. Trends return with the next slate.</p>
      ) : (
        <>
          <p className="trn-meta">
            <span className="gtp-kind-chip-lite">{TRENDS_REFERENCE_LABEL}</span> slate {slateDate}{slateIsToday ? "" : " · not tonight's slate, so no player is marked eligible"} · {trends.gamesRead} regular-season games read · <Link href="/nba/projections/">Top Boards →</Link>
          </p>
          <div className="trn-scroll" role="region" aria-label="Player trends table" tabIndex={0}>
            <table className="trn-table" id="trends-table">
              <caption className="sr-only">Player trends: tonight&apos;s MODEL PROJECTION median and how many of the last 5, 10 and 20 games played were above it</caption>
              <thead>
                <tr><th scope="col">Player</th>{TRENDS_STATS.map(([k, l]) => <th key={k} scope="col">{l}<span className="trn-th-sub">median · games above</span></th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.playerId} data-trn-player={r.playerId} data-trn-availability={r.availability}>
                    <th scope="row">
                      <a href={`#p-${r.playerId}`} className="trn-name" data-trn-open={r.playerId}>
                        {r.rank != null ? <span className="trn-rank">{r.rank}</span> : null}{r.name}
                      </a>
                      <span className="trn-sub">{r.team} vs {r.opp}</span>
                      <span className={`trn-avail is-${r.availability}`} title={r.availabilityNote}>{GLYPH[r.availability]} {AVAILABILITY_LABEL[r.availability]}</span>
                    </th>
                    {TRENDS_STATS.map(([k]) => <Cell key={k} row={r} stat={k} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="trn-fine">
            # orders eligible players by tonight&apos;s expected minutes, never by these counts. A game counts only when its official final is recorded
            and the box score agrees with it; a game a player did not play is not counted, never read as 0. Not betting advice.
          </p>
          <TrendsDrawer />
        </>
      )}
    </div>
  );
}
