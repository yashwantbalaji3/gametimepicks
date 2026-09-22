/**
 * Shadow report probes (v1.7 Phase 7.2): the report is a deterministic function of its inputs, a policy
 * below the preregistered gate can never render as eligible, the vocabulary never says "adopted", and the
 * integrity checks (rewrite, retroactive, guard failure, settlement disagreement) fire on real shapes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShadowReport, renderShadowReportMarkdown, publicationFingerprint, REPORT_STATUS } from "./shadow-report.mjs";
import { ADOPTION_MIN_DECIDED } from "./shadow.mjs";

const leg = (matchup, selection, american) => ({ legId: `mlb:${matchup}:${selection}`, sport: "mlb", eventId: "1", marketKey: "mlb_moneyline", side: "home", american, displayMatchup: matchup, displaySelection: selection });
const placed = (over = {}) => ({ status: "placed", step: 1, stake: 100, american: 139, decimal: 2.39, jointP: 0.38, probabilityBasis: "market-implied", sports: ["mlb"], legs: [leg("A @ B", "B to win", -150), leg("C @ D", "D to win", -120)], graded: null, ...over });
const noPlay = { status: "NO_QUALIFYING_PLAY", reason: "CONCENTRATION_TOO_HIGH", step: 1, stake: 100 };
const policiesFor = (laneA, laneB = noPlay) => Object.fromEntries(["BB-LEGACY", "BB-C1", "BB-C2b", "MS-LEGACY", "MS-C1", "MS-C4"].map((n) => [n, { policyId: `${n}@abc`, lanes: { A: laneA, B: laneB } }]));
const day = (date, over = {}) => ({ schemaVersion: 1, date, asOf: `${date}T10:57:00Z`, generatedAt: `${date}T10:57:05Z`, eligibleLegs: 18, refusedAtRead: 30, universe: { sha256: "f".repeat(64) }, availability: { mlb: { eligible: 18, rejected: 0 }, nfl: { eligible: 0, rejected: 6 } }, policies: policiesFor(placed()), ...over });

/** A fixture ledger with 6 wins in a row and nothing else decided — a hot streak, far below the sample floor. */
function fixture() {
  const days = [];
  for (let i = 1; i <= 6; i++) { const d = `2026-09-0${i}`; days.push(day(d, { policies: policiesFor(placed({ graded: { status: "won", legs: ["won", "won"] } })) })); }
  const state = { policies: Object.fromEntries(Object.keys(days[0].policies).map((n) => [n, { positions: { A: { step: 2, stake: 239 }, B: { step: 1, stake: 100 } } }])) };
  const ledger = { generatedAt: "2026-09-07T05:00:00Z", policies: {}, gates: {} };
  return { days, state, ledger };
}

test("the report is deterministic: identical inputs render byte-identical markdown and JSON", () => {
  const a = buildShadowReport({ ...fixture(), now: "2026-09-07T06:00:00Z" });
  const b = buildShadowReport({ ...fixture(), now: "2026-09-07T06:00:00Z" });
  assert.deepEqual(a, b);
  assert.equal(renderShadowReportMarkdown(a), renderShadowReportMarkdown(b));
  assert.equal(a.status, REPORT_STATUS);
  assert.match(renderShadowReportMarkdown(a), /SHADOW_RUNNING · NOT ADOPTED/);
});

test("a hot streak below the sample floor cannot render as eligible; the page never says a shadow policy is adopted", () => {
  const r = buildShadowReport({ ...fixture(), now: "2026-09-07T06:00:00Z" });
  for (const [name, g] of Object.entries(r.gates)) {
    assert.equal(r.policies[name].metrics.won, 6, `${name} is 6-0 in the fixture`);
    assert.ok(r.policies[name].metrics.decided < ADOPTION_MIN_DECIDED);
    assert.equal(g.allDays.state, "NOT_YET", `${name}: 6-0 is below the ${ADOPTION_MIN_DECIDED} decided floor`);
    assert.equal(g.forwardOnly.state, "NOT_YET");
    assert.match(g.allDays.reasons.join(";"), /decided 6 < 20/);
  }
  const md = renderShadowReportMarkdown(r);
  const gateRows = md.split("\n").filter((l) => /^\| (BB|MS)-/.test(l));
  assert.ok(gateRows.length >= 4, "gate rows rendered");
  for (const row of gateRows) assert.doesNotMatch(row, /ELIGIBLE_FOR_ADOPTION_RECEIPT/, `no gate row renders eligible: ${row}`);
  // The only permitted occurrence of "adopted" is the status token itself.
  assert.match(md, /NOT ADOPTED/);
  assert.doesNotMatch(md.replace(/NOT ADOPTED/g, ""), /\badopted\b/i, "the word 'adopted' never describes a shadow policy");
  assert.doesNotMatch(md, /\badopt\b/i);
});

test("integrity: a seeded day is RETROACTIVE, a rewritten publication is a REWRITE, a manifest/kept gap is a guard failure", () => {
  const f = fixture();
  f.days[0].generatedAt = "2026-09-02T04:57:00Z"; // built 18 h after the instant it claims
  f.days[1].eligibleLegs = 17;                    // manifest says 18 eligible, only 17 survived guardLegs
  const fp = publicationFingerprint(f.days[2]);
  const rewritten = JSON.parse(JSON.stringify(f.days[2])); rewritten.policies["BB-C1"].lanes.A.american = 140;
  const r = buildShadowReport({ ...f, firstCommits: { "2026-09-03": { hash: "deadbeef", committedAt: "2026-09-03T10:58:00Z", publicationFingerprint: fp }, "2026-09-04": { hash: "cafe", committedAt: "2026-09-04T10:58:00Z", publicationFingerprint: publicationFingerprint(rewritten) } }, now: "2026-09-07T06:00:00Z" });
  assert.deepEqual(r.integrity.retroactive, ["2026-09-01"]);
  assert.equal(r.integrity.guardFailures, 1);
  assert.equal(r.integrity.days[2].rewrite, "INTACT", "same publication content as first commit");
  assert.equal(r.integrity.days[3].rewrite, "REWRITE", "a changed card after first commit is a rewrite");
  assert.equal(r.integrity.days[4].rewrite, "UNVERIFIED", "no first-commit record → UNVERIFIED, never assumed intact");
  // a guard failure blocks every gate even if everything else were satisfied
  for (const g of Object.values(r.gates)) assert.match(g.allDays.reasons.join(";"), /1 guard failure/);
  // grading fields never count as a rewrite
  const graded = JSON.parse(JSON.stringify(f.days[2])); graded.policies["BB-C1"].lanes.A.graded = { status: "lost" }; graded.policies["BB-C1"].lanes.A.completed = false;
  assert.equal(publicationFingerprint(graded), fp);
  // forward-only metrics exclude the retroactive day
  assert.equal(r.policies["BB-C1"].metrics.decided, 6);
  assert.equal(r.policies["BB-C1"].forwardOnlyMetrics.decided, 5);
});

test("settlement disagreement: a leg the live settlement graded differently is listed; pending legs are never compared", () => {
  const f = fixture();
  f.days[0].policies["BB-C1"].lanes.A = placed({ graded: { status: "won", legs: ["won", "won"] } });
  f.days[1].policies["BB-C1"].lanes.A = placed({ graded: { status: "pending", legs: ["won", "pending"] } });
  const settled = (date, dResult) => ({ date, lanes: [{ legs: [{ matchup: "A @ B", selection: "B to win", result: "won" }, { matchup: "C @ D", selection: "D to win", result: dResult }] }] });
  const r = buildShadowReport({ ...f, settledByDate: { "2026-09-01": settled("2026-09-01", "lost"), "2026-09-02": settled("2026-09-02", "lost") }, now: "2026-09-07T06:00:00Z" });
  const dis = r.settlementDisagreements.filter((x) => x.policy === "BB-C1");
  assert.deepEqual(dis, [{ date: "2026-09-01", policy: "BB-C1", lane: "A", leg: "C @ D|D to win", shadow: "won", live: "lost" }]);
  assert.match(renderShadowReportMarkdown(r), /Settlement disagreements[^\n]*\*\*\d+\*\*/);
});

test("pending is not decided and missing is not zero: an ungraded day contributes pending, not a loss; no day files → empty report, no gate", () => {
  const f = fixture(); f.days[5].policies["BB-C1"].lanes.A = placed({ graded: null });
  const r = buildShadowReport({ ...f, now: "2026-09-07T06:00:00Z" });
  assert.equal(r.policies["BB-C1"].metrics.pending, 1); assert.equal(r.policies["BB-C1"].metrics.lost, 0); assert.equal(r.policies["BB-C1"].metrics.decided, 5);
  const empty = buildShadowReport({ days: [], now: "2026-09-07T06:00:00Z" });
  assert.equal(empty.days, 0); assert.deepEqual(empty.gates, {}); assert.equal(empty.candidatePool.meanEligibleLegs, null);
  assert.match(renderShadowReportMarkdown(empty), /no decided lane-day yet/);
});
