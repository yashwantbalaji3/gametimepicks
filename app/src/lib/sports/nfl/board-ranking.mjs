/**
 * NFL player-board RANKING — the ONE rule every top board uses (weekly boards, frozen daily Top-5).
 *
 * Two producers ranking the same per-game boards with two copies of the rule would drift, and a frozen
 * daily board that ranked differently from the weekly board a reader saw that morning would be a second
 * truth. So the rule lives here:
 *   - a confirmed-out player (participation INACTIVE) never ranks;
 *   - a player ranks in a family only when his market carries the family's metric (no zero-filling);
 *   - order is the metric, highest first. Ties are COMMON — a receptions median is a whole number, so a
 *     week's board once held ten players at "5" and which of them made a Top-10 cut depended on the order
 *     files were read. Ties now break on the precise mean (the model's own expectation), then playerId,
 *     so the order is the model's, and never the filesystem's;
 *   - a family PUBLISHES across a set of boards only when EVERY board publishes it (the weekly rule).
 * Pure: no IO.
 */

/** The board families and the metric each ranks on. */
export const BOARD_METRIC = Object.freeze({
  anytime_td: "probability",
  player_receptions: "median",
  player_rush_yds: "median",
  player_reception_yds: "median",
  player_pass_yds: "median",
});

/**
 * Every rankable player in `family` across `boards`, best first. Each entry is `{ board, player, market,
 * value }` — callers shape their own rows and apply their own maximum (a maximum, never a quota).
 * @param {Array<any>} boards  per-game player boards
 * @param {string} family
 * @param {string} metric
 */
export function rankFamily(boards, family, metric) {
  const out = [];
  for (const board of boards) {
    for (const player of board.players ?? []) {
      if (player.participation === "INACTIVE") continue; // confirmed out never ranks by default
      const market = player.markets?.[family];
      if (!market || typeof market[metric] !== "number" || !Number.isFinite(market[metric])) continue;
      out.push({ board, player, market, value: market[metric] });
    }
  }
  const mean = (m) => (typeof m.mean === "number" && Number.isFinite(m.mean) ? m.mean : -Infinity);
  return out.sort((a, b) => b.value - a.value || mean(b.market) - mean(a.market) || String(a.player.playerId).localeCompare(String(b.player.playerId)));
}

/**
 * A family's state across a set of boards: PUBLISHED only if every board publishes it; ESTIMATE only if
 * every board estimates it; otherwise WITHHELD with the reason. Carries label / basis / model through.
 * @param {Array<any>} boards
 * @param {string} key
 */
export function familyStateAcross(boards, key) {
  if (!boards.length) return null;
  const states = new Set(boards.map((b) => b.families?.[key]?.state));
  const first = boards[0].families?.[key];
  if (!first) return null;
  if (states.size === 1 && states.has("PUBLISHED")) return { label: first.label, state: "PUBLISHED", basis: first.basis, model: first.model ?? null };
  if (states.size === 1 && states.has("ESTIMATE")) return { label: first.label, state: "ESTIMATE", reason: first.reason, caveat: first.caveat, model: first.model ?? null };
  return { label: first.label, state: "WITHHELD", reason: first.reason ?? [...states].join("/"), model: first.model ?? null };
}
