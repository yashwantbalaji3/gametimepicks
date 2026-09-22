/**
 * THE CANONICAL RESULTS PROJECTION — rules 1–7 (V19 §2), each pinned with a positive control and a
 * mutation probe, over synthetic owners (v1.8 · C1).
 *
 * Run: npx tsx --test src/lib/results/projection-core.test.mjs
 *
 * Every guard here is exercised BOTH ways: the shape it accepts and the mutation it refuses. A guard
 * that has never been seen to fail has never been seen to work (memory: vacuous guard classes).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildProjection, makeCell, counts, settledN, sumSameEra, formatRecordLabel, recordLabelOrNull, pendingLabelOrNull,
  headlineFor, headlineForProduct, cellForEra, cellsByFamily, cellsBySport, cellById, assertProjectionShape,
  ERAS, FAMILIES, RECORD_TYPES, STATUSES, LEGACY_ERAS, UNSUMMABLE_ERAS, REQUIRED_OWNERS,
} from "./projection-core.mjs";

const NOW = "2026-09-22T18:00:00Z";
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── synthetic owners, in the owners' own shapes ─────────────────────────────────────────────── */
function fixtureSources() {
  const days = [
    { date: "2026-08-15", bankBuilder: { won: 1, lost: 1 }, moonshot: { won: 0, lost: 2 }, delta: -150 },
    { date: "2026-08-16", bankBuilder: { won: 0, lost: 1 }, moonshot: { won: 1, lost: 0 }, delta: -100 },
    { date: "2026-08-17", bankBuilder: { won: 1, lost: 0 }, moonshot: { won: 0, lost: 1 }, delta: -25 },
  ];
  const lane = (product, laneId, result, status = result) => ({ product, lane: laneId, step: 1, stake: product === "moonshot" ? 25 : 100, status, result, potentialReturn: 200, legs: [{ id: "x" }] });
  const receipts = [
    { path: "mr-dub/settled/2026-08-15.json", doc: { date: "2026-08-15", settledAt: "2026-08-16T09:00:00Z", lanes: [lane("bank-builder", "A", "won"), lane("bank-builder", "B", "lost"), lane("moonshot", "A", "lost"), lane("moonshot", "B", "lost")], record: { wins: 1, losses: 3, pending: 0 } } },
    { path: "mr-dub/settled/2026-08-16.json", doc: { date: "2026-08-16", settledAt: "2026-08-17T09:00:00Z", lanes: [lane("bank-builder", "A", "lost"), lane("moonshot", "A", "won"), { ...lane("moonshot", "B", "pending", "awaiting"), legs: [] }], record: { wins: 1, losses: 1, pending: 1 } } },
    { path: "mr-dub/settled/2026-08-17.json", doc: { date: "2026-08-17", settledAt: "2026-08-18T09:00:00Z", lanes: [lane("bank-builder", "A", "won"), lane("moonshot", "A", "lost")], record: { wins: 1, losses: 1, pending: 0 } } },
    /* after the fold: a PLACED lane still pending — this is the PENDING_SETTLEMENT population */
    { path: "mr-dub/settled/2026-08-18.json", doc: { date: "2026-08-18", settledAt: "2026-08-19T09:00:00Z", lanes: [lane("bank-builder", "A", "pending", "active"), lane("moonshot", "A", "won")], record: { wins: 1, losses: 0, pending: 1 } } },
  ];
  return {
    portfolio: { path: "mr-dub/portfolio.json", doc: {
      startingDate: "2026-06-09", generatedAt: "2026-07-07T18:00:00Z",
      record: { wins: 21, losses: 16, voids: 0, pending: 0 },
      moonshot: { lane: "Moonshot", inBankrollSince: "2026-08-15", record: { wins: 1, losses: 3, voids: 0, pending: 0 }, legacy: { record: { wins: 0, losses: 1, voids: 0, pending: 0 } } },
      protectedFold: { rule: "S", base: { asOf: "2026-07-07", currentBankroll: 19065.4, record: { wins: 19, losses: 14, voids: 0, pending: 0 } }, foldedAt: "2026-08-18T09:57:00Z", foldedThrough: "2026-08-17", bankrollDelta: -275, days },
    } },
    receipts,
    bankedLadders: { path: "mr-dub/banked-ladders.json", doc: {
      bankedAt: "2026-06-25T16:00:00Z", historicalRecord: { wins: 13, losses: 3, voids: 0, pending: 0 },
      ladders: [
        { ladder: 1, lane: "crown", label: "Road to $10K", start: 100, final: 10376.17, completedDate: "2026-06-13", official: true, source: "bank-builder/public-ledger-latest.json", steps: [1, 2, 3, 4, 5].map((s) => ({ step: s, result: "won", date: `2026-06-0${8 + s}` })) },
        { ladder: 2, lane: "A", label: "Lane A", start: 100, final: 10089.23, completedDate: "2026-06-24", official: true, settlementSource: "API-Football v3", steps: [1, 2, 3, 4, 5].map((s) => ({ step: s, result: "won", date: `2026-06-${17 + s}` })) },
      ],
    } },
    moonshotLedger: { path: "product-ledger/moonshot.json", doc: { productId: "moonshot", results: [
      { date: "2026-06-23", outcome: "lost", stake: 25, payout: 0 }, { date: "2026-06-23", outcome: "lost", stake: 25, payout: 0 },
      { date: "2026-07-01", outcome: "lost", stake: 25, payout: 0 }, { date: "2026-07-06", outcome: "lost", stake: 25, payout: 0 },
    ] } },
    gradedPicks: {
      mlb: { path: "mlb/graded-picks.json", doc: { generatedAt: "2026-09-22T14:11:38Z", sport: "mlb", what: "Player-prop projections", caveat: "model-performance", counts: { counted: 100, hits: 51, misses: 49, voided: 6, shown: 60, total: 108 }, hitRate: 0.51, sampleState: "ASSESSABLE" } },
      ufc: { path: "ufc/graded-picks.json", doc: { generatedAt: "2026-09-22T14:11:38Z", sport: "ufc", what: "Fight-winner picks", caveat: null, counts: { counted: 41, hits: 25, misses: 16, voided: 0, shown: 41, total: 41 }, hitRate: 0.6098, sampleState: "EMERGING" } },
    },
    mlbLifetime: { path: "mlb/results/lifetime_summary.json", doc: { sport: "MLB", generatedAt: "2026-09-22T14:10:47Z", totalDates: 10, totalSettled: 106, decisive: 100, wins: 51, losses: 49, pushes: 0, hitRate: 0.51, partial: true, pendingDates: ["2026-06-16"], oldestDate: "2026-05-16", newestDate: "2026-09-21" } },
    nbaLifetime: { path: "results/lifetime_summary.json", doc: { decisive: 3635, generatedAt: "2026-09-22T14:10:46+00:00", hitRate: 0.4908, losses: 1851, newestDate: "2026-06-13", oldestDate: "2026-05-15", pushes: 0, totalDates: 16, totalSettled: 3635, wins: 1784 } },
    riskLadder: { path: "parlays/risk-ladder/latest.json", doc: { generatedAt: "2026-09-22T14:11:39Z", record: {
      gradedDays: 85, firstDay: "2026-05-25", lastDay: "2026-09-22",
      byTier: { low: { wins: 182, losses: 264, pushes: 1, pending: 25, hitRate: 0.4081 }, longshot: { wins: 32, losses: 421, pushes: 0, pending: 19, hitRate: 0.0706 } },
      overall: { wins: 214, losses: 685, staked: 899, returned: 892.97, roi: -0.0067 },
    } } },
    labLedger: { path: "parlays/lab-ledger.json", doc: {
      generatedAt: "2026-09-22T15:44:19Z", policy: { version: 2, since: "2026-08-17", summary: "disjoint legs" },
      priorPolicy: { version: 1, label: "Before the 2026-08-17 selection change", summary: "reused legs", firstDay: "2026-05-25", lastDay: "2026-09-22", gradedDays: 85, wins: 214, losses: 685, note: "kept because it is real" },
      streams: [
        { id: "mlb", label: "MLB", live: true, settledDays: 34, record: { wins: 20, losses: 71, pushes: 0, hitRate: 0.2198 } },
        { id: "nfl", label: "NFL", live: false, blocked: "only 0 priced games", settledDays: 0, record: { wins: 0, losses: 0, pushes: 0, hitRate: null } },
        { id: "multi", label: "Multi-sport", live: true, settledDays: 0, record: { wins: 0, losses: 0, pushes: 0, hitRate: null } },
      ],
    } },
    modelHealth: { path: "admin/model-health.json", doc: { generatedAt: "2026-09-22T14:12:22Z", families: [
      { id: "mlb_total", sport: "mlb", label: "MLB total picks", baseline: "coin flip", state: "BREACHED", n: 667, judgement: { meanDiff: 0.033, lo95: 0.0127 }, context: { hitRate: 0.4918, modelMinusMarket: 0.032 } },
      { id: "ufc_winner", sport: "ufc", label: "UFC winner", baseline: "coin flip", state: "INSUFFICIENT_SAMPLE", n: 41, judgement: null, context: null },
    ] } },
    cycleTable: { path: "data/internal/products/cycle-table/latest.json", doc: { generatedAt: "2026-09-22T06:02:04Z",
      eras: [{ era: "RECEIPTED", from: "2026-08-15", to: "2026-08-17", receipts: 3 }, { era: "UNRECEIPTED", from: "2026-06-23", to: "2026-07-14", placedLaneDaysWithoutReceipt: 29, source: "forensic" }],
      products: { "bank-builder": { counts: { cyclesStarted: 3, cyclesLost: 2, cyclesCompleted: 0, cyclesOpen: 1, cyclesWithPublishedStepDivergence: 1, furthestStepMax: 2, meanFurthestStep: 1.3, furthestPublishedStepMax: 1, meanFurthestPublishedStep: 1, placedLaneDays: 4, decidedLaneDays: 4, noPlayLaneDays: 2 } } },
    } },
  };
}

const build = (mutate = null) => { const s = fixtureSources(); if (mutate) mutate(s); return buildProjection(s, { now: NOW }); };
const P = build();
const byId = (id) => cellById(P, id);
const BB_COMPOSITE = "product:-:bank-builder:COMPOSITE:protected-record";
const BB_BASE = "product:-:bank-builder:PROTECTED_BASE:-";
const BB_RECEIPT = "product:-:bank-builder:RECEIPT_ERA:-";
const MS_RECEIPT = "product:-:moonshot:RECEIPT_ERA:-";
const MS_LEGACY = "product:-:moonshot:LEGACY_PRODUCT_LEDGER:-";

/* ── rule 1 · never a forecast, never a probability ──────────────────────────────────────────── */
test("rule 1 · no cell carries a probability, a forecast or a calibration number", () => {
  const banned = /probab|forecast|projected|expected|meanDiff|lo95|hi95|modelMinusMarket|roi|staked|returned/i;
  for (const c of P.cells) {
    for (const k of Object.keys(c)) assert.ok(!banned.test(k), `${c.cellId} carries ${k}`);
    if (c.recordType === RECORD_TYPES.CALIBRATION_STATE) {
      const numeric = Object.entries(c).filter(([, v]) => typeof v === "number").map(([k]) => k);
      assert.deepEqual(numeric, ["n"], `${c.cellId}: a calibration cell carries n and a state word only (got ${numeric})`);
      assert.equal(c.hitRate, null);
      assert.ok(Object.values(c.counts).every((v) => v === null));
    }
  }
  // the model-health owner DOES carry numbers (judgement, context.hitRate); none of them crossed
  const src = JSON.stringify(fixtureSources().modelHealth.doc.families[0]);
  assert.match(src, /0\.4918/, "sanity: the owner carries a hit rate the projection must not");
  assert.doesNotMatch(JSON.stringify(cellsByFamily(P, FAMILIES.MODEL_FAMILY)), /0\.4918|0\.033/);
  // mutation probe: the constructor refuses a calibration cell that carries a count or a rate
  assert.throws(() => makeCell({ recordType: RECORD_TYPES.CALIBRATION_STATE, family: FAMILIES.MODEL_FAMILY, era: ERAS.LIVE_LEDGER, counts: { won: 1 }, owner: { path: "x", generatedAt: null }, window: { from: null, to: null }, status: STATUSES.LIVE, displayEligible: { eligible: true, reason: "r" }, semantics: "s" }), /state word and n only/);
  assert.throws(() => makeCell({ recordType: RECORD_TYPES.CALIBRATION_STATE, family: FAMILIES.MODEL_FAMILY, era: ERAS.LIVE_LEDGER, counts: {}, hitRate: 0.5, owner: { path: "x", generatedAt: null }, window: { from: null, to: null }, status: STATUSES.LIVE, displayEligible: { eligible: true, reason: "r" }, semantics: "s" }), /state word and n only/);
});

/* ── rule 2 · no mega-record ─────────────────────────────────────────────────────────────────── */
test("rule 2 · there is no cross-family total, and no exported helper can make one", () => {
  for (const block of Object.values(P.headline)) for (const k of Object.keys(block)) assert.doesNotMatch(k, /^(total|overall|all|combined)$/i);
  assert.equal(P.headline.byFamily[FAMILIES.CYCLE], null, "a cycle table is never a headline figure");
  assert.equal(P.headline.byFamily[FAMILIES.MODEL_FAMILY], null, "a state word is never a headline figure");
  const product = cellsByFamily(P, FAMILIES.PRODUCT).find((c) => c.era === ERAS.RECEIPT_ERA && c.product === "bank-builder");
  const forecast = cellsByFamily(P, FAMILIES.FORECAST)[0];
  const lab = cellsByFamily(P, FAMILIES.LAB)[0];
  assert.throws(() => sumSameEra([product, forecast]), /across families/);
  assert.throws(() => sumSameEra([product, lab]), /across families/);
  assert.throws(() => sumSameEra([forecast, lab]), /across families/);
  // the shape validator refuses a headline slot that names a total
  const bad = clone(P); bad.headline.byFamily.total = BB_COMPOSITE;
  assert.throws(() => assertProjectionShape(bad), /cross-family total/);
  assert.equal(assertProjectionShape(P), true, "positive control: the real shape passes");
});

test("rule 2 · positive control — two cells of ONE family in ONE era DO sum; then any era mix throws", () => {
  const a = byId("product:-:bank-builder:LEDGER_ONLY:ladder-1");
  const b = byId("product:-:bank-builder:LEDGER_ONLY:ladder-2");
  const s = sumSameEra([a, b]);
  assert.deepEqual(s.counts, { won: 10, lost: 0, pending: null, push: null, void: null });
  assert.equal(s.n, 10);
  assert.equal(s.era, ERAS.LEDGER_ONLY);
  assert.deepEqual(s.window, { from: "2026-06-09", to: "2026-06-24" });
  // mutation probes — the same two cells, one era changed → throws
  const c = clone(b); c.era = ERAS.RECEIPT_ERA;
  assert.throws(() => sumSameEra([a, c]), /across eras/);
  const d = clone(b); delete d.era;
  assert.throws(() => sumSameEra([a, d]), /no typed era/);
  const e = clone(b); e.era = "JUNE";
  assert.throws(() => sumSameEra([a, e]), /no typed era/);
  // the protected record's two eras can never be summed by the helper — the owner already did, with composition
  assert.throws(() => sumSameEra([byId(BB_BASE), byId(BB_RECEIPT)]), /across eras/);
  // a COMPOSITE or UNSEGMENTED cell is never an input
  for (const era of UNSUMMABLE_ERAS) {
    const cell = P.cells.find((x) => x.era === era);
    assert.ok(cell, `fixture has a ${era} cell`);
    assert.throws(() => sumSameEra([cell, cell]), /already a sum|cannot be segmented/);
  }
  // a cycle table and a state word are not summable at all
  assert.throws(() => sumSameEra(cellsByFamily(P, FAMILIES.CYCLE)), /not summable/);
  assert.throws(() => sumSameEra(cellsByFamily(P, FAMILIES.MODEL_FAMILY)), /not summable/);
  assert.equal(sumSameEra([]), null);
  // a count any input does not carry is null in the sum — never 0
  const f = clone(a); f.counts.push = 2;
  assert.equal(sumSameEra([f, b]).counts.push, null);
  assert.equal(sumSameEra([f, { ...b, counts: { ...b.counts, push: 1 } }]).counts.push, 3);
});

/* ── rule 3 · window, n, era, owner; absent owner ⇒ absent cell ──────────────────────────────── */
test("rule 3 · every cell carries window, n, era, owner path + generatedAt, status and semantics", () => {
  assert.ok(P.cells.length >= 25, `enough cells to mean something (${P.cells.length})`);
  for (const c of P.cells) {
    assert.ok(Object.values(ERAS).includes(c.era), `${c.cellId} era typed`);
    assert.ok(typeof c.owner.path === "string" && c.owner.path.length, `${c.cellId} owner path`);
    assert.ok("generatedAt" in c.owner, `${c.cellId} owner generatedAt present (null allowed)`);
    assert.ok("from" in c.window && "to" in c.window, `${c.cellId} window`);
    assert.ok("n" in c && (c.n === null || Number.isInteger(c.n)), `${c.cellId} n`);
    assert.ok(Object.values(STATUSES).includes(c.status));
    assert.ok(typeof c.displayEligible.eligible === "boolean" && c.displayEligible.reason.length > 0);
    assert.ok(c.semantics.length > 20, `${c.cellId} names its semantics`);
    assert.deepEqual(Object.keys(c.counts).sort(), ["lost", "pending", "push", "void", "won"]);
  }
  assert.throws(() => makeCell({ recordType: RECORD_TYPES.PRODUCT_RECORD, family: FAMILIES.PRODUCT, era: ERAS.RECEIPT_ERA, counts: {}, owner: { path: "", generatedAt: null }, window: { from: null, to: null }, status: STATUSES.LIVE, displayEligible: { eligible: true, reason: "r" }, semantics: "s" }), /without an owner path/);
  assert.throws(() => makeCell({ recordType: RECORD_TYPES.PRODUCT_RECORD, family: FAMILIES.PRODUCT, era: ERAS.RECEIPT_ERA, counts: {}, owner: { path: "x", generatedAt: null }, window: { from: "2026-9-1", to: null }, status: STATUSES.LIVE, displayEligible: { eligible: true, reason: "r" }, semantics: "s" }), /YYYY-MM-DD/);
});

test("rule 3 · a missing OPTIONAL owner ⇒ its cells are absent (never zero) and the build succeeds", () => {
  const withoutUfc = build((s) => { delete s.gradedPicks.ufc; });
  assert.equal(cellsBySport(P, "ufc").filter((c) => c.family === FAMILIES.FORECAST).length, 1, "positive control: ufc present in the full build");
  assert.equal(cellsBySport(withoutUfc, "ufc").filter((c) => c.family === FAMILIES.FORECAST).length, 0);
  assert.ok(!withoutUfc.cells.some((c) => c.family === FAMILIES.FORECAST && c.sport === "ufc"), "no zeroed ufc forecast cell");
  const withoutNba = build((s) => { s.nbaLifetime = { path: "results/lifetime_summary.json", doc: null }; });
  assert.equal(cellsBySport(withoutNba, "nba").length, 0);
  assert.equal(withoutNba.sources.find((x) => x.key === "nbaLifetime").present, false, "the sources list says it was absent");
  const withoutLedger = build((s) => { s.moonshotLedger.doc = null; });
  assert.equal(cellById(withoutLedger, MS_LEGACY), null);
  assert.ok(cellById(withoutLedger, MS_RECEIPT), "the other Moonshot era is untouched");
  const withoutCycle = build((s) => { s.cycleTable.doc = null; });
  assert.equal(cellsByFamily(withoutCycle, FAMILIES.CYCLE).length, 0);
  const withoutHealth = build((s) => { s.modelHealth.doc = null; });
  assert.equal(cellsByFamily(withoutHealth, FAMILIES.MODEL_FAMILY).length, 0);
  const withoutReceipts = build((s) => { s.receipts = []; });
  assert.equal(cellsByFamily(withoutReceipts, FAMILIES.PRODUCT).filter((c) => c.era === ERAS.PENDING_SETTLEMENT).length, 0, "no receipts ⇒ no pending cell, not a zero pending cell");
});

test("rule 3 · the REQUIRED owner missing ⇒ the build refuses (no projection without the protected record)", () => {
  assert.deepEqual([...REQUIRED_OWNERS], ["portfolio"]);
  assert.throws(() => build((s) => { s.portfolio.doc = null; }), /required owner "portfolio"/);
  assert.throws(() => build((s) => { delete s.portfolio; }), /required owner "portfolio"/);
  assert.throws(() => buildProjection(fixtureSources(), { now: "yesterday" }), /ISO timestamp/);
});

/* ── rule 4 · pending is a count, never a loss; push/void are counts, never decisive ──────────── */
test("rule 4 · pending is never counted as a loss, and never enters a W–L label", () => {
  const bb = byId(BB_RECEIPT);
  assert.deepEqual(bb.counts, { won: 2, lost: 2, pending: null, push: null, void: null }, "Σ fold days, won/lost only");
  const pending = byId("product:-:bank-builder:PENDING_SETTLEMENT:-");
  assert.deepEqual(pending.counts, { won: null, lost: null, pending: 1, push: null, void: null }, "the placed-but-pending lane after the fold is a pending count");
  assert.equal(pending.n, null, "pending is not settled");
  assert.equal(recordLabelOrNull(pending), null, "a pending cell has no W–L");
  assert.equal(pendingLabelOrNull(pending), "1 pending");
  // the pending lane did NOT move any loss count anywhere
  const withoutPending = build((s) => { s.receipts = s.receipts.filter((r) => r.doc.date !== "2026-08-18"); });
  assert.deepEqual(cellById(withoutPending, BB_RECEIPT).counts, bb.counts);
  assert.deepEqual(cellById(withoutPending, BB_COMPOSITE).counts, byId(BB_COMPOSITE).counts);
  // an unplaced (awaiting) pending lane on a folded day is not pending and not a loss
  const ms = byId(MS_RECEIPT);
  assert.deepEqual(ms.counts, { won: 1, lost: 3, pending: 0, push: null, void: 0 });
  // labels: pending never inside; push/void appended as counts
  assert.equal(formatRecordLabel({ won: 3, lost: 2, pending: 9, push: null, void: null }), "3–2");
  assert.equal(formatRecordLabel({ won: 3, lost: 2, pending: 9, push: 1, void: 2 }), "3–2 · 1 push · 2 voids");
  assert.equal(formatRecordLabel({ won: 3, lost: 2, pending: 0, push: 2, void: 1 }), "3–2 · 2 pushes · 1 void");
  assert.equal(formatRecordLabel({ won: 3, lost: 2, pending: 0, push: 0, void: 0 }), "3–2");
  assert.equal(formatRecordLabel({ won: 3, lost: null }), null, "no label without both won and lost");
  // decisive = won + lost; n excludes pending; push/void are inside n (settled) but outside decisive
  const low = byId("lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-tier-low");
  assert.equal(low.decisive, 446); assert.equal(low.n, 447); assert.equal(low.counts.pending, 25);
  assert.equal(settledN({ won: 1, lost: 1, pending: 50, push: 1, void: 1 }), 4);
  assert.equal(settledN({ won: null, lost: null, pending: 3 }), null, "pending alone is not settled");
  // negative or fractional counts are refused
  assert.throws(() => counts({ lost: -1 }), /negative/);
  assert.throws(() => counts({ won: 1.5 }), /integer or null/);
});

test("rule 4 · missing is never zero; a recorded zero is a zero", () => {
  const nfl = byId("lab:nfl:parlay-lab:POLICY_V2:stream");
  assert.deepEqual(nfl.counts, { won: 0, lost: 0, pending: null, push: 0, void: null }, "the owner recorded 0-0 with 0 pushes; it carries no pending/void");
  assert.equal(nfl.n, 0);
  assert.equal(nfl.displayEligible.eligible, false, "the owner's own rule refuses to PRINT 0-0");
  assert.equal(recordLabelOrNull(nfl), null, "…so the label is null, never \"0–0\"");
  const base = byId(BB_BASE);
  assert.equal(base.counts.void, 0, "voids: 0 recorded by the owner stays 0");
  assert.equal(base.counts.push, null, "push not carried by the owner stays null");
  const ledger = byId(MS_LEGACY);
  assert.equal(ledger.counts.pending, 0, "four rows, four decided ⇒ a recorded 0 pending");
  assert.equal(ledger.counts.void, null);
});

/* ── rule 5 · eras typed, never blended silently ─────────────────────────────────────────────── */
test("rule 5 · the protected record is COMPOSITE with its era composition beside it, and the June ladders are their own cells", () => {
  const comp = byId(BB_COMPOSITE);
  assert.equal(comp.era, ERAS.COMPOSITE);
  assert.deepEqual(comp.counts, { won: 21, lost: 16, pending: 0, push: null, void: 0 });
  assert.equal(comp.composition.length, 2);
  assert.deepEqual(comp.composition.map((p) => [p.era, p.counts.won, p.counts.lost, p.cellId]), [[ERAS.PROTECTED_BASE, 19, 14, BB_BASE], [ERAS.RECEIPT_ERA, 2, 2, BB_RECEIPT]]);
  assert.deepEqual(byId(BB_BASE).window, { from: "2026-06-09", to: "2026-07-07" });
  assert.deepEqual(byId(BB_RECEIPT).window, { from: "2026-08-15", to: "2026-08-17" });
  // the June "5–0" ladders: separate LEDGER_ONLY cells, never inside the composite
  const l1 = byId("product:-:bank-builder:LEDGER_ONLY:ladder-1"), l2 = byId("product:-:bank-builder:LEDGER_ONLY:ladder-2");
  assert.deepEqual([l1.counts.won, l1.counts.lost, l2.counts.won, l2.counts.lost], [5, 0, 5, 0]);
  assert.equal(recordLabelOrNull(l1), "5–0");
  assert.equal(l1.window.to, "2026-06-13"); assert.equal(l2.window.to, "2026-06-24");
  assert.ok(!cellsByFamily(P, FAMILIES.PRODUCT).some((c) => c.counts.won === 31 || c.counts.won === 26), "no cell merges the ladders into the protected record");
  assert.equal(byId("product:-:bank-builder:LEDGER_ONLY:historical-record-2026-06-25").status, STATUSES.SUPERSEDED);
  // mutation probes on the constructor: a COMPOSITE without composition, or whose parts do not sum, is refused
  const spec = { recordType: RECORD_TYPES.PRODUCT_RECORD, family: FAMILIES.PRODUCT, product: "bank-builder", era: ERAS.COMPOSITE, counts: { won: 21, lost: 16 }, owner: { path: "x", generatedAt: null }, window: { from: null, to: null }, status: STATUSES.LIVE, displayEligible: { eligible: true, reason: "r" }, semantics: "semantics here" };
  assert.throws(() => makeCell(spec), /must carry the era composition/);
  const parts = [{ era: ERAS.PROTECTED_BASE, counts: { won: 19, lost: 14 } }, { era: ERAS.RECEIPT_ERA, counts: { won: 2, lost: 2 } }];
  assert.ok(makeCell({ ...spec, composition: parts }), "positive control: parts that sum are accepted");
  assert.throws(() => makeCell({ ...spec, composition: [parts[0], { era: ERAS.RECEIPT_ERA, counts: { won: 3, lost: 2 } }] }), /COMPOSITE won 21 ≠ Σ composition 22/);
  assert.throws(() => makeCell({ ...spec, composition: [parts[0], { era: ERAS.COMPOSITE, counts: { won: 2, lost: 2 } }] }), /not a summable typed era/);
  assert.throws(() => makeCell({ ...spec, era: ERAS.RECEIPT_ERA, composition: parts }), /only a COMPOSITE cell/);
  // an untyped era is refused at construction
  assert.throws(() => makeCell({ ...spec, era: "JUNE_2026", composition: parts }), /typed eras/);
  assert.throws(() => makeCell({ ...spec, era: undefined, composition: parts }), /typed eras/);
});

test("rule 5 · the UNRECEIPTED_GAP is emitted as a disclosed gap with counts null, from the owner's own dates", () => {
  const gap = byId("product:-:bank-builder:UNRECEIPTED_GAP:-");
  assert.ok(gap);
  assert.equal(gap.recordType, RECORD_TYPES.ERA_GAP);
  assert.deepEqual(gap.window, { from: "2026-07-08", to: "2026-08-14" }, "base.asOf + 1 → first fold day − 1");
  assert.deepEqual(gap.counts, { won: null, lost: null, pending: null, push: null, void: null });
  assert.equal(gap.n, null);
  assert.equal(gap.status, STATUSES.DISCLOSED_GAP);
  assert.equal(recordLabelOrNull(gap), null, "a gap is never a number");
  // moves with the owner: fold starting later widens the gap
  const later = build((s) => { s.portfolio.doc.protectedFold.days.forEach((d) => { d.date = d.date.replace("2026-08", "2026-09"); }); s.portfolio.doc.protectedFold.foldedThrough = "2026-09-17"; s.receipts.forEach((r) => { r.doc.date = r.doc.date.replace("2026-08", "2026-09"); }); s.portfolio.doc.moonshot.inBankrollSince = "2026-09-15"; });
  assert.equal(cellById(later, "product:-:bank-builder:UNRECEIPTED_GAP:-").window.to, "2026-09-14");
  // no fold ⇒ no gap cell (there is nothing to disclose a gap against), not a zero
  const noFold = build((s) => { delete s.portfolio.doc.protectedFold; delete s.portfolio.doc.moonshot.inBankrollSince; });
  assert.equal(cellById(noFold, "product:-:bank-builder:UNRECEIPTED_GAP:-"), null);
  assert.equal(cellById(noFold, "product:-:bank-builder:PROTECTED_BASE:protected-record").era, ERAS.PROTECTED_BASE, "without a fold the record is base-only and says so");
  // a portfolio that claims a Moonshot fold era (inBankrollSince) without a fold is refused — the record owner must match its own fold
  assert.throws(() => build((s) => { delete s.portfolio.doc.protectedFold; }), /Rule S fold \(0-0\) disagrees with the receipts/);
  // an ERA_GAP cell can never carry a count
  assert.throws(() => makeCell({ ...gap, counts: { won: 1 } }), /carries no counts/);
});

test("rule 5 · BOTH Moonshot eras are separate cells, never summed, and the legacy one is never the headline", () => {
  const receipt = byId(MS_RECEIPT), legacy = byId(MS_LEGACY);
  assert.deepEqual([receipt.counts.won, receipt.counts.lost, receipt.window.from], [1, 3, "2026-08-15"]);
  assert.deepEqual([legacy.counts.won, legacy.counts.lost, legacy.window.from, legacy.window.to], [0, 4, "2026-06-23", "2026-07-06"]);
  assert.equal(legacy.era, ERAS.LEGACY_PRODUCT_LEDGER);
  assert.throws(() => sumSameEra([receipt, legacy]), /across eras/);
  assert.equal(headlineForProduct(P, "moonshot").cellId, MS_RECEIPT);
  assert.ok(!P.cells.some((c) => c.product === "moonshot" && c.counts.lost === 7), "no cell sums 3 + 4");
  const legacyCard = byId("product:-:moonshot:PROTECTED_BASE:legacy-card");
  assert.deepEqual([legacyCard.counts.won, legacyCard.counts.lost, legacyCard.displayEligible.eligible], [0, 1, false]);
  assert.ok(byId("product:-:moonshot:UNRECEIPTED_GAP:-"), "Moonshot's own coverage hole is disclosed");
  assert.deepEqual(byId("product:-:moonshot:UNRECEIPTED_GAP:-").window, { from: "2026-07-07", to: "2026-08-14" });
  // a pre-fold portfolio block (no inBankrollSince) never becomes a RECEIPT_ERA cell
  const preFold = build((s) => { delete s.portfolio.doc.moonshot.inBankrollSince; delete s.portfolio.doc.moonshot.legacy; });
  assert.equal(cellById(preFold, MS_RECEIPT), null);
  assert.equal(cellById(preFold, "product:-:moonshot:PROTECTED_BASE:legacy-card").counts.lost, 3, "…it is read as the base-era block");
  assert.equal(preFold.headline.byProduct.moonshot, null, "and there is no current Moonshot headline — not the legacy ledger by fallback");
});

test("rule 5 · the record owner and the settlement owner must agree — a fold that disagrees with its receipts is refused", () => {
  assert.equal(byId(BB_RECEIPT).crossCheck.won, 2, "positive control: the receipts tally matches the fold");
  assert.throws(() => build((s) => { s.receipts[0].doc.lanes[1].result = "won"; s.receipts[0].doc.lanes[1].status = "won"; }), /REFUSED — the Rule S fold \(2-2\) disagrees with the receipts/);
  assert.throws(() => build((s) => { s.portfolio.doc.moonshot.record.losses = 2; }), /portfolio\.moonshot\.record 1-2 ≠ Σ protectedFold\.days moonshot 1-3/);
  assert.throws(() => build((s) => { s.receipts[2].doc.lanes[1].result = "won"; s.receipts[2].doc.lanes[1].status = "won"; }), /disagrees with the receipts .* for moonshot/);
});

test("rule 5 · the Lab's two windows are two cells with explicit policy fields; the mislabelled prior window is disclosed", () => {
  const v1 = byId("lab:-:parlay-lab:POLICY_V1:prior-policy");
  const v2 = byId("lab:mlb:parlay-lab:POLICY_V2:stream");
  assert.equal(v1.modelOrPolicyVersion, "1"); assert.equal(v2.modelOrPolicyVersion, "2");
  assert.equal(v1.status, STATUSES.WINDOW_CONTRADICTS_LABEL, "lastDay 2026-09-22 ≥ policy.since 2026-08-17 (V19 C4/C5)");
  assert.equal(v1.displayEligible.eligible, false);
  assert.equal(recordLabelOrNull(v1), null);
  assert.equal(v2.window.from, "2026-08-17");
  assert.throws(() => sumSameEra([v1, v2]), /across eras/);
  // the prior-policy figure is byte-identical to the risk-ladder overall — named as the same population
  const overall = byId("lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-overall");
  assert.equal(v1.sameAs, overall.cellId); assert.equal(overall.sameAs, v1.cellId);
  assert.equal(overall.era, ERAS.UNSEGMENTED_WINDOW);
  assert.equal(overall.counts.pending, null, "the owner's overall block carries no pending — not summed from the tiers");
  // a prior window that really ends before the change is honest and eligible
  const honest = build((s) => { s.labLedger.doc.priorPolicy.lastDay = "2026-08-16"; s.labLedger.doc.priorPolicy.wins = 100; });
  const h = cellById(honest, "lab:-:parlay-lab:POLICY_V1:prior-policy");
  assert.equal(h.status, STATUSES.FROZEN); assert.equal(h.displayEligible.eligible, true); assert.equal(h.sameAs, null);
});

test("rule 5 · two owners of one population (MLB leans) are named sameAs, and a disagreement is disclosed, not chosen", () => {
  const life = byId("forecast:mlb:-:LIVE_LEDGER:lifetime-summary"), gp = byId("forecast:mlb:-:LIVE_LEDGER:graded-picks");
  assert.equal(life.sameAs, gp.cellId); assert.equal(gp.sameAs, life.cellId);
  assert.equal(life.status, STATUSES.LIVE);
  assert.equal(life.counts.void, null, "lifetime_summary carries no void count"); assert.equal(gp.counts.void, 6);
  const dis = build((s) => { s.gradedPicks.mlb.doc.counts.hits = 52; });
  for (const id of [life.cellId, gp.cellId]) {
    assert.equal(cellById(dis, id).status, STATUSES.OWNERS_DISAGREE);
    assert.equal(recordLabelOrNull(cellById(dis, id)), null, "neither figure is shown until the owners agree");
  }
});

test("rule 5 · duplicate owner conflict — two cells claiming one family+era+product+segment refuse the build", () => {
  assert.throws(() => build((s) => { s.bankedLadders.doc.ladders[1].ladder = 1; }), /duplicate owner conflict: two cells claim product:-:bank-builder:LEDGER_ONLY:ladder-1/);
  assert.throws(() => build((s) => { s.modelHealth.doc.families.push({ ...s.modelHealth.doc.families[0] }); }), /duplicate owner conflict/);
  assert.throws(() => build((s) => { s.labLedger.doc.streams.push({ ...s.labLedger.doc.streams[0] }); }), /duplicate owner conflict/);
  assert.ok(build((s) => { s.modelHealth.doc.families.push({ ...s.modelHealth.doc.families[0], id: "mlb_total_v2" }); }), "positive control: a distinct id is a distinct cell");
  const dup = clone(P); dup.cells.push(clone(dup.cells[0]));
  assert.throws(() => assertProjectionShape(dup), /duplicate cellId/);
});

/* ── rule 6 · one reader; the fallback is "no figure" (C9); legacy never leaks into a headline ─── */
test("rule 6 · recordLabelOrNull: null for an absent cell, a count-less cell, an ineligible cell — never \"0–0\", never a fallback", () => {
  assert.equal(recordLabelOrNull(null), null);
  assert.equal(recordLabelOrNull(undefined), null);
  assert.equal(recordLabelOrNull(cellById(P, "product:-:nothing:RECEIPT_ERA:-")), null);
  assert.equal(recordLabelOrNull(byId(BB_COMPOSITE)), "21–16");
  assert.equal(recordLabelOrNull({ ...byId(BB_COMPOSITE), counts: { won: null, lost: null, pending: 0, push: null, void: null } }), null);
  assert.equal(recordLabelOrNull({ ...byId(BB_COMPOSITE), displayEligible: { eligible: false, reason: "x" } }), null);
  assert.equal(recordLabelOrNull(cellsByFamily(P, FAMILIES.CYCLE)[0]), null, "cycle completion is not a W–L");
  assert.equal(recordLabelOrNull(cellsByFamily(P, FAMILIES.MODEL_FAMILY)[0]), null, "a state word is not a W–L");
  for (const c of P.cells) assert.notEqual(recordLabelOrNull(c), "0–0", `${c.cellId} never prints 0–0`);
});

test("rule 6 · the headline is never a legacy era; a legacy era is reachable only by explicit era request", () => {
  assert.equal(headlineFor(P, FAMILIES.PRODUCT).cellId, BB_COMPOSITE);
  assert.equal(headlineFor(P, FAMILIES.FORECAST).cellId, "forecast:mlb:-:LIVE_LEDGER:lifetime-summary");
  assert.equal(headlineFor(P, FAMILIES.LAB).cellId, "lab:-:parlay-lab:UNSEGMENTED_WINDOW:risk-ladder-overall");
  assert.equal(headlineFor(P, FAMILIES.CYCLE), null);
  for (const [, id] of Object.entries(P.headline.byFamily)) if (id) assert.ok(!LEGACY_ERAS.includes(cellById(P, id).era));
  // an artifact whose headline points at a legacy era is refused by the reader (mutation probe)
  const leaked = clone(P); leaked.headline.byFamily.product = MS_LEGACY;
  assert.throws(() => headlineFor(leaked, FAMILIES.PRODUCT), /legacy era/);
  const leaked2 = clone(P); leaked2.headline.byProduct.moonshot = MS_LEGACY;
  assert.throws(() => headlineForProduct(leaked2, "moonshot"), /legacy era/);
  // the builder never designates one: a base-only (pre-fold) record has NO product headline — no figure, not a legacy figure by fallback
  const baseOnly = build((s) => { delete s.portfolio.doc.protectedFold; delete s.portfolio.doc.moonshot.inBankrollSince; s.portfolio.doc.record = { wins: 19, losses: 14, voids: 0, pending: 0 }; });
  assert.equal(baseOnly.headline.byFamily.product, null);
  assert.equal(baseOnly.headline.byProduct["bank-builder"], null);
  assert.equal(headlineFor(baseOnly, FAMILIES.PRODUCT), null);
  assert.equal(cellForEra(baseOnly, { family: FAMILIES.PRODUCT, product: "bank-builder", era: ERAS.PROTECTED_BASE, segment: "protected-record" }).counts.won, 19, "…but the base is there for an explicit era request");
  // explicit request works, and only with a typed era
  assert.equal(cellForEra(P, { family: FAMILIES.PRODUCT, product: "moonshot", era: ERAS.LEGACY_PRODUCT_LEDGER }).counts.lost, 4);
  assert.equal(cellForEra(P, { family: FAMILIES.PRODUCT, product: "bank-builder", era: ERAS.LEDGER_ONLY, segment: "ladder-2" }).window.to, "2026-06-24");
  assert.throws(() => cellForEra(P, { family: FAMILIES.PRODUCT, product: "moonshot", era: "legacy" }), /typed era/);
  assert.equal(cellForEra(P, { family: FAMILIES.PRODUCT, product: "moonshot", era: ERAS.HISTORICAL_ONLY }), null);
});

/* ── cycle completion ≠ leg hit rate · calibration ≠ win rate ────────────────────────────────── */
test("cycle completion is a table, not a record; only receipt-derived counts cross, never the forensic ones", () => {
  const cyc = byId("cycle:-:bank-builder:RECEIPT_ERA:-");
  assert.equal(cyc.recordType, RECORD_TYPES.CYCLE_COMPLETION);
  assert.deepEqual(cyc.counts, { won: null, lost: null, pending: null, push: null, void: null });
  assert.equal(cyc.n, 3);
  assert.deepEqual([cyc.cycles.started, cyc.cycles.lost, cyc.cycles.completed, cyc.cycles.open, cyc.cycles.furthestPublishedStepMax], [3, 2, 0, 1, 1]);
  assert.ok(!("furthestStepMax" in cyc.cycles) && !("meanFurthestStep" in cyc.cycles), "the rule-derived (counterfactual) furthest step is not carried — only the PUBLISHED one");
  assert.equal(cyc.displayEligible.eligible, false);
  assert.deepEqual(cyc.window, { from: "2026-08-15", to: "2026-08-17" });
  assert.doesNotMatch(JSON.stringify(P.cells.map((c) => c.cycles)), /WithoutReceipt|forensic|29/, "no forensic-sourced count crosses");
  assert.equal(cellsByFamily(P, FAMILIES.CYCLE).length, 1, "only products with a counts block; the UNRECEIPTED era block of the owner yields no cell");
});

/*
 * DEFENCE IN DEPTH ON THE C9 RULE. The cells the builder actually emits are protected twice over: the
 * real cycle cell carries all-null counts AND displayEligible false, and the constructor outright refuses
 * counts on a CALIBRATION_STATE or an ERA_GAP cell. CYCLE_COMPLETION is the one record type whose counts
 * the constructor does NOT forbid, so a completed-ladder tally is one careless `counts` away from being
 * rendered as a W-L — "cycle completion is not a leg hit rate" would be violated by a cell that passes
 * every construction check. The only thing standing in the way is the record-type test inside
 * recordLabelOrNull, and a mutation probe (2026-09-22, refreshing #632 against main) showed NOTHING
 * pinned it: deleting that test left the suite at 47 pass / 0 fail. This is that pin.
 */
test("C9 · a cycle / calibration / gap cell is NEVER labelled as a W-L, even carrying counts and display-eligible", () => {
  const base = {
    family: FAMILIES.CYCLE, product: "bank-builder", era: ERAS.RECEIPT_ERA, status: STATUSES.LIVE,
    owner: { path: "mr-dub/portfolio.json", generatedAt: NOW, stampField: "generatedAt" },
    window: { from: "2026-08-15", to: "2026-08-17" },
    displayEligible: { eligible: true, reason: "forced eligible ON PURPOSE, so the record-type rule is the only thing left to refuse it" },
    semantics: "a probe cell: ladders completed, wrongly given a won/lost block",
  };

  // CYCLE_COMPLETION with won/lost survives construction — that is exactly why the reader must refuse it.
  const cyc = makeCell({ ...base, recordType: RECORD_TYPES.CYCLE_COMPLETION, counts: counts({ won: 3, lost: 2 }), n: 5 });
  assert.equal(cyc.counts.won, 3, "positive control: the cell really does carry a won/lost block");
  assert.equal(cyc.displayEligible.eligible, true, "positive control: eligibility is not what is refusing it");
  assert.equal(formatRecordLabel(cyc.counts), "3–2", "positive control: those counts DO format into a label on their own (en dash, as the formatter writes it)");
  assert.equal(recordLabelOrNull(cyc), null, "…but a completed-ladder count is not a W–L and must never be labelled as one");

  // The other two cannot be constructed with counts at all — the constructor refuses first.
  assert.throws(() => makeCell({ ...base, family: FAMILIES.MODEL_FAMILY, recordType: RECORD_TYPES.CALIBRATION_STATE, counts: counts({ won: 3, lost: 2 }), n: 5, ownerState: "CALIBRATED" }), /state word and n only/);
  assert.throws(() => makeCell({ ...base, family: FAMILIES.PRODUCT, recordType: RECORD_TYPES.ERA_GAP, counts: counts({ won: 3, lost: 2 }), n: 5 }), /carries no counts/);
  // …so for those the reader is the second line, against a hand-edited or future artifact rather than
  // against this builder. Same refusal, reached with a plain object.
  for (const recordType of [RECORD_TYPES.CALIBRATION_STATE, RECORD_TYPES.ERA_GAP]) {
    const forged = { ...cyc, recordType, counts: counts({ won: 3, lost: 2 }) };
    assert.equal(recordLabelOrNull(forged), null, `${recordType} must not be labelled as a W-L`);
  }

  // And the rule is not blanket: a real product record with the same counts IS labelled.
  const prod = makeCell({ ...base, family: FAMILIES.PRODUCT, recordType: RECORD_TYPES.PRODUCT_RECORD, counts: counts({ won: 3, lost: 2 }), n: 5 });
  assert.equal(recordLabelOrNull(prod), "3–2", "negative control: the refusal is by record type, not a suppression of every label");
});

/* ── selectors ───────────────────────────────────────────────────────────────────────────────── */
test("selectors: byFamily, bySport, byId, headline bySport; an unknown key yields nothing rather than widening", () => {
  assert.equal(cellsByFamily(P, FAMILIES.FORECAST).length, 4);
  assert.equal(cellsBySport(P, "mlb").length, 4, "mlb: lifetime + graded-picks + lab stream + model family");
  assert.equal(cellsBySport(P, "nhl").length, 0);
  assert.equal(cellsByFamily(P, "everything").length, 0);
  assert.equal(P.headline.bySport.mlb, "forecast:mlb:-:LIVE_LEDGER:lifetime-summary");
  assert.equal(P.headline.bySport.ufc, "forecast:ufc:-:LIVE_LEDGER:graded-picks");
  assert.equal(P.headline.bySport.nfl, null, "no NFL forecast owner in the fixture ⇒ null, not a lab stream by fallback");
  assert.equal(cellsByFamily(null, FAMILIES.PRODUCT).length, 0);
  assert.equal(cellById(null, BB_COMPOSITE), null);
});

test("determinism: the same owners and the same now build byte-identical projections", () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
  assert.notEqual(JSON.stringify(build()), JSON.stringify(buildProjection(fixtureSources(), { now: "2026-09-23T18:00:00Z" })), "builtAt is stamped");
});
