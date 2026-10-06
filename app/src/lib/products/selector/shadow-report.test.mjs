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

test("settlement disagreement: a leg the live settlement graded differently is listed; pending is never compared as a result", () => {
  const f = fixture();
  f.days[0].policies["BB-C1"].lanes.A = placed({ graded: { status: "won", legs: ["won", "won"] } });
  f.days[1].policies["BB-C1"].lanes.A = placed({ graded: { status: "pending", legs: ["won", "pending"] } });
  const settled = (date, dResult) => ({ date, lanes: [{ legs: [{ matchup: "A @ B", selection: "B to win", result: "won" }, { matchup: "C @ D", selection: "D to win", result: dResult }] }] });
  const r = buildShadowReport({ ...f, settledByDate: { "2026-09-01": settled("2026-09-01", "lost"), "2026-09-02": settled("2026-09-02", "lost") }, now: "2026-09-07T06:00:00Z" });
  const dis = r.settlementDisagreements.filter((x) => x.policy === "BB-C1");
  assert.deepEqual(dis, [{ date: "2026-09-01", policy: "BB-C1", lane: "A", leg: "C @ D|D to win", gamePk: 1, shadow: "won", live: "lost" }]);
  assert.match(renderShadowReportMarkdown(r), /Settlement disagreements[^\n]*\*\*\d+\*\*/);
});

/* The two 2026-09-22/23 entries, on their real shapes: both were doubleheaders. */
const dhLeg = (gamePk, matchup, selection) => ({ legId: `mlb:${gamePk}:mlb_moneyline:home`, sport: "mlb", eventId: String(gamePk), marketKey: "mlb_moneyline", side: "home", american: -126, displayMatchup: matchup, displaySelection: selection });
const NYY = "Tampa Bay Rays @ New York Yankees";
function dhFixture(liveLeg) {
  const f = fixture();
  f.days[0].policies["BB-LEGACY"].lanes.B = placed({ legs: [dhLeg(823543, NYY, "New York Yankees to win"), dhLeg(822840, "New York Mets @ Texas Rangers", "Texas Rangers to win")], graded: { status: "lost", legs: ["won", "lost"] } });
  const settledByDate = { "2026-09-01": { date: "2026-09-01", lanes: [{ legs: [{ id: "MLB:574050c1:mlb_moneyline:New_York_Yankees_to_win", matchup: NYY, selection: "New York Yankees to win", ...liveLeg }] }] } };
  return { f, settledByDate };
}

test("doubleheader: a live leg on the OTHER game of a doubleheader is a different bet, never a disagreement (2026-09-22)", () => {
  const { f, settledByDate } = dhFixture({ result: "lost" });
  const liveIdentityByDate = { "2026-09-01": { "MLB:574050c1:mlb_moneyline:New_York_Yankees_to_win": { gamePk: 823494, doubleheader: true } } };
  const r = buildShadowReport({ ...f, settledByDate, liveIdentityByDate, now: "2026-09-07T06:00:00Z" });
  assert.equal(r.settlementDisagreements.filter((x) => x.policy === "BB-LEGACY").length, 0);
  assert.equal(r.liveUngraded.length, 0); assert.equal(r.unmatchedLegs.length, 0);
  // Control: the SAME game (a receipt-stored gamePk) graded differently IS a disagreement.
  const same = dhFixture({ result: "lost", gamePk: 823543 });
  const r2 = buildShadowReport({ ...same.f, settledByDate: same.settledByDate, now: "2026-09-07T06:00:00Z" });
  assert.deepEqual(r2.settlementDisagreements.filter((x) => x.policy === "BB-LEGACY"), [{ date: "2026-09-01", policy: "BB-LEGACY", lane: "B", leg: `${NYY}|New York Yankees to win`, gamePk: 823543, shadow: "won", live: "lost" }]);
});

test("doubleheader: a live leg whose game the slate cannot prove is listed UNMATCHED, never joined on team names", () => {
  const { f, settledByDate } = dhFixture({ result: "lost" });
  const liveIdentityByDate = { "2026-09-01": { "MLB:574050c1:mlb_moneyline:New_York_Yankees_to_win": { gamePk: null, doubleheader: true } } };
  const r = buildShadowReport({ ...f, settledByDate, liveIdentityByDate, now: "2026-09-07T06:00:00Z" });
  assert.equal(r.settlementDisagreements.filter((x) => x.policy === "BB-LEGACY").length, 0);
  assert.deepEqual(r.unmatchedLegs.filter((x) => x.policy === "BB-LEGACY").map((x) => x.reason), ["LIVE_GAME_UNPROVEN"]);
});

test("live pending on the same game is LIVE UNGRADED, not a disagreement (2026-09-23)", () => {
  const { f, settledByDate } = dhFixture({ result: "pending" });
  const liveIdentityByDate = { "2026-09-01": { "MLB:574050c1:mlb_moneyline:New_York_Yankees_to_win": { gamePk: 823543, doubleheader: true } } };
  const r = buildShadowReport({ ...f, settledByDate, liveIdentityByDate, now: "2026-09-07T06:00:00Z" });
  assert.equal(r.settlementDisagreements.length, 0);
  assert.deepEqual(r.liveUngraded, [{ date: "2026-09-01", policy: "BB-LEGACY", lane: "B", leg: `${NYY}|New York Yankees to win`, gamePk: 823543, shadow: "won", live: "pending" }]);
  assert.match(renderShadowReportMarkdown(r), /still holds `pending`[^\n]*\*\*1\*\*/);
  assert.match(renderShadowReportMarkdown(r), /\| live ungraded \|/);
});

test("pending is not decided and missing is not zero: an ungraded day contributes pending, not a loss; no day files → empty report, no gate", () => {
  const f = fixture(); f.days[5].policies["BB-C1"].lanes.A = placed({ graded: null });
  const r = buildShadowReport({ ...f, now: "2026-09-07T06:00:00Z" });
  assert.equal(r.policies["BB-C1"].metrics.pending, 1); assert.equal(r.policies["BB-C1"].metrics.lost, 0); assert.equal(r.policies["BB-C1"].metrics.decided, 5);
  const empty = buildShadowReport({ days: [], now: "2026-09-07T06:00:00Z" });
  assert.equal(empty.days, 0); assert.deepEqual(empty.gates, {}); assert.equal(empty.candidatePool.meanEligibleLegs, null);
  assert.match(renderShadowReportMarkdown(empty), /no decided lane-day yet/);
});

test("actual vs market-expected wins: Σ joint p over decided won/lost cards, per rung, never read by the gate", () => {
  const f = fixture();
  f.days[0].policies["BB-C1"].lanes.A = placed({ step: 2, jointP: 0.5, graded: { status: "lost", legs: ["lost", "won"] } });
  f.days[1].policies["BB-C1"].lanes.A = placed({ jointP: null, graded: { status: "won", legs: ["won", "won"] } });
  const r = buildShadowReport({ ...f, now: "2026-09-07T06:00:00Z" });
  const v = r.policies["BB-C1"].vsMarket;
  // 4 rung-1 wins at 0.38 + 1 rung-2 loss at 0.5; the card without a joint p is excluded and counted, never zero.
  assert.equal(v.n, 5); assert.equal(v.won, 4); assert.equal(v.expectedWins, 2.02); assert.equal(v.excludedNoJointP, 1);
  assert.equal(v.actualMinusExpected, 1.98);
  assert.deepEqual(Object.keys(v.byRung), ["1", "2"]); assert.equal(v.byRung["2"].won, 0); assert.equal(v.byRung["2"].expectedWins, 0.5);
  // The gate is unchanged: same inputs without the measurement give the same gate.
  assert.deepEqual(r.gates["BB-C1"].allDays.reasons, buildShadowReport({ ...f, now: "2026-09-07T06:00:00Z" }).gates["BB-C1"].allDays.reasons);
  assert.match(renderShadowReportMarkdown(r), /Actual vs market-expected wins/);
});
