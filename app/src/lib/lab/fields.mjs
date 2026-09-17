/**
 * RESEARCH LAB FIELD REGISTRY (v1.5) — the allowlist. A field name that is not here fails closed; an operator a
 * field does not declare fails closed. There is no arbitrary field name, no expression, no user-authored formula.
 *
 * PACKED ROW LAYOUTS — documented once, read by index everywhere. Entity ids are stored as indexes into the
 * partition's own entity arrays; values are numbers or null. `null` is "the source did not record this" and is
 * NEVER coerced to 0; a recorded 0 is a legitimate value.
 *
 *   GAME    [gameId, date, seasonIdx, teamAIdx, teamBIdx, scoreA, scoreB, flags, matchupPath|null]
 *           flags bit 0 (HOST_KNOWN): when set, teamA HOSTED and teamB visited. When clear the source proves no
 *           host (an NFL neutral-site game): teamA/teamB are in canonical id order, mean nothing about location,
 *           and the row can never match a Home or an Away filter — only Neutral. Every GAME row is a recorded
 *           final whose two team rows agree; scheduled games belong to the Matchup Explorer, not here.
 *
 *   PLAYER  [playerIdx, gameId, date, seasonIdx, teamIdx, oppIdx, ha, ...values]
 *           `teamIdx` is the team recorded for THAT game (never the current roster); `ha` is "H" | "A" | "N" | null;
 *           values follow the partition's `families` order. The season index is carried in the row (not implied by
 *           the partition) so a one-player, every-season dataset reads through the SAME layout.
 *
 *   SEASON  [teamIdx, seasonIdx, games, finals, w, l, t, scored, allowed]
 *           `games` counts every recorded game row (final or not); `finals` counts recorded finals with both
 *           scores, and only those feed w/l/t/scored/allowed.
 *
 * Pure: no filesystem, no clock, no network.
 */

export const GAME = Object.freeze({ ID: 0, DATE: 1, SEASON: 2, A: 3, B: 4, SCORE_A: 5, SCORE_B: 6, FLAGS: 7, PATH: 8 });
export const PLAYER = Object.freeze({ PLAYER: 0, ID: 1, DATE: 2, SEASON: 3, TEAM: 4, OPP: 5, HA: 6, VALUES: 7 });
export const SEASON = Object.freeze({ TEAM: 0, SEASON: 1, GAMES: 2, FINALS: 3, W: 4, L: 5, T: 6, SCORED: 7, ALLOWED: 8 });

/** GAME flag bits. */
export const HOST_KNOWN = 1;

export const OPS = Object.freeze(["eq", "in", "gte", "lte", "between"]);

const ID_OPS = Object.freeze(["eq"]);
const ID_OPS_MULTI = Object.freeze(["eq", "in"]);
const NUM_OPS = Object.freeze(["gte", "lte", "between"]);
const ENUM_OPS = Object.freeze(["eq"]);

/**
 * One field = one factual column with ONE meaning.
 *   type          teamId | playerId | enum | int | number | date
 *   ops           the only operators this field accepts
 *   sortable      may appear in a sort clause
 *   requiresTeam  the field is TEAM-RELATIVE (a result, a home/away side, runs scored) and is meaningless without
 *                 a selected team: "result = W" is a question about somebody. Fails closed as FIELD_REQUIRES_TEAM.
 *   requiresStat  the field reads the SELECTED stat family's value (players mode only).
 *   missing       how rows without a recorded value behave: "exclude" (a numeric comparison never matches null)
 *                 or "n/a" (the column cannot be null).
 */
export const LAB_FIELDS = Object.freeze({
  games: Object.freeze({
    teamId: { type: "teamId", ops: ID_OPS, sortable: false, missing: "n/a", label: "Team" },
    opponentId: { type: "teamId", ops: ID_OPS, sortable: false, requiresTeam: true, missing: "n/a", label: "Opponent" },
    homeAway: { type: "enum", values: Object.freeze(["H", "A", "N"]), ops: ENUM_OPS, sortable: false, requiresTeam: true, missing: "n/a", label: "Home or away" },
    result: { type: "enum", values: Object.freeze(["W", "L", "T"]), ops: ENUM_OPS, sortable: false, requiresTeam: true, missing: "n/a", label: "Result" },
    scored: { type: "int", ops: NUM_OPS, sortable: true, requiresTeam: true, missing: "n/a", label: "Scored" },
    allowed: { type: "int", ops: NUM_OPS, sortable: true, requiresTeam: true, missing: "n/a", label: "Allowed" },
    totalScore: { type: "int", ops: NUM_OPS, sortable: true, missing: "n/a", label: "Combined score" },
    date: { type: "date", ops: NUM_OPS, sortable: true, missing: "exclude", label: "Date" },
  }),
  players: Object.freeze({
    playerId: { type: "playerId", ops: ID_OPS_MULTI, sortable: false, missing: "n/a", label: "Player" },
    teamId: { type: "teamId", ops: ID_OPS, sortable: false, missing: "exclude", label: "Team in that game" },
    opponentId: { type: "teamId", ops: ID_OPS, sortable: false, missing: "exclude", label: "Opponent" },
    // "N" is a real value here: 865 of 38,740 NFL player rows belong to a neutral-site game, and the source proves
    // no host for those. Offering only H and A would have quietly hidden them from both sides of the filter.
    homeAway: { type: "enum", values: Object.freeze(["H", "A", "N"]), ops: ENUM_OPS, sortable: false, missing: "exclude", label: "Home or away" },
    statValue: { type: "number", ops: NUM_OPS, sortable: true, requiresStat: true, missing: "exclude", label: "Recorded value" },
    date: { type: "date", ops: NUM_OPS, sortable: true, missing: "exclude", label: "Date" },
  }),
  seasons: Object.freeze({
    teamId: { type: "teamId", ops: ID_OPS_MULTI, sortable: false, missing: "n/a", label: "Team" },
    finals: { type: "int", ops: NUM_OPS, sortable: true, missing: "n/a", label: "Recorded finals" },
    wins: { type: "int", ops: NUM_OPS, sortable: true, missing: "n/a", label: "W" },
    losses: { type: "int", ops: NUM_OPS, sortable: true, missing: "n/a", label: "L" },
    scored: { type: "int", ops: NUM_OPS, sortable: true, missing: "n/a", label: "Scored" },
    allowed: { type: "int", ops: NUM_OPS, sortable: true, missing: "n/a", label: "Allowed" },
  }),
});

/** Sort keys a mode accepts, plus the two non-field keys the Season Explorer sorts by. */
export const LAB_SORT_FIELDS = Object.freeze({
  games: Object.freeze(["date", "scored", "allowed", "totalScore"]),
  players: Object.freeze(["date", "statValue"]),
  seasons: Object.freeze(["seasonId", "team", "finals", "wins", "losses", "scored", "allowed"]),
});

/**
 * DEFAULT SORT and the DETERMINISTIC TIE-BREAK. A tie is never left to the input order of a file: the secondary key
 * is a canonical id (game id, then player index) or a canonical label, so the same query over the same partition
 * returns the same rows in the same order on every device and every rebuild.
 */
export const LAB_DEFAULT_SORT = Object.freeze({
  games: Object.freeze([{ field: "date", dir: "desc" }]),
  players: Object.freeze([{ field: "date", dir: "desc" }]),
  seasons: Object.freeze([{ field: "seasonId", dir: "desc" }]),
});

export const labField = (mode, field) => (LAB_FIELDS[mode] ?? {})[field] ?? null;
export const labFieldNames = (mode) => Object.keys(LAB_FIELDS[mode] ?? {});
export const opAllowed = (mode, field, op) => Boolean(labField(mode, field)?.ops.includes(op));
export const sortAllowed = (mode, field) => (LAB_SORT_FIELDS[mode] ?? []).includes(field);

/** A recorded number (never null, never NaN, never a numeric string). */
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** ISO calendar date or instant, as the projection stores it. Used to validate a date bound, never to parse a clock. */
export const isIsoDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[0-9:.]+Z?)?$/.test(v);
