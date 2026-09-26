/**
 * P694 — OPPORTUNITY CONSERVATION FOR THE PUBLISHED NFL PLAYER BOARD.
 *
 * THE QUESTION. A player's `share` in the share-level forward forecast is his fraction of a team
 * opportunity pool: targets, carries, pass attempts. Two players cannot between them hold 184% of
 * a team's carries. So for every published team-market, Σshare over the rows a reader actually
 * sees is a physical quantity with a ceiling, and nothing in the pipeline had ever computed it.
 *
 * WHY IT DRIFTS. The forecast is produced with `shrinkK: 0` — deliberately, it is the candidate
 * the P300 second look scored — so nothing pulls a share toward zero and a departed or retired
 * player keeps his. The producer knows this and says so: "a departed player's share never fades,
 * so he stays a candidate and grades VOID." Σshare over the RAW pool measured 2.4–3.5 per
 * team-market on week 3.
 *
 * The board then applies a roster gate, which is the right fix in the right place — 52 rows dropped
 * on one event, Brandon Lloyd (last played 2014) and Mario Manningham (2013) among them. But a gate
 * removes rows; it does not reconcile what is left. Whether the survivors sum to 0.7 or 1.8 is
 * whatever the roster happens to leave behind.
 *
 * WHAT THIS MODULE DOES, AND DELIBERATELY DOES NOT DO. It MEASURES. Renormalising the survivors
 * would change every published number on every board and is a model promotion, not a bug fix; it
 * needs a preregistered bar and a founder decision, not an afternoon. So the contract here is:
 * compute the quantity, name the states, and let a threshold be set against evidence rather than
 * invented. `OVER_ALLOCATED` is a finding, not a refusal.
 *
 * UNDER-allocation is NOT symmetric with over-allocation. Σ < 1 is legitimate: the residual is the
 * unmodelled tail of a roster, exactly where a genuinely unplaced new arrival's volume belongs.
 * Σ > 1 has no such reading — it is opportunity that does not exist.
 *
 * ⚠ ONE NORMALISER, NOT TWO. The board is ESPN-keyed (WSH, LAR); the forecast is nflverse-keyed
 * (WAS, LA). The first cut of this audit joined the raw abbreviations and reported WSH and LAR as
 * NO_JOIN with 40 unjoined rows between them — a defect in the audit reported as a defect in the
 * board. `nflverseTeam` is the mapping the board itself uses, imported rather than restated,
 * because a second copy of a rule is how the two drift apart in the first place.
 */
import { nflverseTeam } from "./snap-share.mjs";

/** anytime_td carries no share column (a different model owns it); it is not a share market. */
export const SHARE_MARKETS = Object.freeze(["player_receptions", "player_reception_yds", "player_rush_yds", "player_pass_yds"]);

/** Markets that draw on the SAME team pool, so their sums are one quantity, not two. */
export const OPPORTUNITY_POOL = Object.freeze({
  player_receptions: "targets",
  player_reception_yds: "targets",
  player_rush_yds: "carries",
  player_pass_yds: "passAttempts",
});

export const CONSERVATION_STATES = Object.freeze(["CONSERVED", "OVER_ALLOCATED", "UNDER_ALLOCATED", "NO_JOIN"]);

/**
 * Σ > 1 + EPS is impossible opportunity. EPS absorbs the artifact's own 4-decimal rounding across
 * a couple of dozen rows, and nothing more — it is not a tolerance for the defect.
 */
export const EPS = 0.005;

/** Below this the pool is mostly unmodelled; reported so a collapse cannot hide behind "Σ ≤ 1 is fine". */
export const THIN_BELOW = 0.75;

export function classify(sum, joined) {
  if (!joined) return "NO_JOIN";
  if (sum > 1 + EPS) return "OVER_ALLOCATED";
  if (sum < THIN_BELOW) return "UNDER_ALLOCATED";
  return "CONSERVED";
}

/**
 * @param board   a published nfl-player-board artifact
 * @param shareOf (espnId, team, market) => number|null|undefined — the forecast's own share column
 * @returns one row per (team, pool) with the sum, the states, and the join coverage that produced it
 */
export function conservationForBoard({ board, shareOf }) {
  const byKey = new Map(); // `${team}|${pool}` → {team, pool, markets:Set, sum, joined, missed, players:[]}
  for (const p of board?.players ?? []) {
    const espnId = String(p.playerId ?? "").replace(/^nfl-athlete-/, "");
    for (const market of Object.keys(p.markets ?? {})) {
      const pool = OPPORTUNITY_POOL[market];
      if (!pool) continue;
      const key = `${p.team}|${pool}`;
      let rec = byKey.get(key);
      if (!rec) { rec = { team: p.team, pool, markets: new Set(), sum: 0, joined: 0, missed: 0, players: [] }; byKey.set(key, rec); }
      rec.markets.add(market);
      // receptions and reception_yds are ONE target share; counting both would double every WR.
      if (rec.players.some((x) => x.playerId === p.playerId)) continue;
      const share = shareOf(espnId, nflverseTeam(p.team), market);
      if (typeof share !== "number" || !Number.isFinite(share)) { rec.missed += 1; continue; }
      rec.joined += 1;
      rec.sum += share;
      rec.players.push({ playerId: p.playerId, name: p.name, share });
    }
  }
  const rows = [...byKey.values()].map((r) => ({
    team: r.team,
    pool: r.pool,
    markets: [...r.markets].sort(),
    sum: Number(r.sum.toFixed(4)),
    joined: r.joined,
    missed: r.missed,
    state: classify(r.sum, r.joined),
    /* The single biggest holder, because an over-allocation caused by one implausible row is a
       different defect from one spread over twenty. */
    largest: r.players.length ? r.players.reduce((a, b) => (b.share > a.share ? b : a)) : null,
  }));
  rows.sort((a, b) => b.sum - a.sum || a.team.localeCompare(b.team));
  return {
    providerEventId: board?.providerEventId ?? null,
    matchup: board?.matchup ?? null,
    kickoffUtc: board?.kickoffUtc ?? null,
    rows,
    worst: rows.length ? rows[0].sum : null,
    overAllocated: rows.filter((r) => r.state === "OVER_ALLOCATED").length,
  };
}

/** Slate fold. An empty slate is NO_BOARDS — a result, never a pass. */
export function foldConservation(perBoard) {
  if (!perBoard.length) return { state: "NO_BOARDS", boards: 0, teamPools: 0, overAllocated: 0, worst: null };
  const teamPools = perBoard.reduce((s, b) => s + b.rows.length, 0);
  const overAllocated = perBoard.reduce((s, b) => s + b.overAllocated, 0);
  const worst = perBoard.reduce((a, b) => (b.worst != null && (a == null || b.worst > a) ? b.worst : a), null);
  return { state: overAllocated ? "OVER_ALLOCATED" : "CONSERVED", boards: perBoard.length, teamPools, overAllocated, worst };
}
