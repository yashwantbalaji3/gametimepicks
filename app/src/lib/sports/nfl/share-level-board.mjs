/**
 * P300 share-level player projections on the public player board.
 *
 * The v1 player engine pulls every named player's share of team volume toward ZERO (shrinkK 0.5) and gives the
 * freed mass to nobody, so its public medians ran low (2026 Week 1: rushing-yard ranges missed high 16 times,
 * low 3). The P300 model removes that pull. It passed every bar on a disclosed 2014–2021 second look for
 * receptions, receiving yards and rushing yards, and a blind 2026 forward test grades each week's forecast,
 * committed before that week's first kickoff (scripts/research/nfl/forward-player-props-share-level.mjs).
 *
 * The board publishes THAT committed forecast — the same numbers the blind test grades — never a re-run.
 *
 * GATES ARE READ FROM RECEIPTS, never a hardcoded family list:
 *   - a market is eligible only if the second-look receipt says SECOND_LOOK_ELIGIBLE for it;
 *   - a market whose blind forward receipt reads FORWARD_BREACHED falls back to v1 the next build;
 *   - no forecast file for the week, or no game in it for this matchup → v1, unchanged.
 * With shrinkK 0 a departed player's share never fades, so forecast rows include players who left the team;
 * the board builder keeps a row only when the player is on the team's CURRENT roster (fail-closed).
 */
import { ESPN_TO_NFLVERSE_TEAM } from "./snap-share.mjs";

export const SHARE_LEVEL_MODEL_ID = "nfl-player-share-level-v1";

const toNflverse = (abbr) => ESPN_TO_NFLVERSE_TEAM[abbr] ?? abbr;
const REQUIRED_COLUMNS = ["gameId", "team", "opponent", "market", "espnId", "name", "mean", "p10", "p25", "p50", "p75", "p90"];

/** Markets the committed receipts allow the share-level model to publish. */
export function shareLevelAdoptedMarkets({ secondLook, forwardReceipt }) {
  const out = new Set();
  for (const [market, byCandidate] of Object.entries(secondLook?.verdicts ?? {})) {
    if (!Object.values(byCandidate ?? {}).includes("SECOND_LOOK_ELIGIBLE")) continue;
    if (forwardReceipt?.families?.[market]?.state === "FORWARD_BREACHED") continue;
    out.add(market);
  }
  return out;
}

/** NFL season of a kickoff: January/February games belong to the previous September's season. */
export function seasonOfKickoff(kickoffUtc) {
  const d = new Date(kickoffUtc);
  return d.getUTCMonth() < 6 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

/**
 * The forecast rows for one ESPN event, keyed to ESPN identities. Returns null (→ v1) unless the forecast is
 * for this regular-season week and exactly one of its games is this matchup.
 * `matchup` is the event artifact's "AWAY @ HOME" with ESPN abbreviations.
 */
export function shareLevelRowsForEvent({ forecast, matchup, week, seasonType, markets }) {
  if (!forecast || seasonType !== 2 || forecast.week !== week || !markets?.size) return null;
  const [away, home] = String(matchup ?? "").split(" @ ").map((s) => s.trim());
  if (!away || !home || away === home) return null;
  const col = Object.fromEntries((forecast.columns ?? []).map((c, i) => [c, i]));
  if (REQUIRED_COLUMNS.some((k) => !(k in col))) return null;
  const espnFor = new Map([[toNflverse(home), home], [toNflverse(away), away]]);
  const rows = (forecast.rows ?? []).filter((r) => espnFor.has(r[col.team]) && espnFor.has(r[col.opponent]) && r[col.team] !== r[col.opponent] && markets.has(r[col.market]));
  const gameIds = new Set(rows.map((r) => r[col.gameId]));
  if (gameIds.size !== 1) return null;
  const players = new Map();
  let withoutEspnId = 0;
  for (const r of rows) {
    const espnId = r[col.espnId];
    if (espnId == null || espnId === "") { withoutEspnId += 1; continue; }
    const team = espnFor.get(r[col.team]);
    const playerId = `nfl-athlete-${espnId}`;
    const key = `${team}|${playerId}`;
    const row = players.get(key) ?? { playerId, name: r[col.name], team, markets: {} };
    row.markets[r[col.market]] = { mean: r[col.mean], p10: r[col.p10], p25: r[col.p25], median: r[col.p50], p75: r[col.p75], p90: r[col.p90] };
    players.set(key, row);
  }
  return { gameId: [...gameIds][0], markets: new Set(rows.map((r) => r[col.market])), players: [...players.values()], withoutEspnId };
}

/** Reader-facing provenance for a share-level family — evidence tier stated, no internal paths. */
export function shareLevelBasis({ market, secondLook, forwardReceipt }) {
  const overall = Object.values(secondLook?.results?.[market] ?? {})[0]?.overall ?? null;
  const fwd = forwardReceipt?.families?.[market] ?? null;
  const blind = !fwd || fwd.state === "ACCUMULATING"
    ? `its blind 2026 record is still accumulating (${fwd?.n ?? 0} graded player-games so far)`
    : `its blind 2026 record is holding every bar (${fwd.n} graded player-games)`;
  return `Share-level model: cleared every bar when re-tested on 2014–2021${overall?.n ? ` (${overall.n.toLocaleString("en-US")} player-games)` : ""} — a second look at seasons examined once before, not a blind test. Each week's forecast is frozen before the first kickoff and graded; ${blind}.`;
}
