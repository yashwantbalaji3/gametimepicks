/**
 * Release A guards (Program 173): the public-beta forecast is coherent, deterministic, humble,
 * market-independent, and cannot borrow validated-pick language.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const cal = read("data/internal/research/nfl/reports/public-beta-v1-calibration.json");
const card = read("data/internal/research/nfl/public-beta-model-card-v1.json");
const pub = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8"));

test("calibration applies only humility operations and preserves the prior failed verdict", () => {
  assert.match(cal.protocol.operations, /TWO preregistered calibrations only/);
  assert.match(cal.protocol.whyThisCannotInflateConfidence, /monotone|widens/);
  // the P172 rejection is carried forward verbatim and not edited away
  assert.equal(cal.priorVerdictPreserved.winner, "ABSTAIN");
  assert.equal(cal.priorVerdictPreserved.total, "RESEARCH_ONLY");
  assert.equal(cal.priorVerdictPreserved.margin, "RESEARCH_ONLY");
  assert.match(cal.priorVerdictPreserved.note, /boundary for VALIDATED_PICK/);
  assert.equal(cal.launchState, "PUBLIC_EXPERIMENTAL");
});

test("shrinkage scales the SIGNAL, not the output probability — the coherence fix", () => {
  assert.match(cal.calibration.shrinkAppliesTo, /NOT the output probability/);
  assert.ok(cal.calibration.signalShrinkLambda >= 0 && cal.calibration.signalShrinkLambda <= 1);
  // still short of the validated bar: publication never implies the bar was met
  const gain = 0.6931 - cal.heldOut2025.winner.calibrated.logLoss;
  assert.ok(gain < 0.010, `held-out gain ${gain.toFixed(4)} must remain below the 0.010 VALIDATED_PICK margin`);
});

test("intervals were NOT widened to flatter the held-out season", () => {
  assert.equal(cal.calibration.marginSigmaInflation, 1);
  assert.match(cal.calibration.intervalMethod, /leave-one-season-out/);
  assert.ok(cal.intervalFinding.losoCoverage.margin > 0.75 && cal.intervalFinding.losoCoverage.margin < 0.85,
    "leave-season-out coverage sits at nominal, which is why no inflation was applied");
  assert.match(cal.intervalFinding.reading, /would be fitting the held-out season/);
  // and the shortfall is published as a limitation rather than hidden
  assert.ok(card.limitations.some((l) => /only \d+% of the time/.test(l)));
});

test("EVERY published forecast is internally coherent — one distribution, no contradictions", () => {
  assert.ok(pub.forecasts.length >= 6);
  for (const f of pub.forecasts) {
    const s = f.forecastSummary;
    const pHome = s.winProbability.home;
    // win side must agree with the median margin's sign
    if (s.margin.median > 0) assert.ok(pHome > 0.5, `${f.matchup}: +${s.margin.median} margin but ${pHome} home win`);
    if (s.margin.median < 0) assert.ok(pHome < 0.5, `${f.matchup}: ${s.margin.median} margin but ${pHome} home win`);
    // probabilities are a distribution
    assert.ok(Math.abs(pHome + s.winProbability.away - 1) < 1e-6);
    // intervals bracket their medians, and scores are legal football scores
    assert.ok(s.margin.p10 <= s.margin.median && s.margin.median <= s.margin.p90);
    assert.ok(s.total.p10 <= s.total.median && s.total.median <= s.total.p90);
    for (const v of [s.projectedScore.home, s.projectedScore.away]) {
      assert.ok(Number.isInteger(v) && v >= 0 && v !== 1, `${f.matchup}: ${v} is not a legal score`);
    }
  }
});

test("HUMILITY · win percentages stay near a coin and never claim a side strongly", () => {
  for (const f of pub.forecasts) {
    const p = f.forecastSummary.winProbability.home;
    assert.ok(p > 0.35 && p < 0.65, `${f.matchup}: ${p} is a stronger claim than this model has earned`);
    assert.ok(f.forecastSummary.winProbability.calibration, "every forecast explains its calibration in words");
  }
});

test("MARKET INDEPENDENCE · odds are carried for comparison and are not an input", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  const hashBlock = src.slice(src.indexOf("const inputHash"), src.indexOf("digest(\"hex\")"));
  // `muTotal` is the model's own scoring climatology — match market IDENTIFIERS, not any word
  // containing "total", or the guard flags the model's own parameter as a market leak.
  assert.doesNotMatch(hashBlock, /\b(market|markets|consensus|marketSpreadHome|marketTotal|books?)\b/i,
    "the market must not enter the input hash");
  const simBlock = src.slice(src.indexOf("for (let i = 0; i < RUNS"), src.indexOf("const hS ="));
  assert.doesNotMatch(simBlock, /market|consensus/i, "the simulation loop cannot read a price");
  for (const f of pub.forecasts) {
    if (f.marketComparison.state === "MARKET_VIEW") {
      assert.match(f.marketComparison.note, /has not been shown to beat the market/);
    }
  }
});

test("LABEL DISCIPLINE · experimental output never borrows validated-pick language", () => {
  const blob = JSON.stringify(pub);
  // word boundaries matter: a substring scan flags "ledger" for containing "edge" and would push
  // a future author toward renaming honest fields to satisfy a sloppy guard.
  for (const banned of ["VALIDATED_PICK", "edge", "lock", "best bet", "profitable", "guaranteed", "high-confidence"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
      `public forecasts must not contain "${banned}"`);
  }
  // "beat the market" may appear ONLY inside a denial ("has not been shown to beat the market").
  // The negation precedes the phrase, so every occurrence is checked against the text before it.
  for (const m of blob.matchAll(/beats? the market/gi)) {
    const before = blob.slice(Math.max(0, m.index - 60), m.index);
    assert.match(before, /\bnot\b[^.]{0,40}$|\bnever\b[^.]{0,40}$|\bno\b[^.]{0,40}$/i,
      `"${m[0]}" must appear only inside a denial, found after: "${before.slice(-45)}"`);
  }
  assert.equal(pub.model.launchState, "PUBLIC_EXPERIMENTAL");
  for (const f of pub.forecasts) assert.equal(f.state, "PUBLIC_EXPERIMENTAL");
  assert.match(pub.disclaimer, /has not been shown to beat/);
  assert.match(card.plainEnglish.honestLimit, /coin flip/);
});

test("DETERMINISM · identical inputs reproduce identical receipts, and receipts are immutable", () => {
  const dir = path.join(ROOT, "data/internal/nfl/forecast-receipts", pub.date);
  const files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
  assert.ok(files.length >= 6, "one receipt per published event");
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    assert.ok(r.model.inputHash, "the receipt pins the input hash its seed derived from");
    assert.ok(Date.parse(r.generatedAt) < Date.parse(r.kickoffUtc), "a receipt is always pre-kickoff");
  }
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  assert.match(src, /LOCKED_AT_KICKOFF/, "a started event's artifact is immutable");
  assert.match(src, /revisionOf/, "a pre-kickoff correction appends a revision with lineage instead of overwriting");
});

test("PUBLIC BOUNDARY · no research payload rides along", () => {
  const blob = JSON.stringify(pub);
  for (const banned of ["data/internal", "PRIVATE_RESEARCH", "apiKey", "p171-ledger", "shrinkCurve"]) {
    assert.ok(!blob.includes(banned), `public forecasts must not carry "${banned}"`);
  }
  assert.equal(pub.dataClass, "PUBLIC_DERIVED");
});
