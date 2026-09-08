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
  // window-size independent: the published set shrinks as games kick off (9 → 4 tonight).
  // Asserting a floor of 6 pinned a full slate and failed the moment 5 games started.
  assert.ok(pub.forecasts.length >= 1, "a live window publishes at least one forecast");
  for (const f of pub.forecasts) {
    const s = f.forecastSummary;
    const pHome = s.winProbability.home;
    // P245: the favourite is pHome vs pAway (tie mass scales both), and only a |median| ≥ 2
    // direction conflict contradicts — the one rule in coherence.mjs, fixtures beside it.
    const pAway = s.winProbability.away;
    if (Math.abs(s.margin.median) > 1) {
      if (s.margin.median > 0) assert.ok(pHome >= pAway, `${f.matchup}: +${s.margin.median} margin but away favoured`);
      if (s.margin.median < 0) assert.ok(pAway >= pHome, `${f.matchup}: ${s.margin.median} margin but home favoured`);
    }
    // probabilities are a distribution — the regular head carries an explicit tie mass (P244)
    const tie = s.winProbability.tieMass ?? 0;
    assert.ok(Math.abs(pHome + s.winProbability.away + tie - 1) < 1e-3, `${f.matchup}: outcomes must sum to 1`);
    // intervals bracket their medians, and scores are legal football scores
    assert.ok(s.margin.p10 <= s.margin.median && s.margin.median <= s.margin.p90);
    assert.ok(s.total.p10 <= s.total.median && s.total.median <= s.total.p90);
    for (const v of [s.projectedScore.home, s.projectedScore.away]) {
      assert.ok(Number.isInteger(v) && v >= 0 && v !== 1, `${f.matchup}: ${v} is not a legal score`);
    }
  }
});

test("HUMILITY · each phase claims exactly what its own evaluation earned", () => {
  /*
   * P240: the 0.35–0.65 band is the PRESEASON model's humility — its held-out result was a coin
   * flip, so a strong side would be an unearned claim. The regular-season identity earned a real
   * (still experimental) read on held-out 2025, so its probabilities may leave that band; what it
   * may never do is publish a near-certain side, or skip the calibration sentence.
   */
  for (const f of pub.forecasts) {
    const p = f.forecastSummary.winProbability.home;
    if (f.seasonType === 1) {
      assert.ok(p > 0.35 && p < 0.65, `${f.matchup}: ${p} is a stronger claim than the preseason model has earned`);
    } else {
      assert.equal(f.model.id, "nfl-regular-season-public-v1", `${f.matchup}: a non-preseason forecast must carry the regular-season identity`);
      assert.ok(p > 0.05 && p < 0.95, `${f.matchup}: ${p} is a stronger claim than any experimental model may publish`);
    }
    assert.ok(f.forecastSummary.winProbability.calibration, "every forecast explains its calibration in words");
  }
});

test("MARKET INDEPENDENCE · odds are carried for comparison and are not an input", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  // BOTH phases' input hashes (P240 added the regular-season one) — every hash block is scanned,
  // so a new phase cannot quietly hash a price. A zero-match is itself a failure: a guard that
  // finds no hash blocks is vacuous, not passing.
  const hashBlocks = [...src.matchAll(/const inputHash[\s\S]*?digest\("hex"\)/g)];
  assert.ok(hashBlocks.length >= 2, `expected both phases' input-hash blocks, found ${hashBlocks.length}`);
  // `muTotal` is the model's own scoring climatology — match market IDENTIFIERS, not any word
  // containing "total", or the guard flags the model's own parameter as a market leak.
  for (const [block] of hashBlocks) {
    assert.doesNotMatch(block, /\b(market|markets|consensus|marketSpreadHome|marketTotal|books?)\b/i,
      "the market must not enter the input hash");
  }
  const simBlock = src.slice(src.indexOf("for (let i = 0; i < RUNS"), src.indexOf("const hS ="));
  assert.doesNotMatch(simBlock, /market|consensus/i, "the simulation loop cannot read a price");
  // The regular path simulates through the evaluated engine — its call carries model inputs only,
  // no lines and no prices (game-sim's own evaluation pins that engine's market independence).
  assert.match(src, /simulateNflGame\(\{ fit: rsFit, strengthState: wrapped, event: ev, artifactDate: DATE, runs: RUNS \}\)/,
    "the regular-season sim call passes model inputs only");
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
  const files = fs.readdirSync(dir).filter((f) => /\.json$/.test(f));
  // P178: this compared a raw FILE COUNT against the published set, which breaks the moment a
  // legitimate pre-kickoff revision is appended (by design — corrections append with lineage rather
  // than overwriting) or a settled game leaves the published set while its receipt stays reachable.
  // The invariant that actually matters is per EVENT: everything published has a receipt.
  const eventsWithReceipts = new Set(files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).providerEventId));
  for (const f of pub.forecasts) {
    assert.ok(eventsWithReceipts.has(f.providerEventId), `${f.matchup}: every published forecast has a receipt on disk`);
  }
  assert.ok(files.length >= pub.forecasts.length, "receipts are append-only — a revision adds a file, it never removes one");
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

/*
 * ── P244 · Release A: the population is the CURRENT WEEK, never an hour window ─────────────────
 *
 * The 18h/48h clocks delivered Week 1 in slices — one forecast at T-18h, fifteen games
 * schedule-only. The builder now takes every pre-start event of the earliest (seasonType, week)
 * pair; the lookahead survives only as a backstop for schedules with no week metadata.
 */
test("P244 · the builder populates the whole current week, including events days beyond any old window", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  assert.match(src, /THE POPULATION IS THE CURRENT WEEK, NOT A CLOCK WINDOW/, "the rule is stated at the owner");
  assert.match(src, /r\.seasonType === currentPeriod\.seasonType && r\.week === currentPeriod\.week/, "week membership decides eligibility");
  // Functional, against the REAL committed schedule with a pinned clock: every pre-start row of
  // the earliest week must be in the population the source computes — proven by running the
  // population expression the same way the builder does.
  const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));
  const nowMs = Date.parse("2026-09-07T22:00:00Z");
  const pre = schedule.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED" && Date.parse(r.dateUtc) > nowMs);
  if (!pre.length) return; // no forward schedule in this tree state
  const withWeek = pre.filter((r) => r.seasonType != null && r.week != null);
  if (!withWeek.length) return;
  const best = withWeek.reduce((b, r) => (!b || r.seasonType < b.seasonType || (r.seasonType === b.seasonType && r.week < b.week) ? r : b), null);
  const week = pre.filter((r) => r.seasonType === best.seasonType && r.week === best.week);
  const beyond48h = week.filter((r) => Date.parse(r.dateUtc) > nowMs + 48 * 3.6e6);
  assert.ok(beyond48h.length > 0, "the live week extends past the old 48h window — otherwise this test is vacuous today");
  // P245: the coherence rule lives ONCE in coherence.mjs (favourite = pHome vs pAway; ±1 snap
  // band), and the builder consumes it — corruption fixtures live beside the rule.
  assert.match(src, /coherentDirection\(\{ medMargin, pHome, pAway \}\)/, "the builder consumes the one rule");
  assert.doesNotMatch(src, /COIN_FLIP_EPS/, "the mis-justified 3σ patch is gone");
});
