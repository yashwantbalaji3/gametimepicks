/**
 * NFL QB props v0 grader (qb-props-grade.mjs) — synthetic receipts and box scores: forward-only selection with counted
 * exclusions, the projected QB, starter match, verified finals, no-leakage baseline, PMF-only count scores, determinism.
 * SYNTHETIC ONLY: no committed receipt or final is graded here (founder ruling 2026-11-10).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/qb-props-grade.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildLedger, familyMetrics, gradeQbProps as gradeApproved, projectedQbs, receiptsOfRecord, forwardCounts, gradingApproved, APPROVED_PREREG_SHA256, SEEN_EXPLORATORY_WEEKS } from "./qb-props-grade.mjs";

/* SYNTHETIC fixtures only: the grader runs here under a test-only approval, never on real outcomes */
const TEST_APPROVAL = { preregSha256: "synthetic-test", approvals: ["synthetic-test"] };
const gradeQbProps = (a) => gradeApproved({ ...a, ...TEST_APPROVAL });

const q = (p10, p50, p90) => ({ mean: p50, p10, p25: p50, p50, p75: p50, p90 });
const qbRow = (id, team, att, extra = {}) => ({ playerId: `nfl-athlete-${id}`, name: `QB${id}`, team, stats: { passAtt: q(att - 8, att, att + 8), cmp: q(15, 22, 29), passYds: q(170, 240, 310), passTd: q(0, 2, 3), int: q(0, 0, 2) }, ...extra });
const receipt = (eventId, generatedAt, eventStart, players) => ({ eventId, generatedAt, eventStart, playerStatDistributions: players });
const box = (id, team, s) => ({ playerId: `nfl-athlete-${id}`, name: `QB${id}`, teamAbbr: team, ...s });

const entries = [
  { file: "a/1-early.json", receipt: receipt("1", "2026-10-10T12:00:00Z", "2026-10-12T17:00Z", [qbRow(10, "AAA", 30), qbRow(20, "BBB", 34), qbRow(11, "AAA", 2)]) },
  { file: "a/1-late.json", receipt: receipt("1", "2026-10-12T16:00:00Z", "2026-10-12T17:00Z", [qbRow(10, "AAA", 32), qbRow(20, "BBB", 34)]) },
  { file: "a/1-after.json", receipt: receipt("1", "2026-10-12T17:30:00Z", "2026-10-12T17:00Z", [qbRow(10, "AAA", 99), qbRow(20, "BBB", 99)]) },
  { file: "a/2.json", receipt: receipt("2", "2026-10-19T12:00:00Z", "2026-10-19T17:00Z", [qbRow(10, "AAA", 31, { countPmf: { passTd: [0.2, 0.3, 0.3, 0.1, 0.05, 0.03, 0.02], int: [0.6, 0.3, 0.1, 0, 0, 0, 0] } }), qbRow(30, "CCC", 33)]) },
  { file: "a/3.json", receipt: receipt("3", "2026-10-19T12:00:00Z", "2026-10-19T17:00Z", [qbRow(40, "DDD", 30), qbRow(50, "EEE", 30)]) },
  { file: "a/old.json", receipt: receipt("0", "2026-09-30T12:00:00Z", "2026-10-01T17:00Z", [qbRow(10, "AAA", 30)]) },
];
const games = [
  { providerEventId: "1", week: 6, dateUtc: "2026-10-12T17:00Z", players: [box(10, "AAA", { passAtt: 30, passCmp: 20, passYds: 250, passTd: 2, passInt: 1 }), box(20, "BBB", { passAtt: 36, passCmp: 24, passYds: 280, passTd: 1, passInt: 0 })] },
  { providerEventId: "2", week: 7, dateUtc: "2026-10-19T17:00Z", players: [box(10, "AAA", { passAtt: 34, passCmp: 23, passYds: 260, passTd: 3, passInt: 0 }), box(31, "CCC", { passAtt: 28, passCmp: 17, passYds: 190, passTd: 1, passInt: 1 }), box(30, "CCC", { passAtt: 4, passCmp: 2, passYds: 20, passTd: 0, passInt: 0 })] },
  { providerEventId: "3", week: 7, dateUtc: "2026-10-19T17:00Z", players: [box(41, "DDD", { passAtt: 30, passCmp: 20, passYds: 200, passTd: 1, passInt: 0 }), box(50, "EEE", { passAtt: 30, passCmp: 20, passYds: 200, passTd: 1, passInt: 0 })] },
];
const verified = new Map([["1", { teamPassYds: { AAA: 250, BBB: 280 } }], ["2", { teamPassYds: { AAA: 260, CCC: 210 } }], ["3", { teamPassYds: { DDD: 999, EEE: 200 } }]]);

test("forward only: the receipt of record is the latest generated before the start; later / pre-window receipts are excluded and counted", () => {
  const { records, excluded } = receiptsOfRecord(entries);
  assert.deepEqual(records.map((r) => r.file), ["a/1-late.json", "a/2.json", "a/3.json"]);
  assert.deepEqual(excluded, { generatedAtOrAfterStart: 1, beforeFromDate: 1 });
});

test("projected QB = the largest pass-attempt median per team", () => {
  assert.deepEqual(Object.entries(projectedQbs(entries[0].receipt)).map(([t, p]) => [t, p.playerId]), [["AAA", "nfl-athlete-10"], ["BBB", "nfl-athlete-20"]]);
});

test("grading: verified finals only, starter match, a projected QB who did not play is counted, the baseline never sees the game itself", () => {
  const g = gradeQbProps({ entries, games, verified });
  assert.equal(g.counts.unverifiedFinal, 1, "game 3: DDD passing yards disagree with the settlement source");
  assert.equal(g.counts.generatedAtOrAfterStart, 1);
  assert.deepEqual(g.rows.map((r) => [r.eventId, r.team, r.starterMatch]), [["1", "AAA", true], ["1", "BBB", true], ["2", "AAA", true], ["2", "CCC", false]]);
  const r2 = g.rows.find((r) => r.eventId === "2" && r.team === "AAA");
  assert.equal(r2.families.passYds.baseline, 250, "only game 1 precedes game 2");
  assert.equal(g.rows.find((r) => r.eventId === "1" && r.team === "AAA").families.passYds.baseline, null, "no earlier game, no baseline");
  assert.equal(r2.families.passTd.logLoss, Number((-Math.log(0.1)).toFixed(4)), "the count PMF's own P(3)");
  assert.equal(g.rows.find((r) => r.eventId === "1").families.passTd.logLoss, undefined, "no PMF ⇒ no count score (never from quantiles)");
  assert.equal(r2.eligibility, "PENDING_ELIGIBILITY_CONTRACT");
});

test("metrics: MAE, bias, cov80 and the PMF n, no verdict field anywhere", () => {
  const g = gradeQbProps({ entries, games, verified });
  const m = familyMetrics(g.rows, "passYds");
  assert.equal(m.n, 4);
  assert.equal(m.mae, (10 + 40 + 20 + 220) / 4, "CCC's projected QB (30) threw for 20 against a 240 median");
  assert.equal(m.cov80, 0.75);
  assert.equal(familyMetrics(g.rows, "passTd").countPmfN, 1);
  const ledger = buildLedger({ graded: g, inputs: {} });
  assert.doesNotMatch(JSON.stringify(ledger), /"verdict"|PASS_BAR|FAILS_BAR|beats/i);
  assert.match(ledger.status, /no verdict/);
});

test("deterministic: the same inputs give byte-identical ledgers; the grader reads no clock", () => {
  const a = JSON.stringify(buildLedger({ graded: gradeQbProps({ entries, games, verified }), inputs: { x: 1 } }));
  const b = JSON.stringify(buildLedger({ graded: gradeQbProps({ entries: [...entries].reverse(), games, verified }), inputs: { x: 1 } }));
  assert.equal(a, b);
  for (const f of ["src/lib/sports/nfl/qb-props-grade.mjs", "scripts/nfl/grade-qb-props.mjs"]) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.doesNotMatch(src, /Date\.now\(|new Date\(\)/, f);
  }
});

test("approval gate: nothing is approved yet; grading refuses without an approved pre-registration sha256", () => {
  assert.deepEqual([...APPROVED_PREREG_SHA256], [], "no pre-registration has been approved");
  assert.equal(gradingApproved("anything"), false);
  assert.throws(() => gradeApproved({ entries, games, verified }), /REFUSED/);
  assert.throws(() => gradeApproved({ entries, games, verified, preregSha256: "x" }), /REFUSED/);
  assert.deepEqual([...SEEN_EXPLORATORY_WEEKS], [5, 6, 7, 8, 9], "the weeks seen before approval stay exploratory");
});

test("counts only: forward rows per family from receipts alone — never a final, never a metric", () => {
  assert.equal(forwardCounts.length, 1);
  const c = forwardCounts({ entries });
  assert.equal(c.receiptsOfRecord, 3);
  assert.equal(c.qbRows, 6);
  assert.deepEqual(c.total, { passYds: 6, passCmp: 6, passAtt: 6, passTd: 6, passInt: 6 });
  assert.equal(c.withCountPmf, 1);
  assert.deepEqual(Object.keys(c.byEligibility), ["PENDING_ELIGIBILITY_CONTRACT"]);
  assert.doesNotMatch(JSON.stringify(c), /"(mae|bias|cov80|logLoss|brier|actual|ece|baseline[A-Za-z]*)"/i, "no metric key");
  // the script's default mode imports no final and no grading function
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/grade-qb-props.mjs"), "utf8");
  assert.doesNotMatch(src, /official-stats|player-events-v1|gradeQbProps|buildLedger/);
});
