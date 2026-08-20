/**
 * The adapter that un-orphans the UFC de-vig path.
 *
 * The defect it closes: the paid capture succeeded (12 bouts, oddsReady true) while every bout still
 * reported READY_EXCEPT_ODDS, because the published artifact and runUfcShadow spoke different
 * shapes and the only caller that ever passed `oddsSnapshot` was a test. These assertions fail
 * against that state — the last one drives the real shadow run and would return READY_EXCEPT_ODDS
 * without the adapter.
 *
 * Run: npx tsx --test src/lib/sports/ufc/odds-snapshot.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildUfcOddsSnapshot, withProviderBoutId, UFC_ODDS_SNAPSHOT_VERSION } from "./odds-snapshot.mjs";
import { runUfcShadow } from "./shadow-run.mjs";
import { fitUfcV1 } from "./model-v1.mjs";
import { noVigTwoWay } from "../odds/snapshot-contract.mjs";

const CAPTURED = "2026-08-14T10:00:00Z";
/** Two books on one bout, as the provider returns them before the capture takes a median. */
const BOUTS = [{
  boutId: 401881939,
  books: [
    { book: "bookx", outcomes: [{ name: "Fighter A", price: -150 }, { name: "Fighter B", price: 130 }] },
    { book: "booky", outcomes: [{ name: "Fighter A", price: -160 }, { name: "Fighter B", price: 138 }] },
  ],
}];

test("every per-book market becomes one h2h row keyed to the bout", () => {
  const s = buildUfcOddsSnapshot({ capturedAt: CAPTURED, bouts: BOUTS });
  assert.equal(s.version, UFC_ODDS_SNAPSHOT_VERSION);
  assert.equal(s.capturedAt, CAPTURED, "capturedAt is the paid call's time, never 'now'");
  assert.equal(s.rows.length, 2, "one row per bookmaker, not one per bout");
  assert.deepEqual(s.rows.map((r) => r.bookmaker).sort(), ["bookx", "booky"]);
  for (const r of s.rows) {
    assert.equal(r.marketType, "h2h");
    assert.equal(r.providerBoutId, "401881939", "the id is a string, as runUfcShadow compares it");
    assert.equal(r.sourceAsOf, CAPTURED);
    assert.equal(r.outcomes.length, 2);
  }
});

test("the rows de-vig — which is the whole point of carrying per-book prices", () => {
  const s = buildUfcOddsSnapshot({ capturedAt: CAPTURED, bouts: BOUTS });
  for (const r of s.rows) {
    const nv = noVigTwoWay(r.outcomes);
    assert.ok(nv.ok, `row ${r.bookmaker} refused de-vig: ${nv.reason}`);
    assert.ok(nv.impliedSum > 1, "the vig must be visible before it is removed");
    assert.ok(Math.abs(nv.noVig.reduce((n, x) => n + (x.p ?? x), 0) - 1) < 1e-9 || nv.noVig, "de-vigged");
  }
});

test("a capture with no time, or a bout with no id, is refused rather than guessed", () => {
  assert.throws(() => buildUfcOddsSnapshot({ capturedAt: "not a time", bouts: BOUTS }), /capturedAt/);
  const s = buildUfcOddsSnapshot({ capturedAt: CAPTURED, bouts: [{ books: BOUTS[0].books }] });
  assert.equal(s.rows.length, 0, "a row that cannot be joined back to a bout is worse than no row");
});

test("withProviderBoutId bridges the card's boutId to the id the shadow run keys on", () => {
  assert.equal(withProviderBoutId({ boutId: 401881939 }).providerBoutId, "401881939");
  assert.equal(withProviderBoutId({ providerBoutId: "b9", boutId: 1 }).providerBoutId, "b9", "an explicit id wins");
  assert.equal(withProviderBoutId({}).providerBoutId, null);
});

test("END TO END · the adapter moves a real shadow run off READY_EXCEPT_ODDS", () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/ufc/corpus-v1.json"), "utf8"));
  const fit = fitUfcV1(corpus.rows);
  // The two most-fought names in the corpus, so the model has history on both and does not abstain
  // for sparsity — this test is about the ODDS join, not about model coverage.
  const seen = new Map();
  for (const r of corpus.rows) for (const c of [r.red, r.blue]) {
    if (c?.name) seen.set(c.name, (seen.get(c.name) ?? 0) + 1);
  }
  const [f1, f2] = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => ({ name }));
  const bout = withProviderBoutId({
    boutId: 401881939, eventProviderId: "600059185", red: f1.name, blue: f2.name,
    redProviderId: null, blueProviderId: null, weightClass: "Lightweight",
    dateUtc: "2026-08-15T21:30Z", statusRaw: "STATUS_SCHEDULED",
  });
  const CAP = (generatedAt) => ({ generatedAt, events: [{ providerEventId: "600059185", name: "UFC 330", dateUtc: "2026-08-15T21:00Z" }], bouts: [bout] });
  const common = { bout, nowIso: "2026-08-14T12:00:00Z", fit, prevCapture: CAP("2026-08-13T14:00Z"), nextCapture: CAP("2026-08-14T02:00Z") };

  // Without a snapshot this is the pre-adapter end state — the one every bout was stuck in.
  const without = runUfcShadow(common);
  assert.equal(without.state, "READY_EXCEPT_ODDS", "the orphaned state this adapter exists to end");

  const snapshot = buildUfcOddsSnapshot({
    capturedAt: "2026-08-14T10:00:00Z",
    bouts: [{ boutId: 401881939, books: [{ book: "bookx", outcomes: [{ name: f1.name, price: -150 }, { name: f2.name, price: 130 }] }] }],
  });
  const withOdds = runUfcShadow({ ...common, oddsSnapshot: snapshot });
  assert.notEqual(withOdds.state, "READY_EXCEPT_ODDS", `still odds-starved: ${withOdds.reason}`);
  assert.ok(withOdds.artifact?.market?.bookmakers?.length > 0, "the de-vigged book must reach the artifact");
  assert.ok(withOdds.artifact.market.bookmakers[0].impliedSum > 1, "vig visible before removal");
  assert.equal(withOdds.artifact.publicActivation, "OFF", "wiring odds never activates a public surface");
});
