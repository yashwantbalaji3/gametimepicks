/**
 * EPL CLOSING-LINE BENCHMARK (P258).
 *
 * The graded record says how the model scored. It cannot say whether that score is good: a log loss
 * of 0.95 is excellent in a season of upsets and poor in a season of favourites. The honest yardstick
 * is the market's own closing price on the SAME matches — football-data.co.uk's market-average
 * closing 1X2, de-vigged. This joins the two and scores both with the same formula, so the gap is the
 * only thing that differs.
 *
 * WHAT THIS IS NOT. It is not a validation and not a claim about wagering. A small sample of matches
 * says very little either way; `sampleState` carries that, and the standard error of the paired
 * difference is reported beside the mean so nobody reads noise as a result.
 *
 * Pure — the runner reads the ledger and the corpus.
 */

const KEY = { H: "home", D: "draw", A: "away" };
const clamp = (p) => Math.min(Math.max(p, 1e-12), 1);

/** "Arsenal v Coventry City" → ["Arsenal", "Coventry City"]. */
export function matchupTeams(matchup) {
  const parts = String(matchup ?? "").split(" v ");
  return parts.length === 2 ? parts.map((s) => s.trim()) : null;
}

/** Multi-class log loss and Brier (the ledger's own convention: sum over H/D/A). */
export function score1x2(probs, outcome) {
  const k = KEY[outcome];
  if (!k) return null;
  const logLoss = -Math.log(clamp(probs[k]));
  const brier = ["home", "draw", "away"].reduce((s, x) => s + (probs[x] - (x === k ? 1 : 0)) ** 2, 0);
  return { logLoss, brier };
}

/**
 * @param {{ graded: object[], corpusRows: object[], aliases?: Record<string,string>, toleranceHours?: number }} input
 */
export function joinClosing({ graded, corpusRows, aliases = {}, toleranceHours = 36 }) {
  const alias = (n) => aliases[n] ?? n;
  const joined = [];
  const unjoined = [];
  for (const g of graded) {
    const teams = matchupTeams(g.matchup);
    const probs = g.forecast?.probs;
    const outcome = g.actual?.outcome;
    if (!teams || !probs || !KEY[outcome]) { unjoined.push({ eventId: g.eventId, reason: "ledger row lacks matchup, forecast or outcome" }); continue; }
    const [home, away] = teams.map(alias);
    const t = Date.parse(g.kickoffUtc);
    // Same home and away, kickoff within the window — a pair meets at a given ground once a season, so
    // the window is what keeps a rematch from another season out.
    const c = corpusRows.find((r) => r.home === home && r.away === away && Math.abs(Date.parse(r.dateUtc) - t) <= toleranceHours * 3_600_000);
    if (!c) { unjoined.push({ eventId: g.eventId, reason: `no closing row for ${home} v ${away} near ${g.kickoffUtc}` }); continue; }
    const market = c.market?.close1x2;
    if (!market) { unjoined.push({ eventId: g.eventId, reason: "closing row has no 1X2 close" }); continue; }
    // Two sources recorded the result. If they disagree, neither score can be trusted.
    if (c.result && c.result !== outcome) { unjoined.push({ eventId: g.eventId, reason: `result mismatch: ledger ${outcome}, football-data ${c.result}` }); continue; }
    const m = score1x2(probs, outcome);
    const k = score1x2(market, outcome);
    joined.push({
      eventId: g.eventId, kickoffUtc: g.kickoffUtc, matchup: g.matchup, outcome,
      model: { home: probs.home, draw: probs.draw, away: probs.away, ...m },
      market: { home: market.home, draw: market.draw, away: market.away, ...k },
      logLossGap: m.logLoss - k.logLoss,
    });
  }
  return { joined, unjoined };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Gap = model minus market; lower log loss is better, so a positive gap means the market scored better. */
export function summarizeBenchmark(joined) {
  const n = joined.length;
  const gaps = joined.map((r) => r.logLossGap);
  const gapMean = mean(gaps);
  const sd = n > 1 ? Math.sqrt(gaps.reduce((s, g) => s + (g - gapMean) ** 2, 0) / (n - 1)) : null;
  return {
    matches: n,
    sampleState: n === 0 ? "NONE" : n < 20 ? "TOO_SMALL_TO_ASSESS" : "ACCUMULATING",
    model: { meanLogLoss: mean(joined.map((r) => r.model.logLoss)), meanBrier: mean(joined.map((r) => r.model.brier)) },
    market: { meanLogLoss: mean(joined.map((r) => r.market.logLoss)), meanBrier: mean(joined.map((r) => r.market.brier)) },
    logLossGap: { mean: gapMean, standardError: sd == null ? null : sd / Math.sqrt(n) },
  };
}
