/**
 * A SETTLED GAME'S RECORD for one player — shared by the Trends panel (client) and the NFL game page (server); pure markup,
 * no hooks, no I/O. Three columns, each its owner's: the MODEL PROJECTION (frozen pregame), the FINAL · settled actual,
 * and the grade row ("graded" + its window, once the ledger holds it). Above them the "graded against" line (#1314), or
 * on a HOLD game "not graded: served version not verified" and no grade at all. Each market's status reads
 * "under forward evaluation · n/300"; a verdict appears only after the single look — never a score or a comparison word.
 */
import GameStateTag from "@/components/game/game-state-tag";
import type { TrendsResult } from "@/lib/trends/contract";

const ET = (iso: string) => new Date(Date.parse(String(iso).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"))).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
const fmt = (v: number | null) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function TrendsResultCard({ r, heading = true }: { r: TrendsResult; heading?: boolean }) {
  const q = r.qb;
  return (
    <section className="trn-result" data-qb-result={r.eventId} data-qb-result-state={r.state}>
      {heading ? <p className="trn-result-h">{q.name} · {q.team} {q.home ? "vs" : "@"} {q.opp} · {ET(r.kickoffUtc)}</p> : null}
      {r.holdText ? <p className="trn-hold" data-qb-hold="">{r.holdText}</p>
        : r.gradedAgainst ? <p className="trn-fine" data-qb-graded-against="">{r.gradedAgainst}</p>
        : <p className="trn-fine">not graded yet</p>}
      <div className="trn-scroll" role="region" aria-label={`${q.name}: frozen projection, final and grade`} tabIndex={0}>
        <table className="trn-games trn-results">
          <thead>
            <tr>
              <th scope="col">Market</th>
              <th scope="col"><span className="gtp-kind-chip-lite">MODEL PROJECTION</span><span className="trn-th-sub">frozen pregame</span></th>
              <th scope="col"><GameStateTag state="final" /></th>
              <th scope="col">Grade</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {q.markets.map((m) => (
              <tr key={m.market} data-qb-market={m.market}>
                <th scope="row">{m.label}</th>
                <td>{fmt(m.projection)}</td>
                <td>{q.final ? fmt(m.actual) : <span className="trn-sub">final not recorded yet</span>}</td>
                <td data-qb-grade="">{r.holdText ? "—" : m.grade ? `graded · ${m.grade.window}` : "not graded yet"}</td>
                <td data-qb-status="">{m.status}{m.verdict ? ` · ${m.verdict}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="trn-fine">Projection frozen {ET(q.projectedAt)}, before kickoff. A grade row records the game for the forward evaluation, which decides once, after 300 graded rows. Not a pick.</p>
    </section>
  );
}
