/**
 * NFL QB props v0 grader (qb-props-grade.mjs) — synthetic receipts and box scores: forward-only selection with counted
 * exclusions, the projected QB, starter match, verified finals, walk-forward baselines, exact-count model scores, the
 * confirmatory filter, the pre-registered decision rule, determinism.
 * SYNTHETIC ONLY: no committed receipt or final is graded here (founder ruling 2026-11-10).
 * Run (from app/): npx tsx --test src/lib/sports/nfl/qb-props-grade.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { assertDistinctQbGames, buildLedger, familyOutcome, gradeQbProps as gradeApproved, projectedQbs, receiptsOfRecord, forwardCounts, gradingApproved, APPROVED_PREREG_SHA256, SEEN_EXPLORATORY_WEEKS } from "./qb-props-grade.mjs";

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

/* walk-forward history: ten 2025 games for AAA (QB 10) and BBB (QB 20), so the 8-game baselines cross the season line */
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T17:00Z`;
const hist = Array.from({ length: 10 }, (_, i) => ({
  providerEventId: `h${i}`, season: 2025, week: i + 1, dateUtc: iso(2025, 9 + Math.floor((7 + 7 * i) / 31), ((7 + 7 * i) % 31) || 1),
  players: [box(10, "AAA", { passAtt: 30 + i, passCmp: 20 + (i % 4), passYds: 200 + 10 * i, passTd: i % 3, passInt: i % 2 }), box(20, "BBB", { passAtt: 30, passCmp: 20, passYds: 250 + i, passTd: 1, passInt: 0 }), box(12, "AAA", { passAtt: 0, passCmp: 0, passYds: 0, passTd: 0, passInt: 0 })],
}));
const g4 = { providerEventId: "4", season: 2026, week: 11, dateUtc: "2026-11-16T18:00Z", players: [box(10, "AAA", { passAtt: 33, passCmp: 24, passYds: 240, passTd: 2, passInt: 1 }), box(20, "BBB", { passAtt: 30, passCmp: 19, passYds: 210, passTd: 0, passInt: 2 })] };
const exact = { passYds: { 190: 2, 230: 5, 260: 3 }, cmp: { 20: 5, 24: 5 }, passAtt: { 30: 5, 34: 5 }, passTd: { 0: 2, 1: 4, 2: 4 }, int: { 0: 7, 1: 3 } };
const entries4 = [...entries, { file: "a/4.json", receipt: receipt("4", "2026-11-16T12:00:00Z", "2026-11-16T18:00Z", [qbRow(10, "AAA", 32, { exactCounts: exact }), qbRow(20, "BBB", 31)]) }];
const allGames = [...hist, ...games.map((g) => ({ season: 2026, ...g })), g4];
const verified4 = new Map([...verified, ["4", { teamPassYds: { AAA: 240, BBB: 210 } }]]);
const normCdf = (z) => { let s = 0, t = z; for (let k = 0; k < 80; k++) { s += t; t *= (-z * z) / 2 * (2 * k + 1) / ((k + 1) * (2 * k + 3)); } return 0.5 + s / Math.sqrt(2 * Math.PI); };
const confirmOpts = { approvedAt: "2026-11-01T00:00:00Z", eligibilityAt: () => ({ state: "ELIGIBLE" }), r5At: () => true };

test("grading: verified finals only, starter match, model only from exact counts / PMFs, walk-forward baselines", () => {
  const g = gradeQbProps({ entries: entries4, games: allGames, verified: verified4 });
  assert.equal(g.counts.unverifiedFinal, 1, "game 3: DDD passing yards disagree with the settlement source");
  assert.equal(g.counts.generatedAtOrAfterStart, 1);
  assert.deepEqual(g.rows.map((r) => [r.eventId, r.team, r.starterMatch]), [["1", "AAA", true], ["1", "BBB", true], ["2", "AAA", true], ["2", "CCC", false], ["4", "AAA", true], ["4", "BBB", true]]);
  const r4a = g.rows.find((r) => r.eventId === "4" && r.team === "AAA").families;
  // model: exact P(over) from the counts — 0.8 / 0.8 / 0.3 at 199.5 / 224.5 / 249.5, actual 240 ⇒ over, over, under
  assert.ok(Math.abs(r4a.passYds.model.primary - (-Math.log(0.8) * 2 - Math.log(0.7)) / 3) < 1e-12);
  assert.deepEqual(r4a.passYds.model.pOver, { 199.5: 0.8, 224.5: 0.8, 249.5: 0.3 });
  assert.ok(Math.abs(r4a.passTd.model.primary + Math.log(0.4)) < 1e-12, "count log loss = −log P(2) from the counts");
  // primary baseline: QB 10's previous 8 games played before game 4 = games 2, 1 and 2025 games 9..4
  const own = [260, 250, ...[9, 8, 7, 6, 5, 4].map((i) => 200 + 10 * i)];
  const mu = own.reduce((a, b) => a + b, 0) / 8;
  assert.equal(mu, 262.5);
  assert.equal(r4a.passYds.baseline.median, 262, "normal(mean, sd) of those 8 read on the integer grid: P(X ≤ 262) ≥ 0.5");
  const sdv = Math.sqrt(own.reduce((a, x) => a + (x - mu) ** 2, 0) / 7);
  assert.ok(Math.abs(r4a.passYds.baseline.pOver[249.5] - (1 - normCdf((249.5 - mu) / sdv))) < 1e-6, "baseline P(over) from the 8 games' mean and SD");
  const td = [3, 2, ...[9, 8, 7, 6, 5, 4].map((i) => i % 3)];
  const lam = td.reduce((a, b) => a + b, 0) / 8;
  assert.ok(Math.abs(r4a.passTd.baseline.primary - -Math.log(Math.exp(-lam) * lam ** 2 / 2)) < 1e-12, "team previous-8 Poisson P(2)");
  // game 1 AAA: the eight 2025 games 9..2 only; the game itself and later games never enter
  const r1 = g.rows.find((r) => r.eventId === "1" && r.team === "AAA").families;
  assert.equal(r1.passYds.model, null, "a receipt without exact counts has no model distribution (never from quantiles)");
  assert.ok(r1.passYds.baseline, "eight 2025 games precede game 1");
  assert.equal(g.rows.find((r) => r.eventId === "2" && r.team === "CCC").families.passYds.baseline, null, "CCC's QB has no 8 prior games ⇒ no baseline");
  assert.ok(g.rows.every((r) => r.confirmatory === false), "no approval timestamp ⇒ nothing is confirmatory");
});

test("confirmatory rows: after approval, outside weeks 5–9, eligibility@1 ELIGIBLE and R5 — all four required", () => {
  const conf = (o) => gradeQbProps({ entries: entries4, games: allGames, verified: verified4, ...confirmOpts, ...o }).rows.filter((r) => r.confirmatory).map((r) => `${r.eventId}${r.team}`);
  assert.deepEqual(conf({}), ["4AAA", "4BBB"], "weeks 6 and 7 are seen weeks and before approval");
  assert.deepEqual(conf({ approvedAt: "2026-11-16T18:00:00Z" }), [], "kickoff at the approval instant is not after it");
  assert.deepEqual(conf({ r5At: ({ teamAbbr }) => teamAbbr === "AAA" }), ["4AAA"]);
  assert.deepEqual(conf({ eligibilityAt: () => ({ state: "FEATURE_HELD" }) }), []);
  assert.deepEqual(conf({ eligibilityAt: null }), [], "eligibility unknown (contract pending) is never confirmatory");
});

test("pre-registered decision: n ≥ 300 paired, cov80 0.76–0.84, CI excludes 0 favourably; no fixed INT event minimum", () => {
  const m = (ci, cov = 0.8, n = 300) => ({ pairedN: n, modelMinusBaselineCi95: ci, model: { cov80: cov } });
  assert.equal(familyOutcome("passYds", m([-0.2, -0.01])).outcome, "MET");
  assert.equal(familyOutcome("passYds", m([-0.2, -0.01], 0.8, 299)).outcome, "INCONCLUSIVE");
  assert.equal(familyOutcome("passYds", m([-0.1, 0.1])).outcome, "INCONCLUSIVE");
  assert.equal(familyOutcome("passYds", m([0.01, 0.2])).outcome, "FAILED");
  assert.equal(familyOutcome("passYds", m([-0.2, -0.01], 0.85)).outcome, "FAILED");
  assert.equal(familyOutcome("passYds", m([-0.2, -0.01], 0.76)).outcome, "MET");
  assert.equal(familyOutcome("passYds", m(null)).outcome, "INCONCLUSIVE");
  assert.equal(familyOutcome("passInt", m([-0.2, -0.01])).outcome, "MET", "INT: the same bars, no event-count gate");
  assert.equal(familyOutcome("passInt", m([-0.3, 0.2])).outcome, "INCONCLUSIVE", "sparse events show as an unsettled interval");
});

test("ledger: the decision is read from confirmatory rows only; small n stays INCONCLUSIVE; secondary league baseline reported", () => {
  const ledger = buildLedger({ graded: gradeQbProps({ entries: entries4, games: allGames, verified: verified4, ...confirmOpts }), inputs: {} });
  assert.equal(ledger.counts.confirmatoryQbGames, 2);
  for (const f of ["passYds", "passCmp", "passAtt", "passTd", "passInt"]) assert.equal(ledger.confirmatory[f].outcome, "INCONCLUSIVE", f);
  assert.equal(ledger.confirmatory.passYds.n, 1, "BBB's receipt row has no exact counts");
  assert.equal(ledger.confirmatory.passYds.noModelDistribution, 1);
  assert.ok(ledger.confirmatory.passYds.secondaryLeague, "league average is computed beside the primary");
  assert.deepEqual(Object.keys(ledger.confirmatory.passYds.ece), ["199.5", "224.5", "249.5"]);
  // count markets always report events and non-events per line, with the model's mean chance (calibration)
  assert.deepEqual(ledger.confirmatory.passInt.events, { eligibleQbGames: 1, total: 1, byLine: { 0.5: { events: 1, nonEvents: 0, eventFrequency: 1, nonEventFrequency: 0, modelMeanP: 0.3 }, 1.5: { events: 0, nonEvents: 1, eventFrequency: 0, nonEventFrequency: 1, modelMeanP: 0 } } });
  assert.deepEqual(Object.keys(ledger.confirmatory.passTd.events.byLine), ["0.5", "1.5", "2.5"]);
  assert.doesNotMatch(JSON.stringify(ledger), /"verdict"|beats/i);
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

test("n counts DISTINCT QB-game outcomes: a repeated (eventId, team, playerId) refuses the grade and the ledger", () => {
  const g = gradeQbProps({ entries: entries4, games: allGames, verified: verified4 });
  assert.equal(assertDistinctQbGames(g.rows), g.rows.length, "every graded row is a distinct outcome");
  const dup = { ...g, rows: [...g.rows, { ...g.rows[0] }] };
  assert.throws(() => assertDistinctQbGames(dup.rows), /REFUSED: duplicate QB-game outcome 1\|AAA\|/);
  assert.throws(() => buildLedger({ graded: dup, inputs: {} }), /REFUSED: duplicate QB-game outcome/);
  // the same QB for the other team in the same game is a different key, not a duplicate
  assert.doesNotThrow(() => assertDistinctQbGames([{ ...g.rows[0] }, { ...g.rows[0], team: "ZZZ" }]));
});
