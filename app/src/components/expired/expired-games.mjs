/**
 * EXPIRED GAME LINKS — what the 404 page can say about a Game Simulation / game report URL that existed on game day
 * (founder P1 2026-10-26, release-owner decision: no archive of past simulation pages — instead, every expired link lands
 * on the existing tombstone plus the game's final, its forecast against the result, and the results link).
 *
 * No fs, no React. The build writes a small index (expired-games-index.ts, from committed public files only) to
 * EXPIRED_GAMES_URL, and the 404 notices fetch it and apply it to window.location. Every figure is a recorded final or a graded
 * row, verbatim; nothing is recomputed, and a game the records do not hold gets the plain expiry note — never a score.
 *
 * Index shapes (compact tuples, because every expired link fetches them):
 *   nba  { [providerEventId]: [awayScore, homeScore, winnerSide "home"|"away", favouredSide "home"|"away"|null] }
 *        (date + matchup come from the existing NBA map in components/nba/expired-simulation.mjs)
 *   mlb  { [slug]: [date, "AWY @ HOM", awayRuns, homeRuns, [[market, pick, modelProbability, outcome], ...]] }
 *   ufc  { [providerBoutId]: [date, card, red, blue, winner|null, predicted|null, modelProbability|null, hit|null] }
 */

/** How far back each sport's index reaches (bytes stay small; older links get the plain expiry note). */
export const EXPIRED_GAMES_MAX_DAYS = 30;

export const RESULTS_LINK = Object.freeze({ mlb: "/results/mlb/", ufc: "/results/picks/ufc/" });

/**
 * The build-time index file (app/data/expired-games.json/route.ts). Fetched by the 404 notices only on a matching path —
 * never passed as a 404 prop, because the root not-found tree rides in every page's flight payload.
 */
export const EXPIRED_GAMES_URL = "/data/expired-games.json";

/** @typedef {{ nba?: Record<string, [number, number, "home" | "away", "home" | "away" | null]>, mlb?: Record<string, any[]>, ufc?: Record<string, any[]> }} ExpiredGamesFile */
/** @type {Promise<ExpiredGamesFile | null> | null} */
let pending = null;
/**
 * The index `{ nba, mlb, ufc }`, fetched once per page; null when it cannot be read (the notices then say less, never guess).
 * @returns {Promise<ExpiredGamesFile | null>}
 */
export function loadExpiredGames() {
  pending ??= fetch(EXPIRED_GAMES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return pending;
}

const MLB_PATH = /^\/games\/mlb\/([a-z0-9]+-vs-[a-z0-9]+-\d{4}-\d{2}-\d{2}(?:-[a-z0-9]+)?)\/?$/;
const UFC_PATH = /^\/ufc\/bout\/(\d{6,12})\/?$/;

/** Graded MLB market → reader words. */
export const MLB_MARKET_WORDS = Object.freeze({ moneyline: "Winner", total: "Total runs", run_line: "Run line", run_line_posted: "Run line" });
export const OUTCOME_WORDS = Object.freeze({ WIN: "right", LOSS: "wrong", PUSH: "push", VOID: "void" });

/**
 * MLB index from graded game-prediction rows (public/data/mlb/results/game-predictions-graded.jsonl): one entry per game
 * slug `<away>-vs-<home>-<date>` (the game report's own slug rule, lib/game-detail.ts). A slug two games share (a
 * doubleheader) is dropped rather than guessed.
 */
export function mlbExpiredIndex(rows, { sinceDate }) {
  const games = new Map();
  for (const r of rows ?? []) {
    if (!r?.date || r.date < sinceDate || !r.actual || !/^[A-Z]{2,3} @ [A-Z]{2,3}$/.test(String(r.matchup ?? ""))) continue;
    const [away, home] = r.matchup.split(" @ ");
    const slug = `${away.toLowerCase()}-vs-${home.toLowerCase()}-${r.date}`;
    const g = games.get(slug) ?? { pks: new Set(), row: r, picks: [] };
    g.pks.add(String(r.gamePk));
    if (MLB_MARKET_WORDS[r.market] && typeof r.modelProbability === "number" && r.outcome) g.picks.push([r.market, String(r.pick ?? ""), r.modelProbability, r.outcome]);
    games.set(slug, g);
  }
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const [slug, g] of games) {
    if (g.pks.size !== 1) continue;
    const r = g.row;
    out[slug] = [r.date, r.matchup, r.actual.awayRuns, r.actual.homeRuns, g.picks];
  }
  return out;
}

const names = (a, b) => [String(a ?? "").trim().toLowerCase(), String(b ?? "").trim().toLowerCase()].sort().join("|");

/**
 * UFC index from the results capture (public/data/ufc/results/latest.json — rows keyed by the ESPN bout id, the id in a
 * /ufc/bout/<id>/ URL) and the graded winner picks (public/data/ufc/graded-picks.json, keyed "<date>:<a>|<b>"), joined
 * by date and BOTH fighter names exactly — never by one name.
 */
export function ufcExpiredIndex(resultRows, gradedPicks, { sinceDate }) {
  const graded = new Map((gradedPicks ?? []).filter((p) => p?.market === "Fight winner").map((p) => [String(p.eventId).toLowerCase(), p]));
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const r of resultRows ?? []) {
    const id = String(r?.providerBoutId ?? "");
    const date = String(r?.eventDateUtc ?? r?.dateUtc ?? "").slice(0, 10);
    if (!/^\d{6,12}$/.test(id) || !date || date < sinceDate || !r.red?.name || !r.blue?.name) continue;
    const winner = r.redWinner === true ? r.red.name : r.blueWinner === true ? r.blue.name : null;
    // the graded key carries the card's date; a late card's UTC date can be the day after its ET date, so try both
    const iso = String(r?.eventDateUtc ?? r?.dateUtc ?? "");
    const et = Number.isFinite(Date.parse(iso)) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null;
    const pair = names(r.red.name, r.blue.name);
    const g = graded.get(`${date}:${pair}`) ?? (et ? graded.get(`${et}:${pair}`) : null) ?? null;
    out[id] = [date, String(r.cardName ?? ""), r.red.name, r.blue.name, winner, g?.predicted ?? null, typeof g?.modelProbability === "number" ? g.modelProbability : null, typeof g?.hit === "boolean" ? g.hit : null];
  }
  return out;
}

/** NBA facts for the ids the existing NBA map names: the recorded final and the frozen Elo side. */
export function nbaExpiredFacts(nbaMap, finals, lanes) {
  const fin = new Map((finals ?? []).filter((f) => f?.statusRaw === "STATUS_FINAL" || f?.winnerSide).map((f) => [String(f.providerEventId), f]));
  const side = new Map();
  for (const l of lanes ?? []) for (const g of l?.games ?? []) {
    const fav = g?.elo?.state === "FAVOURED" ? g.elo.favoured : null;
    side.set(String(g.providerEventId), fav && fav === g.home?.abbr ? "home" : fav && fav === g.away?.abbr ? "away" : null);
  }
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const id of Object.keys(nbaMap ?? {})) {
    const f = fin.get(id);
    if (!f || !Number.isFinite(f.ftAway) || !Number.isFinite(f.ftHome) || (f.winnerSide !== "home" && f.winnerSide !== "away")) continue;
    out[id] = [f.ftAway, f.ftHome, f.winnerSide, side.get(id) ?? null];
  }
  return out;
}

/** What the 404 page says for an MLB or UFC path: null for any other path. */
export function expiredGameFor(pathname, idx) {
  const p = String(pathname ?? "");
  let m = MLB_PATH.exec(p);
  if (m) {
    const g = idx?.mlb?.[m[1]];
    return g ? { sport: "mlb", kind: "KNOWN", key: m[1], date: g[0], matchup: g[1], awayRuns: g[2], homeRuns: g[3], picks: g[4], resultsHref: RESULTS_LINK.mlb }
      : { sport: "mlb", kind: "UNKNOWN", key: m[1], resultsHref: RESULTS_LINK.mlb };
  }
  m = UFC_PATH.exec(p);
  if (m) {
    const b = idx?.ufc?.[m[1]];
    return b ? { sport: "ufc", kind: "KNOWN", key: m[1], date: b[0], card: b[1], red: b[2], blue: b[3], winner: b[4], predicted: b[5], probability: b[6], hit: b[7], resultsHref: RESULTS_LINK.ufc }
      : { sport: "ufc", kind: "UNKNOWN", key: m[1], resultsHref: RESULTS_LINK.ufc };
  }
  return null;
}
