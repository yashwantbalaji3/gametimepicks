/**
 * /nba/simulation/<id> — "GameTimePicks Official Predictions", rendered on the SERVER directly below the Theater
 * (NBA UI parity, founder directive 2026-10-22). It takes no run and no playback state, so it is in the HTML before
 * any script runs and nothing the reader does in the Theater can change it.
 *
 * Sources, never computed here:
 *   official  the payload's official panel (payload.mjs officialPanel — the canonical official snapshot, embedded by the
 *             generator and checked against it): favoured side, model versions, freeze and lock instants, withheld
 *             statements, and each official player's expected minutes and PTS / REB / AST / 3PM medians.
 *   combos    PRA, P+R and P+A from the SAME game's frozen lane snapshot (public/data/nba/experimental-public — the
 *             /nba/projections source): each the median of the per-draw sum over the same simulated draws, copied from
 *             the receipt, never a sum of the medians beside it. A player's combos print ONLY when the lane row
 *             reconciles with the official row (same player, same four medians); otherwise they are missing.
 *   result    the official final, only when the write-once finals record holds it.
 * A missing number prints "—", never 0.
 */
import Link from "next/link";
import { COMBO_STATS, STATS } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { PUBLIC_TERMS } from "@/lib/public-registry";

/* The official panel's shape (possession-types PbOfficial — payload.mjs officialPanel), declared here structurally so
   this official component imports nothing from the research Theater library (public-theater-route research boundary). */
type OfficialPlayer = { playerId: string; team: "home" | "away" | null; displayName: string | null; medians: Record<string, number | null>; expectedMinutes: number | null };
export type PbOfficial = {
  snapshotId: string; eventId: string; favouredSide: "HOME" | "AWAY" | null;
  models: { game: string | null; players: string[] }; frozenAt: string | null; lockAt: string | null;
  withheld: Record<string, string>; players: OfficialPlayer[];
};
type Teams = { home: { abbr: string; name: string }; away: { abbr: string; name: string } };

type LaneRow = { providerAthleteId: string; medians: Record<string, number | null>; comboMedians?: Record<string, number | null> };
export type OfficialLaneGame = { providerEventId: string; receipt: { modelVersion: string }; players: { away: LaneRow[]; home: LaneRow[] } } | null;

export const OFFICIAL_PREDICTIONS_ID = "official-predictions";
// founder directive 2026-10-23 public readiness: the registry term ("Official Forecast")
export const OFFICIAL_PREDICTIONS_TITLE = `GameTimePicks ${PUBLIC_TERMS.OFFICIAL_FORECAST}`;

/* The lane's own 1-dp rounding (experimental-public-lane.mjs r1), so this table prints exactly what Top Boards prints. */
const r1 = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const fmt = (v: number | null | undefined) => { const x = r1(v); return x == null ? "—" : x.toFixed(1); };
const et = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET" : "—";
const same = (official: number | null | undefined, lane: number | null | undefined) => { const a = r1(official); return a != null && typeof lane === "number" && Math.abs(a - lane) < 1e-9; };

/** Combos per official player id — only for lane rows whose four medians equal the official row at the lane's 1-dp rounding. */
export function reconciledCombos(official: PbOfficial, lane: OfficialLaneGame): Map<string, Record<string, number | null>> {
  const out = new Map<string, Record<string, number | null>>();
  if (!lane || String(lane.providerEventId) !== String(official.eventId) || !official.models.players.some((m) => m === lane.receipt.modelVersion || m.startsWith(`${lane.receipt.modelVersion}@`))) return out;
  const rows = new Map([...lane.players.away, ...lane.players.home].map((r) => [String(r.providerAthleteId), r]));
  for (const p of official.players) {
    const r = rows.get(p.playerId);
    if (!r?.comboMedians) continue;
    if (STATS.every(([k]) => (p.medians[k] == null && r.medians[k] == null) || same(p.medians[k], r.medians[k]))) out.set(p.playerId, r.comboMedians);
  }
  return out;
}

export default function NbaOfficialPredictions({ official, teams, lane, finalNote, resultsHref }: {
  official: PbOfficial | null; teams: Teams; lane: OfficialLaneGame; finalNote: string | null; resultsHref: string;
}) {
  return (
    <section id={OFFICIAL_PREDICTIONS_ID} tabIndex={-1} className="nbx-official" aria-labelledby={`${OFFICIAL_PREDICTIONS_ID}-h`} data-nba-official-predictions={official?.snapshotId ?? "none"}>
      <p className="nbx-kind">{PUBLIC_TERMS.OFFICIAL_FORECAST} · frozen before tip-off · the same on every page</p>
      <h2 id={`${OFFICIAL_PREDICTIONS_ID}-h`}>{OFFICIAL_PREDICTIONS_TITLE}</h2>
      {official ? <Official official={official} teams={teams} lane={lane} /> : (
        <p>{PUBLIC_TERMS.UNAVAILABLE}: no Official Forecast receipt for this game. Nothing on this page is an Official Forecast.</p>
      )}
      <h3>What each part of this page is</h3>
      <ul className="nbx-legend">
        <li><b>{PUBLIC_TERMS.OFFICIAL_FORECAST}</b> — this section: frozen before tip-off. It is what GameTimePicks forecasts.</li>
        <li><b>{PUBLIC_TERMS.GAME_SIMULATION}</b> — the replay above: one possible game from the NBA possession engine. Its score and box score are not a forecast and never change this section.</li>
        <li><b>Real Result</b> — {finalNote ? <>official final: <strong>{finalNote}</strong>.</> : "the official final, recorded after the game."} <Link href={resultsHref}>NBA {PUBLIC_TERMS.HISTORICAL_RESULTS} →</Link></li>
      </ul>
    </section>
  );
}

function Official({ official, teams, lane }: { official: PbOfficial; teams: Teams; lane: OfficialLaneGame }) {
  const fav = official.favouredSide === "HOME" ? teams.home : official.favouredSide === "AWAY" ? teams.away : null;
  const combos = reconciledCombos(official, lane);
  const w = official.withheld ?? {};
  return (
    <>
      <dl className="nbx-kv">
        <dt>Favoured side</dt><dd data-nba-official-side=""><strong>{fav ? `${fav.name} (${fav.abbr})` : "Neither side"}</strong> · Elo rating</dd>
        <dt>Models</dt><dd>{official.models.game ?? "—"} (side) · {official.models.players.join(", ") || "—"} (players)</dd>
        <dt>Frozen</dt><dd>{et(official.frozenAt)}{official.lockAt ? ` · locked at tip-off, ${et(official.lockAt)}` : ""}</dd>
        <dt>Withheld</dt><dd>Win chance, team scores, margin and total, player ranges, prices{w.teamScores ? <span className="sr-only"> · {w.teamScores}</span> : null}</dd>
      </dl>
      {(["away", "home"] as const).map((side) => {
        const rows = official.players.filter((p) => p.team === side).sort((a, b) => (b.expectedMinutes ?? -1) - (a.expectedMinutes ?? -1));
        return (
          <div key={side} className="nbx-scroll">
            <table className="nbx-ptable" data-nba-official-table={side}>
              <caption>{teams[side].name} · {PUBLIC_TERMS.PLAYER_STATISTICS}</caption>
              <thead><tr><th scope="col">Player</th><th scope="col">MIN</th>{STATS.map(([, l]) => <th key={l} scope="col">{l}</th>)}{COMBO_STATS.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
              <tbody>
                {rows.map((p) => {
                  const c = combos.get(p.playerId);
                  return (
                    <tr key={p.playerId}>
                      <th scope="row">{p.displayName ?? p.playerId}</th><td>{fmt(p.expectedMinutes)}</td>
                      {STATS.map(([k]) => <td key={k}>{fmt(p.medians[k])}</td>)}
                      {COMBO_STATS.map(([k]) => <td key={k}>{fmt(c?.[k])}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="nbx-fine">
        Medians from the frozen player simulation; MIN is expected minutes. PRA, P+R and P+A are medians of the per-draw sums over the same
        simulated draws, so they are not the sum of the medians beside them. &ldquo;—&rdquo; means the figure was not published for that player.
        Not betting recommendations.
      </p>
    </>
  );
}
