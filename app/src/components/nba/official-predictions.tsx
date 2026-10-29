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
 *   elo       the Elo rating's game-winner probability (founder decision 2026-10-23, behind its switch): from the SAME
 *             lane game through the shared accessor (elo-win-probability.tsx), separately identified, with its accuracy
 *             disclosure; "Win chance" then leaves the Withheld line (team scores, ranges and prices stay withheld).
 * A missing number prints "—", never 0.
 */
import Link from "next/link";
import { COMBO_STATS, STATS } from "@/lib/sports/nba/experimental-public-lane.mjs";
import { PUBLIC_TERMS } from "@/lib/public-registry";
import { EloWinProbability, type EloCtx } from "@/components/nba/elo-win-probability";
import { eloWinProbabilityOf, ELO_WIN_PROBABILITY_LABEL } from "@/lib/sports/nba/elo-win-probability.mjs";
import { loadEloWinProbabilityContext } from "@/lib/sports/nba/elo-win-probability-context.mjs";
import NbaPropLines from "@/components/nba/nba-prop-lines";

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
/* Lane players the official pool could not project (lane `players.unavailable`, PR 1230): a state and a reason, never a number. */
type LaneUnavailable = { providerAthleteId: string; name: string | null; position?: string | null; state: string; reason: string; status?: string | null };
export type OfficialLaneGame = {
  providerEventId: string; receipt: { modelVersion: string; payloadSha256?: string }; players: { away: LaneRow[]; home: LaneRow[]; unavailable?: { away: LaneUnavailable[]; home: LaneUnavailable[] } };
  frozenAt?: string; home?: { abbr: string | null }; away?: { abbr: string | null };
  elo?: { favoured: string | null; state: string; rule?: string | null; winProbability?: { home: number; away: number; provenance: Record<string, string | null> } };
} | null;

export const OFFICIAL_PREDICTIONS_ID = "official-predictions";
/* Plain model names (founder mandate 2026-10-24); the Theater's in-panel labels say the same words
   (the Theater labels module's MODEL_PLAIN — pinned equal in official-predictions-labels.test; no path named here, so the
   research boundary in public-theater-route.test keeps this official component clear of the Theater library). */
export const OFFICIAL_MODEL_PLAIN = Object.freeze({ game: "Elo team rating", players: "GameTimePicks player model" });
/** A projection-unavailable player's reason in words (founder mandate 2026-10-24: "Projection unavailable — <reason>", never 0). */
export const UNAVAILABLE_REASON_TEXT: Readonly<Record<string, string>> = Object.freeze({
  RULED_OUT: "ruled out on the pre-tip injury report",
  BELOW_PUBLISH_CUT: "expected to play too few minutes for a published projection",
  ROOKIE: "a rookie with no NBA minutes in the data yet",
  INSUFFICIENT_HISTORY: "not enough recent NBA minutes to project (for example, a returning player)",
  NO_EXPECTED_MINUTES: "no expected minutes in the pregame record",
});
/** RULED_OUT carries the receipt's pre-cutoff status text; it is added only when it says more than "Out". */
export const unavailableReasonText = (reason: string | null | undefined, status?: string | null) => {
  const base = UNAVAILABLE_REASON_TEXT[reason ?? ""] ?? "no projection was published for this player";
  return reason === "RULED_OUT" && status && status.trim().toLowerCase() !== "out" ? `${base} (listed ${status.trim()})` : base;
};
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

export default function NbaOfficialPredictions({ official, teams, lane, finalNote, resultsHref, eloCtx }: {
  official: PbOfficial | null; teams: Teams; lane: OfficialLaneGame; finalNote: string | null; resultsHref: string; eloCtx?: EloCtx;
}) {
  const elo = eloCtx ?? loadEloWinProbabilityContext();
  return (
    <section id={OFFICIAL_PREDICTIONS_ID} tabIndex={-1} className="nbx-official" aria-labelledby={`${OFFICIAL_PREDICTIONS_ID}-h`} data-nba-official-predictions={official?.snapshotId ?? "none"}>
      <p className="nbx-kind">{PUBLIC_TERMS.OFFICIAL_FORECAST} · frozen before tip-off · the same on every page</p>
      <h2 id={`${OFFICIAL_PREDICTIONS_ID}-h`}>{OFFICIAL_PREDICTIONS_TITLE}</h2>
      {official ? <Official official={official} teams={teams} lane={lane} elo={elo} /> : (
        <p>{PUBLIC_TERMS.UNAVAILABLE}: no Official Forecast receipt for this game. Nothing on this page is an Official Forecast.</p>
      )}
      {/* Model vs. sportsbook line for this game (founder P0 2026-10-29): renders nothing while NBA_LINE_DISPLAY.public is false. */}
      {official ? <NbaPropLines eventId={official.eventId} id="nba-game-prop-lines" /> : null}
      <h3>What each part of this page is</h3>
      <ul className="nbx-legend">
        <li><b>{PUBLIC_TERMS.OFFICIAL_FORECAST}</b> — this section: frozen before tip-off. It is what GameTimePicks forecasts.</li>
        <li><b>{PUBLIC_TERMS.GAME_SIMULATION}</b> — the replay above: one possible game from the NBA possession engine. Its score and box score are not a forecast and never change this section.</li>
        <li><b>Real Result</b> — {finalNote ? <>official final: <strong>{finalNote}</strong>.</> : "the official final, recorded after the game."} <Link href={resultsHref}>NBA {PUBLIC_TERMS.HISTORICAL_RESULTS} →</Link></li>
      </ul>
    </section>
  );
}

function Official({ official, teams, lane, elo }: { official: PbOfficial; teams: Teams; lane: OfficialLaneGame; elo: EloCtx }) {
  const fav = official.favouredSide === "HOME" ? teams.home : official.favouredSide === "AWAY" ? teams.away : null;
  const combos = reconciledCombos(official, lane);
  const w = official.withheld ?? {};
  // the lane game must be THIS game and carry this panel's side, or no Elo number is printed here
  const laneSide = lane?.elo?.state === "FAVOURED" ? (lane.elo.favoured === lane.home?.abbr ? "HOME" : lane.elo.favoured === lane.away?.abbr ? "AWAY" : null) : null;
  const eloGame = lane && String(lane.providerEventId) === String(official.eventId) && laneSide === official.favouredSide ? lane : null;
  const eloShown = eloGame != null && eloWinProbabilityOf(eloGame, { enabled: elo.enabled }) != null;
  return (
    <>
      <dl className="nbx-kv">
        <dt>Favoured side</dt><dd data-nba-official-side=""><strong>{fav ? `${fav.name} (${fav.abbr})` : "Neither side"}</strong> · Elo rating</dd>
        {/* Founder mandate 2026-10-24: the models in words; the exact ids are kept, verbatim, under Technical details below. */}
        <dt>Game winner</dt><dd>{OFFICIAL_MODEL_PLAIN.game}</dd>
        <dt>Player statistics</dt><dd>{OFFICIAL_MODEL_PLAIN.players} · medians</dd>
        <dt>Frozen</dt><dd>{et(official.frozenAt)}{official.lockAt ? ` · locked at tip-off, ${et(official.lockAt)}` : ""}</dd>
        {eloShown ? <><dt>{ELO_WIN_PROBABILITY_LABEL}</dt><dd><EloWinProbability game={eloGame} ctx={elo} /> <span className="nbx-fine" data-nba-elo-wp-disclosure="">{elo.disclosure}</span></dd></> : null}
        <dt>Withheld</dt><dd>{eloShown ? "Team scores" : "Win chance, team scores"}, margin and total, player ranges, prices{w.teamScores ? <span className="sr-only"> · {w.teamScores}</span> : null}</dd>
      </dl>
      <details className="nbx-model-details" data-nba-model-details="">
        <summary style={{ minHeight: 44, lineHeight: "44px", cursor: "pointer" }}>Technical details</summary>
        <dl className="nbx-kv">
          <dt>Game winner model</dt><dd>{official.models.game ?? "—"}</dd>
          <dt>Player model</dt><dd>{official.models.players.join(", ") || "—"}</dd>
          <dt>Snapshot</dt><dd>{official.snapshotId}</dd>
        </dl>
      </details>
      {(["away", "home"] as const).map((side) => {
        const rows = official.players.filter((p) => p.team === side).sort((a, b) => (b.expectedMinutes ?? -1) - (a.expectedMinutes ?? -1));
        // only THIS game's lane list, and never a player the official rows already carry
        const shown = new Set(rows.map((p) => p.playerId));
        const none = (lane && String(lane.providerEventId) === String(official.eventId) ? lane.players.unavailable?.[side] ?? [] : []).filter((u) => !shown.has(String(u.providerAthleteId)));
        return (
          <div key={side} className="nbx-scroll" role="region" aria-label={`${teams[side].name} · ${PUBLIC_TERMS.PLAYER_STATISTICS}`} tabIndex={0}>
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
                {none.map((u) => (
                  <tr key={`u-${u.providerAthleteId}`} data-nba-projection-unavailable={u.providerAthleteId}>
                    <th scope="row">{u.name ?? u.providerAthleteId}</th>
                    <td colSpan={1 + STATS.length + COMBO_STATS.length} style={{ textAlign: "left" }}>Projection unavailable — {unavailableReasonText(u.reason, u.status)}</td>
                  </tr>
                ))}
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
