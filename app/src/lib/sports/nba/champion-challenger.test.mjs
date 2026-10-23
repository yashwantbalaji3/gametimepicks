/**
 * Champion / challenger evaluator + promotion/rollback record (SYNTHETIC fixtures, clearly marked).
 * Run (from app/): npx tsx --test src/lib/sports/nba/champion-challenger.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { clusterBootstrap, mulberry32, pairGames, pairPlayerRows, pairedMetrics, evaluateChampionChallenger, VERDICT, marketVerdict, winnerHeadComparison, PROPOSED_CHALLENGERS, FEW_CLUSTERS_BELOW, DIRECTION, clustersSupportClaim } from "./champion-challenger.mjs";
import { PREREG } from "./grader-metrics.mjs";
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
  assert.deepEqual(excluded, { onlyChampion: 1, onlyChallenger: 1, notRegularSeason: 1, notPreTip: 1, receiptNotVerified: 0, disputedFinal: 0, finalMismatch: 1, boxscoreMismatch: 0 });
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

test("winner heads: Elo (v0.1 receipt) vs v0.1-sim vs v1-sim on identical frozen forward games only; no verdict; the Elo home refit is a text-only proposal", () => {
  const mk = (id, over) => graded(id, { inputAsOf: "2029-12-31T00:00:00Z", final: Number(id.slice(1)) % 2 ? [110, 100] : [100, 110], ...over });
  const v01 = Array.from({ length: 40 }, (_, i) => mk(`w${i}`, { pHome: 0.55, eloPHome: 0.62 }));
  const v1 = [...Array.from({ length: 40 }, (_, i) => mk(`w${i}`, { pHome: 0.5 })), mk("w99", { pHome: 0.5 }), mk("w98", { pHome: 0.5, label: PRE })];
  const w = winnerHeadComparison({ v01, v1 }, { B: 300 });
  assert.equal(w.n, 40, "only the 40 games both families froze pre-tip");
  assert.equal(w.excluded.onlyChallenger, 2);
  assert.deepEqual([w.meanPHome.elo, w.meanPHome.v01Sim, w.meanPHome.v1Sim, w.meanPHome.realisedHomeWinRate, w.meanPHome.n], [0.62, 0.55, 0.5, 0.5, 40]);
  assert.ok(w.logLoss.v1SimMinusElo.diff < 0, "on a 50% home sample the 0.5 head beats a 0.62 head");
  for (const k of ["v1SimMinusElo", "v01SimMinusElo", "v1SimMinusV01Sim"]) assert.equal(w.brier[k].n, 40);
  assert.equal("verdict" in w, false);
  const r = evaluateChampionChallenger({ families: { "v0.1": v01, "v0.2": [], v1 }, computedAt: "t", bootstrap: { B: 200 } });
  assert.equal(r.winnerHeads.n, 40);
  assert.equal(r.promotes, false);
  assert.match(PROPOSED_CHALLENGERS[0].text, /Elo home-advantage refit \(fit on 2023-24 only\)/);
  assert.deepEqual(r.proposedChallengers, PROPOSED_CHALLENGERS);
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

// ── few-clusters guard (prereg §14 reporting note, 2026-10-23): claim-suppressing ONLY ───────────────────────────────
// The reference run passes fewClustersBelow: 0, which is exactly the pre-guard rule (any interval may be read).

/** Walk two reports in parallel; return every leaf where they differ, as { keys, at, g, r } (keys may contain dots: "v0.2"). */
function diffLeaves(g, r, keys = []) {
  if (g === r) return [];
  if (g && r && typeof g === "object" && typeof r === "object") {
    return [...new Set([...Object.keys(g), ...Object.keys(r)])].flatMap((k) => diffLeaves(g[k], r[k], [...keys, k]));
  }
  return [{ keys, at: keys.join("/"), g, r }];
}
const parentOf = (obj, keys) => keys.slice(0, -1).reduce((o, k) => o?.[k], obj);

test("few-clusters guard: the threshold is the PR 1180 backtest's reporting constant (10), not a new or fitted value", () => {
  assert.equal(FEW_CLUSTERS_BELOW, 10);
  assert.equal(clustersSupportClaim(9), false);
  assert.equal(clustersSupportClaim(10), true);
  assert.equal(clustersSupportClaim(2, { fewClustersBelow: 0 }), true, "fewClustersBelow: 0 is the pre-guard rule");
});

test("few-clusters guard: on 2 games the interval and estimate are unchanged, only the direction is withheld", () => {
  // Two games the challenger forecast better (both home wins: e1, e2) — the pre-guard rule reads that as a direction.
  const f = families(3);
  const pairs = pairGames(f["v0.1"], f["v0.2"]).pairs.filter((p) => p.id !== "e0");
  assert.equal(pairs.length, 2);
  const guarded = pairedMetrics(pairs, { B: 500 });
  const reference = pairedMetrics(pairs, { B: 500, fewClustersBelow: 0 });
  assert.equal(reference.winnerSimLogLoss.direction, DIRECTION.CHALLENGER_LOWER, "the pre-guard rule claimed a direction from 2 games");
  assert.equal(guarded.winnerSimLogLoss.direction, DIRECTION.FEW_CLUSTERS);
  for (const k of ["n", "clusters", "champion", "challenger", "diff"]) assert.equal(guarded.winnerSimLogLoss[k], reference.winnerSimLogLoss[k], k);
  assert.deepEqual(guarded.winnerSimLogLoss.ci95, reference.winnerSimLogLoss.ci95);
});

test("few-clusters guard: across sizes and effects it only ever withholds a direction and never changes a verdict upward", () => {
  const cases = [];
  for (const n of [2, 3, 5, 9, 10, 11, 40, 320]) for (const better of [true, false]) for (const [champP, challP] of [[0.6, 0.78], [0.5, 0.86], [0.7, 0.55]]) cases.push({ n, better, champP, challP });
  let withheld = 0, compared = 0;
  for (const c of cases) {
    const fam = families(c.n, c);
    const g = evaluateChampionChallenger({ families: fam, computedAt: "2030-03-01T00:00:00Z", bootstrap: { B: 300 } });
    const r = evaluateChampionChallenger({ families: fam, computedAt: "2030-03-01T00:00:00Z", bootstrap: { B: 300, fewClustersBelow: 0 } });
    for (const { keys, at, g: gv, r: rv } of diffLeaves(g, r)) {
      const leaf = keys.at(-1);
      if (leaf === "rule" || at === "bootstrap/fewClustersBelow" || keys.includes("reasons")) continue; // wording / the echoed setting
      if ((leaf === "verdict" && keys.includes("verdicts")) || leaf === "overall") {
        // A verdict may only move AWAY from READY_FOR_FOUNDER_REVIEW, never towards it.
        assert.ok(rv === VERDICT.READY_FOR_FOUNDER_REVIEW || rv === "SOME_MARKET_READY_FOR_FOUNDER_REVIEW", `${JSON.stringify(c)} ${at}: ${rv} → ${gv}`);
        continue;
      }
      assert.equal(leaf, "direction", `${JSON.stringify(c)}: only directions may differ, not ${at} (${rv} → ${gv})`);
      assert.equal(gv, DIRECTION.FEW_CLUSTERS, `${JSON.stringify(c)} ${at}`);
      assert.ok(parentOf(g, keys).clusters < FEW_CLUSTERS_BELOW, `${at}: withheld only below ${FEW_CLUSTERS_BELOW} clusters`);
      withheld += 1;
    }
    for (const [name, cmp] of Object.entries(g.comparisons)) {
      for (const [i, v] of (cmp.verdicts ?? []).entries()) { compared += 1; assert.equal(v.verdict, r.comparisons[name].verdicts[i].verdict, `${JSON.stringify(c)} ${name} ${v.market}: verdict unchanged`); }
    }
  }
  assert.ok(withheld > 0, "the property ran on small-n cases where the pre-guard rule claimed a direction");
  assert.ok(compared > 0);
});

test("few-clusters guard: a FEW_CLUSTERS direction can never yield READY_FOR_FOUNDER_REVIEW (a claim is removed, never created)", () => {
  const paired = { n: 400, clusters: 9, diff: -0.02, ci95: [-0.03, -0.01], direction: DIRECTION.FEW_CLUSTERS };
  const v = marketVerdict({ market: "m", paired, minN: 300, challengerState: { state: "BARS_HOLD" } });
  assert.equal(v.verdict, VERDICT.NOT_READY);
  assert.match(v.reasons.join(), /fewer than 10 games \(9\): no difference claimed/);
});

test("few-clusters guard: unreachable for every game-level §6 market (n = games ≥ minN ≥ the threshold)", () => {
  // Game markets have one value per game, so clusters = n; INSUFFICIENT_N is decided first (marketVerdict), so once
  // n ≥ minN the guard cannot apply. Player markets need ≥ 800–1500 eligible rows; under 10 games that would be
  // ≥ 80 rows per game at expectedMinutes ≥ 20 in both families — impossible with two NBA rotations.
  for (const k of ["winner", "margin", "total"]) assert.ok(PREREG[k].minN >= FEW_CLUSTERS_BELOW, k);
  for (const k of ["pts", "reb", "ast", "threePm"]) assert.ok(PREREG.player[k].minN / (FEW_CLUSTERS_BELOW - 1) > 40, k);
});
