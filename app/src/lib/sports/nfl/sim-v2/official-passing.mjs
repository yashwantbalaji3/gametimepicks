/**
 * NFL SIMULATION PAGE · QUARTERBACK PASSING ROWS = THE OFFICIAL PROJECTION (ledger N14, founder rule 2026-10-20 / 11-11:
 * one official forecast for a player everywhere; a what-if simulation never presents a competing number).
 *
 * The Simulation V2 report used to print each passer's SIMULATED attempts, completions, yards, TD and INT (median and
 * 80% range of the shadow engine). On production those contradicted the official player board on the game page
 * (Week 10: Burrow board 271 vs simulation 228, Goff 244 vs 222, Maye 242 vs 223). This module replaces them:
 *
 *   - passing yards: the player's OFFICIAL value, taken from the Theater's own Default view model
 *     (official-default.mjs nflOfficialDefault — the game page's gameView value and formatter), with the family's
 *     Estimate label when the board marks it ESTIMATE;
 *   - attempts, completions, passing TDs, interceptions: no official projection is published (GTP_NFL_QB_PROPS_PUBLIC
 *     is a separate, default-OFF research section), so this model carries NO number for them;
 *   - a passer the simulation names but the official board does not project is listed by name only.
 *
 * Pure: documents in, a display model out. No simulated passing number is ever copied into the output.
 */
import { formatValue } from "../forecast-view.mjs";

export const OFFICIAL_PASSING_VERSION = "nfl-sim-official-passing@1";
/** QB markets the official board does not publish — never printed as a number on the simulation page. */
export const UNPUBLISHED_QB_MARKETS = Object.freeze(["passAtt", "cmp", "passTd", "int"]);
export const OFFICIAL_PASSING_NOTE =
  "Passing yards are each quarterback's official projection, exactly as the game page prints it. Pass attempts, completions, passing touchdowns and interceptions have no official projection yet, so no number is shown for them here.";

const simPassers = (receipt, abbr) =>
  (receipt?.playerStatDistributions ?? [])
    .filter((p) => p.playerId !== "OTHER" && p.team === abbr && p.stats?.passYds && (p.stats.passYds.p50 ?? 0) > 0);

/**
 * @param {any} receipt  the Simulation V2 receipt of record (only names / ids of its passers are read)
 * @param {ReturnType<typeof import("../../../simulation-theater/official-default.mjs").nflOfficialDefault>} official
 * @returns {{ version: string, available: boolean, teams: Array<{ abbr: string,
 *   rows: Array<{ playerId: string, name: string, position: string|null, passYds: { value: number, text: string, estimate: string|null } }>,
 *   unprojected: Array<{ playerId: string, name: string }> }> }}
 */
export function officialPassingRows(receipt, official) {
  const sides = [receipt?.away?.abbr, receipt?.home?.abbr];
  const teams = sides.map((abbr) => {
    const t = official?.teams?.find((x) => x.abbr === abbr) ?? null;
    // presentation only: the position tag falls back to the receipt's roster position (never a number)
    const simPos = new Map((receipt?.playerStatDistributions ?? []).filter((p) => p.team === abbr).map((p) => [p.playerId, p.position ?? null]));
    const rows = (t?.rows ?? [])
      .filter((row) => row.cells?.passingYards && Number.isFinite(row.cells.passingYards.value))
      .map((row) => {
        const c = row.cells.passingYards;
        return { playerId: row.playerId, name: row.name, position: row.position ?? simPos.get(row.playerId) ?? null, passYds: { value: c.value, text: c.text ?? formatValue("yards", c.value), estimate: c.estimate ?? null } };
      })
      .sort((a, b) => b.passYds.value - a.passYds.value || String(a.name).localeCompare(String(b.name)));
    const have = new Set(rows.map((r) => r.playerId));
    const unprojected = simPassers(receipt, abbr).filter((p) => !have.has(p.playerId)).map((p) => ({ playerId: p.playerId, name: p.name }));
    return { abbr, rows, unprojected };
  });
  return { version: OFFICIAL_PASSING_VERSION, available: Boolean(official), teams };
}
