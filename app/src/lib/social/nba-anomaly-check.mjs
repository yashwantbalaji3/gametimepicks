/**
 * NBA DAILY ANOMALY CHECK. PURE: no I/O, no clock, no network. Runs before a stat or Top 5 package is built and tells the
 * founder which rows need a look. It changes no forecast, ranking or published number; a REVIEW only asks for a human.
 *
 * THRESHOLD (a review trigger, not a methodology constant and never shown on a card). For each market it is the 80th
 * percentile of |actual - frozen median| over the committed graded rows of data/internal/research/nba/prop-grades/v0.1,
 * players expected at 15+ minutes who played. That is the distance the model itself exceeds on one row in five, so a gap
 * beyond it is more than this model's ordinary miss. `typical` is the 50th percentile, used to say "the line agrees".
 *
 * TWO COMPARISONS. Median vs compared line where a line exists; median vs the player's own average since the lane began
 * (`laneHistory`: prior published lanes joined to box scores, 3+ games) on every package, so model-only packages have one.
 *
 * NO PRICES. `detail` is built from the model and box scores only: never a line, a gap to a line, a price or a book.
 */
export const ANOMALY_SCHEMA = "gtp-anomaly-check@1";
export const REVIEW_QUANTILE = 0.8;
export const TYPICAL_QUANTILE = 0.5;
export const MIN_EXPECTED_MINUTES = 15;
export const MIN_HISTORY_GAMES = 3;
/** Which cause gets the label. These sort a row that was already flagged; they trigger nothing. */
export const ROLE_SHIFT = 0.5;
export const MINUTES_SHIFT = 0.1;
export const RATE_SHIFT = 0.15;

export const VERDICT = Object.freeze({
  GENUINE_EXPECTATION: "GENUINE_EXPECTATION",
  INCORRECT_MINUTES: "INCORRECT_MINUTES",
  STALE_PLAYER_ROSTER: "STALE_PLAYER_ROSTER",
  BAD_JOIN: "BAD_JOIN",
  MODEL_DEFECT: "MODEL_DEFECT",
  SPORTSBOOK_MISMATCH: "SPORTSBOOK_MISMATCH",
  LEGITIMATE_LARGE_DISAGREEMENT: "LEGITIMATE_LARGE_DISAGREEMENT",
});
export const ANOMALY_MARKETS = Object.freeze(["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst"]);
const PARTS = Object.freeze({ pts: ["pts"], reb: ["reb"], ast: ["ast"], threePm: ["threePm"], pra: ["pts", "reb", "ast"], ptsReb: ["pts", "reb"], ptsAst: ["pts", "ast"] });

const nearestRank = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

/** @param {Array<any>} graded ledger rows (latest per key), any state; only GRADED rows count. */
export function reviewThresholds(graded) {
  const byMarket = {};
  for (const market of ANOMALY_MARKETS) {
    const errs = (graded ?? []).filter((x) => x.state === "GRADED" && x.family === market && x.measurement?.minutes > 0 && x.frozen?.expectedMinutes >= MIN_EXPECTED_MINUTES).map((x) => Math.abs(x.measurement.actual - x.frozen.median));
    if (!errs.length) throw new Error(`reviewThresholds: no graded rows for ${market}`);
    byMarket[market] = { n: errs.length, review: nearestRank(errs, REVIEW_QUANTILE), typical: nearestRank(errs, TYPICAL_QUANTILE) };
  }
  return { rule: `P${REVIEW_QUANTILE * 100} of |actual - frozen median|, expected minutes >= ${MIN_EXPECTED_MINUTES}, played`, byMarket };
}

/** One row per published player per market. */
export function laneRows(lane) {
  return (lane?.games ?? []).flatMap((g) => ["away", "home"].flatMap((side) => (g.players?.[side] ?? []).flatMap((p) => ANOMALY_MARKETS.map((market) => ({
    playerId: String(p.providerAthleteId), name: p.name, team: g[side].abbr, eventId: String(g.providerEventId), market, expectedMinutes: p.expectedMinutes, median: p.medians?.[market] ?? p.comboMedians?.[market] ?? null,
  })).filter((r) => r.median != null))));
}

/**
 * Each player's record since the lane began: prior lanes joined to box scores.
 * @param {Array<any>} priorLanes  lanes dated before the slate
 * @param {Map<string, any>} boxByEvent  event id -> box-score document
 * @returns {Map<string, {games:number, minutes:number, starterShare:number, totals:Record<string,number>}>}
 */
export function laneHistory(priorLanes, boxByEvent) {
  const seen = new Map();
  for (const lane of priorLanes ?? []) for (const g of lane.games ?? []) {
    const box = boxByEvent.get(String(g.providerEventId));
    if (!box || box.status !== "STATUS_FINAL") continue;
    const players = new Map((box.players ?? []).map((p) => [String(p.providerAthleteId), p]));
    for (const side of ["away", "home"]) for (const p of g.players?.[side] ?? []) {
      const id = String(p.providerAthleteId);
      const b = players.get(id);
      if (!b || b.didNotPlay || !(b.minutes > 0)) continue;
      if (!seen.has(id)) seen.set(id, new Map());
      seen.get(id).set(String(g.providerEventId), b);
    }
  }
  const out = new Map();
  for (const [id, games] of seen) {
    const rows = [...games.values()];
    const avg = (k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0) / rows.length;
    out.set(id, { games: rows.length, minutes: avg("minutes"), starterShare: rows.filter((r) => r.starter).length / rows.length, totals: { pts: avg("pts"), reb: avg("reb"), ast: avg("ast"), threePm: avg("threePm") } });
  }
  return out;
}

const historyMean = (h, market) => PARTS[market].reduce((s, k) => s + h.totals[k], 0);

function cause(row, h, histMean, windowStarterRate) {
  const form = `${h.games} recent games`;
  if (windowStarterRate != null && Math.abs(windowStarterRate - h.starterShare) >= ROLE_SHIFT) return [VERDICT.STALE_PLAYER_ROSTER, `Model window has him starting ${Math.round(windowStarterRate * 100)}% of games; he started ${Math.round(h.starterShare * 100)}% of ${form}.`];
  const em = row.expectedMinutes;
  if (em > 0 && Math.abs(em - h.minutes) / h.minutes >= MINUTES_SHIFT) return [VERDICT.INCORRECT_MINUTES, `Expected minutes ${r1(em)} vs ${r1(h.minutes)} over ${form}.`];
  if (em > 0 && histMean > 0 && Math.abs(row.median / em / (histMean / h.minutes) - 1) >= RATE_SHIFT) return [VERDICT.MODEL_DEFECT, `Per-minute rate ${(row.median / em).toFixed(2)} from the model window vs ${(histMean / h.minutes).toFixed(2)} over ${form}.`];
  return null;
}

/**
 * @param {{ rows: Array<any>, thresholds: any, history: Map<string, any>, lines?: Array<{playerId:string, market:string, line:number, team?:string|null, spread?:number|null}>|null, windowStarterRate?: Map<string, number> }} o
 * @returns {{ schema:string, anomalyCheck:"PASS"|"REVIEW", anomalies:Array<{playerId:string, market:string, verdict:string, detail:string}>, compared:{rows:number, withLine:number, withHistory:number} }}
 */
export function runAnomalyCheck({ rows, thresholds, history, lines = null, windowStarterRate = new Map() }) {
  const lineFor = new Map((lines ?? []).map((l) => [`${l.playerId}:${l.market}`, l]));
  const known = new Set(rows.map((r) => `${r.playerId}:${r.market}`));
  const anomalies = [];
  let withLine = 0; let withHistory = 0;
  for (const l of lines ?? []) if (!known.has(`${l.playerId}:${l.market}`)) anomalies.push({ playerId: String(l.playerId), market: l.market, verdict: VERDICT.BAD_JOIN, detail: "A compared line has no published model row for this player and market." });
  for (const r of rows) {
    const t = thresholds.byMarket[r.market];
    const l = lineFor.get(`${r.playerId}:${r.market}`);
    const h = history.get(r.playerId);
    const usable = h && h.games >= MIN_HISTORY_GAMES ? h : null;
    if (l) withLine += 1;
    if (usable) withHistory += 1;
    const push = (verdict, detail) => anomalies.push({ playerId: r.playerId, market: r.market, verdict, detail: `${r.name} ${r.market}: ${detail}` });
    if (l?.team && l.team !== r.team) { push(VERDICT.BAD_JOIN, "The compared line is filed under a different team than the lane."); continue; }
    if (l?.spread != null && l.spread > t.review) { push(VERDICT.SPORTSBOOK_MISMATCH, "Books disagree with each other by more than the review threshold."); continue; }
    const gap = l ? r.median - l.line : null;
    const histMean = usable ? historyMean(usable, r.market) : null;
    const lineBeyond = gap != null && Math.abs(gap) > t.review;
    const histBeyond = histMean != null && Math.abs(r.median - histMean) > t.review;
    if (!lineBeyond && !histBeyond) continue;
    const dir = (lineBeyond ? gap : r.median - histMean) < 0 ? "below" : "above";
    const against = lineBeyond ? "the compared line" : "his recent average";
    if (l && !lineBeyond && Math.abs(gap) <= t.typical) { push(VERDICT.GENUINE_EXPECTATION, `Model ${dir} his recent average, but the compared line agrees with the model.`); continue; }
    const head = `Model ${dir} ${against}, beyond the review threshold.`;
    if (!usable) { push(VERDICT.LEGITIMATE_LARGE_DISAGREEMENT, `${head} Fewer than ${MIN_HISTORY_GAMES} recent games, cause not established.`); continue; }
    const c = cause(r, usable, histMean, windowStarterRate.get(r.playerId) ?? null);
    if (c) push(c[0], `${head} ${c[1]}`);
    else push(VERDICT.LEGITIMATE_LARGE_DISAGREEMENT, `${head} Minutes, role and rate match his ${usable.games} recent games.`);
  }
  return { schema: ANOMALY_SCHEMA, anomalyCheck: anomalyStatus(anomalies), anomalies, compared: { rows: rows.length, withLine, withHistory } };
}

/** REVIEW when anything other than a confirmed expectation is on the list. */
export const anomalyStatus = (anomalies) => (anomalies.some((a) => a.verdict !== VERDICT.GENUINE_EXPECTATION) ? "REVIEW" : "PASS");

/** The part of a check one package prints. */
export function anomaliesFor(check, playerIds, markets) {
  const ids = new Set([...playerIds].map(String));
  const anomalies = check.anomalies.filter((a) => ids.has(a.playerId) && markets.includes(a.market));
  return { anomalies, anomalyCheck: anomalyStatus(anomalies) };
}
