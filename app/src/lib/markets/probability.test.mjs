/**
 * SPORTSBOOK PROBABILITY PROVENANCE + ACCESS (Sprint 029 · Phases 1–2).
 *
 * Pins the traced provenance and the fail-closed contract, so a later change cannot quietly turn a
 * vig-inclusive number into a "no-vig" one, fabricate a probability from a malformed price, or
 * relabel who did the math.
 *
 * Run: npx tsx --test src/lib/markets/probability.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  DEVIG_METHOD,
  deVigPair,
  formatProbability,
  impliedFromPrice,
  readProbabilities,
  readMarketProbabilities,
} from "./probability.ts";
import { normalizeGameMarkets } from "./normalize.ts";

const PUB = path.join(process.cwd(), "public", "data");
const newestTeamMarkets = () => {
  const dir = path.join(PUB, "mlb", "team-markets");
  const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().at(-1);
  return { date: f.replace(".json", ""), json: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) };
};

// ── provenance ──────────────────────────────────────────────────────────────

test("the live artifact still stamps the de-vig method we traced", () => {
  const { json } = newestTeamMarkets();
  assert.equal(json.method, DEVIG_METHOD, "artifact methodology stamp must match the documented one");
  // The provider supplies prices only. If it ever starts supplying probabilities directly, this
  // assertion should be revisited deliberately rather than the provenance label drifting.
  assert.equal(json.source, "odds_api");
});

test("probabilities are attributed as GameTimePicks-derived from the book price", () => {
  const { json } = newestTeamMarkets();
  const [ml] = normalizeGameMarkets(json, "ref");
  const r = readProbabilities(ml.prices[0]);
  assert.equal(r.available, true);
  assert.equal(
    r.provenance,
    "GTP_DERIVED_FROM_BOOK_PRICE",
    "the book publishes a price, not a probability — misattributing this misstates methodology",
  );
});

// ── fail-closed contract ────────────────────────────────────────────────────

test("a one-sided market cannot be de-vigged — overround is only observable across the pair", () => {
  assert.equal(deVigPair(-110, null), null, "missing other side must fail closed");
  assert.equal(deVigPair(null, -110), null);
  assert.equal(deVigPair(undefined, undefined), null);
  // ...and a real pair still works, so the guard is not simply always-null.
  const paired = deVigPair(109, -131);
  assert.ok(paired, "a genuine two-sided market de-vigs");
  assert.ok(Math.abs(paired.side + paired.other - 1) < 1e-9, "no-vig pair sums to exactly 1");
});

test("malformed prices never become a fabricated probability", () => {
  // 0%, 50% and 100% are the tempting fabrications — a price of 0 must produce none of them.
  for (const bad of [0, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "-110"]) {
    assert.equal(impliedFromPrice(bad), null, `${String(bad)} must not yield a probability`);
    assert.equal(deVigPair(bad, -110), null, `${String(bad)} must not de-vig`);
  }
});

test("a missing no-vig probability never falls back to the raw implied one", () => {
  // They mean different things — one has the book's margin removed, one does not. A silent
  // fallback would let a surface label a vig-inclusive number as no-vig.
  const priceWithOnlyImplied = {
    side: "HOME",
    americanOdds: -110,
    impliedProb: 0.5238,
    noVigProb: null,
    status: "OK",
  };
  const r = readProbabilities(priceWithOnlyImplied);
  assert.equal(r.rawImplied, 0.5238);
  assert.equal(r.noVig, null, "no-vig must stay null, not inherit the raw implied value");
  assert.notEqual(r.noVig, r.rawImplied);
});

test("an unusable price yields no probability at all", () => {
  for (const status of ["MALFORMED", "UNAVAILABLE", "UNSUPPORTED"]) {
    const r = readProbabilities({ side: "HOME", americanOdds: null, impliedProb: 0.5, noVigProb: 0.5, status });
    assert.equal(r.available, false, `${status} must not expose probabilities`);
    assert.equal(r.noVig, null);
    assert.equal(r.rawImplied, null);
  }
  assert.equal(readProbabilities(null).available, false);
});

// ── storage vs display ──────────────────────────────────────────────────────

test("display rounding cannot mutate the stored probability", () => {
  const stored = 0.45764321;
  const shown = formatProbability(stored);
  assert.equal(shown, "45.8%");
  assert.equal(typeof shown, "string", "formatting returns a string so it cannot be written back");
  assert.equal(stored, 0.45764321, "the stored value is untouched");
  assert.equal(formatProbability(null), null);
  assert.equal(formatProbability(Number.NaN), null);
});

// ── real-artifact parity ────────────────────────────────────────────────────

test("stored probabilities reproduce from the stored prices — no drift between them", () => {
  // If the artifact's stored numbers ever disagreed with what the canonical math produces from
  // the same prices, one of the two is wrong. Per the charter, that is investigated, not silently
  // overwritten — so this test exists to surface it.
  const { json } = newestTeamMarkets();
  const markets = normalizeGameMarkets(json, "ref");
  const moneylines = markets.filter((m) => m.family === "MONEYLINE");
  assert.ok(moneylines.length > 0, "live moneylines must exist");

  for (const m of moneylines) {
    const [home, away] = m.prices;
    const recomputed = deVigPair(home.americanOdds, away.americanOdds);
    assert.ok(recomputed, `${m.eventId}: both prices present so de-vig must succeed`);
    // The artifact rounds to 4dp; compare at that tolerance rather than demanding bit equality.
    assert.ok(
      Math.abs(recomputed.side - home.noVigProb) < 5e-5,
      `${m.eventId}: stored home noVig ${home.noVigProb} vs recomputed ${recomputed.side}`,
    );
    const rawHome = impliedFromPrice(home.americanOdds);
    assert.ok(
      Math.abs(rawHome - home.impliedProb) < 5e-5,
      `${m.eventId}: stored impliedProb ${home.impliedProb} vs recomputed ${rawHome}`,
    );
    // And the invariant that makes it a no-vig figure at all.
    assert.ok(Math.abs(home.noVigProb + away.noVigProb - 1) < 1e-3, `${m.eventId}: no-vig pair sums to 1`);
  }
});

test("totals carry no-vig but no raw implied — a consumer must not assume both exist", () => {
  const { json } = newestTeamMarkets();
  const totals = normalizeGameMarkets(json, "ref").filter((m) => m.family === "TOTAL");
  assert.ok(totals.length > 0, "live totals must exist");
  for (const t of totals) {
    const probs = readMarketProbabilities(t);
    assert.ok(probs.OVER.available, "totals expose a no-vig probability");
    assert.equal(probs.OVER.noVig !== null, true);
    assert.equal(probs.OVER.rawImplied, null, "the totals artifact stores no impliedProb");
  }
});
