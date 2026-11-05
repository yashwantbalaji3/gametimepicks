/**
 * NFL player hit-rate windows at an exact line, from the committed per-game player stats
 * (data/internal/platform/v1/player-game-stats/NFL/<season>.jsonl.gz, family nfl.espn-player-lines). PURE: rows in,
 * windows out. Research evidence (LEVEL_B) only: k/n is never shown as a probability.
 *
 *   last5 / last10 / last20 (across seasons, newest first by ESPN game id) · season-<year> for each season present
 *   shrunk: beta-binomial on last20 toward the side's no-vig q with prior strength m. m = 64 was fitted on NBA props by
 *   nba-engine-eval (8e1028e26b), NOT on NFL: a disclosed limitation, flagged on every leg (NFL_SHRINK_FROM_NBA_FIT).
 * A game counts only if the player recorded the stat (a null line means he did not appear and is skipped).
 */
export const NFL_FAMILY_STAT = Object.freeze({
  receptions: (s) => s.receptions,
  reception_yds: (s) => s.receivingYards,
  rush_yds: (s) => s.rushingYards,
  pass_yds: (s) => s.passingYards,
  pass_tds: (s) => s.passingTds,
  anytime_td: (s) => (s.rushingTds == null && s.receivingTds == null ? null : (s.rushingTds ?? 0) + (s.receivingTds ?? 0)),
});
export const NFL_SHRINK_M = 64;

/** rows: parsed jsonl objects, any seasons. Returns { windows, shrunk } for one player, family, side and exact line. */
export function nflWindows(rows, { playerId, family, side, line = null, noVig = null, m = NFL_SHRINK_M, seasonOf = (r) => r.season }) {
  const stat = NFL_FAMILY_STAT[family];
  if (!stat) throw new Error(`nflWindows: unknown family ${family}`);
  const games = rows.filter((r) => r.playerId === playerId && r.family === "nfl.espn-player-lines")
    .map((r) => ({ gameId: String(r.gameId), season: seasonOf(r), v: stat(r.stats ?? {}) }))
    .filter((g) => g.v != null)
    .sort((a, b) => b.gameId.localeCompare(a.gameId, undefined, { numeric: true }));
  const hit = (v) => (family === "anytime_td" ? (side === "yes" ? v >= 1 : v === 0) : side === "over" ? v > line : v < line);
  const win = (name, gs) => ({ window: name, hits: gs.filter((g) => hit(g.v)).length, n: gs.length });
  const windows = [win("last5", games.slice(0, 5)), win("last10", games.slice(0, 10)), win("last20", games.slice(0, 20))];
  for (const s of [...new Set(games.map((g) => g.season))].filter(Boolean).sort().reverse()) windows.push(win(`season-${s}`, games.filter((g) => g.season === s)));
  const l20 = windows[2];
  const shrunk = typeof noVig === "number" && l20.n > 0
    ? { rate: Math.round(((l20.hits + m * noVig) / (l20.n + m)) * 1000) / 1000, nEffective: l20.n + m, method: `beta-binomial on last20 toward the no-vig ${noVig.toFixed(3)}, m ${m} (fitted on NBA props; not an NFL fit)` }
    : { rate: null, nEffective: null, method: "no no-vig price to shrink toward" };
  return { windows: windows.filter((w) => w.n > 0), shrunk, gamesFound: games.length, flags: ["NFL_SHRINK_FROM_NBA_FIT"] };
}
