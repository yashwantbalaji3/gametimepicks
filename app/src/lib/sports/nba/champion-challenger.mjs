/**
 * NBA CHAMPION / CHALLENGER EVALUATOR — PURE, no I/O. REPORT ONLY: it promotes nothing, writes no registry, and its
 * verdict is an input to a founder decision recorded in promotion-record.mjs, never a decision itself.
 *
 * Compares the champion family (v0.1, founder N1) against each challenger (v0.2, v1) on the SAME graded forward rows:
 *   - games: identical providerEventId in both ledgers' current view, both graded, REGULAR season only (prereg §3:
 *     preseason never counts), both forecasts frozen before tip (§8: timing.preTip === true in BOTH), same final;
 *   - players: identical providerAthleteId matched in both families' rows for that game, expectedMinutes ≥ 20 in BOTH
 *     (§6; 3PM also rate ≥ 0.05/min in both) — so neither side is scored on rows the other was not.
 * Each market gets the paired difference (challenger − champion; for every loss here LOWER IS BETTER, so a negative
 * difference favours the challenger) with a game-clustered percentile bootstrap interval (player rows within a game
 * are not independent). A direction is claimed only when the interval excludes 0.
 *
 * Verdict per market (never pooled across markets, §7 "No adoption on a pooled all-market score"):
 *   INSUFFICIENT_N            paired n below the §6 minimum
 *   NOT_READY                 n met, but the interval includes 0 or favours the champion, or the challenger fails /
 *                             cannot evaluate a §7 bar on the paired rows
 *   READY_FOR_FOUNDER_REVIEW  n met, interval excludes 0 in the challenger's favour, and the challenger's §7 state on
 *                             the paired rows is BARS_HOLD. Still not a promotion: §8 + a founder-approved record are.
 */
import { validationMetrics, PREREG, MARKET_STATE } from "./grader-metrics.mjs";
import { LABELS } from "./experimental-forecast.mjs";
import { isDisputedFinal } from "./experimental-grading-ledger.mjs";

export const EVALUATOR_VERSION = "nba-champion-challenger-1";
export const VERDICT = Object.freeze({ INSUFFICIENT_N: "INSUFFICIENT_N", NOT_READY: "NOT_READY", READY_FOR_FOUNDER_REVIEW: "READY_FOR_FOUNDER_REVIEW" });
export const BOOTSTRAP_DEFAULTS = Object.freeze({ B: 2000, seed: 20261020, alpha: 0.05 });
const REGULAR = LABELS[2];
const STATS = ["pts", "reb", "ast", "threePm"];

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4)));

/** Deterministic PRNG (mulberry32) — a report must re-derive byte-for-byte from the same ledgers. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cluster (by game) percentile bootstrap of the pooled mean of `values`.
 * @param clusters  Array<number[]> — one array of values per game (empty arrays ignored)
 */
export function clusterBootstrap(clusters, { B = BOOTSTRAP_DEFAULTS.B, seed = BOOTSTRAP_DEFAULTS.seed, alpha = BOOTSTRAP_DEFAULTS.alpha } = {}) {
  const cs = clusters.map((c) => c.filter(Number.isFinite)).filter((c) => c.length);
  const sums = cs.map((c) => c.reduce((s, x) => s + x, 0));
  const ns = cs.map((c) => c.length);
  const n = ns.reduce((s, x) => s + x, 0);
  if (!cs.length) return { n: 0, clusters: 0, mean: null, lo: null, hi: null, B, seed, alpha };
  const mean = sums.reduce((s, x) => s + x, 0) / n;
  if (cs.length < 2) return { n, clusters: cs.length, mean: r4(mean), lo: null, hi: null, B, seed, alpha, note: "one cluster — no interval" };
  const rnd = mulberry32(seed);
  const stats = new Float64Array(B);
  for (let b = 0; b < B; b += 1) {
    let s = 0, k = 0;
    for (let i = 0; i < cs.length; i += 1) { const j = Math.floor(rnd() * cs.length); s += sums[j]; k += ns[j]; }
    stats[b] = s / k;
  }
  stats.sort();
  const q = (p) => stats[Math.min(B - 1, Math.max(0, Math.floor(p * B)))];
  return { n, clusters: cs.length, mean: r4(mean), lo: r4(q(alpha / 2)), hi: r4(q(1 - alpha / 2)), B, seed, alpha };
}

/** Pair two families' current grades on identical, eligible games. */
export function pairGames(champion, challenger, { underReview = new Set() } = {}) {
  const byId = (gs) => new Map((gs ?? []).filter((g) => g?.graded).map((g) => [String(g.providerEventId), g]));
  const A = byId(champion), Bm = byId(challenger);
  const excluded = { onlyChampion: 0, onlyChallenger: 0, notRegularSeason: 0, notPreTip: 0, receiptNotVerified: 0, disputedFinal: 0, finalMismatch: 0, boxscoreMismatch: 0 };
  const pairs = [];
  for (const [id, a] of A) {
    const b = Bm.get(id);
    if (!b) { excluded.onlyChampion += 1; continue; }
    if (a.label !== REGULAR || b.label !== REGULAR) { excluded.notRegularSeason += 1; continue; }
    if (a.timing?.preTip !== true || b.timing?.preTip !== true) { excluded.notPreTip += 1; continue; }
    // Pre-tip is a VERIFIED receipt in both (receiptIntegrity OK: payload hash matches, generatedAt < tip), not inputAsOf alone.
    if (a.timing?.receipt !== "OK" || b.timing?.receipt !== "OK") { excluded.receiptNotVerified += 1; continue; }
    if (isDisputedFinal(a, underReview) || isDisputedFinal(b, underReview)) { excluded.disputedFinal += 1; continue; }
    if (a.final?.ftHome !== b.final?.ftHome || a.final?.ftAway !== b.final?.ftAway) { excluded.finalMismatch += 1; continue; }
    // Review #2: both families must have graded the game on the SAME box score (same content hash).
    if ((a.context?.boxscoreHash ?? null) !== (b.context?.boxscoreHash ?? null)) { excluded.boxscoreMismatch += 1; continue; }
    pairs.push({ id, a, b });
  }
  for (const id of Bm.keys()) if (!A.has(id)) excluded.onlyChallenger += 1;
  return { pairs: pairs.sort((x, y) => x.id.localeCompare(y.id)), excluded };
}

/** Player rows present in BOTH families for a paired game, eligible for `stat` under §6 in both. */
export function pairPlayerRows({ a, b }, stat) {
  const spec = PREREG.player[stat];
  const ok = (r) => Number.isFinite(r?.expectedMinutes) && r.expectedMinutes >= spec.minMinutes && (spec.minRatePerMin == null || (Number.isFinite(r.rates?.[stat]) && r.rates[stat] >= spec.minRatePerMin));
  const bRows = new Map((b.players?.rows ?? []).map((r) => [String(r.providerAthleteId), r]));
  const out = [];
  for (const ra of a.players?.rows ?? []) {
    const rb = bRows.get(String(ra.providerAthleteId));
    if (rb && ok(ra) && ok(rb)) out.push([ra, rb]);
  }
  return out;
}

const directionOf = (ci) => (ci.lo == null || ci.hi == null ? "NO_INTERVAL" : ci.hi < 0 ? "CHALLENGER_LOWER" : ci.lo > 0 ? "CHAMPION_LOWER" : "CI_INCLUDES_0");

/** One paired market: per-cluster [champion value, challenger value] → difference interval. */
function pairedMarket(clusterPairs, opts) {
  // Means and the difference over the SAME paired rows (both values finite) — one n.
  const both = clusterPairs.map((c) => c.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  const diffs = both.map((c) => c.map(([x, y]) => y - x));
  const A = both.flat().map(([x]) => x);
  const Bv = both.flat().map(([, y]) => y);
  const ci = clusterBootstrap(diffs, opts);
  return {
    n: ci.n, clusters: ci.clusters,
    champion: r4(A.length ? A.reduce((s, x) => s + x, 0) / A.length : null),
    challenger: r4(Bv.length ? Bv.reduce((s, x) => s + x, 0) / Bv.length : null),
    diff: ci.mean, ci95: [ci.lo, ci.hi],
    direction: directionOf(ci),
    rule: "challenger − champion; lower is better, so a negative difference favours the challenger; a direction is claimed only when the 95% interval excludes 0",
  };
}

/** Paired metrics for one champion/challenger pair. */
export function pairedMetrics(pairs, opts = {}) {
  const per = (f) => pairs.map((p) => [[f(p.a), f(p.b)]]);
  const out = {
    winnerSimLogLoss: pairedMarket(per((g) => g.winner?.sim?.logLoss), opts),
    winnerSimBrier: pairedMarket(per((g) => g.winner?.sim?.brier), opts),
    winnerEloLogLoss: pairedMarket(per((g) => g.winner?.elo?.logLoss), opts),
    marginAbsErr: pairedMarket(per((g) => g.score?.marginAbsErr), opts),
    totalAbsErr: pairedMarket(per((g) => g.score?.totalAbsErr), opts),
    players: {},
  };
  // Minutes on the ≥ 20-minute pts-eligible rows (the minutes MAE bar applies to every player family).
  out.players.minutesAbsErr = pairedMarket(pairs.map((p) => pairPlayerRows(p, "pts").map(([ra, rb]) => [ra.minutesAbsErr, rb.minutesAbsErr])), opts);
  for (const k of STATS) {
    out.players[k] = {
      absErr: pairedMarket(pairs.map((p) => pairPlayerRows(p, k).map(([ra, rb]) => [ra.unconditional?.[k], rb.unconditional?.[k]])), opts),
      // Coverage miss (1 − inside p10–p90) is reported, not ranked: the bar is a BAND around 0.80, not "more is better".
      coverage80: (() => {
        const rows = pairs.flatMap((p) => pairPlayerRows(p, k)).filter(([ra, rb]) => (ra.inside80?.[k] === 0 || ra.inside80?.[k] === 1) && (rb.inside80?.[k] === 0 || rb.inside80?.[k] === 1));
        const m = (xs) => (xs.length ? r4(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
        return { n: rows.length, champion: m(rows.map(([ra]) => ra.inside80[k])), challenger: m(rows.map(([, rb]) => rb.inside80[k])), nominal: 0.8, band: PREREG.player[k].coverage };
      })(),
    };
  }
  return out;
}

/** Readiness verdict for one market from its paired difference and the challenger's §7 state on the paired rows. */
export function marketVerdict({ market, paired, minN, challengerState }) {
  const reasons = [];
  if (paired.n < minN) return { market, verdict: VERDICT.INSUFFICIENT_N, n: paired.n, minN, reasons: [`paired n ${paired.n} < §6 minimum ${minN}`] };
  if (paired.direction !== "CHALLENGER_LOWER") reasons.push(`paired difference ${paired.diff} (95% CI ${paired.ci95.join(" to ")}, n ${paired.n}) — ${paired.direction === "CHAMPION_LOWER" ? "favours the champion" : "interval includes 0: no difference claimed"}`);
  if (challengerState?.state !== MARKET_STATE.BARS_HOLD) reasons.push(`challenger §7 state on the paired rows is ${challengerState?.state ?? "UNKNOWN"}${challengerState?.unrecordedBars ? ` (${challengerState.unrecordedBars})` : ""}`);
  return { market, verdict: reasons.length ? VERDICT.NOT_READY : VERDICT.READY_FOR_FOUNDER_REVIEW, n: paired.n, minN, reasons };
}

/**
 * WINNER-HEAD COMPARISON (coordinator request, 2026-10-20): Elo vs v1-sim vs v0.1-sim on IDENTICAL frozen forward
 * games — regular season, pre-tip in both v0.1 and v1, same final. "Elo" is the frozen Elo pHome in the v0.1 receipt
 * (the published N2 side). Paired log-loss / Brier differences with the same game bootstrap, plus each head's mean
 * pHome beside the realised home-win rate (n). Report only: no verdict (§7's winner bar names the sim; scoring the
 * Elo side for promotion is founder reading N6).
 */
export function winnerHeadComparison({ v01 = [], v1 = [] }, opts = {}) {
  const { pairs, excluded } = pairGames(v01, v1, { underReview: opts.underReview ?? new Set() });
  const rows = pairs.map(({ a, b }) => ({ y: a.winner?.elo?.y ?? a.winner?.sim?.y, elo: a.winner?.elo, v01: a.winner?.sim, v1: b.winner?.sim }))
    .filter((r) => (r.y === 0 || r.y === 1) && r.elo && r.v01 && r.v1);
  const diff = (key, x, y) => pairedMarket(rows.map((r) => [[r[x][key], r[y][key]]]), opts);
  const mean = (xs) => (xs.length ? r4(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
  return {
    n: rows.length, excluded,
    eloSource: "v0.1 receipt forecast.elo.pHome (the frozen N2 winner side)",
    meanPHome: { elo: mean(rows.map((r) => r.elo.p)), v01Sim: mean(rows.map((r) => r.v01.p)), v1Sim: mean(rows.map((r) => r.v1.p)), realisedHomeWinRate: mean(rows.map((r) => r.y)), n: rows.length },
    logLoss: { v1SimMinusElo: diff("logLoss", "elo", "v1"), v01SimMinusElo: diff("logLoss", "elo", "v01"), v1SimMinusV01Sim: diff("logLoss", "v01", "v1") },
    brier: { v1SimMinusElo: diff("brier", "elo", "v1"), v01SimMinusElo: diff("brier", "elo", "v01"), v1SimMinusV01Sim: diff("brier", "v01", "v1") },
    rule: "second head − first head; lower is better; a direction only when the 95% interval excludes 0; no verdict (N6)",
  };
}

/**
 * Proposed challengers (TEXT ONLY — nothing is built, fitted or armed by this module). Each would be a new version
 * string with its own forward shadow (prereg §1, §10).
 */
export const PROPOSED_CHALLENGERS = Object.freeze([
  Object.freeze({
    id: "elo-home-advantage-refit",
    text: "Elo home-advantage refit (fit on 2023-24 only): refit NBA_ELO_PARAMS.HOME_ADVANTAGE (today 70) on the 2023-24 regular season alone, freeze it, look once at 2024-25 development, then shadow forward as a new version string beside the frozen N2 Elo side. Never replaces the published side automatically.",
    motivation: "Coordinator-relayed historical evidence (research PR 1152, 2024-25 development season, n 1005, NOT re-derived here): mean pHome Elo 0.584 vs v1 0.547 vs realised home-win rate 0.530 — Elo overstates home; paired v1 − Elo log loss −0.0059 (95% CI −0.0110 to −0.0009), Brier −0.0026 (−0.0049 to −0.0004). Historical development evidence only; it promotes nothing and is not forward-shadow evidence (§8).",
  }),
]);

/**
 * The full report. `families` maps family → current grades (experimental-grading-ledger.mjs currentGrades).
 * @returns {object} report with `promotes: false` — always.
 */
export function evaluateChampionChallenger({ champion = "v0.1", challengers = ["v0.2", "v1"], families, computedAt, bootstrap = {}, underReview = new Set() }) {
  const opts = { ...BOOTSTRAP_DEFAULTS, ...bootstrap };
  const report = {
    artifact: "nba-champion-challenger-report", evaluatorVersion: EVALUATOR_VERSION, computedAt, preregistration: PREREG.doc,
    dataClass: "PRIVATE_RESEARCH", productEligible: false, promotes: false,
    rule: "report only — a verdict is an input to a founder decision (promotion-record.json), never a promotion; markets are judged separately (§7)",
    bootstrap: { ...opts, method: "game-clustered percentile bootstrap of the pooled mean paired difference" },
    champion, comparisons: {},
    underReview: [...underReview].sort(),
    winnerHeads: winnerHeadComparison({ v01: families["v0.1"] ?? [], v1: families.v1 ?? [] }, { ...opts, underReview }),
    proposedChallengers: PROPOSED_CHALLENGERS,
  };
  for (const ch of challengers) {
    const { pairs, excluded } = pairGames(families[champion] ?? [], families[ch] ?? [], { underReview });
    const paired = pairedMetrics(pairs, opts);
    // The challenger's §7 states computed on exactly the paired games (its own rows within them).
    const chValidation = validationMetrics(pairs.map((p) => p.b));
    const st = chValidation.states;
    const verdicts = [
      marketVerdict({ market: "winner (sim log loss)", paired: paired.winnerSimLogLoss, minN: PREREG.winner.minN, challengerState: st.winner }),
      marketVerdict({ market: "margin (|error|)", paired: paired.marginAbsErr, minN: PREREG.margin.minN, challengerState: st.margin }),
      marketVerdict({ market: "total (|error|)", paired: paired.totalAbsErr, minN: PREREG.total.minN, challengerState: st.total }),
      ...STATS.map((k) => marketVerdict({ market: `${k} (|error|, expectedMinutes ≥ 20 in both)`, paired: paired.players[k].absErr, minN: PREREG.player[k].minN, challengerState: st[k] })),
    ];
    report.comparisons[ch] = {
      pairedGames: pairs.length, excluded, paired, verdicts,
      overall: verdicts.some((v) => v.verdict === VERDICT.READY_FOR_FOUNDER_REVIEW) ? "SOME_MARKET_READY_FOR_FOUNDER_REVIEW" : verdicts.every((v) => v.verdict === VERDICT.INSUFFICIENT_N) ? "INSUFFICIENT_N" : "NOT_READY",
      eloHeadNote: "the Elo head is reported (winnerEloLogLoss) but carries no verdict: §7's winner bar names the sim; scoring the Elo side for promotion is founder reading N6",
    };
  }
  return report;
}
