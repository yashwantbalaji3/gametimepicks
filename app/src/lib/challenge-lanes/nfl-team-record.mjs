/**
 * NFL team W-L research windows from the committed final scores
 * (data/internal/platform/v1/team-game-stats/NFL/<season>.jsonl.gz, family nfl.final-score). PURE. LEVEL_B evidence:
 * W-L counts are never shown as a probability. Shrinkage toward the side's no-vig uses m = 16, which nba-engine-eval
 * fitted on NBA moneylines (9a9b7a0900), not NFL: flagged NFL_SHRINK_FROM_NBA_FIT on every leg.
 */
export const NFL_ML_SHRINK_M = 16;

/** rows: parsed jsonl rows (one per team per game). side: "home" | "away" for tonight's game. */
export function nflTeamWindows(rows, { teamId, venue, noVig = null, m = NFL_ML_SHRINK_M }) {
  const byGame = new Map(); for (const r of rows) if (r.family === "nfl.final-score" && r.isFinal) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r); }
  const games = [];
  for (const [gameId, rs] of byGame) {
    const me = rs.find((r) => r.teamId === teamId); const opp = rs.find((r) => r.teamId !== teamId);
    if (!me || !opp) continue;
    games.push({ gameId, won: me.stats.points > opp.stats.points, tie: me.stats.points === opp.stats.points, venue: me.homeAway === "HOME" ? "home" : "away" });
  }
  games.sort((a, b) => b.gameId.localeCompare(a.gameId, undefined, { numeric: true }));
  const win = (name, gs) => ({ window: name, hits: gs.filter((g) => g.won).length, n: gs.filter((g) => !g.tie).length });
  const windows = [win("last5", games.slice(0, 5)), win("last10", games.slice(0, 10)), win("season", games), win(`${venue}`, games.filter((g) => g.venue === venue))].filter((w) => w.n > 0);
  const season = windows.find((w) => w.window === "season");
  const shrunk = typeof noVig === "number" && season ? { rate: Math.round(((season.hits + m * noVig) / (season.n + m)) * 1000) / 1000, nEffective: season.n + m, method: `season W-L shrunk toward the no-vig ${noVig.toFixed(3)}, m ${m} (fitted on NBA moneylines; not an NFL fit)` } : { rate: null, nEffective: null, method: "no no-vig price to shrink toward" };
  return { windows, shrunk, games: games.length, flags: ["NFL_SHRINK_FROM_NBA_FIT"] };
}
