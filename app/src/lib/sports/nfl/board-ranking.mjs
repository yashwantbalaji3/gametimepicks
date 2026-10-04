/**
 * NFL player-board RANKING — the ONE rule every top board uses (weekly boards, frozen daily Top-5).
 *
 * Session 11 (founder policy, 2026-10-04): ONLY A CLEARLY AVAILABLE PLAYER RANKS. The weekly Receiving
 * Top 10 ranked Zay Flowers #2 while he was listed Questionable — the rule below excluded INACTIVE only,
 * so every softer designation (Questionable, Doubtful → QUESTIONABLE on the board) and every state the
 * vocabulary does not know ranked as if healthy. The gate is now an ALLOWLIST applied BEFORE ranking
 * (so a blocked player is replaced by the next valid row, never leaves a hole), and it fails closed
 * when the board's availability read is missing or stale. Availability ≠ ROLE_CONFIRMED ≠ product
 * eligibility: a cleared player may rank on a model board and still be no product leg.
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

/**
 * Board participation states that are CLEARED to rank on a public top board: no published designation.
 * AVAILABLE_ROLE_UNCERTAIN is the model's own role caveat (no source confirms roles), not an injury fact.
 * Everything else — QUESTIONABLE (incl. Doubtful), INACTIVE (Out / IR / suspension), any unknown or
 * missing string — is blocked. An allowlist, so a new state is blocked until someone decides otherwise.
 */
export const PUBLIC_BOARD_CLEARED = Object.freeze(["AVAILABLE_ROLE_UNCERTAIN", "ACTIVE_PROJECTED"]);
/** The injuries feed's own freshness policy (season-context.mjs: injuries 24 h). */
export const AVAILABILITY_MAX_AGE_MS = 24 * 3600 * 1000;
/** A capture stamped this far AFTER the ranking instant is a clock conflict, not a fresher read. */
export const AVAILABILITY_MAX_LEAD_MS = 3600 * 1000;

/**
 * The per-game board's availability read at `asOf`: CURRENT, or why not (MISSING / STALE / CONFLICTING).
 * Reads `board.availability` = { injuriesCapturedAt, injuries, rosters } written by build-nfl-player-board.
 * @param {any} board
 * @param {string} asOf ISO instant of the ranking
 */
export function boardAvailabilityState(board, asOf) {
  const a = board?.availability;
  const now = Date.parse(asOf ?? "");
  const at = Date.parse(a?.injuriesCapturedAt ?? "");
  if (!a || !Number.isFinite(at) || !Number.isFinite(now)) return "MISSING";
  if (a.injuries !== "FRESH" || a.rosters !== "FRESH") return "STALE";
  if (now - at > AVAILABILITY_MAX_AGE_MS) return "STALE";
  if (at - now > AVAILABILITY_MAX_LEAD_MS) return "CONFLICTING";
  return "CURRENT";
}

/**
 * THE public-board availability gate. `{ eligible, reason }` — reason is the blocking participation state,
 * `UNKNOWN` for a missing one, or `AVAILABILITY_<state>` when the board's availability read is not current.
 * @param {any} player  a per-game board row ({ participation })
 * @param {any} board   its per-game board
 * @param {string} asOf ISO instant of the ranking
 */
export function publicBoardEligibility(player, board, asOf) {
  const avail = boardAvailabilityState(board, asOf);
  if (avail !== "CURRENT") return { eligible: false, reason: `AVAILABILITY_${avail}` };
  const p = player?.participation;
  if (typeof p !== "string" || !p) return { eligible: false, reason: "UNKNOWN" };
  if (!PUBLIC_BOARD_CLEARED.includes(p)) return { eligible: false, reason: p };
  return { eligible: true, reason: null };
}

/** @param {any} player @param {any} board @param {string} asOf */
export const isPublicNflBoardEligible = (player, board, asOf) => publicBoardEligibility(player, board, asOf).eligible;

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
 * The availability gate runs FIRST, on the whole pool, so truncation never sees a blocked row.
 * @param {Array<any>} boards  per-game player boards
 * @param {string} family
 * @param {string} metric
 * @param {{ asOf: string, blocked?: Array<any> }} opts  `asOf` is required; `blocked` collects the
 *   players the gate removed ({ playerId, name, team, providerEventId, reason }) so no removal is silent.
 */
export function rankFamily(boards, family, metric, { asOf, blocked } = /** @type {any} */ ({})) {
  if (!Number.isFinite(Date.parse(asOf ?? ""))) throw new Error("rankFamily: asOf (ISO) is required — availability is judged at an instant");
  const out = [];
  for (const board of boards) {
    for (const player of board.players ?? []) {
      const market = player.markets?.[family];
      if (!market || typeof market[metric] !== "number" || !Number.isFinite(market[metric])) continue;
      const gate = publicBoardEligibility(player, board, asOf);
      if (!gate.eligible) {
        blocked?.push({ playerId: player.playerId, name: player.name, team: player.team, providerEventId: board.providerEventId, reason: gate.reason });
        continue;
      }
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
