/**
 * LEG POOL · NBA AVAILABILITY & PLAUSIBILITY GUARD. PURE (plus one read-only loader). Changes no forecast: it decides
 * only whether a projected player, or a game-winner side, may be shown as a usable leg.
 *
 * SAME LOGIC AS THE SOCIAL PACK. `guardReasons` (rules R1–R3) is app/scripts/social/nba-unified-roster.mjs and
 * `assessPlayer` is app/src/lib/sports/nba/player-readiness.mjs, both from origin/claude/p2-social-pack @ 948a8fde6a
 * (not on main yet). They are copied here with the SAME constants so the products and the social graphics hide the same
 * players. When that branch merges, import them from there and delete the copies (nba-guard.test.mjs pins the values).
 *
 * One difference, on purpose: the social pack fetches ESPN game logs live. This guard reads the COMMITTED 2026-27
 * regular-season box scores (data/internal/research/nba/experimental/boxscores), keeping only games whose ET date is
 * before the slate and that were captured at or before the evaluation instant. That makes it network-free and
 * replayable. Build-time injury status is the lane's own `injuryStatus` (frozen with the forecast).
 */
import fs from "node:fs";
import path from "node:path";

// ── nba-unified-roster.mjs (p2-social-pack), verbatim constants ─────────────────────────────────────────────────────
export const GUARD = Object.freeze({ minGames: 3, hardMinutes: 42, band: 4 });
const GUARD_STATUS = /^(out|day|doubtful|inactive|suspen|injured reserve)/i;
/** Guard rules that hide this player (empty = shown). `status` is the build-time injury status. */
export function guardReasons(r, status) {
  const G = GUARD; const out = [];
  if (status && GUARD_STATUS.test(status)) out.push("R1");
  if (!(r.n >= G.minGames)) out.push("R2");
  if (r.mu > G.hardMinutes || (r.minLo != null && r.mu < r.minLo - G.band) || (r.minHi != null && r.mu > r.minHi + G.band)) out.push("R3");
  return out;
}

// ── player-readiness.mjs (p2-social-pack), verbatim ─────────────────────────────────────────────────────────────────
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

export const GUARD_TEXT = Object.freeze({
  R1: "listed Out, Day-To-Day, Doubtful, Inactive or Suspended when the forecast froze",
  R2: "fewer than 3 games played this regular season",
  R3: "projected minutes are implausible (over 42, or more than 4 outside this season's range)",
  B_CAP: "projected for 48 minutes",
  B_GAP: "projected minutes 14+ away from this season's average",
  B_ELIG: "has not played this season, or missed the team's last two games",
  R_STAT: "the median is far from this season's average for this stat",
});

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? ET_DAY.format(new Date(t)) : null; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const BOXSCORE_DIR = "data/internal/research/nba/experimental/boxscores";

/**
 * Committed regular-season box scores usable for a slate: ET date before `date`, captured at or before `asOf`, final.
 * Returns the raw docs sorted by tip. A missing directory yields [] (every player then fails R2: never a silent pass).
 */
export function loadSeasonBoxscores({ repoRoot, date, asOf }) {
  const dir = path.join(repoRoot, BOXSCORE_DIR);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)); } catch { return []; }
  const out = [];
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    if (d?.phase !== 2 || d.status !== "STATUS_FINAL" || d.boxscoreAvailable !== true) continue;
    const day = etDay(d.dateUtc);
    if (!day || day >= date) continue;
    if (asOf && !(Date.parse(d.capturedAt) <= Date.parse(asOf))) continue;
    out.push(d);
  }
  return out.sort((a, b) => Date.parse(a.dateUtc) - Date.parse(b.dateUtc) || String(a.providerEventId).localeCompare(String(b.providerEventId)));
}

/**
 * Per-team season history from box scores: { [teamAbbr]: { games: eventId[] (newest first), players: { [id]: rows[] } } }.
 */
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

const finite = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * The guard verdict for one projected player.
 *   blocked  any of R1–R3, an assessPlayer block, or a malformed projection (SUSPICIOUS_PROJECTION)
 *   review   assessPlayer REVIEW (shown with its flags; never used as a conservative leg)
 *   pass     none
 * `cells` lists per-stat flags (R_STAT) so a single implausible median is withheld without hiding the player.
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
