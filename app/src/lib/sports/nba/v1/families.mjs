/**
 * PREP · Stage 12 (NBA V1), NBA department, local only. NOT WIRED: no surface, script or workflow imports this.
 *
 * THE NBA V1 FORECAST FAMILIES, mapped onto what the frozen per-game receipt (`nba-forecast-receipt@1`, written
 * write-once before tip by nba-forecast-window / sport-schedules) already holds. Nothing here is a new model: each
 * family names the receipt field it reads and the preregistered bar that governs it
 * (docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md §5–§7). A family whose source does not exist in the receipt yet is
 * `source: null` and emits no row, ever — it is never derived after the fact.
 *
 * Family ids are new (prefix `nba_`), so a V1 row can never be confused with the retired May–June 2026
 * player-prop archive (`/results/nba`), which is a different generation and never enters these families.
 */

export const NBA_V1_FAMILY_SCHEMA = "nba-v1-families@0"; // 0 = prep

/** Ledger forecast kinds (lib/forecast-ledger/contract.mjs FORECAST_KIND values). */
const BINARY = "BINARY_PROBABILITY";
const CONTINUOUS = "CONTINUOUS_PROJECTION";

/**
 * subject: GAME | TEAM | PLAYER.  source: where in a receipt game the number lives (null = not produced yet).
 * prereg: the §7 row that governs SHADOW → PUBLIC for this family (founder-gated; this file never moves it).
 */
export const NBA_V1_FAMILIES = Object.freeze([
  { family: "nba_game_winner", subject: "GAME", kind: BINARY, source: "forecast.<head>.pHome", prereg: "Winner", boardable: false },
  { family: "nba_game_margin", subject: "GAME", kind: CONTINUOUS, source: "forecast.sim.margin", prereg: "Margin", boardable: false },
  { family: "nba_game_total", subject: "GAME", kind: CONTINUOUS, source: "forecast.sim.total", prereg: "Total", boardable: false },
  { family: "nba_team_score", subject: "TEAM", kind: CONTINUOUS, source: "forecast.sim.home|away", prereg: "Total (component)", boardable: false },
  { family: "nba_player_points", subject: "PLAYER", kind: CONTINUOUS, source: "players[].pts", stat: "pts", prereg: "Points", boardable: true },
  { family: "nba_player_rebounds", subject: "PLAYER", kind: CONTINUOUS, source: "players[].reb", stat: "reb", prereg: "Rebounds, assists", boardable: true },
  { family: "nba_player_assists", subject: "PLAYER", kind: CONTINUOUS, source: "players[].ast", stat: "ast", prereg: "Rebounds, assists", boardable: true },
  { family: "nba_player_threes", subject: "PLAYER", kind: CONTINUOUS, source: "players[].threePm", stat: "threePm", prereg: "3PM", boardable: true },
  // Combinations are JOINT draws of the simulated components (prereg §5: "PRA only as the joint combination"). The v0
  // receipt stores each component's marginal quantiles only, and the median of a sum is not the sum of medians, so
  // these families stay unproduced until the simulator freezes the joint quantiles in the receipt (slice 12-S2).
  { family: "nba_player_pra", subject: "PLAYER", kind: CONTINUOUS, source: null, stat: ["pts", "reb", "ast"], prereg: "PRA", boardable: true },
  { family: "nba_player_points_assists", subject: "PLAYER", kind: CONTINUOUS, source: null, stat: ["pts", "ast"], prereg: "none yet (needs a §7 row)", boardable: true },
  { family: "nba_player_points_rebounds", subject: "PLAYER", kind: CONTINUOUS, source: null, stat: ["pts", "reb"], prereg: "none yet (needs a §7 row)", boardable: true },
]);

export const familyById = (id) => NBA_V1_FAMILIES.find((f) => f.family === id) ?? null;
export const producedFamilies = () => NBA_V1_FAMILIES.filter((f) => f.source != null);
