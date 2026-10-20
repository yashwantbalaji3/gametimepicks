/**
 * Official Representative Simulation. Run: npx tsx --test src/lib/consistency/representative.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OFFICIAL_LABEL, RUN_ROLE, WHAT_IF_LABEL, officialTargets, runDistance, runsFromNbaSamples, runsFromNflSimReceipt, selectOfficialRepresentative,
} from "./representative.mjs";
import { nbaOfficialSnapshot, nflOfficialSnapshot } from "./official-snapshot.mjs";
import { NBA_ID, NFL_ID, nbaArtifact, nflBoard, nflReceipt, receiptsOf } from "./__fixtures__/synthetic.mjs";

const snap = nflOfficialSnapshot(NFL_ID, { receipts: receiptsOf(nflReceipt()), playerBoard: { doc: nflBoard() } });
const targets = officialTargets(snap);
// official: home ≈ 23.8, away ≈ 20.4, margin 3.4, total 44.2
const simReceipt = {
  representativeRuns: [
    { kind: "MEDIAN_LIKE", runIndex: 40, final: { home: 27, away: 17, overtime: false }, quarters: { home: [7, 7, 3, 10, 0], away: [3, 7, 0, 7, 0] } }, // the shadow sim's own p50 pick
    { kind: "HIGH_SCORING", runIndex: 7, final: { home: 34, away: 31, overtime: false }, quarters: { home: [7, 10, 7, 10, 0], away: [7, 7, 10, 7, 0] } },
    { kind: "LOW_SCORING", runIndex: 12, final: { home: 24, away: 20, overtime: false }, quarters: { home: [3, 7, 7, 7, 0], away: [0, 10, 3, 7, 0] } },
    { kind: "UPSET", runIndex: 3, final: { home: 17, away: 24, overtime: false }, quarters: { home: [0, 7, 3, 7, 0], away: [7, 7, 3, 7, 0] } },
  ],
};

test("the default run is the real run closest to the OFFICIAL projections, not the simulator's own pick", () => {
  const sel = selectOfficialRepresentative(runsFromNflSimReceipt(simReceipt), targets);
  assert.equal(sel.official.run.runIndex, 12, "24–20 is nearest 23.8–20.4 / margin 3.4 / total 44.2");
  assert.equal(sel.official.role, RUN_ROLE.OFFICIAL_REPRESENTATIVE);
  assert.equal(sel.official.label, OFFICIAL_LABEL);
  assert.equal(sel.official.feedsProducts, false);
  assert.equal(sel.snapshotId, snap.snapshotId);
  assert.ok(sel.withinTolerance);
});

test("every other run is a labelled Hypothetical What-If that never feeds a product, and never the official run", () => {
  const sel = selectOfficialRepresentative(runsFromNflSimReceipt(simReceipt), targets);
  assert.deepEqual(sel.whatIf.map((w) => w.run.runIndex), [3, 7, 40]);
  for (const w of sel.whatIf) {
    assert.equal(w.label, WHAT_IF_LABEL);
    assert.equal(w.hypothetical, true);
    assert.equal(w.feedsProducts, false);
    assert.equal(w.role, RUN_ROLE.WHAT_IF);
    assert.notEqual(w.run.runIndex, sel.official.run.runIndex);
  }
});

test("deterministic; ties go to the lowest runIndex; input order is irrelevant", () => {
  const runs = runsFromNflSimReceipt(simReceipt);
  const a = selectOfficialRepresentative(runs, targets);
  const b = selectOfficialRepresentative(runs.slice().reverse(), targets);
  assert.deepEqual(b, a);
  const twin = [{ runIndex: 9, home: 24, away: 20 }, { runIndex: 2, home: 24, away: 20 }];
  assert.equal(selectOfficialRepresentative(twin, targets).official.run.runIndex, 2);
});

test("reconciliation states fractional expectations beside whole-number results without rounding either", () => {
  const sel = selectOfficialRepresentative(runsFromNflSimReceipt(simReceipt), targets);
  const home = sel.reconciliation.find((r) => r.term === "home");
  assert.equal(home.officialExpectation, (44.2 + 3.4) / 2);
  assert.equal(home.simulatedGame, 24);
  assert.equal(home.difference, 24 - (44.2 + 3.4) / 2);
  assert.equal(home.note, "fractional expectation vs whole-number result");
  assert.match(sel.reconciliationRule, /never rounded/);
});

test("player terms join by id only and share one team-term weight", () => {
  const s = nbaOfficialSnapshot(NBA_ID, nbaArtifact());
  const t = officialTargets(s);
  const mk = (runIndex, pts, id = "11") => ({ runIndex, home: 112, away: 109, players: [{ playerId: id, stats: { pts } }] });
  const near = runDistance(mk(1, 24), t);
  const far = runDistance(mk(2, 40), t);
  assert.ok(far.distance > near.distance);
  const byName = runDistance({ runIndex: 3, home: 112, away: 109, players: [{ playerId: null, stats: { name: "Same Name", pts: 40 } }] }, t);
  assert.equal(byName.terms.filter((x) => x.key.includes(":")).length, 0, "an id-less line is never matched");
  const playerWeights = near.terms.filter((x) => x.key.includes(":")).reduce((a, x) => a + x.weight, 0);
  assert.equal(playerWeights, 1);
});

test("NBA stored samples normalise with player lines keyed by providerAthleteId", () => {
  const game = { forecast: { representativeSamples: [{ runIndex: 35, label: "typical", final: { home: 107, away: 105 }, periods: [{ home: 26, away: 30 }, { home: 21, away: 34 }, { home: 29, away: 20 }, { home: 31, away: 21 }], overtimePeriods: 0, players: { home: [{ providerAthleteId: "11", name: "X", pts: 14 }], away: [] } }] } };
  const [r] = runsFromNbaSamples(game);
  assert.deepEqual(r.periods.home, [26, 21, 29, 31]);
  assert.equal(r.players[0].playerId, "11");
});

test("a run stored under two kinds is ONE run: never both the official run and a what-if", () => {
  const dup = { representativeRuns: [
    ...simReceipt.representativeRuns,
    { kind: "OVERTIME", runIndex: 3, final: { home: 17, away: 24, overtime: false }, quarters: { home: [0, 7, 3, 7, 0], away: [7, 7, 3, 7, 0] } },
  ] };
  const sel = selectOfficialRepresentative(runsFromNflSimReceipt(dup), targets);
  const indices = [sel.official.run.runIndex, ...sel.whatIf.map((w) => w.run.runIndex)];
  assert.equal(new Set(indices).size, indices.length, "each runIndex appears once");
  assert.equal(indices.length, 4);
  const w3 = sel.whatIf.find((w) => w.run.runIndex === 3);
  assert.equal(w3.kind, "UPSET + OVERTIME", "both stored kinds are kept on the single entry");
  // the duplicate can also be the closest run: still exactly one entry for it, as the official run
  const low = simReceipt.representativeRuns[2];
  const sel2 = selectOfficialRepresentative(runsFromNflSimReceipt({ representativeRuns: [low, { ...low, kind: "OVERTIME" }] }), targets);
  assert.equal(sel2.official.run.runIndex, 12);
  assert.deepEqual(sel2.whatIf, []);
});

test("CONDITIONAL_ON_PLAYING families compare on unconditional terms; a 0-minute run counts as 0, not as missing", () => {
  const snapshot = { snapshotId: "s", game: {}, players: [{ playerId: "1", families: {
    pts: { expected: 20, sd: 6, conditioning: "CONDITIONAL_ON_PLAYING", playRate: 0.5, distribution: { kind: "quantiles", points: [] } },
  } }] };
  const t = officialTargets(snapshot);
  assert.equal(t.players["1"].pts.expected, 10, "r·μ");
  assert.ok(Math.abs(t.players["1"].pts.scale - Math.sqrt(0.5 * (36 + 400) - 100)) < 1e-12, "√(r(σ²+μ²) − (rμ)²)");
  const run = (minutes, pts) => ({ runIndex: 1, home: 100, away: 90, players: [{ playerId: "1", stats: { minutes, pts } }] });
  const satOut = runDistance(run(0, null), t).terms.find((x) => x.key === "1:pts");
  assert.equal(satOut.value, 0, "sat out ⇒ 0 points against the unconditional expectation");
  assert.equal(runDistance(run(30, 10), t).terms.find((x) => x.key === "1:pts").value, 10);
  // a family without a play rate still skips a missing stat rather than inventing a 0
  const t2 = officialTargets({ snapshotId: "s", game: {}, players: [{ playerId: "1", families: { pts: { expected: 20, sd: 6, distribution: { kind: "quantiles", points: [] } } } }] });
  assert.equal(runDistance(run(0, null), t2).terms.find((x) => x.key === "1:pts"), undefined);
});
