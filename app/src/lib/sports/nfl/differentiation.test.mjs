/**
 * Release C guards (Program 178): the engine consumes event-specific information where it claims
 * to, and DECLARES the head where it does not.
 *
 * The founder's observation was two Friday games at 19-19 and a third at 19-18. The audit's answer
 * is per HEAD, not per game: the margin/win head reads each team's own strength, while the total
 * head draws every game from one league prior. These tests hold both halves of that answer —
 * including the half that is a limitation, because a limitation that is not guarded quietly becomes
 * a claim again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { strengthStateAt } from "./strength-state.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const pub = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8"));
const report = read(`data/internal/research/nfl/reports/differentiation-${pub.date}.json`);
const publicSummary = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/model-differentiation.json"), "utf8"));

test("NO P0 · distinct events never share an input fingerprint", () => {
  assert.equal(report.fingerprintCollisions.length, 0,
    "two different games producing the same input hash would mean the engine is not reading the event at all");
  assert.deepEqual(report.p0, []);
  const hashes = pub.forecasts.map((f) => f.model.inputHash);
  assert.equal(new Set(hashes).size, hashes.length, "one fingerprint per event, checked against the published artifact too");
});

test("THE TEAM-STRENGTH TERM IS SWITCHED OFF — its coefficient is indistinguishable from zero", () => {
  const sig = read("data/internal/research/nfl/reports/signal-significance.json");
  assert.equal(sig.barDeclaredBeforeComputation, true, "the |t| >= 2 bar is declared before the statistic, not chosen to suit it");
  assert.equal(sig.reproducesCommittedFit, true, "the test reproduces the SHIPPED fit, not a different model");
  assert.equal(sig.fitted.ciIncludesZero, true);
  assert.equal(sig.significant, false);

  const h = report.heads.find((x) => x.head === "margin_and_win");
  assert.equal(h.classification, "LIMITED_INPUTS");
  assert.equal(h.teamSignalState, "NOT_SIGNIFICANT");
  assert.equal(h.eventSpecific, false);
  assert.equal(h.observedVariationIsNoise, true,
    "ten distinct win probabilities look like evidence and are not — with the term zeroed they are ten draws around one mean");
  // and the generator actually applies the gate
  const gen = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  assert.match(gen, /const EFFECTIVE_SLOPE = TEAM_SIGNAL_APPLIED \? base\.marginSlope : 0;/);
  assert.match(gen, /LAMBDA \* \(EFFECTIVE_SLOPE \* d\)/);
  assert.match(gen, /effectiveSlope: EFFECTIVE_SLOPE, teamSignal: TEAM_SIGNAL\.state/,
    "the gate is inside the input hash, so a gated and an ungated run can never collide");
  for (const f of pub.forecasts) {
    assert.equal(f.teamSignal.state, "NOT_SIGNIFICANT", `${f.matchup}: every published forecast carries the limitation`);
    assert.match(f.teamSignal.note, /no measurable read on which of these two teams is better/);
  }
});

test("THE INVERSION IS GONE — the model no longer leans against the stronger side", () => {
  const corpus = read("data/internal/research/nfl/corpus-v1.json");
  const state = strengthStateAt({ rows: corpus.rows, cutoffIso: pub.generatedAt });
  const ds = pub.forecasts.map((f) => state.ratingFor(f.home.name) - state.ratingFor(f.away.name));
  const ps = pub.forecasts.map((f) => f.forecastSummary.winProbability.home);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const md = mean(ds), mp = mean(ps);
  const r = ds.reduce((s, _, i) => s + (ds[i] - md) * (ps[i] - mp), 0) /
    (Math.sqrt(ds.reduce((s, x) => s + (x - md) ** 2, 0)) * Math.sqrt(ps.reduce((s, x) => s + (x - mp) ** 2, 0)));
  // Before the gate this was -0.9726: a strong, consistent lean AGAINST the better team.
  assert.ok(Math.abs(r) < 0.6, `strength/win-probability correlation must be noise-level, got ${r.toFixed(4)}`);
  // and the residual spread is small enough to read as noise rather than a claim
  const spreadPp = (Math.max(...ps) - Math.min(...ps)) * 100;
  assert.ok(spreadPp < 3, `with the term off, the spread across the slate is simulation noise (${spreadPp.toFixed(2)}pp)`);
});

test("METAMORPHIC · the MACHINERY still responds to strength — the gate is what switched it off", () => {
  // With the team term zeroed there is deliberately no monotone relationship in the PUBLISHED
  // numbers, so asserting one would now be asserting a bug. What must still hold is that the
  // formula itself responds to strength — otherwise "we switched it off" would be indistinguishable
  // from "it never worked", and re-enabling it after a better fit would ship silently broken.
  const fit = read("data/internal/research/nfl/reports/preseason-model-v1-evaluation.json").fit;
  const cal = read("data/internal/research/nfl/reports/public-beta-v1-calibration.json");
  const lambda = cal.calibration.signalShrinkLambda;
  const marginMean = (slope, d) => fit.homeAdvantage + lambda * (slope * d);

  // A hypothetical POSITIVE, significant slope: a stronger home side must get a better margin.
  const hypothetical = 0.05;
  assert.ok(marginMean(hypothetical, 200) > marginMean(hypothetical, 0), "stronger home ⇒ better margin");
  assert.ok(marginMean(hypothetical, 0) > marginMean(hypothetical, -200), "weaker home ⇒ worse margin");
  // Swapping home and away flips the sign of the strength term, as a margin must.
  const swapped = marginMean(hypothetical, -200) - fit.homeAdvantage;
  const straight = marginMean(hypothetical, 200) - fit.homeAdvantage;
  assert.ok(Math.abs(swapped + straight) < 1e-12, "swapping the sides negates the strength contribution exactly");

  // And the SHIPPED configuration contributes nothing at any strength gap — that is the gate.
  assert.equal(marginMean(0, 200), marginMean(0, -200));
  assert.equal(marginMean(0, 200), fit.homeAdvantage);
});

test("COHERENCE · the win side agrees with the margin sign, in every published event", () => {
  for (const f of pub.forecasts) {
    const s = f.forecastSummary;
    if (s.margin.median > 0) assert.ok(s.winProbability.home > 0.5, `${f.matchup}`);
    if (s.margin.median < 0) assert.ok(s.winProbability.home < 0.5, `${f.matchup}`);
    assert.ok(Math.abs(s.winProbability.home + s.winProbability.away - 1) < 1e-6);
  }
});

test("THE TOTAL HEAD IS A DECLARED SHARED PRIOR — and the audit refuses to read its noise as signal", () => {
  const h = report.heads.find((x) => x.head === "total");
  assert.equal(h.classification, "LIMITED_INPUTS");
  assert.equal(h.declaredSharedPrior, true);
  assert.equal(h.eventSpecific, false,
    "published totals DO vary by a point or two; that variation is simulation noise over one constant prior, and calling it differentiation is the exact mistake this audit exists to catch");
  assert.equal(h.observedVariationIsNoise, true);
  assert.match(h.missingAdapter, /preregistered bar/, "the repair is named and gated, not promised vaguely");
});

test("the VERDICT is derived from the classifications and cannot contradict them", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/audit-nfl-differentiation.mjs"), "utf8");
  assert.match(src, /heads\.every\(\(h\) => h\.classification === "EVENT_SPECIFIC"\)/);
  assert.match(src, /A verdict that\s*\n?\s*\/\/ could disagree with its own per-head classification/);
  const cls = report.heads.map((x) => x.classification);
  const expected = report.p0.length ? "P0_DEFECT"
    : cls.every((c) => c === "EVENT_SPECIFIC") ? "FULLY_EVENT_SPECIFIC"
    : cls.some((c) => c === "EVENT_SPECIFIC") ? "PARTIALLY_EVENT_SPECIFIC"
    : "NO_EVENT_SPECIFIC_SIGNAL";
  assert.equal(report.verdict, expected);
  assert.equal(report.verdict, "NO_EVENT_SPECIFIC_SIGNAL",
    "today's honest answer: neither head reads these teams — one by design (league scoring prior), one because its coefficient failed the significance bar");
});

test("ROUNDED TIES are justified numerically, never waved through", () => {
  for (const t of report.roundedTies) {
    assert.equal(t.distributionsDiffer, true, `${t.events.join(" / ")} at ${t.roundedScore} must sit on distinct distributions`);
    assert.equal(new Set(t.underlyingWinProbabilities).size, t.underlyingWinProbabilities.length);
    assert.match(t.verdict, /^LEGITIMATE/);
  }
  assert.ok(report.roundedTies.length > 0, "this slate genuinely has rounded ties — they are explained, not hidden");
});

test("PUBLIC · the limitation is stated to readers in plain words, with no research payload", () => {
  assert.equal(publicSummary.dataClass, "PUBLIC_DERIVED");
  assert.match(publicSummary.headline, /does not currently tell these teams apart/);
  const totals = publicSummary.heads.find((h) => /points are scored/i.test(h.head));
  assert.equal(totals.state, "LIMITED_INPUTS");
  assert.match(totals.plainEnglish, /does NOT look at the two teams/);
  const winner = publicSummary.heads.find((h) => /who wins/i.test(h.head));
  assert.equal(winner.state, "LIMITED_INPUTS");
  assert.match(winner.plainEnglish, /we switched that part off/);
  assert.match(publicSummary.whyGamesLookAlike, /cannot tell them apart/);
  assert.match(publicSummary.whatWeFoundAndFixed, /favouring the WEAKER side/,
    "the defect is disclosed to readers, not only recorded internally");
  const blob = JSON.stringify(publicSummary);
  for (const leak of ["muTotal", "marginSlope", "lambda", "inputHash", "data/internal", "PRIVATE_RESEARCH", "Elo"]) {
    assert.ok(!blob.includes(leak), `the public summary must not carry "${leak}"`);
  }
  for (const banned of ["edge", "lock", "guaranteed", "profitable"]) {
    assert.doesNotMatch(blob, new RegExp(`\\b${banned}\\b`, "i"));
  }
});

test("the market can never rewrite the forecast — comparison only", () => {
  const gen = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  const hashBlock = gen.slice(gen.indexOf("const inputHash"), gen.indexOf("digest(\"hex\")"));
  assert.doesNotMatch(hashBlock, /\b(market|markets|consensus|books?)\b/i);
  const simBlock = gen.slice(gen.indexOf("for (let i = 0; i < RUNS"), gen.indexOf("const hS ="));
  assert.doesNotMatch(simBlock, /market|consensus/i);
});
