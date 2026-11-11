/**
 * INJURY MONITOR · STALE FLAGS (founder-approved phased injury direction, Phase 1, 2026-11-11). Shared NBA / NFL. PURE:
 * no fs, no clock — every instant comes from the inputs, so the same inputs give byte-identical output.
 *
 * A published forecast is FROZEN and never edited. When an injury capture shows that an assumption behind it no longer
 * holds, this module records a STALENESS EVENT in an APPEND-ONLY, versioned public facts file; consumers (game pages,
 * the social console's package builders and send-time recheck) read the file and act. The frozen numbers never change.
 *
 * TWO LEVELS (each event carries both flags it raises):
 *   player flag   EVERY player with a published projection in the frozen forecast whose status became unavailable
 *                 (UNAVAILABLE_STATUSES) after the freeze and before the start, when the forecast assumed him available.
 *                 Any post featuring that player is refused. (BKN @ NO: Mathurin, projected 16.9 min, Out 16:29Z.)
 *   game flag     MATERIAL events only — the game's winner / score posts are refused too. Material (sourced rule):
 *                   NBA  the frozen lane's own expectedMinutes ≥ NBA_MATERIAL_MINUTES (20; founder directive 2026-11-11:
 *                        "a starter with ≥ 20 projected minutes" — 20 of 240 team minutes, ≥ 8% of the team's floor
 *                        time), or the player is in the forecast's Top-N (NBA_TOP_N per stat family by median);
 *                   NFL  the board's identified starting QB (integrity.qbStarter), or a top skill player: the top
 *                        NFL_TOP_RUSHERS by rushing median and the top NFL_TOP_RECEIVERS by receiving-yards median
 *                        (founder directive 2026-11-11: "the starting QB or a top skill player").
 *                 (BOS @ TOR: Paul George, projected 27.8 min, Out 17:55Z → player AND game flag.)
 * "Newly": the frozen forecast recorded the player as available (no injury status, or one not in UNAVAILABLE_STATUSES);
 * a player already listed Out/Doubtful at the freeze raises nothing (the forecast already knew).
 */
export const STALE_FLAGS_SCHEMA = "gtp.stale-flags@1";
export const UNAVAILABLE_STATUSES = Object.freeze(["out", "doubtful", "injured reserve", "suspension", "inactive"]);
export const NBA_MATERIAL_MINUTES = 20;
export const NBA_TOP_N = 5;
export const NFL_TOP_RUSHERS = 2;
export const NFL_TOP_RECEIVERS = 3;
export const STALE_FLAGS_REL = (sport, date) => `app/public/data/${sport}/stale-flags/${date}.json`;

const t = (iso) => (typeof iso === "string" ? Date.parse(iso) : NaN);
const unavailable = (s) => UNAVAILABLE_STATUSES.includes(String(s ?? "").trim().toLowerCase());
const stripId = (id) => String(id ?? "").replace(/^nfl-athlete-/, "");

/**
 * The players each frozen NBA lane game assumed available, with their materiality.
 * @param lane experimental-public/<date>.json (frozen)  @param shaOf (game) => sha256 hex of the game's canonical JSON
 */
export function nbaCandidates(lane, shaOf) {
  const out = [];
  for (const g of lane?.games ?? []) {
    const all = [...(g.players?.away ?? []).map((p) => ({ p, side: "away" })), ...(g.players?.home ?? []).map((p) => ({ p, side: "home" }))];
    const top = new Set();
    for (const fam of ["pts", "reb", "ast", "threePm"]) {
      all.filter(({ p }) => Number.isFinite(p.medians?.[fam])).sort((a, b) => b.p.medians[fam] - a.p.medians[fam]).slice(0, NBA_TOP_N).forEach(({ p }) => top.add(String(p.providerAthleteId)));
    }
    const sha = shaOf(g);
    for (const { p, side } of all) {
      const minutes = Number(p.expectedMinutes);
      const reasons = [];
      if (minutes >= NBA_MATERIAL_MINUTES) reasons.push(`projected ${minutes} min ≥ ${NBA_MATERIAL_MINUTES}`);
      if (top.has(String(p.providerAthleteId))) reasons.push(`top ${NBA_TOP_N} in a stat family`);
      out.push({ sport: "nba", eventId: String(g.providerEventId), side, playerId: String(p.providerAthleteId), name: p.name ?? null, frozenAt: g.frozenAt, startUtc: g.tipUtc, assumedStatus: p.injuryStatus ?? null, material: reasons.length > 0, materialReasons: reasons, topN: top.has(String(p.providerAthleteId)), forecastId: `nba-lane:${lane.date}:${g.providerEventId}`, forecastSha256: sha });
    }
  }
  return out;
}

/**
 * The players one NFL player board assumed available (the board as published at `generatedAt`), with materiality.
 * @param board player-board/<eventId>.json  @param shaOf (board) => sha256 hex
 */
export function nflCandidates(board, shaOf) {
  const out = [];
  const sha = shaOf(board);
  const starters = new Set((board?.integrity?.qbStarter ?? []).map((q) => q.starter?.playerId).filter(Boolean).map(stripId));
  const teams = [...new Set((board?.players ?? []).map((p) => p.team))];
  const top = new Set();
  for (const team of teams) {
    const ps = (board.players ?? []).filter((p) => p.team === team);
    ps.filter((p) => p.markets?.player_rush_yds && !starters.has(stripId(p.playerId))).sort((a, b) => b.markets.player_rush_yds.median - a.markets.player_rush_yds.median).slice(0, NFL_TOP_RUSHERS).forEach((p) => top.add(stripId(p.playerId)));
    ps.filter((p) => p.markets?.player_reception_yds).sort((a, b) => b.markets.player_reception_yds.median - a.markets.player_reception_yds.median).slice(0, NFL_TOP_RECEIVERS).forEach((p) => top.add(stripId(p.playerId)));
  }
  const listed = new Map((board?.players ?? []).map((p) => [stripId(p.playerId), p]));
  for (const id of starters) if (!listed.has(id)) listed.set(id, { playerId: id, name: (board.integrity.qbStarter.find((q) => stripId(q.starter?.playerId) === id) ?? {}).starter?.name ?? null, team: (board.integrity.qbStarter.find((q) => stripId(q.starter?.playerId) === id) ?? {}).team });
  for (const [id, p] of listed) {
    const reasons = [];
    if (starters.has(id)) reasons.push("identified starting QB");
    if (top.has(id)) reasons.push("top skill player");
    out.push({ sport: "nfl", eventId: String(board.providerEventId), side: p.team ?? null, playerId: id, name: p.name ?? null, frozenAt: board.generatedAt, startUtc: board.kickoffUtc, assumedStatus: p.eligibility?.sources?.injuries?.status ?? null, material: reasons.length > 0, materialReasons: reasons, topN: reasons.length > 0, forecastId: `nfl-board:${board.providerEventId}:${board.generatedAt}`, forecastSha256: sha });
  }
  return out;
}

/**
 * STALENESS EVENTS for one injuries capture: a candidate whose capture status is unavailable, stated after the freeze
 * and before the start, while the forecast assumed him available. `detectedAt` = the capture's sourceAsOf (the instant
 * our system knew), never a wall clock.
 */
export function detectStaleEvents(candidates, capture) {
  const entries = new Map();
  for (const e of capture?.entries ?? []) if (e?.athleteId != null) entries.set(String(e.athleteId), e);
  const detectedAt = capture?.sourceAsOf ?? null;
  const events = [];
  for (const c of candidates) {
    const e = entries.get(c.playerId);
    if (!e || !unavailable(e.status) || unavailable(c.assumedStatus)) continue;
    const stated = t(e.statedAt);
    if (!(stated > t(c.frozenAt) && stated < t(c.startUtc))) continue;
    events.push({
      key: `${c.sport}:${c.eventId}:${c.playerId}:${String(e.status).toLowerCase()}`,
      sport: c.sport, eventId: c.eventId, playerId: c.playerId, name: c.name ?? e.athleteName ?? null, side: c.side,
      statusBefore: c.assumedStatus, statusAfter: e.status, statedAt: e.statedAt, detectedAt,
      flags: { player: true, game: c.material }, materialReasons: c.materialReasons, topN: c.topN,
      forecastId: c.forecastId, forecastSha256: c.forecastSha256, source: capture?.source?.name ?? null,
    });
  }
  return events.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * APPEND-ONLY: the next version of the public stale-flags file. Existing events are never edited or removed; events not
 * yet present (by key) are appended as one new version stamped with the capture instant. No new event ⇒ the SAME object
 * (a quiet capture writes nothing).
 */
export function appendStaleFlags(file, events, { sport, date, capturedAt }) {
  const base = file && file.schema === STALE_FLAGS_SCHEMA ? file : { schema: STALE_FLAGS_SCHEMA, sport, date, versions: [], events: [] };
  const seen = new Set(base.events.map((e) => e.key));
  const fresh = events.filter((e) => !seen.has(e.key));
  if (!fresh.length) return base;
  const version = base.versions.length + 1;
  return { ...base, versions: [...base.versions, { version, capturedAt, added: fresh.map((e) => e.key) }], events: [...base.events, ...fresh.map((e) => ({ ...e, version }))] };
}

/**
 * THE SOCIAL CONTRACT (console package builders + send-time recheck, owned by bb-social): may a post about this game,
 * featuring these players, go out? Refused when the game carries a game flag (winner / score / game-level content) or
 * any featured player carries a player flag. An unreadable or foreign file refuses (fail closed).
 * @param file the stale-flags file for the post's sport and date (null when the file does not exist ⇒ no flags)
 * @param post { sport, eventId, playerIds: string[], gameLevel: boolean }
 */
export function postAllowed(file, post) {
  if (file == null) return { allowed: true, reasons: [] };
  if (file.schema !== STALE_FLAGS_SCHEMA || file.sport !== post.sport) return { allowed: false, reasons: ["stale-flags file unreadable or for another sport — refusing (fail closed)"] };
  const evs = file.events.filter((e) => e.eventId === String(post.eventId));
  const reasons = [];
  if (post.gameLevel) for (const e of evs.filter((x) => x.flags.game)) reasons.push(`game flagged: ${e.name} ${e.statusAfter} (stated ${e.statedAt}, detected ${e.detectedAt})`);
  const ids = new Set((post.playerIds ?? []).map(stripId));
  for (const e of evs.filter((x) => ids.has(x.playerId))) reasons.push(`player flagged: ${e.name} ${e.statusAfter} (stated ${e.statedAt})`);
  return { allowed: reasons.length === 0, reasons };
}

/** The send-time recheck's capture-freshness bound (minutes): a capture older than this cannot clear a post. */
export const SEND_MAX_CAPTURE_AGE_MIN = 30;

/**
 * SEND-TIME RECHECK (the console's last gate; fail closed). Computed straight from the frozen forecast's candidates and
 * the LATEST injuries capture — independent of whether the committed stale-flags file has been written yet — and
 * refused when that capture is older than `maxAgeMin` at `nowIso` (a stalled monitor never clears a post).
 * @param a { candidates, capture, post, nowIso, maxAgeMin? }
 */
export function evaluatePostAtSend({ candidates, capture, post, nowIso, maxAgeMin = SEND_MAX_CAPTURE_AGE_MIN }) {
  const age = (t(nowIso) - t(capture?.sourceAsOf)) / 60000;
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMin) return { allowed: false, reasons: [`injuries capture ${capture?.sourceAsOf ?? "missing"} is ${Number.isFinite(age) ? `${Math.round(age)} min` : "of unknown"} old at send (limit ${maxAgeMin}) — refusing`] };
  const events = detectStaleEvents(candidates, capture);
  return postAllowed({ schema: STALE_FLAGS_SCHEMA, sport: post.sport, events }, post);
}
