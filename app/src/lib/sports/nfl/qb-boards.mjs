/**
 * NFL QB BOARDS · the five QB markets as an EXPERIMENTAL board section (row G, PD 2026-11-11). PURE: no fs, no clock.
 *
 * Fed by the QB props projections (NFL QB props v0, #1302): each upcoming game's sim-v2 receipt of record, its projected
 * QB per team (the grader's rule: largest pass-attempt median), and the five market views from the SAME simulation
 * (qb-props-markets.mjs qbMarketViews: exact run counts, never a fitted curve). Per market, the projected QBs ordered by
 * the run median (a maximum of BOARD_SIZE), each with its 80% range and the market's status — never a price, a line, a
 * pick, an edge or a confidence word. Labelled EXPERIMENTAL · MODEL PROJECTION.
 *
 * Who may appear (fail closed):
 *   R5         only a game whose official forecast of record knows its starting-QB situation (qb-props-markets r5Allows)
 *   eligibility only a QB whose official player-board row is eligibility@1 ELIGIBLE and featurable (no R6 flag); a QB
 *              with no board record is not shown
 * Behind GTP_NFL_QB_BOARDS_PUBLIC (default OFF): with the flag off the hub never imports the component.
 */
import { QB_MARKETS, QB_MARKET_STATUS, qbMarketViews, r5Allows } from "./qb-props-markets.mjs";
import { projectedQbs } from "./qb-props-grade.mjs";
import { featurable } from "../../availability/eligibility.mjs";

export const QB_BOARDS_SCHEMA = "gtp.nfl.qb-boards@1";
export const QB_BOARDS_LABEL = "EXPERIMENTAL · MODEL PROJECTION";
export const QB_BOARD_SIZE = 5;

/**
 * @param {{ records: Array<{ receipt: object }>, teamInputsFor: (eventId: string) => ({ state?: string } | null), eligibilityFor: (eventId: string, playerId: string) => object | null, size?: number }} a
 */
export function buildQbBoards({ records, teamInputsFor, eligibilityFor, size = QB_BOARD_SIZE }) {
  const excluded = { r5: 0, eligibility: 0 };
  const qbs = [];
  for (const { receipt } of [...records].sort((a, b) => String(a.receipt.eventId).localeCompare(String(b.receipt.eventId)))) {
    const id = String(receipt.eventId);
    const teams = Object.entries(projectedQbs(receipt)).sort(([a], [b]) => a.localeCompare(b));
    if (!r5Allows(teamInputsFor(id))) { excluded.r5 += teams.length; continue; }
    for (const [team, row] of teams) {
      const pid = row.playerId.startsWith("nfl-athlete-") ? row.playerId : `nfl-athlete-${row.playerId}`;
      if (!featurable(eligibilityFor(id, pid))) { excluded.eligibility += 1; continue; }
      qbs.push({ eventId: id, eventStart: receipt.eventStart ?? null, team, playerId: pid, name: row.name ?? pid, views: Object.fromEntries(qbMarketViews(row).map((v) => [v.market, v])) });
    }
  }
  const markets = QB_MARKETS.map((m) => {
    const rows = qbs
      .filter((q) => q.views[m.market]?.distribution)
      .map((q) => ({ eventId: q.eventId, eventStart: q.eventStart, team: q.team, playerId: q.playerId, name: q.name, median: q.views[m.market].distribution.p50, p10: q.views[m.market].distribution.p10, p90: q.views[m.market].distribution.p90 }))
      .sort((a, b) => b.median - a.median || b.p90 - a.p90 || a.playerId.localeCompare(b.playerId))
      .slice(0, size);
    return { market: m.market, label: m.label, status: QB_MARKET_STATUS[m.market], rows };
  });
  return { schema: QB_BOARDS_SCHEMA, label: QB_BOARDS_LABEL, size, games: records.length, quarterbacks: qbs.length, excluded, markets };
}
