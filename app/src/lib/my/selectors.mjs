/**
 * MY GAMETIME — pure selectors (v1.1.3). No React, no network, no storage, no clock of their own.
 *
 * My GameTime is a VIEW over existing owners, not a truth owner. Everything it shows comes from an
 * artifact or envelope that already exists; these functions only decide which of those rows belong to
 * what a reader explicitly follows, in what order, and how many.
 *
 * EVERY INCLUSION IS AN EXACT CANONICAL-ID JOIN. A row is kept because its `mlb-team-147` /
 * `nfl-team-2` / `nfl-athlete-4374302` is in the follow set — never because a name or abbreviation
 * looks similar. A row without the id it needs is not guessed at; it is counted as unjoined, so a
 * degrading join shows up in a test before it shows up to a reader.
 *
 * ⚠ THE PRESENT IS AN ARGUMENT. `nowMs` is passed in. The read model built at export time makes no
 * claim about which games are upcoming or past — that claim ages into a lie (the Phase 6 lesson), so it
 * is decided here, on the reader's clock, every time.
 */

/** Canonical team ref ids from a normalized envelope side (StatsAPI id for MLB). */
function mlbIdFromEnvelopeSide(side) {
  const raw = side?.teamId;
  return typeof raw === "string" && /^\d+$/.test(raw) ? `mlb-team-${raw}` : null;
}

/** The set of followed ids of one kind, from a list of follow refs. */
/** @param {any[]} followed @param {{ sport: string, entityType: string }} kind @returns {Set<string>} */
export function followedIdSet(followed, { sport, entityType }) {
  const out = new Set();
  for (const f of Array.isArray(followed) ? followed : []) {
    if (f?.sport === sport && f?.entityType === entityType && typeof f.id === "string") out.add(f.id);
  }
  return out;
}

/* ───────────────────────────── Live Now ───────────────────────────── */

/**
 * Live events involving a followed MLB team.
 *
 * Kept only while the lifecycle says the game is in play (LIVE or DELAYED); a PRE game is Up Next's
 * business and a final is Results'. One card per event however many of its teams are followed.
 * Order: scheduled start, then event id — the same order a reader sees on /live.
 */
/** @param {Record<string, any>} envelopesByGamePk @param {any[]} followed @returns {{ events: any[], unjoined: number }} */
export function selectFollowedLiveEvents(envelopesByGamePk, followed) {
  const ids = followedIdSet(followed, { sport: "MLB", entityType: "team" });
  const kept = [];
  let unjoined = 0;
  if (ids.size === 0) return { events: kept, unjoined };
  for (const env of Object.values(envelopesByGamePk ?? {})) {
    if (env?.state !== "LIVE" && env?.state !== "DELAYED") continue;
    const home = mlbIdFromEnvelopeSide(env?.competitors?.home);
    const away = mlbIdFromEnvelopeSide(env?.competitors?.away);
    if (!home && !away) { unjoined++; continue; }
    if ((home && ids.has(home)) || (away && ids.has(away))) kept.push(env);
  }
  kept.sort((a, b) => cmpStart(a.startTime, b.startTime) || String(a.eventId).localeCompare(String(b.eventId)));
  return { events: kept, unjoined };
}

/* ───────────────────────────── Up Next ───────────────────────────── */

/**
 * The next games for followed teams, from the build-time schedule read model.
 *
 * Rule (stated once, pinned in tests): a game is Up Next iff its start is KNOWN and strictly LATER than
 * the reader's `nowMs`, and at least one side's canonical team id is followed. One row per game. Order:
 * start ascending, then game id. At most `limit`.
 *
 * An unknown start fails CLOSED — it is excluded rather than shown as "upcoming" with no time, because
 * Up Next is a claim about the future and a game with no time cannot support it.
 */
/**
 * @param {any[]} games @param {any[]} followed
 * @param {{ nowMs: number, limit?: number }} options
 * @returns {{ games: any[], total: number, unjoined: number }}
 */
export function selectUpcomingFollowedGames(games, followed, { nowMs, limit = 6 } = /** @type {any} */ ({})) {
  const mlb = followedIdSet(followed, { sport: "MLB", entityType: "team" });
  const nfl = followedIdSet(followed, { sport: "NFL", entityType: "team" });
  const seen = new Set();
  const kept = [];
  let unjoined = 0;
  for (const g of Array.isArray(games) ? games : []) {
    const ids = g?.sport === "MLB" ? mlb : g?.sport === "NFL" ? nfl : null;
    if (!ids || ids.size === 0) continue;
    if (!g.homeId && !g.awayId) { unjoined++; continue; }
    if (!((g.homeId && ids.has(g.homeId)) || (g.awayId && ids.has(g.awayId)))) continue;
    const start = Date.parse(g.startUtc ?? "");
    if (!Number.isFinite(start) || !(start > nowMs)) continue; // unknown or not in the future
    const key = `${g.sport}:${g.gameId}`;
    if (seen.has(key)) continue; // both teams followed → still one card
    seen.add(key);
    kept.push(g);
  }
  kept.sort((a, b) => cmpStart(a.startUtc, b.startUtc) || `${a.sport}:${a.gameId}`.localeCompare(`${b.sport}:${b.gameId}`));
  return { games: kept.slice(0, limit), total: kept.length, unjoined };
}

/* ───────────────────────────── Recent Results ───────────────────────────── */

/**
 * Canonical results involving followed teams.
 *
 * The read model is built ONLY from canonical result owners (MLB graded rows; NFL results through the
 * FINAL-only settlement adapter), so a provider "Final" that the owner has not produced never reaches
 * this list. Order: most recent `resultAt` first, then game id. At most `limit`.
 */
/**
 * @param {any[]} results @param {any[]} followed @param {{ limit?: number }} [options]
 * @returns {{ results: any[], total: number, unjoined: number }}
 */
export function selectRecentFollowedResults(results, followed, { limit = 6 } = {}) {
  const mlb = followedIdSet(followed, { sport: "MLB", entityType: "team" });
  const nfl = followedIdSet(followed, { sport: "NFL", entityType: "team" });
  const seen = new Set();
  const kept = [];
  let unjoined = 0;
  for (const r of Array.isArray(results) ? results : []) {
    const ids = r?.sport === "MLB" ? mlb : r?.sport === "NFL" ? nfl : null;
    if (!ids || ids.size === 0) continue;
    if (!r.homeId && !r.awayId) { unjoined++; continue; }
    if (!((r.homeId && ids.has(r.homeId)) || (r.awayId && ids.has(r.awayId)))) continue;
    // A result without integer scores is not a result this module may show.
    if (!Number.isInteger(r.homeScore) || !Number.isInteger(r.awayScore)) continue;
    const key = `${r.sport}:${r.gameId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(r);
  }
  kept.sort((a, b) => cmpRecentFirst(a.resultAt, b.resultAt) || `${a.sport}:${a.gameId}`.localeCompare(`${b.sport}:${b.gameId}`));
  return { results: kept.slice(0, limit), total: kept.length, unjoined };
}

/* ───────────────────────────── Followed NFL players ───────────────────────────── */

/**
 * Current published board rows for followed NFL players.
 *
 * Joined on `nfl-athlete-<id>` exactly. A followed player who appears on no current board is returned
 * in `absent` — shown as "no current published forecast", never as zeroes. Markets reach a card only if
 * the read model already filtered them to PUBLISHED families from the board in hand; this selector does
 * not re-decide eligibility and cannot widen it.
 *
 * Order: kickoff ascending, then player name, then id — so a reader sees the soonest game first.
 */
/** @param {any[]} playerRows @param {any[]} followed @returns {{ present: any[], absent: string[] }} */
export function selectFollowedPlayerRows(playerRows, followed) {
  const ids = followedIdSet(followed, { sport: "NFL", entityType: "player" });
  const byId = new Map();
  for (const row of Array.isArray(playerRows) ? playerRows : []) {
    if (!row?.playerId || !ids.has(row.playerId)) continue;
    const prev = byId.get(row.playerId);
    // A player on two boards (rare) shows the SOONER game.
    if (!prev || cmpStart(row.kickoffUtc, prev.kickoffUtc) < 0) byId.set(row.playerId, row);
  }
  const present = [...byId.values()].sort(
    (a, b) => cmpStart(a.kickoffUtc, b.kickoffUtc) || String(a.name).localeCompare(String(b.name)) || a.playerId.localeCompare(b.playerId),
  );
  const absent = [...ids].filter((id) => !byId.has(id)).sort();
  return { present, absent };
}

/* ───────────────────────────── page composition ───────────────────────────── */

/**
 * Which state the page is in. `FIRST_RUN` only when there is genuinely nothing personal: no follows AND
 * no saved forecasts. Anything else renders the modules that can show value.
 *
 * Called only after BOTH local stores have loaded — before that the page renders neither an empty state
 * nor a first-run pitch, because "not read yet" is not "empty".
 */
/** @param {{ followedCount: number, savedCount: number }} input @returns {"FIRST_RUN"|"PERSONALIZED"} */
export function pageStateFor({ followedCount, savedCount }) {
  if (followedCount === 0 && savedCount === 0) return "FIRST_RUN";
  return "PERSONALIZED";
}

/** Does this reader follow at least one MLB team? Decides whether the Live module mounts at all. */
/** @param {any[]} followed @returns {boolean} */
export function followsAnyMlbTeam(followed) {
  return followedIdSet(followed, { sport: "MLB", entityType: "team" }).size > 0;
}

/**
 * Newest first, with an UNKNOWN time still sorting LAST. Simply swapping cmpStart's arguments would
 * reverse the unknown rule too and put undated results at the top.
 */
function cmpRecentFirst(a, b) {
  const ta = Date.parse(a ?? "");
  const tb = Date.parse(b ?? "");
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return 1;
  if (!Number.isFinite(tb)) return -1;
  return tb - ta;
}

function cmpStart(a, b) {
  const ta = Date.parse(a ?? "");
  const tb = Date.parse(b ?? "");
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return 0;
  if (!Number.isFinite(ta)) return 1; // unknown sorts last
  if (!Number.isFinite(tb)) return -1;
  return ta - tb;
}
