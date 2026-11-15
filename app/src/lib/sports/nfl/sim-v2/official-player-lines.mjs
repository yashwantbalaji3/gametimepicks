/**
 * NFL SIMULATION PAGE · PLAYER LINES = THE OFFICIAL PROJECTION (ledger N14, founder rule 2026-10-20 / 11-11: one official
 * forecast for a player everywhere; a what-if simulation never presents a competing number).
 *
 * The Simulation V2 report used to print each player's SIMULATED line (median and 80% range of the shadow engine):
 * passing, rushing, receiving and touchdown-scorer tables. On production those contradicted the official player board on
 * the game page (Week 10: Burrow board 271 pass yds vs simulation 228, Goff 244 vs 222, Maye 242 vs 223). This module
 * replaces every one of them with the OFFICIAL value:
 *
 *   - each official family (passing / rushing / receiving yards, receptions, anytime TD) comes from the Theater's own
 *     Default view model (official-default.mjs nflOfficialDefault — the game page's gameView value and formatter), with
 *     the family's Estimate label when the board marks it ESTIMATE;
 *   - markets with no official projection (pass attempts, completions, passing TDs, interceptions, carries, targets,
 *     rushing / receiving TDs, 2+ TDs, first TD) get NO number;
 *   - a player or family without an official value is absent, never filled from the simulation.
 *
 * Pure: documents in, a display model out. The receipt is read only for the two team abbreviations and position tags;
 * no simulated player number is ever copied into the output.
 */
import { formatValue } from "../forecast-view.mjs";

export const OFFICIAL_PLAYER_LINES_VERSION = "nfl-sim-official-player-lines@1";
/** Official families the report prints, per table (keys of forecast-view.mjs PLAYER_FAMILIES). */
export const TABLE_FAMILIES = Object.freeze({
  passing: Object.freeze(["passingYards"]),
  rushing: Object.freeze(["rushingYards"]),
  receiving: Object.freeze(["receptions", "receivingYards"]),
  touchdowns: Object.freeze(["anytimeTd"]),
});
export const KIND = Object.freeze({ passingYards: "yards", rushingYards: "yards", receivingYards: "yards", receptions: "count", anytimeTd: "probability" });
const LIMIT = Object.freeze({ rushing: 4, receiving: 6 });

export const OFFICIAL_PLAYER_NOTE =
  "Every player number in this section is that player's official projection, exactly as the game page prints it — not a simulated line. Pass attempts, completions, passing touchdowns, interceptions, carries, targets and touchdown counts have no official projection yet, so no number is shown for them here.";
export const STARTER_UNCONFIRMED = "Starter not confirmed — no official passing projection";

const cell = (row, fam) => {
  const c = row.cells?.[fam];
  return c && Number.isFinite(c.value) ? { value: c.value, text: c.text ?? formatValue(KIND[fam], c.value), estimate: c.estimate ?? null } : null;
};

/**
 * @param {any} receipt  the Simulation V2 receipt of record (team abbreviations and position tags only)
 * @param {ReturnType<typeof import("../../../simulation-theater/official-default.mjs").nflOfficialDefault>} official
 */
export function officialPlayerLines(receipt, official) {
  const posOf = new Map((receipt?.playerStatDistributions ?? []).map((p) => [`${p.team}|${p.playerId}`, p.position ?? null]));
  const rowsOf = (abbr) => (official?.teams?.find((x) => x.abbr === abbr)?.rows ?? []).map((row) => ({
    playerId: row.playerId, name: row.name, team: abbr,
    position: row.position ?? posOf.get(`${abbr}|${row.playerId}`) ?? null,
    cells: Object.fromEntries(Object.keys(KIND).map((fam) => [fam, cell(row, fam)])),
  }));
  const table = (rows, fams, sortFam, limit) => rows
    .filter((r) => fams.some((f) => r.cells[f]))
    .map((r) => ({ ...r, cells: Object.fromEntries(fams.map((f) => [f, r.cells[f]])) }))
    .sort((a, b) => (b.cells[sortFam]?.value ?? -1) - (a.cells[sortFam]?.value ?? -1) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit ?? Infinity);
  const sides = [receipt?.away?.abbr, receipt?.home?.abbr];
  const all = sides.map((abbr) => ({ abbr, rows: rowsOf(abbr) }));
  const teams = all.map(({ abbr, rows }) => {
    const passing = table(rows, TABLE_FAMILIES.passing, "passingYards");
    return {
      abbr,
      passing,
      starterUnconfirmed: passing.length === 0,
      rushing: table(rows, TABLE_FAMILIES.rushing, "rushingYards", LIMIT.rushing),
      receiving: table(rows, TABLE_FAMILIES.receiving, "receivingYards", LIMIT.receiving),
    };
  });
  const touchdowns = table(all.flatMap((t) => t.rows), TABLE_FAMILIES.touchdowns, "anytimeTd");
  return { version: OFFICIAL_PLAYER_LINES_VERSION, available: Boolean(official), teams, touchdowns };
}
