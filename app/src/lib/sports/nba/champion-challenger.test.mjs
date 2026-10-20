/**
 * Champion / challenger evaluator + promotion/rollback record (SYNTHETIC fixtures, clearly marked).
 * Run (from app/): npx tsx --test src/lib/sports/nba/champion-challenger.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clusterBootstrap, mulberry32, pairGames, pairPlayerRows, pairedMetrics, evaluateChampionChallenger, VERDICT, marketVerdict } from "./champion-challenger.mjs";
import { emptyPromotionRecord, appendPromotionRecord, validatePromotionRecord, promotionRecordViolations, RECORD_KIND } from "./promotion-record.mjs";
import { FAMILIES } from "./experimental-forecast.mjs";
import { FIXTURE_NOTE, graded, predPlayer, boxDoc, boxRow, HOME, AWAY, REG, PRE } from "./__fixtures__/nba-grading-fixtures.mjs";

test("fixtures are labelled synthetic", () => assert.match(FIXTURE_NOTE, /SYNTHETIC/));

test("bootstrap: deterministic for a seed, interval brackets the mean, one cluster gives no interval", () => {
  const clusters = Array.from({ length: 50 }, (_, i) => [Math.sin(i) + 0.5, Math.cos(i)]);
  const a = clusterBootstrap(clusters, { B: 500, seed: 7 }), b = clusterBootstrap(clusters, { B: 500, seed: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.lo <= a.mean && a.mean <= a.hi);
  assert.equal(a.n, 100); assert.equal(a.clusters, 50);
  assert.equal(clusterBootstrap([[1, 2]]).lo, null);
  assert.equal(clusterBootstrap([]).n, 0);
  const r = mulberry32(1); const xs = Array.from({ length: 1000 }, r);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("pairing: only identical REGULAR-season games frozen pre-tip in BOTH families with the same final", () => {
  const champ = [graded("1"), graded("2"), graded("3", { label: PRE }), graded("4", { inputAsOf: "2030-01-11T01:00:00Z" }), graded("5"), graded("6")];
  const chall = [graded("1"), graded("2"), graded("3", { label: PRE }), graded("4"), graded("5", { final: [111, 100] }), graded("7")];
  const { pairs, excluded } = pairGames(champ, chall);
  assert.deepEqual(pairs.map((p) => p.id), ["1", "2"]);
  assert.deepEqual(excluded, { onlyChampion: 1, onlyChallenger: 1, notRegularSeason: 1, notPreTip: 1, finalMismatch: 1 });
});

test("player pairing: identical athlete ids, expectedMinutes ≥ 20 in BOTH families (3PM also rate ≥ 0.05 in both)", () => {
  const box = boxDoc("g", { homeRows: [boxRow("p1", HOME), boxRow("p2", HOME), boxRow("p3", HOME), boxRow("p4", HOME)], awayRows: [boxRow("q1", AWAY)] });
  const a = graded("g", { box, home: [predPlayer("p1", { em: 30 }), predPlayer("p2", { em: 25 }), predPlayer("p3", { em: 30, tpm: 0.5 }), predPlayer("p4", { em: 30 })] });
  const b = graded("g", { box, home: [predPlayer("p1", { em: 31 }), predPlayer("p2", { em: 18 }), predPlayer("p3", { em: 30, tpm: 0.5 })] });
  assert.deepEqual(pairPlayerRows({ a, b }, "pts").map(([x]) => x.providerAthleteId), ["p1", "p3"], "p2 < 20 in one family; p4 only in one");
  assert.deepEqual(pairPlayerRows({ a, b }, "threePm").map(([x]) => x.providerAthleteId), ["p1"], "p3's 3PM rate < 0.05/min");
});

/** n regular-season games where the challenger's sim probability is closer to the truth (or equal). */
function families(n, { better = true, champP = 0.6, challP = 0.78 } = {}) {
  const champ = [], chall = [];
  for (let i = 0; i < n; i += 1) {
    const homeWins = i % 5 !== 0; // 80% home wins
    const final = homeWins ? [110, 100] : [100, 110];
    const dateUtc = `2030-0${1 + (i % 3)}-${String(1 + (i % 27)).padStart(2, "0")}T00:00Z`;
    champ.push(graded(`e${i}`, { final, dateUtc, inputAsOf: "2029-12-31T00:00:00Z", pHome: champP, marginMean: 4, totalMean: 210 }));
    chall.push(graded(`e${i}`, { final, dateUtc, inputAsOf: "2029-12-31T00:00:00Z", pHome: better ? challP : champP + ((i % 2) ? 0.01 : -0.01), marginMean: 6, totalMean: 210 }));
  }
  return { "v0.1": champ, "v0.2": chall, v1: [] };
}

test("paired metrics: challenger − champion; a direction only when the interval excludes 0 (lower is better)", () => {
  const f = families(120);
  const { pairs } = pairGames(f["v0.1"], f["v0.2"]);
  const m = pairedMetrics(pairs, { B: 500 });
  assert.equal(m.winnerSimLogLoss.n, 120);
  assert.ok(m.winnerSimLogLoss.diff < 0);
  assert.equal(m.winnerSimLogLoss.direction, "CHALLENGER_LOWER");
  const g = families(120, { better: false });
  const m2 = pairedMetrics(pairGames(g["v0.1"], g["v0.2"]).pairs, { B: 500 });
  assert.equal(m2.winnerSimLogLoss.direction, "CI_INCLUDES_0", "a ±0.01 wiggle is not a difference");
});

test("verdicts: below §6 n → INSUFFICIENT_N even when the challenger looks better; report never promotes", () => {
  const r = evaluateChampionChallenger({ families: families(120), computedAt: "2030-03-01T00:00:00Z", bootstrap: { B: 300 } });
  assert.equal(r.promotes, false);
  const w = r.comparisons["v0.2"].verdicts.find((v) => v.market.startsWith("winner"));
  assert.equal(w.verdict, VERDICT.INSUFFICIENT_N);
  assert.equal(w.n, 120); assert.equal(w.minN, 300);
  assert.equal(r.comparisons.v1.overall, "INSUFFICIENT_N", "no v1 rows → nothing to compare");
});

test("verdicts: n met + CI favours the challenger but a §7 bar fails → NOT_READY with the reason", () => {
  // Champion 0.5 everywhere; challenger 0.86 everywhere on an 80% home-win sample: lower log loss than the champion,
  // but ECE ≈ 0.06 fails the §7 ECE ≤ 0.05 bar (below the 0.08 early-reject line).
  const r = evaluateChampionChallenger({ families: families(320, { champP: 0.5, challP: 0.86 }), computedAt: "2030-03-01T00:00:00Z", bootstrap: { B: 300 } });
  const c = r.comparisons["v0.2"];
  assert.equal(c.paired.winnerSimLogLoss.direction, "CHALLENGER_LOWER");
  const w = c.verdicts.find((v) => v.market.startsWith("winner"));
  assert.equal(w.verdict, VERDICT.NOT_READY);
  assert.match(w.reasons.join(), /§7 state on the paired rows is BARS_FAIL/);
  assert.equal(r.promotes, false);
});

test("verdicts: a calibrated, better challenger on ≥ 300 paired games reaches READY_FOR_FOUNDER_REVIEW for that market only — and still promotes nothing", () => {
  const r = evaluateChampionChallenger({ families: families(320), computedAt: "2030-03-01T00:00:00Z", bootstrap: { B: 300 } });
  const c = r.comparisons["v0.2"];
  const w = c.verdicts.find((v) => v.market.startsWith("winner"));
  assert.equal(w.verdict, VERDICT.READY_FOR_FOUNDER_REVIEW, w.reasons.join());
  assert.equal(c.overall, "SOME_MARKET_READY_FOR_FOUNDER_REVIEW");
  for (const v of c.verdicts.filter((x) => /pts|reb|ast|threePm/.test(x.market))) assert.equal(v.verdict, VERDICT.INSUFFICIENT_N, "no player rows → never ready");
  assert.equal(r.promotes, false);
});

test("verdicts: READY_FOR_FOUNDER_REVIEW needs n, a CI excluding 0 in the challenger's favour AND BARS_HOLD", () => {
  const paired = { n: 400, diff: -0.02, ci95: [-0.03, -0.01], direction: "CHALLENGER_LOWER" };
  assert.equal(marketVerdict({ market: "m", paired, minN: 300, challengerState: { state: "BARS_HOLD" } }).verdict, VERDICT.READY_FOR_FOUNDER_REVIEW);
  assert.equal(marketVerdict({ market: "m", paired: { ...paired, direction: "CI_INCLUDES_0", ci95: [-0.03, 0.01] }, minN: 300, challengerState: { state: "BARS_HOLD" } }).verdict, VERDICT.NOT_READY);
  assert.equal(marketVerdict({ market: "m", paired: { ...paired, direction: "CHAMPION_LOWER" }, minN: 300, challengerState: { state: "BARS_HOLD" } }).verdict, VERDICT.NOT_READY);
  assert.equal(marketVerdict({ market: "m", paired, minN: 300, challengerState: { state: "HOLD" } }).verdict, VERDICT.NOT_READY);
});

/* ── promotion / rollback record ── */
const good = {
  kind: RECORD_KIND.PROMOTION, family: "v0.2", version: FAMILIES["v0.2"].modelVersion, market: "winner (sim log loss)", date: "2030-03-01", decidedAt: "2030-03-01T12:00:00Z",
  metrics: { pairedN: 412, logLossDiff: -0.012, ci95: [-0.02, -0.004] }, reason: "paired forward evidence met every §7 bar",
  approver: "Yash (founder)", evidence: { verdict: VERDICT.READY_FOR_FOUNDER_REVIEW, report: "reports/champion-challenger/2030-03-01.json", market: "winner (sim log loss)" },
};

test("COMMITTED: promotion-record.json exists, is empty and append-only shaped", () => {
  const doc = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "internal", "research", "nba", "promotion-record.json"), "utf8"));
  assert.deepEqual(doc, emptyPromotionRecord());
  assert.deepEqual(doc.records, []);
  assert.deepEqual(promotionRecordViolations({ before: null, after: doc }), []);
});

test("a record with no approver is REFUSED (and so is an automation approver)", () => {
  for (const approver of [undefined, "", "   "]) {
    const r = appendPromotionRecord(emptyPromotionRecord(), { ...good, approver });
    assert.equal(r.ok, false); assert.match(r.errors.join(), /approver is required/);
    assert.deepEqual(r.doc.records, [], "nothing was appended");
  }
  for (const approver of ["github-actions[bot]", "gtp-ops[bot]", "Claude", "automation"]) {
    assert.match(validatePromotionRecord({ ...good, approver }).errors.join(), /automation identity/, approver);
  }
});

test("a PROMOTION needs a READY_FOR_FOUNDER_REVIEW verdict for its market; version must match the family", () => {
  assert.match(validatePromotionRecord({ ...good, evidence: { ...good.evidence, verdict: VERDICT.NOT_READY } }).errors.join(), /READY_FOR_FOUNDER_REVIEW/);
  assert.match(validatePromotionRecord({ ...good, version: "nba-made-up" }).errors.join(), /model version/);
  assert.match(validatePromotionRecord({ ...good, metrics: {} }).errors.join(), /metrics/);
  assert.match(validatePromotionRecord({ ...good, reason: "ok" }).errors.join(), /reason/);
});

test("valid PROMOTION appends seq 1; a ROLLBACK must name an earlier PROMOTION of the same market; edits are violations", () => {
  const a = appendPromotionRecord(emptyPromotionRecord(), good);
  assert.equal(a.ok, true); assert.equal(a.doc.records[0].seq, 1);
  const rb = { ...good, kind: RECORD_KIND.ROLLBACK, evidence: undefined, rollsBack: 1, reason: "a rollback criterion fired on the forward record" };
  assert.equal(appendPromotionRecord(a.doc, rb).ok, true);
  assert.match(appendPromotionRecord(a.doc, { ...rb, rollsBack: 9 }).errors.join(), /earlier PROMOTION/);
  const b = appendPromotionRecord(a.doc, rb).doc;
  const edited = { ...b, records: [{ ...b.records[0], approver: "someone else" }, b.records[1]] };
  assert.match(promotionRecordViolations({ before: b, after: edited }).join(), /seq 1 was edited/);
  const sneaky = { ...b, records: [...b.records, { seq: 3, ...good, approver: "" }] };
  assert.match(promotionRecordViolations({ before: b, after: sneaky }).join(), /approver is required/);
});
