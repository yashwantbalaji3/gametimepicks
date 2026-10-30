/**
 * P0-E daily Bank Builder / Moonshot candidates: policy pins, payout math, correlation refusal, separate-book
 * "illustrative" labelling, NO_CANDIDATE reasons per leg type, no fabricated legs, receipt immutability and status
 * transitions, the real committed sources (no key → NO_CANDIDATE), a synthetic NBA line artifact under a throwaway key,
 * and byte identity of /bank-builder and /moonshot outside the new section.
 * Run: npx tsx --test src/lib/products/daily-candidates/daily-candidates.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

import { POLICY, EXAMPLE_STAKE, DAILY_CANDIDATE_SWITCH, LEG_TYPE, REQUIRED_LEG_TYPES, CALIBRATION_STATUS, DAILY_CANDIDATE_SECTION_ENV } from "./policy.mjs";
import { buildDailyCandidate, evaluateDailyLeg, parlayMath, pricingOf, fabricatedLegs, DAILY_REASON, CARD_REASON } from "./engine.mjs";
import { makeDailyCandidateReceipt, writeReceiptOnce, appendStatusEvent, readStatusEvents, currentStatus, canonicalJson, receiptPath } from "./receipt.mjs";
import { loadDailyCandidateInputs, dailyCandidateForPage } from "./load.mjs";
import { REASON } from "../eligible-leg/contract.mjs";
import { PROBABILITY_BASIS } from "../recommendation-receipt.mjs";
import { buildSyntheticLineArtifact, writeSyntheticArtifact } from "../../../../scripts/social/synthetic-line-artifact.mjs";

const APP = process.cwd();
const { BUILDER_PLUS100_FALLBACK_BAND, BUILDER_PLUS100_TARGET } = await import("../../parlay-suggested.ts");
const { MOONSHOT_MIN_COMBINED_ODDS } = await import("../../world-cup/model-qualified-picks.ts");
const { DEFAULT_STAKE } = await import("../../parlay-payout.ts");

// ── synthetic legs (MLB is FULL_MODEL in the real registry, so it exercises the positive path with no injection) ──
const AS_OF = "2026-10-30T15:00:00.000Z";
const START = "2026-10-30T23:10:00.000Z";
const leg = (o = {}) => ({
  legType: "mlb_test", sport: "mlb", eventId: o.eventId ?? "g1", eventStartUtc: o.start ?? START, eventLabel: o.label ?? "AAA @ BBB",
  team: o.team ?? "BBB", opponent: o.opponent ?? "AAA", participantId: o.participantId ?? null, participantName: null,
  family: "winner", marketFamily: o.marketFamily ?? "team_result", marketKey: o.marketKey ?? "h2h", side: o.side ?? (o.team ?? "BBB"), line: o.line ?? null,
  selection: `${o.team ?? "BBB"} to win`, availabilityState: o.availabilityState ?? "UNKNOWN",
  forecast: {
    owner: "mlb-prediction official snapshot", id: "snap-1", forecastClass: o.forecastClass ?? "VALIDATED_MODEL", modelStatus: "VALIDATED",
    probability: o.probability ?? 0.66, probabilityBasis: o.basis ?? PROBABILITY_BASIS.MODEL_VALIDATED, projection: o.projection ?? null,
    estimate: o.estimate ?? false, sourceRefs: ["test/fixture.json"], publishedAt: "2026-10-30T12:00:00Z",
  },
  price: o.price === null ? null : { american: o.american ?? -150, bookmaker: o.book ?? "BookA", capturedAt: o.capturedAt ?? "2026-10-30T14:00:00.000Z", receipt: "test/odds" },
});

test("policy constants are the documented ones (pinned to their owners)", () => {
  assert.equal(POLICY["bank-builder"].combinedAmerican.lo, BUILDER_PLUS100_FALLBACK_BAND.lo);
  assert.equal(POLICY["bank-builder"].combinedAmerican.hi, BUILDER_PLUS100_FALLBACK_BAND.hi);
  assert.equal(POLICY["bank-builder"].combinedAmerican.target, BUILDER_PLUS100_TARGET);
  assert.equal(POLICY["bank-builder"].minLegProbability, 0.6);
  const doc = fs.readFileSync(path.join(APP, "..", "docs", "MULTI_SPORT_BANK_BUILDER_MOONSHOT_DESIGN_2026-07-09.md"), "utf8");
  assert.match(doc, /≥ 0\.60/);
  assert.match(doc, /\+700/);
  assert.equal(POLICY.moonshot.combinedAmerican.lo, MOONSHOT_MIN_COMBINED_ODDS);
  assert.equal(EXAMPLE_STAKE, DEFAULT_STAKE);
  assert.equal(DAILY_CANDIDATE_SWITCH.candidateCardsPublic, false, "the public candidate-card switch is the founder's");
  for (const t of REQUIRED_LEG_TYPES) assert.equal(CALIBRATION_STATUS[t].calibrated, false, `${t} has no accepted calibrated probability today`);
});

test("payout math: full-precision decimal, example stake, gross payout and net profit", () => {
  const m = parlayMath([{ american: -110 }, { american: 150 }]);
  const dec = (1 + 100 / 110) * 2.5;
  assert.ok(Math.abs(m.decimal - dec) < 1e-12);
  assert.equal(m.american, 377);
  assert.deepEqual(m.example, { stake: 10, grossPayout: 47.73, netProfit: 37.73, hypothetical: true });
  // +133 and -130 (parlay-payout.ts's own example): never round-trips through American.
  assert.equal(parlayMath([{ american: 133 }, { american: -130 }], 100).example.grossPayout, 412.23);
  assert.equal(parlayMath([{ american: null }, { american: 150 }]), null, "a missing price is no payout, never a partial product");
});

test("positive path: a Bank Builder candidate from two validated, priced, distinct-game legs; legs are inputs verbatim", () => {
  const inputs = [leg({ eventId: "g1", team: "BBB", opponent: "AAA", american: -150 }), leg({ eventId: "g2", team: "DDD", opponent: "CCC", label: "CCC @ DDD", american: -160, probability: 0.64 })];
  const r = buildDailyCandidate({ product: "bank-builder", productDay: "2026-10-30", asOf: AS_OF, inputs });
  assert.equal(r.status, "CANDIDATE");
  assert.equal(r.card.legs.length, 2);
  assert.equal(r.card.combined.american, decimalTo(1.6666666666666667 * 1.625));
  assert.ok(r.card.combined.american >= 60 && r.card.combined.american <= 180);
  assert.deepEqual(fabricatedLegs(r, inputs), []);
  assert.equal(r.card.pricing.kind, "SAME_BOOK_ARITHMETIC");
  assert.equal(r.card.pricing.executable, false);
  assert.ok(Math.abs(r.card.jointProbability.value - 0.66 * 0.64) < 1e-12);
  assert.match(r.card.jointProbability.basis, /not a measured joint probability/);
  // A tampered card leg is caught.
  const tampered = structuredClone(r); tampered.card.legs[0].american = 120;
  assert.equal(fabricatedLegs(tampered, inputs).length, 1);
});
function decimalTo(d) { return d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)); }

test("correlation: same-game legs are refused, never multiplied (both products)", () => {
  const inputs = [
    leg({ eventId: "g1", team: "BBB", opponent: "AAA", american: -150 }),
    leg({ eventId: "g1", team: "BBB", opponent: "AAA", marketFamily: "player_prop", marketKey: "batter_hits", participantId: "p9", side: "Over", line: 0.5, american: -140, availabilityState: "ACTIVE_CONFIRMED" }),
  ];
  for (const product of ["bank-builder", "moonshot"]) {
    const r = buildDailyCandidate({ product, productDay: "2026-10-30", asOf: AS_OF, inputs });
    assert.equal(r.status, "NO_CANDIDATE");
    assert.deepEqual(r.cardReasons, [CARD_REASON.CORRELATED_ONLY]);
    assert.ok(r.counts.correlatedCombosRefused > 0);
    assert.equal(r.card, null);
  }
});

test("separate books are illustrative, never one executable parlay; a verified same-book quote is the only executable case", () => {
  const legs = [{ legId: "a", bookmaker: "BookA" }, { legId: "b", bookmaker: "BookB" }];
  const mixed = pricingOf(legs);
  assert.equal(mixed.kind, "MIXED_BOOKS_ILLUSTRATIVE");
  assert.equal(mixed.executable, false);
  assert.match(mixed.label, /^Illustrative only/);
  assert.match(mixed.label, /not one parlay any single book offers/);
  const same = pricingOf([{ legId: "a", bookmaker: "BookA" }, { legId: "b", bookmaker: "BookA" }]);
  assert.equal(same.kind, "SAME_BOOK_ARITHMETIC");
  assert.equal(same.executable, false);
  assert.match(same.label, /^Illustrative/);
  const quoted = pricingOf([{ legId: "a", bookmaker: "BookA" }, { legId: "b", bookmaker: "BookA" }], { bookmaker: "BookA", american: 110, legIds: ["b", "a"] });
  assert.equal(quoted.executable, true);
  assert.equal(pricingOf(legs, { bookmaker: "BookA", american: 110, legIds: ["a", "b"] }).executable, false, "a quote cannot make mixed books executable");
  // Through the engine.
  const inputs = [leg({ eventId: "g1", american: -150, book: "BookA" }), leg({ eventId: "g2", team: "DDD", opponent: "CCC", american: -160, probability: 0.64, book: "BookB" })];
  const r = buildDailyCandidate({ product: "bank-builder", productDay: "2026-10-30", asOf: AS_OF, inputs });
  assert.equal(r.card.pricing.kind, "MIXED_BOOKS_ILLUSTRATIVE");
});

test("a projection above a line never selects a leg: no calibrated probability → refused", () => {
  const e = evaluateDailyLeg(leg({ basis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING, forecastClass: "EXPERIMENTAL_MODEL", probability: 0.9, projection: 99, line: 0.5, marketFamily: "player_prop", participantId: "p1", side: "Over", availabilityState: "ACTIVE_CONFIRMED" }), { asOf: AS_OF, policy: POLICY["bank-builder"] });
  assert.equal(e.eligible, false);
  assert.ok(e.failures.includes(DAILY_REASON.PROBABILITY_NOT_CALIBRATED));
  assert.equal(e.probability, null, "an unvalidated probability is never carried");
});

test("leg-level product rules: floor, model below price, participation, ESTIMATE, timing", () => {
  const ev = (o, product = "bank-builder") => evaluateDailyLeg(leg(o), { asOf: AS_OF, policy: POLICY[product] }).failures;
  assert.ok(ev({ probability: 0.55, american: 150 }).includes(DAILY_REASON.BELOW_LEG_PROBABILITY_FLOOR));
  assert.ok(!ev({ probability: 0.55, american: 150 }, "moonshot").includes(DAILY_REASON.BELOW_LEG_PROBABILITY_FLOOR));
  assert.ok(ev({ probability: 0.61, american: -200 }).includes(DAILY_REASON.MODEL_BELOW_PRICE));
  assert.ok(ev({ marketFamily: "player_prop", participantId: "p1", availabilityState: "QUESTIONABLE" }).includes(DAILY_REASON.PARTICIPATION_NOT_CLEARED));
  assert.ok(ev({ estimate: true }).includes(DAILY_REASON.ESTIMATE_RESEARCH_ONLY));
  assert.ok(ev({ start: "2026-10-30T15:10:00.000Z" }).includes(REASON.EVENT_INSIDE_CUTOFF));
  assert.ok(ev({ price: null }).includes(REASON.PRICE_UNAVAILABLE));
  assert.ok(ev({ capturedAt: "2026-10-30T16:00:00.000Z" }).includes(REASON.PRICE_CAPTURED_AFTER_AS_OF));
});

test("NO_CANDIDATE: NBA and NFL legs list every failed requirement per leg type", () => {
  const nbaProp = { ...leg({ eventId: "401", marketFamily: "player_prop", marketKey: "player_points", participantId: "123", side: "Over", line: 20.5, american: -110, availabilityState: "ACTIVE_EXPECTED", basis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING, forecastClass: "EXPERIMENTAL_MODEL", probability: null, projection: 24 }), legType: LEG_TYPE.NBA_PLAYER_PROP, sport: "nba" };
  const nflPass = { ...leg({ eventId: "501", marketFamily: "player_prop", marketKey: "player_pass_yds", participantId: "77", side: "Over", line: 250.5, american: -115, availabilityState: "ACTIVE_EXPECTED", basis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING, forecastClass: "EXPERIMENTAL_MODEL", probability: null }), legType: LEG_TYPE.NFL_PLAYER_PROP, sport: "nfl", family: "pass_yds" };
  const r = buildDailyCandidate({ product: "moonshot", productDay: "2026-10-30", asOf: AS_OF, inputs: [nbaProp, nflPass] });
  assert.equal(r.status, "NO_CANDIDATE");
  assert.deepEqual(r.cardReasons, [CARD_REASON.TOO_FEW_ELIGIBLE_LEGS]);
  for (const t of REQUIRED_LEG_TYPES) assert.ok(r.legTypes[t], `${t} is always listed`);
  const p = r.legTypes[LEG_TYPE.NBA_PLAYER_PROP];
  for (const code of [REASON.SPORT_NOT_ELIGIBLE, REASON.FORECAST_EXPERIMENTAL, DAILY_REASON.PROBABILITY_NOT_CALIBRATED]) assert.equal(p.failureCounts[code], 1, code);
  assert.equal(p.requirements.find((q) => q.key === "sport_gate").pass, false);
  assert.equal(p.requirements.find((q) => q.key === "calibrated_probability").pass, false);
  assert.equal(p.requirements.find((q) => q.key === "verified_price").pass, true, "the price was there; the probability was not");
  assert.equal(r.legTypes[LEG_TYPE.NFL_PLAYER_PROP].failureCounts[DAILY_REASON.ESTIMATE_RESEARCH_ONLY], 1);
});

test("receipts: deterministic, deep-frozen, write-once, pregame only, append-only status", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-daily-receipts-"));
  try {
    const inputs = [leg({ eventId: "g1", american: -150 }), leg({ eventId: "g2", team: "DDD", opponent: "CCC", american: -160, probability: 0.64 })];
    const r = buildDailyCandidate({ product: "bank-builder", productDay: "2026-10-30", asOf: AS_OF, inputs });
    const a = makeDailyCandidateReceipt(r), b = makeDailyCandidateReceipt(r);
    assert.equal(canonicalJson(a), canonicalJson(b), "same inputs, same bytes (no wall clock)");
    assert.throws(() => { a.result.card.legs[0].american = 999; }, TypeError);
    assert.equal(a.placed, false);
    assert.equal(a.hypotheticalStakeOnly, true);
    assert.equal(writeReceiptOnce(dir, a, { inputs, nowIso: "2026-10-30T15:05:00Z" }).written, true);
    assert.equal(writeReceiptOnce(dir, b, { inputs, nowIso: "2026-10-30T15:06:00Z" }).written, false, "identical rewrite is a no-op");
    // A different receipt claiming the same id and path.
    const forged = structuredClone(a); forged.result.card.example.grossPayout = 1e6;
    const { contentSha256: _drop, ...body } = forged;
    forged.contentSha256 = crypto.createHash("sha256").update(canonicalJson(body)).digest("hex");
    assert.equal(receiptPath(dir, forged), receiptPath(dir, a));
    assert.throws(() => writeReceiptOnce(dir, forged, { inputs, nowIso: "2026-10-30T15:07:00Z" }), /IMMUTABLE/);
    const bytes = fs.readFileSync(receiptPath(dir, a), "utf8");
    // Content hash tamper, post-start write, fabricated legs: all refused.
    const badHash = { ...structuredClone(a), contentSha256: "0".repeat(64) };
    assert.throws(() => writeReceiptOnce(fs.mkdtempSync(path.join(os.tmpdir(), "gtp-r2-")), badHash, { inputs, nowIso: "2026-10-30T15:07:00Z" }), /contentSha256/);
    assert.throws(() => writeReceiptOnce(dir, a, { inputs, nowIso: START }), /has started/);
    assert.throws(() => writeReceiptOnce(dir, a, { inputs: [inputs[0]], nowIso: "2026-10-30T15:07:00Z" }), /not their inputs verbatim/);
    // Status: draft → published → live → pending → won; illegal jumps refused; receipt bytes never change.
    assert.equal(currentStatus(readStatusEvents(dir), a.receiptId), "draft");
    assert.throws(() => appendStatusEvent(dir, a, { status: "won", at: "2026-10-30T15:08:00Z" }), /illegal transition draft → won/);
    for (const s of ["published", "live", "pending", "won"]) appendStatusEvent(dir, a, { status: s, at: "2026-10-31T04:00:00Z" });
    assert.equal(currentStatus(readStatusEvents(dir), a.receiptId), "won");
    assert.throws(() => appendStatusEvent(dir, a, { status: "lost", at: "2026-10-31T05:00:00Z" }), /illegal transition won → lost/, "a settled result is never rewritten");
    assert.equal(fs.readFileSync(receiptPath(dir, a), "utf8"), bytes);
    // NO_CANDIDATE receipts publish and stop.
    const none = makeDailyCandidateReceipt(buildDailyCandidate({ product: "moonshot", productDay: "2026-10-30", asOf: AS_OF, inputs: [] }));
    appendStatusEvent(dir, none, { status: "published", at: "2026-10-30T15:09:00Z" });
    assert.throws(() => appendStatusEvent(dir, none, { status: "live", at: "2026-10-30T15:10:00Z" }), /illegal transition/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── real committed sources, no display key (every CI build) ──
const NO_KEY = { GTP_ODDS_DISPLAY_KEY: undefined };
test("real sources today: NO_CANDIDATE on both products, all four leg types explained, no price read without a key", () => {
  for (const product of ["bank-builder", "moonshot"]) {
    const r = dailyCandidateForPage(product, { asOf: "2026-10-30T16:00:00.000Z", env: NO_KEY });
    assert.equal(r.status, "NO_CANDIDATE");
    assert.equal(r.card, null);
    for (const t of REQUIRED_LEG_TYPES) {
      const row = r.legTypes[t];
      assert.equal(row.eligible, 0);
      assert.equal(row.requirements.find((q) => q.key === "sport_gate").pass, false, `${t}: registry refuses`);
      assert.equal(row.requirements.find((q) => q.key === "calibrated_probability").pass, false, `${t}: no calibrated probability`);
      assert.equal(row.requirements.find((q) => q.key === "verified_price").pass, false, `${t}: no readable verified price in this build`);
    }
    const nfl = r.legTypes[LEG_TYPE.NFL_GAME_WINNER];
    assert.ok(nfl.considered > 0, "the weekend's NFL forecasts of record are considered");
    for (const code of [REASON.SPORT_NOT_ELIGIBLE, REASON.FORECAST_EXPERIMENTAL, REASON.PRICE_UNAVAILABLE, DAILY_REASON.PROBABILITY_NOT_CALIBRATED]) assert.equal(nfl.failureCounts[code], nfl.considered, code);
  }
});

test("NBA game winners from a committed lane are considered and refused (no moneyline price, Elo estimate not calibrated)", () => {
  const { inputs } = loadDailyCandidateInputs({ appRoot: APP, productDay: "2026-10-29", asOf: "2026-10-29T16:30:00.000Z", env: NO_KEY });
  const gw = inputs.filter((i) => i.legType === LEG_TYPE.NBA_GAME_WINNER);
  assert.ok(gw.length > 0);
  for (const i of gw) {
    assert.equal(i.price, null);
    assert.equal(i.forecast.probabilityBasis, PROBABILITY_BASIS.NO_VALIDATED_MAPPING);
    const e = evaluateDailyLeg(i, { asOf: "2026-10-29T16:30:00.000Z", policy: POLICY["bank-builder"] });
    assert.equal(e.eligible, false);
    assert.equal(e.probability, null);
  }
});

test("synthetic NBA line artifact under a throwaway key: props are read and every one is refused", () => {
  const DATE = "2026-10-29";
  const buf = fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${DATE}.json`));
  const lane = JSON.parse(buf.toString("utf8"));
  const t = Math.min(...lane.games.map((g) => Date.parse(g.tipUtc)));
  const iso = (ms) => new Date(ms).toISOString();
  const H = 3600_000;
  const art = buildSyntheticLineArtifact({ lane, laneSha256: crypto.createHash("sha256").update(buf).digest("hex"), asOf: iso(t - H), freshAt: iso(t - 1.5 * H), staleAt: iso(t - 6.5 * H) });
  const { dir, env } = writeSyntheticArtifact(art);
  try {
    const asOf = iso(t - H);
    const { inputs, sourceNotes } = loadDailyCandidateInputs({ appRoot: APP, productDay: DATE, asOf, env: { ...process.env, ...env } });
    const props = inputs.filter((i) => i.legType === LEG_TYPE.NBA_PLAYER_PROP);
    assert.ok(props.length > 0, "synthetic rows reach the engine");
    assert.equal(sourceNotes[LEG_TYPE.NBA_PLAYER_PROP].price, null);
    for (const product of ["bank-builder", "moonshot"]) {
      const r = buildDailyCandidate({ product, productDay: DATE, asOf, inputs, sourceNotes });
      assert.equal(r.status, "NO_CANDIDATE");
      const row = r.legTypes[LEG_TYPE.NBA_PLAYER_PROP];
      assert.equal(row.considered, props.length);
      assert.equal(row.eligible, 0);
      for (const code of [REASON.SPORT_NOT_ELIGIBLE, REASON.FORECAST_EXPERIMENTAL, DAILY_REASON.PROBABILITY_NOT_CALIBRATED]) assert.equal(row.failureCounts[code], props.length, code);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── the pages: the new section is additive; everything else (the historical record) is byte-identical ──
const HISTORY_FILES = ["mr-dub/ledger.json", "mr-dub/banked-ladders.json", "mr-dub/master-ledger.json", "bank-builder/public-summary-latest.json", "bank-builder/public-ledger-latest.json"];
const shaOf = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(APP, "public", "data", rel))).digest("hex");
const SECTION = /<section data-daily-candidate="[^"]+"[\s\S]*?<\/section>/;

async function render(rel) {
  const m = await import(path.join(APP, rel));
  const Page = typeof m.default === "function" ? m.default : m.default.default;
  return renderToStaticMarkup(React.createElement(Page));
}
function withSection(value, fn) {
  const before = process.env[DAILY_CANDIDATE_SECTION_ENV];
  if (value == null) delete process.env[DAILY_CANDIDATE_SECTION_ENV]; else process.env[DAILY_CANDIDATE_SECTION_ENV] = value;
  return fn().finally(() => { if (before === undefined) delete process.env[DAILY_CANDIDATE_SECTION_ENV]; else process.env[DAILY_CANDIDATE_SECTION_ENV] = before; });
}

for (const [rel, product] of [["src/app/bank-builder/page.tsx", "bank-builder"], ["src/app/moonshot/page.tsx", "moonshot"]]) {
  test(`${rel}: historical sections byte-identical with and without the daily candidate section`, async () => {
    const shaBefore = HISTORY_FILES.map(shaOf);
    const on = await withSection(null, () => render(rel));
    const off = await withSection("off", () => render(rel));
    const m = SECTION.exec(on);
    assert.ok(m, "the section renders by default");
    assert.match(m[0], new RegExp(`data-daily-candidate="${product}"`));
    assert.match(m[0], /No qualified .* candidate today/);
    assert.equal(on.replace(SECTION, ""), off, "removing the new section leaves the page byte-identical");
    assert.ok(!SECTION.test(off));
    assert.deepEqual(HISTORY_FILES.map(shaOf), shaBefore, "the historical record files were not touched");
    // Never implies a placed bet or a promised win.
    assert.doesNotMatch(m[0], /\bguarantee|\bsafe\b|you will win|bet placed/i);
  });
}
