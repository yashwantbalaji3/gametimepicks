/**
 * THE FROZEN-FORECAST JOIN (v1.1 · §11) — where an immutable prediction meets an ephemeral fact.
 *
 * This module is deliberately one-way. It reads a frozen forecast and a live envelope and returns a
 * COMPARISON; it exposes nothing that writes back. A live value cannot reach a forecast artifact
 * through this file because there is no function here that would carry it — Rule A enforced by
 * absence rather than by discipline.
 *
 * WHAT A COMPARISON IS. `BELOW | INSIDE | ABOVE` against the published p10–p90 band, and nothing
 * else. It is an arithmetic statement about two numbers that are both already public. It is NOT a
 * probability, NOT a pace projection, NOT an updated forecast, and the copy layer is forbidden from
 * implying otherwise (§4: no "on pace", no "% to hit now", no "the model changed").
 *
 * JOIN BY IDENTITY, NEVER BY NAME. NFL joins on `nfl-athlete-<espnId>`, which the player board and
 * the ESPN box score already share; MLB joins on `gamePk`. A row that will not join is dropped and
 * counted, never fuzzy-matched — §13's fail-closed rule.
 */

/** Families GameTime publishes a comparable range for. Anything absent here is never compared. */
export const COMPARABLE_NFL_MARKETS = Object.freeze([
  "player_rush_yds",
  "player_reception_yds",
  "player_receptions",
]);

/**
 * Model states a market must be in for its range to appear beside a live value.
 *
 * PUBLISHED only. An ESTIMATE (NFL passing yards), a HOLDING (NFL TD, MLB run line) or a PAUSED
 * market (MLB totals) has no range a reader should measure anything against, and putting a live
 * number next to one would read as the paused market quietly coming back.
 */
export const COMPARABLE_STATES = Object.freeze(["PUBLISHED"]);

/** BELOW | INSIDE | ABOVE — or null when either side of the comparison is missing. */
export function compareToRange(value, rangeLow, rangeHigh) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (typeof rangeLow !== "number" || !Number.isFinite(rangeLow)) return null;
  if (typeof rangeHigh !== "number" || !Number.isFinite(rangeHigh)) return null;
  if (value < rangeLow) return "BELOW";
  if (value > rangeHigh) return "ABOVE";
  return "INSIDE";
}

/** The sentence a screen reader gets. Deterministic, non-probabilistic, no "on pace". */
export function comparisonSentence({ name, market, label, value, rangeLow, rangeHigh, position }) {
  const unit = market === "player_receptions" ? "" : " yards";
  const head = `${name}: ${value}${unit} so far in this game.`;
  if (position === null) return `${head} No GameTime pregame range published for ${label.toLowerCase()}.`;
  const where =
    position === "INSIDE"
      ? "the current value is inside the pregame range"
      : position === "BELOW"
        ? "the current value is below the pregame range"
        : "the current value is above the pregame range";
  return `${head} GameTime pregame range ${rangeLow} to ${rangeHigh}; ${where}. The pregame forecast is frozen and has not changed.`;
}

/**
 * Join an NFL player board to live box-score stats.
 *
 * Returns one row per (player, comparable PUBLISHED market) for which the board has a range —
 * whether or not the player has recorded anything yet. A player with no live value yet shows a null
 * value, NOT a zero: "has not recorded a reception" and "recorded 0" are the same on a scoreboard
 * but not in a contract, and only the feed may say which.
 */
export function joinNflPlayerBoard(board, liveStats, { markets = COMPARABLE_NFL_MARKETS } = {}) {
  if (!board || !Array.isArray(board.players)) return { rows: [], unjoinedLiveRows: 0 };

  const liveByKey = new Map();
  for (const s of liveStats ?? []) {
    if (s.playerId && s.market) liveByKey.set(`${s.playerId}::${s.market}`, s);
  }

  const rows = [];
  const usedKeys = new Set();
  for (const player of board.players) {
    for (const market of markets) {
      const family = board.families?.[market];
      // A family the board did not publish, or published in a non-comparable state, contributes
      // NO row. This is the line that keeps a PAUSED or ESTIMATE market out of the live view.
      if (!family || !COMPARABLE_STATES.includes(family.state)) continue;
      const projection = player.markets?.[market];
      if (!projection) continue;
      const rangeLow = round1(projection.p10);
      const rangeHigh = round1(projection.p90);
      const key = `${player.playerId}::${market}`;
      const live = liveByKey.get(key) ?? null;
      if (live) usedKeys.add(key);
      const value = live?.value ?? null;
      rows.push({
        playerId: player.playerId,
        name: player.name,
        team: player.team,
        market,
        label: family.label ?? market,
        modelState: family.state,
        value,
        rangeLow,
        rangeHigh,
        position: compareToRange(value, rangeLow, rangeHigh),
      });
    }
  }

  // Live rows that matched no forecast row are counted, never discarded silently — the count is how
  // a reviewer notices the join degrading before a reader does.
  let unjoined = 0;
  for (const key of liveByKey.keys()) if (!usedKeys.has(key)) unjoined++;
  return { rows, unjoinedLiveRows: unjoined };
}

/**
 * The MLB frozen forecast for one gamePk, projected to the narrow shape the live module may show.
 *
 * ⚠ TOTAL RUNS IS DELIBERATELY NOT PROJECTED. MLB totals are PAUSED. The simulation artifact carries
 * `totalRuns` with a full distribution and it would be trivial to surface beside a live score — which
 * is exactly why its absence is stated here rather than left to each caller to remember. Per-team run
 * bands are the team-level simulation output the report page already publishes; a combined over/under
 * is the paused market and does not appear.
 */
export function projectMlbForecast(simGame) {
  if (!simGame || simGame.status !== "ready" || !simGame.runs) return null;
  const side = (s) =>
    s && typeof s.median === "number"
      ? { median: round1(s.median), rangeLow: round1(s.p10), rangeHigh: round1(s.p90) }
      : null;
  const home = side(simGame.runs.home);
  const away = side(simGame.runs.away);
  if (!home || !away) return null;
  return {
    gamePk: simGame.gamePk,
    generatedAt: simGame.generatedAt ?? null,
    runs: { home, away },
    winProbability: simGame.winProbability ?? null,
  };
}

function round1(x) {
  return typeof x === "number" && Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
}
