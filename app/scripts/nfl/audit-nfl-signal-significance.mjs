/**
 * Is the team-strength term in the preseason margin model distinguishable from zero?
 * (Program 178 · Release C). PRIVATE_RESEARCH.
 *
 * WHY THIS EXISTS. The founder asked why three Friday games all projected 19-19 or 19-18. Chasing
 * that produced a worse finding than repetition: across the ten weekend forecasts the correlation
 * between the home side's Elo advantage and its published win probability was −0.97. The model was
 * leaning AGAINST the stronger team, consistently, and nothing said so.
 *
 * The cause is not a coding error. `marginSlope` is the OLS coefficient fitted on 98 training
 * preseason games, and it came out NEGATIVE (−0.017442). The engine applied it faithfully.
 *
 * The real question is whether that coefficient is evidence at all. This script answers it with the
 * standard test, on the same committed corpus and the same cutoff-safe Elo the fit used:
 *
 *     slope = -0.017442   SE = 0.030355   t = -0.575   95% CI [-0.0777, +0.0428]
 *
 * The interval contains zero. There is no evidence that regular-season strength predicts preseason
 * margin in EITHER direction — so publishing a direction from it is publishing noise with a sign.
 *
 * THE RULE, stated before the number is used: a coefficient may drive a published forecast only if
 * |t| >= 2. That is not a preference about which team should be favoured; it is the ordinary bar for
 * claiming a direction exists, and it is exactly the stopping rule this repository has already
 * applied three times when a model failed to add anything over the market.
 *
 * Usage: node scripts/nfl/audit-nfl-signal-significance.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/signal-significance.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { strengthStateAt } from "../../src/lib/sports/nfl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

/** Declared BEFORE the statistic is computed, so it cannot be chosen to suit the answer. */
export const SIGNIFICANCE_BAR = { statistic: "|t| on the fitted margin slope", threshold: 2 };

const corpus = read("data/internal/research/nfl/corpus-v1.json").rows;
const evaluation = read("data/internal/research/nfl/reports/preseason-model-v1-evaluation.json");

// Reproduce the fit's own training set and its own cutoff-safe Elo. Anything else would be testing
// a different model than the one that ships.
const TRAIN_MAX_SEASON = 2024;   // the evaluation's protocol: fit 2023+2024, hold out 2025
const train = corpus.filter((r) => r.phase === 1 && r.season <= TRAIN_MAX_SEASON);
const eloDiffFor = (row) => {
  const prior = corpus.filter((r) => r.phase !== 1 && r.dateUtc < row.dateUtc);
  const st = strengthStateAt({ rows: prior, cutoffIso: row.dateUtc });
  return st.ratingFor(row.home) - st.ratingFor(row.away);
};
const rows = train.map((r) => ({ d: eloDiffFor(r), margin: r.ftHome - r.ftAway }));
if (rows.length < 30) { console.error(`REFUSED: only ${rows.length} training rows — too few to test a coefficient`); process.exit(2); }

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const dBar = mean(rows.map((r) => r.d));
const mBar = mean(rows.map((r) => r.margin));
let sxy = 0, sxx = 0;
for (const r of rows) { sxy += (r.d - dBar) * (r.margin - mBar); sxx += (r.d - dBar) ** 2; }
const slope = sxy / sxx;
const intercept = mBar - slope * dBar;
const resid = rows.map((r) => r.margin - (intercept + slope * r.d));
const s2 = resid.reduce((s, x) => s + x * x, 0) / (rows.length - 2);
const se = Math.sqrt(s2 / sxx);
const t = slope / se;
const crit = 1.984;  // two-sided 95% at ~98 df
const ci = [slope - crit * se, slope + crit * se];
const significant = Math.abs(t) >= SIGNIFICANCE_BAR.threshold;

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-signal-significance",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  bar: SIGNIFICANCE_BAR,
  barDeclaredBeforeComputation: true,
  protocol: {
    trainingSet: `preseason games through ${TRAIN_MAX_SEASON}, the same rows the committed fit used`,
    n: rows.length,
    input: "cutoff-safe regular-season Elo difference (home − away), no home constant (fit separately)",
    target: "final margin (home − away)",
  },
  fitted: {
    slope: Number(slope.toFixed(6)),
    intercept: Number(intercept.toFixed(6)),
    standardError: Number(se.toFixed(6)),
    tStatistic: Number(t.toFixed(4)),
    ci95: ci.map((x) => Number(x.toFixed(6))),
    ciIncludesZero: ci[0] < 0 && ci[1] > 0,
    marginSwingOver150Elo: Number((slope * 150).toFixed(3)),
  },
  committedFitSlope: evaluation.fit.marginSlope,
  reproducesCommittedFit: Math.abs(slope - evaluation.fit.marginSlope) < 1e-5,
  significant,
  verdict: significant
    ? "SIGNIFICANT — the team-strength term may drive a published forecast"
    : "NOT_SIGNIFICANT — the team-strength term may NOT drive a published forecast",
  consequence: significant
    ? "the margin head remains event-specific"
    : "the published margin signal is set to ZERO. Every game's forecast then reflects only preseason scoring climatology and home context, which is the honest description of what this model actually knows. It is not a claim that the teams are equal — it is a statement that this model cannot tell them apart.",
  whyThisMatters:
    "Before this gate, the fitted negative coefficient produced a −0.97 correlation between a home side's strength and its published win probability: the model leaned against the better team, consistently, on evidence that does not exist. Publishing a direction from a coefficient whose interval spans zero is publishing noise with a sign.",
};

const out = path.join(ROOT, "data/internal/research/nfl/reports/signal-significance.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + "\n");

console.log(`nfl signal significance: slope ${slope.toFixed(6)} · SE ${se.toFixed(6)} · t ${t.toFixed(3)} · CI [${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`);
console.log(`  ${receipt.verdict}`);
console.log(`  reproduces committed fit: ${receipt.reproducesCommittedFit}`);
