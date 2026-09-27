import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLOCK, CLOCK_DOMAIN, CLOCK_STATE, DOMAIN, FEED_HEALTH, NOT_A_CLAIM_ABOUT,
  SURFACE_CLOCKS, feedHealth, predictionAge, readClock, surfaceCoverage,
} from "./clocks.mjs";

const ASOF = "2026-09-27T18:00:00Z";
const MIN = 60000;

test("§15 names eleven clocks and the contract carries exactly those", () => {
  const named = [
    "PAGE_BUILT_AT", "SOURCE_OBSERVED_AT", "FORECAST_GENERATED_AT", "FORECAST_FROZEN_AT",
    "MODEL_FIT_AT", "MODEL_VALIDATED_AT", "MARKET_CAPTURED_AT", "LIVE_OBSERVED_AT",
    "FINAL_OBSERVED_AT", "SETTLED_AT", "CORRECTED_AT",
  ];
  assert.deepEqual(Object.keys(CLOCK).sort(), [...named].sort());
  assert.equal(Object.keys(CLOCK).length, 11);
  /* Every clock is assigned a domain and carries what it does NOT mean — an unassigned clock is a
     clock that can be read from anywhere, which is the failure this contract exists to stop. */
  for (const c of named) {
    assert.ok(CLOCK_DOMAIN[c], `${c} has no domain`);
    assert.ok(NOT_A_CLAIM_ABOUT[c], `${c} does not say what it is not a claim about`);
  }
});

/* ── §15 RULE 1: an old model-fit date does not mean the live feed failed ─────────────────────── */

test("a two-year-old MODEL_FIT_AT cannot make the feed look stale", () => {
  const record = {
    [CLOCK.MODEL_FIT_AT]: "2024-01-01T00:00:00Z",
    [CLOCK.MODEL_VALIDATED_AT]: "2024-02-01T00:00:00Z",
    [CLOCK.LIVE_OBSERVED_AT]: "2026-09-27T17:59:30Z", // 30 seconds old
  };
  const h = feedHealth({ record, asOf: ASOF, staleAfterMs: 2 * MIN });
  assert.equal(h.state, FEED_HEALTH.FRESH);
  assert.equal(h.ageMs, 30000);
  assert.equal(h.basis, CLOCK.LIVE_OBSERVED_AT, "the answer names the only clock it used");
});

test("MODEL_FIT_AT is not even reachable through a LIVE read — the read THROWS", () => {
  /* Structural, not advisory. A wrong number here is invisible; an exception is not. */
  assert.throws(
    () => readClock({ [CLOCK.MODEL_FIT_AT]: "2024-01-01T00:00:00Z" }, CLOCK.MODEL_FIT_AT, { domain: DOMAIN.LIVE, asOf: ASOF }),
    /MODEL clock and cannot answer a LIVE question/,
  );
});

test("a genuinely stale feed is still reported stale, model age irrelevant", () => {
  const fresh = { [CLOCK.MODEL_FIT_AT]: ASOF, [CLOCK.LIVE_OBSERVED_AT]: "2026-09-27T17:00:00Z" };
  assert.equal(feedHealth({ record: fresh, asOf: ASOF, staleAfterMs: 2 * MIN }).state, FEED_HEALTH.STALE);
});

test("no live observation is NOT_OBSERVED — never FRESH and never STALE", () => {
  const h = feedHealth({ record: { [CLOCK.MODEL_FIT_AT]: ASOF }, asOf: ASOF, staleAfterMs: 2 * MIN });
  assert.equal(h.state, FEED_HEALTH.NOT_OBSERVED);
  assert.equal(h.ageMs, null, "absent is not zero");
  assert.notEqual(h.state, FEED_HEALTH.FRESH, "unknown must never read as up to date");
});

/* ── §15 RULE 2: a current page build does not mean the prediction was generated now ─────────── */

test("a page built this second does not make a week-old forecast current", () => {
  const record = {
    [CLOCK.PAGE_BUILT_AT]: ASOF,
    [CLOCK.FORECAST_GENERATED_AT]: "2026-09-20T18:00:00Z", // 7 days
  };
  const p = predictionAge({ record, asOf: ASOF });
  assert.equal(p.state, CLOCK_STATE.KNOWN);
  assert.equal(p.ageMs, 7 * 86400000);
  assert.equal(p.basis, CLOCK.FORECAST_GENERATED_AT);
});

test("PAGE_BUILT_AT cannot answer a FORECAST question — the read THROWS", () => {
  assert.throws(
    () => readClock({ [CLOCK.PAGE_BUILT_AT]: ASOF }, CLOCK.PAGE_BUILT_AT, { domain: DOMAIN.FORECAST, asOf: ASOF }),
    /BUILD clock and cannot answer a FORECAST question/,
  );
});

test("an absent FORECAST_GENERATED_AT is UNKNOWN — it does NOT fall back to the build clock", () => {
  /* This is the real MLB case: a carried-forward forecast keeps no generation time. The honest
     answer is "we do not know", and a fallback to PAGE_BUILT_AT would have printed "moments ago". */
  const p = predictionAge({ record: { [CLOCK.PAGE_BUILT_AT]: ASOF }, asOf: ASOF });
  assert.equal(p.state, CLOCK_STATE.UNKNOWN);
  assert.equal(p.ageMs, null);
  assert.equal(p.at, null);
});

test("FORECAST_FROZEN_AT is not FORECAST_GENERATED_AT, though both are FORECAST-domain", () => {
  /* A carried-forward forecast freezes long after it was computed, so the two clocks differ and the
     freeze is the LATER one. Sharing a domain lets both be read; it does not make them equal. */
  const record = {
    [CLOCK.FORECAST_GENERATED_AT]: "2026-09-26T12:00:00Z",
    [CLOCK.FORECAST_FROZEN_AT]: "2026-09-27T17:00:00Z",
  };
  const gen = readClock(record, CLOCK.FORECAST_GENERATED_AT, { domain: DOMAIN.FORECAST, asOf: ASOF });
  const frozen = readClock(record, CLOCK.FORECAST_FROZEN_AT, { domain: DOMAIN.FORECAST, asOf: ASOF });
  assert.ok(gen.ageMs > frozen.ageMs, "the generation is older than the freeze");
  assert.notEqual(predictionAge({ record, asOf: ASOF }).ageMs, frozen.ageMs, "the freeze must not stand in for the generation");
});

/* ── ABSENT / INVALID ───────────────────────────────────────────────────────────────────────── */

test("a clock ahead of asOf is INVALID, not fresh", () => {
  const r = readClock({ [CLOCK.LIVE_OBSERVED_AT]: "2026-09-27T18:05:00Z" }, CLOCK.LIVE_OBSERVED_AT, { domain: DOMAIN.LIVE, asOf: ASOF });
  assert.equal(r.state, CLOCK_STATE.INVALID);
  assert.match(r.why, /ahead of asOf/);
  /* A negative age would otherwise sort as the freshest thing on the page. */
  assert.equal(r.ageMs, null);
  assert.equal(feedHealth({ record: { [CLOCK.LIVE_OBSERVED_AT]: "2026-09-27T18:05:00Z" }, asOf: ASOF, staleAfterMs: MIN }).state, FEED_HEALTH.INVALID);
});

test("an unparseable clock is INVALID, not absent — a malformed stamp is a bug to see", () => {
  const r = readClock({ [CLOCK.SETTLED_AT]: "yesterday" }, CLOCK.SETTLED_AT, { domain: DOMAIN.RESULT, asOf: ASOF });
  assert.equal(r.state, CLOCK_STATE.INVALID);
  assert.match(r.why, /unparseable/);
});

test("an undeclared domain is refused, and so is an unnamed clock", () => {
  assert.throws(() => readClock({}, CLOCK.LIVE_OBSERVED_AT, { asOf: ASOF }), /a domain must be declared/);
  assert.throws(() => readClock({}, "UPDATED_AT", { domain: DOMAIN.LIVE, asOf: ASOF }), /not one of the eleven/);
});

test("asOf is required — a clock age is never taken from the wall clock", () => {
  assert.throws(
    () => readClock({ [CLOCK.LIVE_OBSERVED_AT]: ASOF }, CLOCK.LIVE_OBSERVED_AT, { domain: DOMAIN.LIVE }),
    /asOf must be a parseable instant/,
  );
});

test("feedHealth refuses to invent a staleness threshold", () => {
  assert.throws(() => feedHealth({ record: {}, asOf: ASOF }), /staleAfterMs is required/);
});

/* ── SURFACES ───────────────────────────────────────────────────────────────────────────────── */

test("every clock is shown somewhere, and no surface invents one", () => {
  const { unshown, unknown } = surfaceCoverage();
  assert.deepEqual(unshown, [], "a clock no surface shows is dead code or a gap");
  assert.deepEqual(unknown, [], "a surface naming a clock that does not exist");
});

test("PAGE_BUILT_AT headlines the footer and nothing else", () => {
  for (const [surface, clocks] of Object.entries(SURFACE_CLOCKS)) {
    if (surface === "SITE_FOOTER" || surface === "OPS") continue;
    assert.ok(!clocks.includes(CLOCK.PAGE_BUILT_AT), `${surface} must not present the build clock as its "when"`);
  }
  assert.deepEqual(SURFACE_CLOCKS.SITE_FOOTER, [CLOCK.PAGE_BUILT_AT]);
});

test("model provenance is not on a live row, and liveness is not on the methodology page", () => {
  for (const c of [CLOCK.MODEL_FIT_AT, CLOCK.MODEL_VALIDATED_AT]) {
    assert.ok(!SURFACE_CLOCKS.LIVE_ROW.includes(c), `${c} is provenance, not liveness`);
  }
  for (const c of [CLOCK.LIVE_OBSERVED_AT, CLOCK.MARKET_CAPTURED_AT]) {
    assert.ok(!SURFACE_CLOCKS.METHODOLOGY.includes(c), `${c} is not a methodology fact`);
  }
});

test("a result row separates the provider's FINAL from our SETTLED", () => {
  assert.ok(SURFACE_CLOCKS.RESULT_ROW.includes(CLOCK.FINAL_OBSERVED_AT));
  assert.ok(SURFACE_CLOCKS.RESULT_ROW.includes(CLOCK.SETTLED_AT));
  /* Provider FINAL ≠ settlement is a standing rule; keeping both clocks on the row is how a reader
     can see the gap rather than being told a grade exists when only a provider said "final". */
  assert.notEqual(CLOCK.FINAL_OBSERVED_AT, CLOCK.SETTLED_AT);
});

test('no clock is named "UPDATED" — the word §15 forbids collapsing to', () => {
  for (const c of Object.keys(CLOCK)) {
    assert.doesNotMatch(c, /^UPDATED/, "one word for eleven meanings is the defect");
  }
});
