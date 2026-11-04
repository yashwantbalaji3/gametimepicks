/**
 * NBA FORECAST GUARD (`nba-forecast-guard@1`, founder authorization 2026-11-04). PURE, no I/O, browser-safe.
 *
 * WHAT IT IS. One hide-only eligibility and warning layer for the official NBA forecast (the write-once lane
 * app/public/data/nba/experimental-public/<date>.json). For each lane player row it returns a verdict
 * { state: pass | review | blocked, rules[], review[], cells{} }, and for each game's favoured side a rotation warning.
 * It NEVER CHANGES A NUMBER: a surface either prints the lane's own value or prints "Projection under model review".
 *
 * WHY. v0.1 never reads 2026-27 box scores, so a player who changed teams is projected from his old role (2026-11-02:
 * Cody Williams 32.5 expected minutes against 2–5 this season; 123 of 296 public rows flagged or with an audit concern,
 * 44 of them did not play — ~/gtp-evidence/nba-engine-eval-2026-11-04.md).
 *
 * THE RULES are the betting engine's (claude/betting-engine-1104-02e05b leg-pool/nba-guard.mjs + leg-pool.mjs
 * favouredAvailability, which copy the social pack's nba-unified-roster.mjs and player-readiness.mjs) — SAME names, SAME
 * constants, SAME outputs, pinned by forecast-guard.test.mjs. This module is their single owner from here on; the engine
 * and (after Nov 4) the social pack import it instead of keeping copies.
 *   R1  injury status Out / Day-To-Day / Doubtful / Inactive / Suspended at the freeze           → blocked
 *   R2  fewer than 3 played 2026-27 regular-season games for the lane team                         → blocked
 *   R3  expected minutes > 42, or outside [own 2026-27 min − 4, own max + 4]                        → blocked
 *   B_CAP / B_GAP / B_ELIG (readiness blocks), SUSPICIOUS_PROJECTION (a malformed row)             → blocked
 *   R_41 / R_GAP / R_THIN / R_NO_CURRENT / R_MISSED_1 / R_INJ (readiness review)                   → review
 *   R_STAT (a cell's median far from this season's average for that stat)                         → that cell only
 *   FAVOURED_ROTATION_OUT / _R1: one of the favoured team's five highest-minute players this season is Out, or
 *   Day-To-Day / Questionable / Doubtful, at the freeze                                            → game warning
 *
 * DETERMINISTIC INPUTS ONLY (the site build must be reproducible; no live call ever):
 *   - the lane itself: each row's `injuryStatus` is the injury status frozen with the forecast (R1), and
 *     `players.unavailable` is the frozen Out list (rotation rule);
 *   - the COMMITTED 2026-27 regular-season box scores whose ET date is before the slate AND that were captured at or
 *     before the lane's generatedAt (selectSeasonBoxscores). The verdict is computed once per slate and committed as
 *     app/public/data/nba/forecast-guard/<date>.json (buildForecastGuard), write-once beside the lane; pages read that
 *     file through the accessor (forecast-guard-accessor.mjs) and never recompute it.
 */

export const FORECAST_GUARD_SCHEMA = "nba-forecast-guard@1";
/** What a reader sees in place of a withheld official value. Never a zero, never a number. */
export const UNDER_REVIEW_TEXT = "Projection under model review";
export const UNDER_REVIEW_SHORT = "Under review";

// ── R1–R3 (nba-unified-roster.mjs, p2-social-pack; nba-guard.mjs, betting engine) — verbatim constants ───────────────
export const GUARD = Object.freeze({ minGames: 3, hardMinutes: 42, band: 4 });
const GUARD_STATUS = /^(out|day|doubtful|inactive|suspen|injured reserve)/i;
/** Guard rules that hide this player (empty = shown). `status` is the injury status frozen with the forecast. */
export function guardReasons(r, status) {
  const G = GUARD; const out = [];
  if (status && GUARD_STATUS.test(status)) out.push("R1");
  if (!(r.n >= G.minGames)) out.push("R2");
  if (r.mu > G.hardMinutes || (r.minLo != null && r.mu < r.minLo - G.band) || (r.minHi != null && r.mu > r.minHi + G.band)) out.push("R3");
  return out;
}

// ── readiness (player-readiness.mjs, p2-social-pack; nba-guard.mjs, betting engine) — verbatim ──────────────────────
export const READINESS = Object.freeze({ cap: 48, blockGap: 14.3, review: 41, reviewGap: 8.4, minGames: 3, statShare: 0.25, statFloor: 3 });
const off = (a, b) => Math.abs(a - b) >= READINESS.statFloor && Math.abs(a - b) / Math.max(Math.abs(b), 1) >= READINESS.statShare;
export function assessPlayer(r) {
  const R = READINESS; const blocked = []; const review = [];
  if (r.mu >= R.cap) blocked.push("B_CAP");
  if (r.n >= R.minGames && Math.abs(r.mu - r.cur) >= R.blockGap) blocked.push("B_GAP");
  if ((r.n === 0 && r.teamGames >= R.minGames) || r.missedTwo) blocked.push("B_ELIG");
  if (r.mu >= R.review) review.push("R_41");
  if (r.n >= R.minGames && Math.abs(r.mu - r.cur) >= R.reviewGap) review.push("R_GAP");
  if (r.n < R.minGames && r.teamGames >= R.minGames) review.push("R_THIN");
  if (r.teamGames < R.minGames) review.push("R_NO_CURRENT");
  if (r.missedLast) review.push("R_MISSED_1");
  if (r.injured) review.push("R_INJ");
  const cells = {};
  for (const m of ["pts", "reb", "ast"]) {
    const reasons = [];
    if (r.recent?.[m] != null && r.n >= R.minGames && off(r.medians[m], r.recent[m])) reasons.push("R_STAT");
    if (r.lines?.[m] != null && off(r.medians[m], r.lines[m])) reasons.push("R_LINE");
    cells[m] = { state: blocked.length ? "BLOCKED" : review.some((x) => x !== "R_INJ") || reasons.length ? "REVIEW" : "PASS", reasons };
  }
  return { state: blocked.length ? "BLOCKED" : review.length ? "REVIEW" : "PASS", reasons: [...blocked, ...review], cells };
}

/** Plain-language text per rule id (one table for every surface and the engine). */
export const GUARD_TEXT = Object.freeze({
  R1: "listed Out, Day-To-Day, Doubtful, Inactive or Suspended when the forecast froze",
  R2: "fewer than 3 games played this regular season",
  R3: "projected minutes are implausible (over 42, or more than 4 outside this season's range)",
  B_CAP: "projected for 48 minutes",
  B_GAP: "projected minutes 14+ away from this season's average",
  B_ELIG: "has not played this season, or missed the team's last two games",
  SUSPICIOUS_PROJECTION: "the projection row is malformed",
  R_41: "projected for 41+ minutes",
  R_GAP: "projected minutes 8+ away from this season's average",
  R_THIN: "fewer than 3 games played this season while the team has played 3+",
  R_NO_CURRENT: "the team has fewer than 3 games this season to check against",
  R_MISSED_1: "did not play in the team's last game",
  R_INJ: "carried an injury designation when the forecast froze",
  R_STAT: "the median is far from this season's average for this stat",
  GUARD_MISSING: "this slate's eligibility check is not available in this build",
});

// ── favoured-side rotation (leg-pool.mjs favouredAvailability, betting engine) — verbatim ───────────────────────────
export const ROTATION_SIZE = 5;
const R1_STATUS = /^(out|day|doubtful|inactive|suspen|injured reserve|questionable)/i;
export const FLAG_TEXT = Object.freeze({
  FAVOURED_ROTATION_OUT: "One of the favoured team's five highest-minute players this season is ruled Out; the Elo side does not account for it.",
  FAVOURED_ROTATION_R1: "One of the favoured team's five highest-minute players this season was listed Day-To-Day, Questionable or Doubtful at freeze; the Elo side does not account for it.",
  ROTATION_FROM_LANE: "No box scores yet this season for this team, so its rotation was read from projected minutes and a player ruled Out cannot be seen.",
});
/** The hub's compact words per flag (the page weight budget: the full FLAG_TEXT is on the game pages). */
export const FLAG_SHORT = Object.freeze({
  FAVOURED_ROTATION_OUT: "a rotation player is out",
  FAVOURED_ROTATION_R1: "a rotation player is listed day-to-day",
  GUARD_MISSING: "availability not checked",
});
/** Flags that put a game's favoured side under review. ROTATION_FROM_LANE alone does not: it says what could not be checked. */
export const REVIEW_FLAGS = Object.freeze(["FAVOURED_ROTATION_OUT", "FAVOURED_ROTATION_R1"]);

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : null; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const finite = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * The committed box scores a slate's guard may read: regular season (phase 2), final with a box score, ET date before
 * `date`, captured at or before `asOf`. Sorted by tip, then id. Pure (the caller reads the files).
 */
export function selectSeasonBoxscores(docs, { date, asOf }) {
  const at = Date.parse(asOf ?? "");
  return (docs ?? [])
    .filter((d) => d?.phase === 2 && d.status === "STATUS_FINAL" && d.boxscoreAvailable === true)
    .filter((d) => { const day = etDay(d.dateUtc); return day != null && day < date; })
    .filter((d) => Number.isFinite(at) && Date.parse(d.capturedAt) <= at)
    .sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
}

/** Per-team season history from box scores: { [teamAbbr]: { games: eventId[] (newest first), players: { [id]: rows[] } } }. */
export function seasonHistory(boxscores) {
  const teams = {};
  for (const d of boxscores) {
    const abbrOf = Object.fromEntries((d.teams ?? []).map((t) => [String(t.providerTeamId), t.abbr]));
    for (const t of d.teams ?? []) (teams[t.abbr] ??= { games: [], players: {} }).games.unshift(String(d.providerEventId));
    for (const p of d.players ?? []) {
      const ab = abbrOf[String(p.providerTeamId)];
      if (!ab || p.didNotPlay || !(Number(p.minutes) > 0)) continue;
      (teams[ab].players[String(p.providerAthleteId)] ??= []).push({ eventId: String(d.providerEventId), minutes: Number(p.minutes), pts: Number(p.pts ?? 0), reb: Number(p.reb ?? 0), ast: Number(p.ast ?? 0) });
    }
  }
  return teams;
}

/** The readiness row assessPlayer / guardReasons read, for one lane player on one team. */
export function readinessRow(player, team) {
  const rows = team?.players?.[String(player.providerAthleteId)] ?? [];
  const games = team?.games ?? [];
  const played = new Set(rows.map((r) => r.eventId));
  const ms = rows.map((r) => r.minutes);
  const n = rows.length;
  return {
    mu: Number(player.expectedMinutes), n, cur: mean(ms),
    minLo: n ? Math.min(...ms) : null, minHi: n ? Math.max(...ms) : null,
    teamGames: games.length,
    missedLast: games.length > 0 && !played.has(games[0]),
    missedTwo: games.length >= 2 && !played.has(games[0]) && !played.has(games[1]),
    injured: Boolean(player.injuryStatus),
    medians: { pts: player.medians?.pts, reb: player.medians?.reb, ast: player.medians?.ast },
    recent: n ? { pts: mean(rows.map((r) => r.pts)), reb: mean(rows.map((r) => r.reb)), ast: mean(rows.map((r) => r.ast)) } : null,
    lines: null, // no authorized NBA line: R_LINE never fires
  };
}

/**
 * The verdict for one lane player row.
 *   blocked  any of R1–R3, a readiness block, or a malformed projection (SUSPICIOUS_PROJECTION)
 *   review   a readiness review reason
 *   pass     none (a pass row may still carry an R_STAT cell, which withholds that cell only)
 */
export function playerGuard(player, team) {
  const r = readinessRow(player, team);
  const rules = guardReasons(r, player.injuryStatus ?? null);
  const a = assessPlayer(r);
  const malformed = !finite(r.mu) || r.mu < 0 || ["pts", "reb", "ast"].some((k) => !finite(r.medians[k]) || r.medians[k] < 0);
  if (malformed) rules.push("SUSPICIOUS_PROJECTION");
  const blocks = a.reasons.filter((x) => x.startsWith("B_"));
  const reviews = a.reasons.filter((x) => x.startsWith("R_"));
  const state = rules.length || blocks.length ? "blocked" : reviews.length ? "review" : "pass";
  const cells = Object.fromEntries(Object.entries(a.cells).map(([k, c]) => [k, c.reasons]));
  return {
    state, rules: [...rules, ...blocks], review: reviews, cells,
    history: { gamesPlayed: r.n, teamGames: r.teamGames, minutesRange: r.n ? [r.minLo, r.minHi] : null, minutesAvg: r.cur == null ? null : Math.round(r.cur * 10) / 10 },
  };
}

/**
 * Availability for one lane game's favoured side. THE ROTATION IS THE SEASON'S, NOT THE LANE'S: the lane drops every
 * player ruled Out, so ranking its projected players can never see an absent star. The rotation is the favoured team's
 * ROTATION_SIZE players with the most average minutes per game played in the selected box scores, Out or not.
 */
export function favouredAvailability(game, side, teamHistory = null) {
  if (!side) return { flags: [], rotation: [], rotationFlagged: [], outAtFreeze: [], rotationSource: null };
  const projected = game.players?.[side] ?? [];
  const unavailable = game.players?.unavailable?.[side] ?? [];
  const outAtFreeze = unavailable.filter((p) => p.reason === "RULED_OUT").map((p) => ({ playerId: String(p.providerAthleteId), name: p.name, status: p.status ?? "Out" }));
  const nameOf = new Map([...projected, ...unavailable].map((p) => [String(p.providerAthleteId), p.name]));
  const hist = Object.entries(teamHistory?.players ?? {}).filter(([, rows]) => rows.length > 0);
  const byId = (a, b) => String(a.playerId).localeCompare(String(b.playerId));
  const rotation = hist.length
    ? hist.map(([id, rows]) => ({ playerId: id, name: nameOf.get(id) ?? null, minutesAvg: Math.round((rows.reduce((n, r) => n + r.minutes, 0) / rows.length) * 10) / 10, gamesPlayed: rows.length }))
      .sort((a, b) => b.minutesAvg - a.minutesAvg || byId(a, b)).slice(0, ROTATION_SIZE)
    : [...projected].sort((a, b) => (b.expectedMinutes ?? 0) - (a.expectedMinutes ?? 0) || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId))).slice(0, ROTATION_SIZE)
      .map((p) => ({ playerId: String(p.providerAthleteId), name: p.name, minutesAvg: null, gamesPlayed: null }));
  const out = new Map(outAtFreeze.map((p) => [p.playerId, p]));
  const statusOf = new Map(projected.filter((p) => p.injuryStatus).map((p) => [String(p.providerAthleteId), p.injuryStatus]));
  const rotationFlagged = [];
  for (const r of rotation) {
    if (out.has(r.playerId)) rotationFlagged.push({ ...r, name: r.name ?? out.get(r.playerId).name, status: out.get(r.playerId).status, flag: "FAVOURED_ROTATION_OUT" });
    else if (statusOf.has(r.playerId) && R1_STATUS.test(statusOf.get(r.playerId))) rotationFlagged.push({ ...r, status: statusOf.get(r.playerId), flag: "FAVOURED_ROTATION_R1" });
  }
  const flags = [...new Set(rotationFlagged.map((r) => r.flag))].sort();
  if (!hist.length) flags.push("ROTATION_FROM_LANE");
  return { flags, rotation, rotationFlagged, outAtFreeze, rotationSource: hist.length ? "season-box-scores" : "lane-projected-minutes" };
}

/**
 * THE PER-SLATE GUARD DOCUMENT (written once beside the lane; read by every surface through the accessor).
 * @param {{ lane: any, boxscores: any[], inputs?: { count: number, sha256: string } | null }} a
 *   `lane`       the committed lane snapshot (nba-experimental-public-snapshot@1)
 *   `boxscores`  ALL committed box-score docs; this function selects the ones the slate may read (selectSeasonBoxscores)
 *   `inputs`     digest of the selected files (the builder computes it from their bytes; null in pure tests)
 * Every published player row gets a verdict, so a row missing from the document is never a silent pass (the accessor
 * withholds it as GUARD_MISSING). No wall clock: the document is a function of its inputs only.
 */
export function buildForecastGuard({ lane, boxscores, inputs = null }) {
  if (!lane?.date || !Array.isArray(lane.games)) throw new Error("buildForecastGuard: not a lane snapshot");
  const asOf = lane.generatedAt;
  if (!Number.isFinite(Date.parse(asOf ?? ""))) throw new Error("buildForecastGuard: the lane has no generatedAt");
  const selected = selectSeasonBoxscores(boxscores, { date: lane.date, asOf });
  const hist = seasonHistory(selected);
  const games = [];
  for (const g of lane.games) {
    const fav = g.elo?.state === "FAVOURED" ? g.elo.favoured : null;
    const side = fav && fav === g.home?.abbr ? "home" : fav && fav === g.away?.abbr ? "away" : null;
    const a = favouredAvailability(g, side, side ? hist[g[side]?.abbr] : null);
    const players = {};
    for (const s of ["away", "home"]) for (const p of g.players?.[s] ?? []) {
      const v = playerGuard(p, hist[g[s]?.abbr]);
      players[String(p.providerAthleteId)] = { side: s, state: v.state, rules: v.rules, review: v.review, cells: Object.fromEntries(Object.entries(v.cells).filter(([, rs]) => rs.length)), history: v.history };
    }
    games.push({
      providerEventId: String(g.providerEventId),
      receiptPayloadSha256: g.receipt?.payloadSha256 ?? null,
      favoured: { side, state: a.flags.some((f) => REVIEW_FLAGS.includes(f)) ? "review" : "pass", flags: a.flags, rotationSource: a.rotationSource, rotationFlagged: a.rotationFlagged.map((r) => ({ playerId: r.playerId, name: r.name, status: r.status, flag: r.flag })) },
      players,
    });
  }
  return {
    schema: FORECAST_GUARD_SCHEMA,
    date: lane.date,
    lane: { file: `app/public/data/nba/experimental-public/${lane.date}.json`, generatedAt: asOf },
    asOf,
    rules: "R1–R3 + readiness + favoured rotation (forecast-guard.mjs); hide-only — no number is changed",
    inputs: { boxscores: { dir: "data/internal/research/nba/experimental/boxscores", selected: selected.length, events: selected.map((d) => String(d.providerEventId)), ...(inputs ? { sha256: inputs.sha256 } : {}) } },
    games,
  };
}

/** Counts for a guard document (impact reports, the publish log). Pure. */
export function guardSummary(doc) {
  const s = { players: 0, pass: 0, review: 0, blocked: 0, cellOnly: 0, favouredReview: 0, byRule: {} };
  for (const g of doc?.games ?? []) {
    if (g.favoured?.state === "review") s.favouredReview += 1;
    for (const v of Object.values(g.players ?? {})) {
      s.players += 1; s[v.state] += 1;
      if (v.state === "pass" && Object.keys(v.cells ?? {}).length) s.cellOnly += 1;
      for (const r of [...v.rules, ...v.review, ...Object.values(v.cells ?? {}).flat()]) s.byRule[r] = (s.byRule[r] ?? 0) + 1;
    }
  }
  return s;
}
