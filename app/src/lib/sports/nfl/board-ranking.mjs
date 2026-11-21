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

import { NOT_FEATURABLE_FLAGS } from "../../availability/eligibility.mjs";

/**
 * Board participation states that are CLEARED to rank on a public top board: no published designation.
 * AVAILABLE_ROLE_UNCERTAIN is the model's own role caveat (no source confirms roles), not an injury fact.
 * Everything else — QUESTIONABLE (incl. Doubtful), INACTIVE (Out / IR / suspension), any unknown or
 * missing string — is blocked. An allowlist, so a new state is blocked until someone decides otherwise.
 */
export const PUBLIC_BOARD_CLEARED = Object.freeze(["AVAILABLE_ROLE_UNCERTAIN", "ACTIVE_PROJECTED"]);
/**
 * Eligibility contract v1 cut-over: boards generated at or after this instant must carry `eligibility` on every row.
 * The release owner sets it to the release instant (the first board built by the contract-aware builder).
 */
export const ELIGIBILITY_REQUIRED_FROM = "2026-11-10T00:00:00Z";
/** Does this board fall under the eligibility contract? (a board with no parseable generatedAt does — fail closed) */
export const eligibilityRequired = (board) => { const t = Date.parse(board?.generatedAt ?? ""); return !Number.isFinite(t) || t >= Date.parse(ELIGIBILITY_REQUIRED_FROM); };
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
  /* ELIGIBILITY CONTRACT v1 (2026-11-09): a top board ranks only rows the contract resolved ELIGIBLE with no R6 flag.
     FORWARD ONLY: a board generated on or after ELIGIBILITY_REQUIRED_FROM must carry a record on every row, and a row
     without one is UNKNOWN — missing evidence is never a pass (INC-2026-11-08-01). An earlier, frozen board ranks
     exactly as it did when it was published. */
  // a row that CARRIES a record is judged by it whatever the board's date; a row without one only before the cut-over
  const e = player?.eligibility;
  if (!e && !eligibilityRequired(board)) return { eligible: true, reason: null };
  if (!e || typeof e.state !== "string") return { eligible: false, reason: "ELIGIBILITY_MISSING" };
  if (e.state !== "ELIGIBLE") return { eligible: false, reason: `ELIGIBILITY_${e.state}` };
  const held = (e.flags ?? []).find((f) => NOT_FEATURABLE_FLAGS.includes(f));
  if (held) return { eligible: false, reason: `ELIGIBILITY_${held}` };
  return { eligible: true, reason: null };
}

/** @param {any} player @param {any} board @param {string} asOf */
export const isPublicNflBoardEligible = (player, board, asOf) => publicBoardEligibility(player, board, asOf).eligible;

/**
 * Gate reasons that mean LISTED QUESTIONABLE (R6: Questionable / Doubtful / Day-To-Day) or the R3a source disagreement:
 * the player is modelled and may be SHOWN un-featured with a label, never ranked or featured. Every other reason
 * (INELIGIBLE, UNKNOWN, missing or stale availability, inactive) keeps the player off the board entirely.
 */
export const UNFEATURED_REASONS = Object.freeze(["QUESTIONABLE", "ELIGIBILITY_QUESTIONABLE", "ELIGIBILITY_SOURCES_DISAGREE"]);
/** Exclusions by reason only — no player names or ids — for a public board file. */
export function exclusionCounts(blocked) {
  const byReason = {};
  for (const b of blocked ?? []) byReason[b.reason] = (byReason[b.reason] ?? 0) + 1;
  return { total: (blocked ?? []).length, byReason: Object.fromEntries(Object.entries(byReason).sort(([a], [b]) => (a < b ? -1 : 1))) };
}
/**
 * The R6 players who would have placed inside a top-N had they been cleared: shown below the board, un-featured, with
 * the label. Same order as the ranking (value, then the model's mean, then playerId). A maximum of `size`.
 */
export function unfeaturedRows(blocked, rows, size, valueOf = (r) => r.value) {
  const cut = rows.length >= size ? valueOf(rows[rows.length - 1]) : -Infinity;
  const mean = (m) => (typeof m?.mean === "number" && Number.isFinite(m.mean) ? m.mean : -Infinity);
  return (blocked ?? [])
    .filter((b) => UNFEATURED_REASONS.includes(b.reason) && typeof b.value === "number" && b.value >= cut)
    .sort((a, b) => b.value - a.value || mean(b.market) - mean(a.market) || String(a.playerId).localeCompare(String(b.playerId)))
    .slice(0, size);
}
export const UNFEATURED_LABEL = "Listed questionable · not featured";

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
        // board / player / market ride NON-ENUMERABLE (for unfeaturedRows), so a serialized `blocked` list stays as small as before
        blocked?.push(Object.defineProperties({ playerId: player.playerId, name: player.name, team: player.team, providerEventId: board.providerEventId, reason: gate.reason }, { value: { value: market[metric] }, board: { value: board }, player: { value: player }, market: { value: market } }));
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

/**
 * Session 11 — teams whose pool for `family` a per-game board WITHHELD (it could not be reconciled). A top list
 * over a partial population is a false claim, so the weekly board and the frozen daily Top-5 both refuse to rank
 * the family while any constituent board withholds a team. One helper, so the two cannot disagree.
 * @param {Array<any>} boards @param {string} family @returns {string[]}
 */
export function poolWithheldTeams(boards, family) {
  return boards.flatMap((b) => (b.families?.[family]?.withheldTeams ?? []).map((w) => w.team));
}
