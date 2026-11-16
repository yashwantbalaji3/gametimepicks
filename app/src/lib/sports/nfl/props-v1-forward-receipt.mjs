/**
 * NFL props-v1 RECEIVING YARDS — FORWARD RECEIPT (ledger N8). PURE: no I/O, no clock. PRIVATE_RESEARCH.
 *
 * The public player board labels player_reception_yds PUBLISHED on the props-v1 RETROSPECTIVE evaluation (held-out
 * 2025, n=3575). This module grades the numbers the board actually carried, frozen before each kickoff, against
 * two bar sets read from their sources of truth — never restated here:
 *
 *   1. props-v1 PROMOTION bars — the bars the PUBLISHED basis cites. Code of record:
 *      app/scripts/nfl/evaluate-nfl-player-props.mjs (PROMOTION POLICY block + ECE bin rule); the committed receipt
 *      data/internal/research/nfl/reports/player-props-v1-evaluation.json carries the same policy as text.
 *      readPropsV1PromotionBars() parses BOTH and refuses when they disagree.
 *   2. P300 share-level FORWARD bars — data/internal/research/nfl/reports/player-props-share-level-preregistration.json
 *      frozen.bars, the bars the share-level forward receipt applies (MAE of the median, all-bin ECE, level band).
 *
 * Verdict rule (both sets, the share-level forward receipt's rule): n below the minimum → ACCUMULATING (no verdict);
 * every bar passes → FORWARD_HOLDING; otherwise FORWARD_BREACHED.
 *
 * The board never carried a P(over line) for this family, so the calibration bar's probability is RECONSTRUCTED from
 * the served quantiles (pOverFromQuantiles); everything that is reconstructed is labelled so on the receipt.
 */
import { bootstrapStatistic, BOOTSTRAP_DEFAULTS } from "../nba/bootstrap.mjs";

export const PROPS_V1_FORWARD_RECEIPT_VERSION = 1;
export const MARKET = "player_reception_yds";
export const QUANTILE_LEVELS = Object.freeze([["p10", 0.1], ["p25", 0.25], ["median", 0.5], ["p75", 0.75], ["p90", 0.9]]);

const num = (s) => Number(s);
const must = (m, what) => {
  if (!m) throw new Error(`props-v1 bars: could not read ${what} from the source of truth`);
  return m;
};

/**
 * The props-v1 promotion bars, read from the evaluator source (the code that set PUBLIC_ELIGIBLE) and cross-checked
 * against the committed evaluation receipt's promotionPolicy text. Throws on any disagreement or missing clause.
 */
export function readPropsV1PromotionBars({ evaluatorSource, evaluationReceipt }) {
  const src = String(evaluatorSource ?? "");
  const cover = must(src.match(/const coverOk = t\.interval80Coverage >= ([0-9.]+) && t\.interval80Coverage <= ([0-9.]+);/), "coverOk");
  const coverLoose = must(src.match(/const coverLoose = t\.interval80Coverage >= ([0-9.]+) && t\.interval80Coverage <= ([0-9.]+);/), "coverLoose");
  const cal = must(src.match(/const calOk = t\.thresholdCalibration\.ece != null && t\.thresholdCalibration\.ece <= ([0-9.]+);/), "calOk");
  const enough = must(src.match(/const enoughN = t\.n >= ([0-9]+);/), "enoughN");
  const bins = must(src.match(/const bins = Array\.from\(\{ length: ([0-9]+) \}, \(\) => \(\{ p: 0, hit: 0, n: 0 \}\)\);/), "ECE bin count");
  const usable = must(src.match(/const usable = bins\.filter\(\(b\) => b\.n >= ([0-9]+)\);/), "ECE usable-bin minimum");
  const proxy = must(src.match(/if \(r4\.length === ([0-9]+)\) \{\s*const proxy = r4\.reduce\(\(a, b\) => a \+ b, 0\) \/ ([0-9]+);\s*if \(proxy > 0\)/), "line proxy rule");
  const shareParams = must(src.match(/const shareParams = \{ halfLifeGames: ([0-9.]+), shrinkK: ([0-9.]+), boundaryDecay: BOUNDARY \}/), "share params");
  const boundary = must(src.match(/const BOUNDARY = ([0-9.]+);/), "boundary decay");
  must(/beatsRolling && beatsShareVol && coverOk && calOk && enoughN\) state2 = "PUBLIC_ELIGIBLE"/.test(src), "PUBLIC_ELIGIBLE conjunction");
  must(/const beatsRolling = t\.mae < t\.baselines\.rolling4Mae;/.test(src) && /const beatsShareVol = t\.mae < t\.baselines\.shareVolMae;/.test(src), "MAE baseline bars");
  must(/const err = dist\.mean - actual;\s*m\.mae \+= Math\.abs\(err\);/.test(src), "MAE point (distribution mean)");
  const bars = {
    coverageBand: [num(cover[1]), num(cover[2])],
    shadowCoverageBand: [num(coverLoose[1]), num(coverLoose[2])],
    eceMax: num(cal[1]),
    minimumN: num(enough[1]),
    eceBins: num(bins[1]),
    eceMinBinN: num(usable[1]),
    lineProxyGames: num(proxy[1]),
    maePoint: "mean",
    shareParams: { halfLifeGames: num(shareParams[1]), shrinkK: num(shareParams[2]), boundaryDecay: num(boundary[1]) },
  };
  if (num(proxy[1]) !== num(proxy[2])) throw new Error("props-v1 bars: line proxy window and divisor differ");
  const policy = String(evaluationReceipt?.promotionPolicy?.[0] ?? "");
  const p = must(policy.match(/^PUBLIC_ELIGIBLE: beats rolling-4 AND share×volume on MAE; interval80 coverage in \[([0-9.]+),([0-9.]+)\]; threshold ECE ≤ ([0-9.]+); n ≥ ([0-9]+)/), "receipt promotionPolicy[0]");
  const fromPolicy = [num(p[1]), num(p[2]), num(p[3]), num(p[4])];
  const fromCode = [bars.coverageBand[0], bars.coverageBand[1], bars.eceMax, bars.minimumN];
  if (fromPolicy.some((v, i) => v !== fromCode[i])) throw new Error(`props-v1 bars: receipt policy ${fromPolicy.join("/")} disagrees with evaluator code ${fromCode.join("/")}`);
  return bars;
}

/** The P300 share-level forward bars, verbatim from the preregistration's frozen block. */
export function readShareLevelForwardBars(prereg) {
  const B = prereg?.frozen?.bars;
  for (const k of ["coverageBand", "eceMax", "levelBand", "eceBins", "minimumN"]) if (B?.[k] == null) throw new Error(`share-level bars: frozen.bars.${k} missing`);
  return { coverageBand: [...B.coverageBand], eceMax: B.eceMax, levelBand: [...B.levelBand], eceBins: B.eceBins, eceMinBinN: 0, minimumN: B.minimumN, maePoint: "median" };
}

/**
 * P(Y > line) RECONSTRUCTED from five served quantiles: piecewise-linear CDF through (q, level), extended past the
 * outer knots with the adjacent segment's slope and clamped to [0, 1]. Also returns the step bounds [lo, hi] — the
 * two values P(over) could take if all mass sat at a knot — so the sensitivity of the calibration bar is visible.
 */
export function pOverFromQuantiles(dist, line) {
  const knots = QUANTILE_LEVELS.map(([k, a]) => [Number(dist?.[k]), a]);
  if (knots.some(([q]) => !Number.isFinite(q)) || !Number.isFinite(line)) return null;
  let lower = null; // highest level whose quantile ≤ line
  let upper = null; // lowest level whose quantile > line
  for (const [q, a] of knots) if (q <= line) lower = [q, a];
  for (const [q, a] of [...knots].reverse()) if (q > line) upper = [q, a];
  let cdf;
  if (lower && upper) cdf = lower[1] + ((line - lower[0]) / (upper[0] - lower[0])) * (upper[1] - lower[1]);
  else if (!lower) {
    const [q0, a0] = knots[0];
    const next = knots.find(([q]) => q > q0);
    const slope = next ? (next[1] - a0) / (next[0] - q0) : 0;
    cdf = line < 0 ? 0 : slope > 0 ? a0 - (q0 - line) * slope : a0 / 2;
  } else {
    const [qn, an] = knots[knots.length - 1];
    const prev = [...knots].reverse().find(([q]) => q < qn);
    const slope = prev ? (an - prev[1]) / (qn - prev[0]) : 0;
    cdf = slope > 0 ? an + (line - qn) * slope : an + (1 - an) / 2;
  }
  cdf = Math.min(1, Math.max(0, cdf));
  return { p: 1 - cdf, lo: 1 - (upper ? upper[1] : 1), hi: 1 - (lower ? lower[1] : 0) };
}

/** Threshold ECE over {p, hit} pairs: `bins` equal-width bins, only bins with ≥ minBinN pairs (props-v1 rule). */
export function thresholdEce(pairs, { bins = 10, minBinN = 0 } = {}) {
  const bs = Array.from({ length: bins }, () => ({ p: 0, hit: 0, n: 0 }));
  for (const c of pairs) { const b = bs[Math.min(bins - 1, Math.floor(c.p * bins))]; b.p += c.p; b.hit += c.hit; b.n += 1; }
  const usable = bs.filter((b) => b.n > 0 && b.n >= minBinN);
  const usableN = usable.reduce((s, b) => s + b.n, 0);
  if (!usableN) return { ece: null, pairs: pairs.length, binsUsed: 0 };
  return { ece: usable.reduce((s, b) => s + (b.n / usableN) * Math.abs(b.p / b.n - b.hit / b.n), 0), pairs: pairs.length, binsUsed: usable.length };
}

/**
 * Metrics over SCORED points. A point: {gameId, week, actual, mean, p10, p25, median, p75, p90, rolling4, shareVol,
 * line (props-v1 proxy or null)}. Continuous family ⇒ inclusive interval coverage (contract v2.1).
 */
export function pointMetrics(points, bars, pKey = "p") {
  const n = points.length;
  if (!n) return null;
  const avg = (fn) => points.reduce((s, x) => s + fn(x), 0) / n;
  const pairs = points.filter((x) => x.line != null && x.pOver != null).map((x) => ({ p: x.pOver[pKey], hit: x.actual > x.line ? 1 : 0 }));
  const cal = thresholdEce(pairs, { bins: bars.eceBins, minBinN: bars.eceMinBinN });
  const point = bars.maePoint === "median" ? (x) => x.median : (x) => x.mean;
  const meanActual = avg((x) => x.actual);
  return {
    n,
    mae: avg((x) => Math.abs(point(x) - x.actual)),
    rolling4Mae: avg((x) => Math.abs(x.rolling4 - x.actual)),
    shareVolMae: avg((x) => Math.abs(x.shareVol - x.actual)),
    coverage80: avg((x) => (x.actual >= x.p10 && x.actual <= x.p90 ? 1 : 0)),
    ece: cal.ece,
    calibrationPairs: cal.pairs,
    eceBinsUsed: cal.binsUsed,
    level: meanActual > 0 ? avg((x) => x.mean) / meanActual : null,
  };
}

/** props-v1 promotion bars → bar booleans, verdict, and the state the evaluator's policy would assign. */
export function judgePropsV1(m, bars) {
  if (!m || m.n < bars.minimumN) return { state: "ACCUMULATING", n: m?.n ?? 0, needed: bars.minimumN, metrics: m };
  const b = {
    beatsRolling: m.mae < m.rolling4Mae,
    beatsShareVol: m.mae < m.shareVolMae,
    coverOk: m.coverage80 >= bars.coverageBand[0] && m.coverage80 <= bars.coverageBand[1],
    calOk: m.ece != null && m.ece <= bars.eceMax,
  };
  const coverLoose = m.coverage80 >= bars.shadowCoverageBand[0] && m.coverage80 <= bars.shadowCoverageBand[1];
  const policyState = Object.values(b).every(Boolean) ? "PUBLIC_ELIGIBLE" : (b.beatsRolling || b.beatsShareVol) && coverLoose ? "SHADOW_ELIGIBLE" : "RESEARCH_ONLY";
  return { state: Object.values(b).every(Boolean) ? "FORWARD_HOLDING" : "FORWARD_BREACHED", n: m.n, metrics: m, bars: b, policyStateOnForwardData: policyState };
}

/** P300 share-level forward bars → bar booleans and verdict (forward-player-props-share-level.mjs rule). */
export function judgeShareLevel(m, bars) {
  if (!m || m.n < bars.minimumN) return { state: "ACCUMULATING", n: m?.n ?? 0, needed: bars.minimumN, metrics: m };
  const b = {
    beatsRolling4: m.mae < m.rolling4Mae,
    beatsShareVolume: m.mae < m.shareVolMae,
    coverage80: m.coverage80 >= bars.coverageBand[0] && m.coverage80 <= bars.coverageBand[1],
    thresholdCalibration: m.ece != null && m.ece <= bars.eceMax,
    level: m.level != null && m.level >= bars.levelBand[0] && m.level <= bars.levelBand[1],
  };
  return { state: Object.values(b).every(Boolean) ? "FORWARD_HOLDING" : "FORWARD_BREACHED", n: m.n, metrics: m, bars: b };
}

/** Game-clustered percentile bootstrap intervals (shared deterministic mulberry32 stream) — informational only. */
export function clusteredIntervals(points, bars, opts = {}) {
  const byGame = new Map();
  for (const p of points) { if (!byGame.has(p.gameId)) byGame.set(p.gameId, []); byGame.get(p.gameId).push(p); }
  const clusters = [...byGame.keys()].sort().map((k) => byGame.get(k));
  const flat = (cs) => cs.flat();
  const stat = (fn) => bootstrapStatistic(clusters, (cs) => { const m = pointMetrics(flat(cs), bars); return fn(m); }, { ...BOOTSTRAP_DEFAULTS, ...opts });
  const strip = ({ value, lo, hi }) => ({ value, lo, hi });
  return {
    method: `game-clustered percentile bootstrap (app/src/lib/sports/nba/bootstrap.mjs bootstrapStatistic), ${clusters.length} games`,
    B: opts.B ?? BOOTSTRAP_DEFAULTS.B, seed: opts.seed ?? BOOTSTRAP_DEFAULTS.seed, alpha: opts.alpha ?? BOOTSTRAP_DEFAULTS.alpha,
    games: clusters.length,
    mae: strip(stat((m) => m.mae)),
    maeMinusRolling4: strip(stat((m) => m.mae - m.rolling4Mae)),
    maeMinusShareVol: strip(stat((m) => m.mae - m.shareVolMae)),
    coverage80: strip(stat((m) => m.coverage80)),
    ece: strip(stat((m) => m.ece ?? NaN)),
    level: strip(stat((m) => m.level ?? NaN)),
  };
}

/** Four-decimal rounding for every non-integer number (the share-level receipt's convention). */
export const r4 = (v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(4)) : v);
export const stableJson = (obj) => `${JSON.stringify(obj, (_k, v) => r4(v), 1)}\n`;
