/**
 * Canonical id builders — the ONLY place platform ids are formed.
 *
 * Rule 1: an id that already ships is reused EXACTLY. MLB/NFL team and NFL player ids are produced by the
 * Follow owner's own builders (lib/follow/follow-schema.mjs), so the platform cannot drift from the ids
 * saved in readers' browsers. Game ids are the provider event ids the routes, Live envelopes, Saved
 * records and graded ledgers already use (MLB gamePk, NFL ESPN event id, UFC ESPN competition id, EPL's
 * shipped `soccer:epl:…` event id).
 *
 * Rule 2: a NEW v1.2 id is a namespaced STABLE PROVIDER id — never a display name, never a sequence, never
 * ingestion order. New in v1.2: `mlb-player-<StatsAPI person id>`, `epl-team-<ESPN team id>`,
 * `epl-athlete-<ESPN athlete id>`, `ufc-athlete-<ESPN athlete id>`, and bare ESPN event ids for EPL
 * matches that predate the shipped fixture ids (2022-23 … 2025-26).
 *
 * Every builder returns null for anything that is not a real provider id. Callers count the null as a
 * diagnostic; they never substitute a name.
 */
import { mlbTeamRef, nflTeamRef, nflPlayerRef } from "../follow/follow-schema.mjs";

const DIGITS = /^\d{1,12}$/;
const digits = (v) => {
  const s = typeof v === "number" && Number.isInteger(v) && v >= 0 ? String(v) : typeof v === "string" ? v.trim() : "";
  return DIGITS.test(s) ? s : null;
};

export const ID_PATTERNS = Object.freeze({
  MLB: { team: /^mlb-team-\d{1,6}$/, player: /^mlb-player-\d{1,9}$/, game: /^\d{5,9}$/ },
  NFL: { team: /^nfl-team-\d{1,6}$/, player: /^nfl-athlete-\d{1,12}$/, game: /^\d{6,12}$/ },
  EPL: { team: /^epl-team-\d{1,6}$/, player: /^epl-athlete-\d{1,12}$/, game: /^(soccer:epl:[a-z0-9-]+-v-[a-z0-9-]+:\d{8}t\d{4}|\d{6,12})$/ },
  UFC: { team: /^$a/, player: /^ufc-athlete-\d{1,12}$/, game: /^\d{6,12}$/ },
});

/** @param {"MLB"|"NFL"|"EPL"|"UFC"} sport @param {"team"|"player"|"game"} type @param {unknown} id */
export function isCanonicalId(sport, type, id) {
  return typeof id === "string" && Boolean(ID_PATTERNS[sport]?.[type]?.test(id));
}

// ── MLB ───────────────────────────────────────────────────────────────────────────────────────────
export const mlbTeamId = (statsApiTeamId) => (digits(statsApiTeamId) ? mlbTeamRef(digits(statsApiTeamId))?.id ?? null : null);
export const mlbPlayerId = (statsApiPersonId) => (digits(statsApiPersonId) ? `mlb-player-${digits(statsApiPersonId)}` : null);
export const mlbGameId = (gamePk) => {
  const d = digits(gamePk);
  return d && ID_PATTERNS.MLB.game.test(d) ? d : null;
};

// ── NFL ───────────────────────────────────────────────────────────────────────────────────────────
export const nflTeamId = (espnTeamId) => (digits(espnTeamId) ? nflTeamRef(digits(espnTeamId))?.id ?? null : null);
/** Accepts a bare ESPN athlete id or the shipped `nfl-athlete-<id>` string (kept verbatim, like Follow). */
export const nflPlayerId = (espnAthleteIdOrRef) => {
  const s = typeof espnAthleteIdOrRef === "number" ? String(espnAthleteIdOrRef) : String(espnAthleteIdOrRef ?? "").trim();
  const ref = /^\d{1,12}$/.test(s) ? `nfl-athlete-${s}` : s;
  return /^nfl-athlete-\d{1,12}$/.test(ref) ? nflPlayerRef(ref)?.id ?? null : null;
};
export const nflGameId = (espnEventId) => {
  const d = digits(espnEventId);
  return d && ID_PATTERNS.NFL.game.test(d) ? d : null;
};

// ── EPL ───────────────────────────────────────────────────────────────────────────────────────────
export const eplTeamId = (espnTeamId) => (digits(espnTeamId) ? `epl-team-${digits(espnTeamId)}` : null);
export const eplPlayerId = (espnAthleteId) => (digits(espnAthleteId) ? `epl-athlete-${digits(espnAthleteId)}` : null);
/** A shipped EPL fixture id, verbatim — only when it has the shipped shape. */
export const eplShippedGameId = (eventId) => {
  const s = typeof eventId === "string" ? eventId.trim() : "";
  return /^soccer:epl:[a-z0-9-]+-v-[a-z0-9-]+:\d{8}t\d{4}$/.test(s) ? s : null;
};
/** Historical EPL match (no shipped id exists): the ESPN event id. */
export const eplEspnGameId = (espnEventId) => {
  const d = digits(espnEventId);
  return d && d.length >= 6 ? d : null;
};

// ── UFC ───────────────────────────────────────────────────────────────────────────────────────────
export const ufcPlayerId = (espnAthleteId) => (digits(espnAthleteId) ? `ufc-athlete-${digits(espnAthleteId)}` : null);
/** A bout — the competitive unit the `/ufc/bout/[boutId]` route already uses (ESPN competition id). */
export const ufcGameId = (espnCompetitionId) => {
  const d = digits(espnCompetitionId);
  return d && d.length >= 6 ? d : null;
};

// ── seasons / leagues ─────────────────────────────────────────────────────────────────────────────
/**
 * Season ids. Conventions (no shipped season id existed before v1.2):
 *   MLB  `MLB-2025`     calendar season year (StatsAPI `season`)
 *   NFL  `NFL-2025`     the year the season STARTS (ESPN/nflverse `season`; a February Super Bowl is season 2025)
 *   EPL  `EPL-2025-26`  split-year label the product already prints
 *   UFC  `UFC-2026`     calendar year (UTC) of the card's scheduled start — a neutral period key, NOT a competitive season
 */
export function seasonId(sport, key) {
  const k = String(key ?? "").trim();
  if (sport === "EPL") return /^\d{4}-\d{2}$/.test(k) ? `EPL-${k}` : null;
  if (sport === "MLB" || sport === "NFL" || sport === "UFC") return /^\d{4}$/.test(k) ? `${sport}-${k}` : null;
  return null;
}

export const LEAGUE_IDS = Object.freeze({ MLB: "MLB", NFL: "NFL", EPL: "EPL", UFC: "UFC" });
