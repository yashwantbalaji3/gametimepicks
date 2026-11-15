/**
 * NFL PLAYER EVIDENCE (founder directive 2026-11-15, P2): the actual recent games behind every displayed projection.
 *
 * Source: data/internal/research/nfl/player-events-v1/<season>.json (ESPN public game summaries, compact derived stat
 * lines). HISTORY ONLY — never a model input, never a forecast, never a price.
 *
 * Honesty rules this module enforces (and its tests pin):
 *  - A team game the player has NO stat line for is kept in the window as NO_STAT_LINE (did not play, or recorded no
 *    stat). It is never dropped, because dropping it would hide a miss (a receiver with 0 targets has no ESPN row).
 *  - A hit rate exists only against an OBSERVED sportsbook line passed in by the caller. No line ⇒ NO_OBSERVED_LINE,
 *    never a substitute threshold (not the model median, not a round number).
 *  - An N/N badge ("5/5") needs N complete games: every game in the window has a stat line. Otherwise the record is
 *    INCOMPLETE (with hits/recorded/missing) or SHORT_SAMPLE, and carries no badge.
 *  - The basis is explicit: TODAY_LINE (each past game vs today's line) or OWN_LINE (each past game vs the line captured
 *    before THAT game). They are different claims and are never merged.
 */

export const EVIDENCE_SCHEMA = "gtp.nfl.player-evidence@1";
export const EVIDENCE_REL = "data/internal/research/nfl/player-evidence/latest.json";
export const WINDOW_MAX = 10;

/** family → how its actual value is read from a compact stat line. */
export const FAMILY_STAT = {
  player_receptions: { label: "Receptions", unit: "rec", read: (p) => p.rec ?? 0 },
  player_reception_yds: { label: "Receiving yards", unit: "yds", read: (p) => p.recYds ?? 0 },
  player_rush_yds: { label: "Rushing yards", unit: "yds", read: (p) => p.rushYds ?? 0 },
  player_rush_att: { label: "Rushing attempts", unit: "att", read: (p) => p.rushAtt ?? 0 },
  player_pass_yds: { label: "Passing yards", unit: "yds", read: (p) => p.passYds ?? 0 },
  player_pass_td: { label: "Passing TDs", unit: "TD", read: (p) => p.passTd ?? 0 },
  player_pass_att: { label: "Pass attempts", unit: "att", read: (p) => p.passAtt ?? 0 },
  player_pass_cmp: { label: "Completions", unit: "cmp", read: (p) => p.passCmp ?? 0 },
  player_pass_int: { label: "Interceptions", unit: "INT", read: (p) => p.passInt ?? 0 },
  /* rushing or receiving touchdown; return / fumble-recovery touchdowns are not in the compact line (documented gap) */
  anytime_td: { label: "Rush or receiving TD", unit: "TD", read: (p) => (p.recTd ?? 0) + (p.rushTd ?? 0) },
};

/** player-events-v1 stores home/away as the abbreviation string; older fixtures used { abbr }. Accept both. */
/* Game sides come from nflverse codes (LA, WAS); player rows and the public boards use ESPN codes (LAR, WSH). One form. */
export const ESPN_ABBR = { LA: "LAR", WAS: "WSH" };
export const abbrOf = (side) => { const a = typeof side === "string" ? side : side?.abbr ?? null; return a == null ? null : ESPN_ABBR[a] ?? a; };
const ms = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; };
const STAT_KEYS = ["targets", "rec", "recYds", "recTd", "rushAtt", "rushYds", "rushTd", "passCmp", "passAtt", "passYds", "passTd", "passInt"];

/**
 * PURE. The player's last `n` games before `kickoff`, most recent first. A game is in the window when the player has a
 * stat line in it (any team), or when it is a game of `team` played after the player's first stat line for `team`
 * (then it is NO_STAT_LINE). Games of the current team before he joined it are not his games and are not counted.
 */
export function gameLog(games, playerId, team, kickoff, n = WINDOW_MAX) {
  const k = ms(kickoff);
  const before = games.filter((g) => ms(g.dateUtc) != null && ms(g.dateUtc) < k).sort((a, b) => ms(b.dateUtc) - ms(a.dateUtc));
  const rowOf = (g) => g.players?.find((x) => x.playerId === playerId) ?? null;
  let joined = null;
  for (const g of before) { const r = rowOf(g); if (r && r.teamAbbr === team) joined = g.dateUtc; }
  const out = [];
  for (const g of before) {
    const r = rowOf(g);
    const H = abbrOf(g.home), A = abbrOf(g.away);
    const teamGame = H === team || A === team;
    if (!r && !(teamGame && joined != null && ms(g.dateUtc) >= ms(joined))) continue;
    const t = r?.teamAbbr ?? team;
    const home = H === t;
    const entry = {
      eventId: String(g.providerEventId), season: g.season, week: g.week, date: String(g.dateUtc).slice(0, 10),
      team: t, opponent: home ? A : H, homeAway: home ? "H" : "A",
      score: g.ftHome != null && g.ftAway != null ? (home ? `${g.ftHome}-${g.ftAway}` : `${g.ftAway}-${g.ftHome}`) : null,
      state: r ? "STAT_LINE" : "NO_STAT_LINE",
    };
    if (r) entry.stats = Object.fromEntries(STAT_KEYS.filter((s) => r[s] != null).map((s) => [s, r[s]]));
    out.push(entry);
    if (out.length === n) break;
  }
  return out;
}

/** PURE. The family's actual value in one log entry, or null when the game has no stat line. */
export function valueOf(entry, family) {
  const f = FAMILY_STAT[family];
  if (!f) throw new Error(`unknown family ${family}`);
  return entry.state === "STAT_LINE" ? f.read(entry.stats ?? {}) : null;
}

/** PURE. Descriptive summary over the first `n` entries: recorded values only, and how many had no stat line. */
export function summary(log, family, n) {
  const win = log.slice(0, n);
  const vals = win.map((e) => valueOf(e, family)).filter((v) => v != null);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = !sorted.length ? null : sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { window: n, games: win.length, recorded: vals.length, noStatLine: win.length - vals.length, values: win.map((e) => valueOf(e, family)), mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, median, min: vals.length ? sorted[0] : null, max: vals.length ? sorted[sorted.length - 1] : null };
}

/**
 * PURE. The record against an observed line over the first `n` entries.
 *   basis TODAY_LINE: `line` is today's observed line {line, sportsbook, capturedAt}; every past game is compared to it.
 *   basis OWN_LINE:   `lineFor(entry)` returns the line captured before THAT game (or null); a game without one is
 *                     NO_OWN_LINE and makes the record INCOMPLETE.
 * States: NO_OBSERVED_LINE | SHORT_SAMPLE | INCOMPLETE | COMPLETE. Only COMPLETE carries `badge` ("5/5").
 * A push (value === line on an integer line) is counted separately and is neither a hit nor a miss.
 */
/**
 * @param {any[]} log @param {string} family @param {number} n
 * @param {{ basis?: string, line?: { line: number, sportsbook?: string, capturedAt?: string } | null, lineFor?: ((e: any) => ({ line: number } | null)) | null, side?: string }} [opts]
 * @returns {{ state: string, basis: string, window: number, side?: string, games?: number, hits?: number, misses?: number, pushes?: number, missing?: number, line?: any, badge?: string, rate?: number | null }}
 */
export function lineRecord(log, family, n, { basis = "TODAY_LINE", line = null, lineFor = null, side = "over" } = {}) {
  if (basis === "TODAY_LINE" && (line == null || !Number.isFinite(line.line))) return { state: "NO_OBSERVED_LINE", basis, window: n };
  if (basis === "OWN_LINE" && typeof lineFor !== "function") return { state: "NO_OBSERVED_LINE", basis, window: n };
  const win = log.slice(0, n);
  let hits = 0, misses = 0, pushes = 0, missing = 0;
  for (const e of win) {
    const v = valueOf(e, family);
    const L = basis === "TODAY_LINE" ? line.line : lineFor(e)?.line;
    if (v == null || L == null || !Number.isFinite(L)) { missing++; continue; }
    if (v === L) pushes++;
    else if (side === "over" ? v > L : v < L) hits++;
    else misses++;
  }
  const base = { basis, side, window: n, games: win.length, hits, misses, pushes, missing, line: basis === "TODAY_LINE" ? line : null };
  if (win.length < n) return { ...base, state: "SHORT_SAMPLE" };
  if (missing > 0) return { ...base, state: "INCOMPLETE" };
  const decided = hits + misses;
  return { ...base, state: "COMPLETE", badge: `${hits}/${n}`, rate: decided ? hits / decided : null };
}

/**
 * PURE. Trend tier for discovery (Trends, Bank Builder, Moonshot screening). DESCRIPTIVE ONLY: a tier is a historical
 * screen, never a probability. Tier needs a COMPLETE record with no pushes over exactly 5 games.
 */
export function trendTier(rec) {
  if (!rec || rec.state !== "COMPLETE" || rec.window !== 5 || rec.pushes > 0) return null;
  return rec.hits === 5 ? "5/5" : rec.hits === 4 ? "4/5" : rec.hits === 3 ? "3/5" : null;
}

/**
 * PURE. The compact evidence file for a set of upcoming boards: eventId → playerId → last-10 log. Deterministic: no
 * wall-clock; `source` carries the player-events content hash so a rebuild from the same inputs is byte-identical.
 */
export function buildEvidenceFile({ boards, games, sourceHash }) {
  const events = {};
  for (const b of [...boards].sort((a, c) => String(a.providerEventId).localeCompare(String(c.providerEventId)))) {
    const players = {};
    for (const p of [...(b.players ?? [])].sort((a, c) => a.playerId.localeCompare(c.playerId))) {
      players[p.playerId] = gameLog(games, p.playerId, p.team, b.kickoffUtc, WINDOW_MAX);
    }
    events[String(b.providerEventId)] = { kickoffUtc: b.kickoffUtc, players };
  }
  return { schema: EVIDENCE_SCHEMA, label: "HISTORY — actual games before each kickoff; not a forecast, not a price", source: { artifact: "player-events-v1", contentHash: sourceHash ?? null }, events };
}
