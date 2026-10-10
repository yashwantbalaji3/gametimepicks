/**
 * MODEL QUALITY BARS — each published family's OWN preregistered bar, cited, never re-derived (Phase D · D-1).
 *
 * The model-health scorecard (model-health.mjs, P303) judges every family against a generic floor — a coin flip,
 * an even-odds guess, 80% coverage. That floor catches a broken model; it cannot say whether a model is living up
 * to the bar it was ACCEPTED on. This registry is that bar, per family, with its source:
 *   source  { file, pointer, quote } — the preregistration / receipt / contract that froze the bar, the JSON
 *           pointer to the passage, and a verbatim fragment of it. model-quality-bars.test.mjs re-reads every
 *           file and fails if a quote or number here no longer matches its source.
 *   bar     the machine-readable form of that passage (coverage band, ECE ceiling, level band, log-loss margin)
 *   minN    the sample below which the source says figures support no verdict either way
 *
 * A family whose bar depends on WHICH model publishes (NFL player ranges: the props-v1 gate or the share-level
 * model) carries `byModel`; the ledger picks the entry for the model the live board names. A family with NO
 * preregistered bar says so (`bar: null` + `noBarReason`) — it keeps the generic floor, labelled as a floor.
 *
 * Verdicts built from these bars are ADVISORY. Nothing here changes what publishes: promotion and demotion stay
 * with the preregistered forward receipts and the founder.
 */

const NFL_CONTRACT = "data/internal/research/nfl/regular-season-evaluation-contract.json";
const PROPS_V1 = "data/internal/research/nfl/reports/player-props-v1-evaluation.json";
const SHARE_LEVEL = "data/internal/research/nfl/reports/player-props-share-level-preregistration.json";
const V1_POLICY = "interval80 coverage in [0.72,0.88]; threshold ECE ≤ 0.05; n ≥ 300";

const playerBars = {
  "player-props-v1": {
    source: { file: PROPS_V1, pointer: "/promotionPolicy/0", quote: V1_POLICY },
    bar: { coverage80: [0.72, 0.88], ece: 0.05 }, minN: 300,
  },
  "nfl-player-share-level-v1": {
    source: { file: SHARE_LEVEL, pointer: "/frozenBars/perFamily/coverage80", quote: "80% coverage in [0.72, 0.88] overall, mid-p for receptions" },
    also: [
      { file: SHARE_LEVEL, pointer: "/frozenBars/perFamily/thresholdCalibration", quote: "ECE at most 0.05 overall" },
      { file: SHARE_LEVEL, pointer: "/frozenBars/perFamily/level", quote: "within [0.92, 1.08] overall" },
      { file: SHARE_LEVEL, pointer: "/frozenBars/perFamily/minimumN", quote: "at least 300 scored player-games" },
    ],
    bar: { coverage80: [0.72, 0.88], ece: 0.05, level: [0.92, 1.08] }, minN: 300,
  },
};

export const MODEL_QUALITY_BARS = Object.freeze({
  nfl_winner: {
    sport: "nfl", label: "NFL game winner",
    source: { file: NFL_CONTRACT, pointer: "/bars/winHead/requirement", quote: "mean log loss at least 0.005 BELOW the baseline's" },
    also: [{ file: NFL_CONTRACT, pointer: "/evaluationMode/minimumSample", value: 64 }],
    bar: { logLossMarginBelowBaseline: 0.005, baseline: "the committed cutoff-Elo baseline" }, minN: 64,
  },
  nfl_margin_range: {
    sport: "nfl", label: "NFL winning-margin 80% range",
    source: { file: NFL_CONTRACT, pointer: "/bars/marginHead/requirement", quote: "80% interval coverage inside the BAND 0.75-0.85" },
    bar: { coverage80: [0.75, 0.85] }, minN: 64,
  },
  nfl_total_range: {
    sport: "nfl", label: "NFL total-points 80% range",
    source: { file: NFL_CONTRACT, pointer: "/bars/totalHead/requirement", quote: "80% interval coverage inside the band 0.75-0.85" },
    bar: { coverage80: [0.75, 0.85] }, minN: 64,
  },
  nfl_player_receptions: { sport: "nfl", label: "NFL receptions 80% range", byModel: playerBars, countFamily: true },
  nfl_player_reception_yds: { sport: "nfl", label: "NFL receiving-yards 80% range", byModel: playerBars },
  nfl_player_rush_yds: { sport: "nfl", label: "NFL rushing-yards 80% range", byModel: playerBars },
  nfl_player_pass_yds: {
    sport: "nfl", label: "NFL passing-yards 80% range", bar: null,
    noBarReason: "published as an ESTIMATE below its bar — there is no accepted bar to live up to; the generic 80% floor stays as a floor",
  },
  nfl_anytime_td: {
    sport: "nfl", label: "NFL anytime touchdown",
    source: { file: "data/internal/research/nfl/reports/anytime-td-forward-protocol.json", pointer: "/frozen/eceMax", value: 0.04 },
    also: [
      { file: "data/internal/research/nfl/reports/anytime-td-forward-protocol.json", pointer: "/frozen/levelBand", value: [0.9, 1.1] },
      { file: "data/internal/research/nfl/reports/anytime-td-forward-protocol.json", pointer: "/frozen/minimumN", value: 1000 },
    ],
    bar: { ece: 0.04, level: [0.9, 1.1] }, minN: 1000,
  },
  ufc_winner: {
    sport: "ufc", label: "UFC fight winner",
    source: { file: "app/public/data/ufc/fight-model-evaluation.json", pointer: "/bars/winnerGain", value: 0.005 },
    also: [{ file: "app/public/data/ufc/fight-model-evaluation.json", pointer: "/bars/calibrationZ", value: 2 }],
    bar: { logLossMarginBelowBaseline: 0.005, baseline: "a coin flip (0.6931)", calibrationZ: 2 }, minN: 60,
  },
  epl_result: {
    sport: "epl", label: "EPL match result",
    source: { file: "data/internal/research/epl/reports/epl-elo-poisson-forward-protocol.json", pointer: "/frozen/minimumN", value: 60 },
    bar: null,
    noBarReason: "the live bar is the forward receipt's own comparison (Elo-Poisson vs the split Poisson it replaced), judged in epl_forward_match_model — this family keeps the even-odds floor",
    minN: 60,
  },
  ligue1_result: {
    sport: "ligue-1", label: "Ligue 1 match result",
    source: { file: "data/internal/research/soccer/preregistration-league-expansion-v1.json", pointer: "/acceptanceBars/bars/1/statement", quote: "poisson holdout log loss ≤ empirical holdout log loss − 0.005" },
    bar: { logLossMarginBelowBaseline: 0.005, baseline: "the empirical H/D/A rate" }, minN: 60,
  },
  mlb_moneyline: { sport: "mlb", label: "MLB moneyline call", bar: null, noBarReason: "no preregistered live bar exists for MLB game calls — judged against the coin floor and the founder-approved live-record gate" },
  mlb_total: { sport: "mlb", label: "MLB total call", bar: null, noBarReason: "no preregistered live bar exists for MLB game calls — judged against the coin floor and the founder-approved live-record gate" },
  mlb_run_line: { sport: "mlb", label: "MLB run-line call (v1, simulated ±1.5, retired)", bar: null, noBarReason: "no preregistered live bar exists for MLB game calls — judged against the coin floor and the founder-approved live-record gate" },
  mlb_run_line_posted: { sport: "mlb", label: "MLB run-line call (posted line)", bar: null, noBarReason: "no preregistered live bar exists for MLB game calls — judged against the coin floor and the founder-approved live-record gate" },
});

/** Forward-receipt families are judged by their own preregistered receipts; they need no bar here. */
export const JUDGED_BY_OWN_RECEIPT = /^(nfl_forward_|epl_forward_|epl_shadow_)/;

/** The bar that applies to a family given the model its live board names (null model → the props-v1 gate). */
export function barFor(familyId, liveModelId = null) {
  const entry = MODEL_QUALITY_BARS[familyId];
  if (!entry) return null;
  if (entry.byModel) {
    const m = entry.byModel[liveModelId ?? "player-props-v1"];
    return m ? { ...entry, ...m, model: liveModelId ?? "player-props-v1" } : null;
  }
  return entry;
}

const r4 = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));

/**
 * Interval coverage from graded range rows {low, high, actual}. Inclusive: an endpoint counts as inside (how the
 * public week report grades). Mid-p (population-contract v2.1, count families): strictly inside counts 1, an
 * outcome on either endpoint counts 1/2. Rows without a numeric range or actual are not scored.
 */
export function coverageOf(rows) {
  const scored = (rows ?? []).filter((r) => [r.low, r.high, r.actual].every((x) => typeof x === "number" && Number.isFinite(x)));
  if (!scored.length) return { n: 0, inclusive: null, midP: null, onEndpoint: 0 };
  let inclusive = 0, midP = 0, onEndpoint = 0;
  for (const r of scored) {
    const on = r.actual === r.low || r.actual === r.high;
    const inside = r.actual > r.low && r.actual < r.high;
    if (inside || on) inclusive += 1;
    midP += inside ? 1 : on ? 0.5 : 0;
    if (on) onEndpoint += 1;
  }
  return { n: scored.length, inclusive: r4(inclusive / scored.length), midP: r4(midP / scored.length), onEndpoint };
}

/** Expected calibration error, 10 equal-width bins, weighted by bin count. */
export function ece10(probabilities, outcomes) {
  const n = probabilities.length;
  if (!n) return null;
  const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  probabilities.forEach((p, i) => { const b = bins[Math.min(9, Math.floor(p * 10))]; b.n += 1; b.p += p; b.y += outcomes[i]; });
  return r4(bins.reduce((a, b) => a + (b.n ? (b.n / n) * Math.abs(b.p / b.n - b.y / b.n) : 0), 0));
}

/**
 * The advisory verdict of live measures against a family's bar.
 *   NO_BAR          the family has no preregistered bar (it keeps the generic floor)
 *   NOT_COMPUTABLE  the bar needs quantities the live ledger does not carry (named in `notComputable`)
 *   TOO_SMALL       fewer than the bar's minimum n — the checks are shown, no verdict either way
 *   ON_TRACK        every computable check inside its bar
 *   BELOW_BAR       at least one computable check outside its bar
 * measures: { coverage80?, ece?, level?, logLossVsBaseline? } (null / absent = not computable).
 */
export function barVerdict(entry, measures, n) {
  if (!entry?.bar) return { verdict: "NO_BAR", reason: entry?.noBarReason ?? "no preregistered bar" };
  const b = entry.bar;
  const checks = [];
  const notComputable = [];
  const within = (v, [lo, hi]) => v >= lo && v <= hi;
  const want = (key, fn) => { if (measures?.[key] == null || !Number.isFinite(measures[key])) notComputable.push(key); else checks.push(fn(measures[key])); };
  if (b.coverage80) want("coverage80", (v) => ({ measure: "coverage80", value: v, bar: b.coverage80, pass: within(v, b.coverage80) }));
  if (b.ece != null) want("ece", (v) => ({ measure: "ece", value: v, bar: `≤ ${b.ece}`, pass: v <= b.ece }));
  if (b.level) want("level", (v) => ({ measure: "level", value: v, bar: b.level, pass: within(v, b.level) }));
  if (b.logLossMarginBelowBaseline != null) want("logLossVsBaseline", (v) => ({ measure: "logLossVsBaseline", value: v, bar: `≤ −${b.logLossMarginBelowBaseline} vs ${b.baseline}`, pass: v <= -b.logLossMarginBelowBaseline }));
  if (b.calibrationZ != null) want("calibrationZ", (v) => ({ measure: "calibrationZ", value: v, bar: `< ${b.calibrationZ}`, pass: Math.abs(v) < b.calibrationZ }));
  if (!checks.length) return { verdict: "NOT_COMPUTABLE", checks, notComputable };
  if (n < (entry.minN ?? 0)) return { verdict: "TOO_SMALL", checks, notComputable, n, needed: entry.minN };
  return { verdict: checks.every((c) => c.pass) ? "ON_TRACK" : "BELOW_BAR", checks, notComputable, n, needed: entry.minN ?? null };
}
