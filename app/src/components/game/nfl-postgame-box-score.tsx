/**
 * "What happened" — the played game's official box score on a settled NFL game page (gap 5, 2026-10-23).
 *
 * Server component, no client state. The quarter-by-quarter line, then each team's official player lines, with the
 * graded Official Forecast under the actual wherever both exist ("Official Forecast 84 (31–159)"). The forecast rows
 * are the reconciliation's own — the numbers and the in/out-of-range result /results/nfl grades — never recomputed.
 * Missing is "—", never 0. Styled by class so ~40 rows do not repeat their style per cell.
 */
import Link from "next/link";

import { STAT_COLUMNS, type BoxPlayer, type BoxTeam, type NflPostgame } from "@/lib/sports/nfl/postgame-box-score";

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const range = (f: { median: number | null; low: number; high: number }) => `${f.median != null ? num(f.median) : "—"} (${num(f.low)}–${num(f.high)})`;
const fmtDate = (iso: string | null) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
};

function Cell({ p, k }: { p: BoxPlayer; k: (typeof STAT_COLUMNS)[number]["key"] }) {
  const f = p.forecast[k];
  return (
    <td>
      <span className="pg-actual">{p.line ? num(p.line[k]) : "—"}</span>
      {f ? (
        <span className="pg-fc">
          Forecast {range(f)}
          {f.outcome === "HIT" ? <span className="pg-in"> · in range</span> : f.outcome === "MISS" ? <span className="pg-out"> · outside range</span> : null}
        </span>
      ) : null}
    </td>
  );
}

function TeamTable({ t }: { t: BoxTeam }) {
  return (
    <div className="pg-team">
      <h3 className="pg-h3">{t.name} <span className="pg-mute">· {t.final}</span></h3>
      <div className="pg-scroll" role="region" aria-label={`${t.name} player lines`} tabIndex={0}>
        <table className="pg-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {STAT_COLUMNS.map((c) => <th key={c.key} scope="col" title={c.label}>{c.short}</th>)}
              <th scope="col">TD</th>
            </tr>
          </thead>
          <tbody>
            {t.players.map((p) => (
              <tr key={p.name}>
                <th scope="row">{p.name}{p.line ? null : <span className="pg-fc">No line in the official box score</span>}</th>
                {STAT_COLUMNS.map((c) => <Cell key={c.key} p={p} k={c.key} />)}
                <td>
                  <span className="pg-actual">{p.line ? (p.scored ? "Yes" : "No") : "—"}</span>
                  {p.td ? <span className="pg-fc">Forecast {(p.td.probability * 100).toFixed(1)}%</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Player lines added up</th>
              {STAT_COLUMNS.map((c) => <td key={c.key}><span className="pg-actual">{num(t.totals[c.key])}</span></td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {t.quiet ? <p className="pg-note">{t.quiet} other {t.name} player{t.quiet === 1 ? "" : "s"} appear in the official box score with no passing, rushing or receiving line.</p> : null}
    </div>
  );
}

export default function NflPostgameBoxScore({ box }: { box: NflPostgame }) {
  const quarters = Math.max(box.away.periods?.length ?? 0, box.home.periods?.length ?? 0);
  const captured = fmtDate(box.capturedAt);
  return (
    <section id="what-happened" className="pg" aria-labelledby="pg-h">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p className="pg-eyebrow">What happened · official box score</p>
      <h2 id="pg-h" className="pg-h2">
        {`Final: ${box.away.abbr} ${box.away.final} – ${box.home.final} ${box.home.abbr}${box.overtime ? " (OT)" : ""}`}
      </h2>
      <p className="pg-sub">
        The played game&apos;s official lines{captured ? `, recorded ${captured}` : ""}, the same lines the forecasts on this page were graded against.
        {box.forecastPlayers ? <> Under each actual is the Official Forecast published before kickoff, with its 80% range.</> : <> No player forecast was graded for this game.</>}
      </p>
      {quarters ? (
        <div className="pg-scroll" role="region" aria-label="Score by quarter" tabIndex={0}>
          <table className="pg-table pg-lines">
            <thead>
              <tr>
                <th scope="col">Team</th>
                {Array.from({ length: quarters }, (_, i) => <th key={i} scope="col">{i < 4 ? `Q${i + 1}` : quarters > 5 ? `OT${i - 3}` : "OT"}</th>)}
                <th scope="col">Final</th>
              </tr>
            </thead>
            <tbody>
              {[box.away, box.home].map((t) => (
                <tr key={t.abbr}>
                  <th scope="row">{t.abbr}</th>
                  {Array.from({ length: quarters }, (_, i) => <td key={i}>{t.periods?.[i] ?? "—"}</td>)}
                  <td><strong>{t.final}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <TeamTable t={box.away} />
      <TeamTable t={box.home} />
      <p className="pg-note">
        Shown: the passing, rushing and receiving lines and touchdowns GameTimePicks records; defensive and kicking statistics are not recorded here. &ldquo;Player lines added up&rdquo; sums the players&apos; lines, so team passing yards are before sack yardage. TD means a rushing, receiving, return or recovery touchdown; a thrown one does not count. &ldquo;—&rdquo; means the player has no line in the official box score.
        {box.weekLabel ? <> Every graded forecast for {box.weekLabel} is on <Link href="/results/nfl/">the NFL week report</Link>.</> : null}
      </p>
    </section>
  );
}

const CSS = `
.pg{margin-top:26px}
.pg-eyebrow{margin:0;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--vault-gold)}
.pg-h2{margin:6px 0 0;font-size:20px;font-weight:750;color:var(--vault-text)}
.pg-h3{margin:18px 0 6px;font-size:15px;font-weight:700;color:var(--vault-text)}
.pg-sub{margin:6px 0 0;font-size:12.5px;line-height:1.6;color:var(--vault-text-mute);max-width:720px}
.pg-mute{color:var(--vault-text-faint);font-weight:500}
.pg-scroll{overflow-x:auto;margin-top:10px;max-width:100%}
.pg-table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
.pg-table th,.pg-table td{padding:6px 8px;border-top:1px solid var(--vault-border);text-align:right;vertical-align:top;white-space:nowrap}
.pg-table th[scope=row],.pg-table thead th:first-child{text-align:left;white-space:normal;min-width:120px;font-weight:600;color:var(--vault-text)}
.pg-table thead th{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);font-weight:500;border-top:0}
.pg-table tfoot th,.pg-table tfoot td{color:var(--vault-text-mute);font-weight:500}
.pg-lines{max-width:520px}
.pg-actual{display:block;font-size:13.5px;font-weight:700;color:var(--vault-text);font-family:var(--font-mono,monospace)}
.pg-fc{display:block;font-size:10.5px;font-weight:400;color:var(--vault-text-faint)}
.pg-in{color:var(--gtp-success-on-dark)}
.pg-out{color:var(--vault-text-mute)}
.pg-note{margin:10px 0 0;font-size:11.5px;line-height:1.55;color:var(--vault-text-faint);max-width:760px}
.pg-note a{color:var(--vault-gold-bright);text-decoration:underline}
`;
