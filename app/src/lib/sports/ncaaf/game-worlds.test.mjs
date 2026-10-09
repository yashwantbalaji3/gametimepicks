/**
 * NCAAF-003 world-engine guards: each world is one coherent game (exact-count identities hold for every
 * receipt); same inputs + seed → byte-identical receipt; OT follows the 2021 regime and its distribution is
 * strictly as-of; provider OT anomalies are quarantined; every missing input refuses with a reason; the
 * walk-forward world wrapper cannot leak a future outcome into an earlier receipt. PRIVATE_RESEARCH.
 *
 * Everything below is a SYNTHETIC TEST FIXTURE. No real game, score or distribution appears here.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/game-worlds.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createScoreBank, createWorldModel, seedFor, simulateEvent } from "./game-worlds.mjs";
import { mulberry32 } from "./metrics.mjs";
import { createModel } from "./models.mjs";
import { MIN_OT_OBSERVATIONS, otDistribution, overtimeRow } from "./overtime.mjs";
import { walkForward } from "./walk-forward.mjs";

/** SYNTHETIC bank: team scores that cluster on football values around mu. */
function syntheticBank(size = 2000, seed = 5) {
  const rand = mulberry32(seed);
  const values = [0, 3, 7, 10, 13, 14, 17, 20, 21, 24, 27, 28, 31, 34, 35, 38, 42, 45, 49];
  const bank = createScoreBank();
  for (let i = 0; i < size; i++) {
    const mu = 10 + 30 * rand();
    const near = values.filter((v) => Math.abs(v - mu) <= 14);
    bank.add(mu, near[Math.floor(rand() * near.length)]);
  }
  return bank;
}
/** SYNTHETIC OT distribution under the 2021 regime. */
const OT = { regime: "ncaa-ot-2021", periods: {
  1: { values: [0, 3, 6, 7, 8], probs: [0.25, 0.2, 0.15, 0.38, 0.02], n: 600 },
  2: { values: [0, 3, 6, 8], probs: [0.3, 0.2, 0.3, 0.2], n: 200 },
  "3+": { values: [0, 2], probs: [0.6, 0.4], n: 120 },
} };
const FORECAST = { homeMean: 30, awayMean: 24, rho: 0.25 };

test("seeds are deterministic per event and differ across events", () => {
  assert.equal(seedFor("900000001"), seedFor("900000001"));
  assert.notEqual(seedFor("900000001"), seedFor("900000002"));
  assert.notEqual(seedFor("900000001", 1), seedFor("900000001", 2));
});

test("every receipt satisfies the exact-count coherence identities", () => {
  const r = simulateEvent({ eventId: "900000001", forecast: FORECAST, bank: syntheticBank(), ot: OT, n: 10000 });
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const wsum = (o) => Object.entries(o).reduce((s, [k, v]) => s + Number(k) * v, 0);
  assert.equal(r.counts.homeWins + r.counts.awayWins, r.worlds);
  assert.equal(sum(r.marginHistogram), r.worlds);
  assert.equal(sum(r.totalHistogram), r.worlds);
  assert.equal(r.marginHistogram[0], undefined, "no final ties");
  assert.equal(Object.entries(r.marginHistogram).filter(([k]) => Number(k) > 0).reduce((s, [, v]) => s + v, 0), r.counts.homeWins, "winner = sign(margin) in every world");
  assert.ok(Math.abs(wsum(r.marginHistogram) / r.worlds - r.mean.margin) < 1e-9);
  assert.ok(Math.abs(wsum(r.totalHistogram) / r.worlds - r.mean.total) < 1e-9);
  assert.ok(Math.abs(r.mean.home - r.mean.away - r.mean.margin) < 1e-9 && Math.abs(r.mean.home + r.mean.away - r.mean.total) < 1e-9);
  assert.equal(sum(r.overtimePeriodsHistogram), r.counts.overtimeWorlds);
  assert.equal(sum(r.regulationTieScores), r.counts.overtimeWorlds, "overtime ⇔ tied regulation");
  assert.equal(r.pHome, r.counts.homeWins / r.worlds);
  assert.ok(r.counts.overtimeWorlds > 0, "a 6-point favourite still produces some ties");
  assert.ok(r.marginPercentiles.p10 <= r.marginPercentiles.p50 && r.marginPercentiles.p50 <= r.marginPercentiles.p90);
});

test("same inputs and seed reproduce byte-identically; another base seed does not", () => {
  const args = { eventId: "900000003", forecast: FORECAST, bank: syntheticBank(), ot: OT, n: 4000 };
  assert.equal(JSON.stringify(simulateEvent(args)), JSON.stringify(simulateEvent(args)));
  assert.notEqual(JSON.stringify(simulateEvent(args)), JSON.stringify(simulateEvent({ ...args, baseSeed: 7 })));
});

test("a stronger home side wins more worlds; swapping means mirrors the margin", () => {
  const bank = syntheticBank();
  const strong = simulateEvent({ eventId: "900000004", forecast: { homeMean: 38, awayMean: 14, rho: 0.2 }, bank, ot: OT, n: 5000 });
  const even = simulateEvent({ eventId: "900000004", forecast: { homeMean: 26, awayMean: 26, rho: 0.2 }, bank, ot: OT, n: 5000 });
  assert.ok(strong.pHome > 0.85, `${strong.pHome}`);
  assert.ok(Math.abs(even.pHome - 0.5) < 0.03, `${even.pHome}`);
});

test("missing inputs refuse with a reason instead of simulating", () => {
  assert.equal(simulateEvent({ eventId: "9", forecast: FORECAST, bank: syntheticBank(), ot: { refused: "OT_RULES_NOT_ENCODED_FOR_2019" } }).refused, "OT_RULES_NOT_ENCODED_FOR_2019");
  assert.match(simulateEvent({ eventId: "9", forecast: FORECAST, bank: syntheticBank(100), ot: OT }).refused, /SCORE_BANK_INSUFFICIENT/);
  assert.equal(simulateEvent({ eventId: "9", forecast: { homeMean: 30 }, bank: syntheticBank(), ot: OT }).refused, "FORECAST_INCOMPLETE");
});

test("an OT distribution that can never end a period trips the coherence guard instead of looping", () => {
  const stuck = { regime: "x", periods: { 1: { values: [0], probs: [1], n: 99 }, 2: { values: [0], probs: [1], n: 99 }, "3+": { values: [0], probs: [1], n: 99 } } };
  assert.throws(() => simulateEvent({ eventId: "900000005", forecast: { homeMean: 20, awayMean: 20, rho: 0.95 }, bank: syntheticBank(), ot: stuck, n: 2000 }), /exceeded 30 OT periods/);
});

const otEvent = (season, homeLines, awayLines, over = {}) => ({
  providerEventId: "900000010", season, overtimePeriods: homeLines.length - 4,
  home: { periodScores: homeLines }, away: { periodScores: awayLines }, ...over,
});

test("overtime rows: valid 2021-regime games pass; anomalies are quarantined, never corrected", () => {
  const ok = overtimeRow(otEvent(2022, [7, 7, 0, 3, 7, 8], [0, 10, 7, 0, 7, 6]), "2022-10-01");
  assert.deepEqual([ok.homeRegulation, ok.awayRegulation, ok.homeOt, ok.awayOt], [17, 17, [7, 8], [7, 6]]);
  assert.equal(overtimeRow(otEvent(2022, [7, 7, 0, 3, 13], [7, 7, 0, 3, 7]), "d").quarantined, "OT_PERIOD_OVER_8");
  assert.equal(overtimeRow(otEvent(2022, [7, 7, 0, 3, 7, 7], [7, 7, 0, 3, 7, 0]), "d").quarantined, "OT_POINTS_OUTSIDE_RULES", "a 7 in OT2 is impossible from 2021");
  assert.equal(overtimeRow(otEvent(2022, [7, 7, 0, 3, 7, 8, 3], [7, 7, 0, 3, 7, 8, 0]), "d").quarantined, "OT_POINTS_OUTSIDE_RULES", "OT3+ is two-point attempts only");
  assert.equal(overtimeRow(otEvent(2022, [7, 7, 0, 3, 7], [7, 7, 0, 0, 7]), "d").quarantined, "REGULATION_NOT_TIED");
  assert.equal(overtimeRow(otEvent(2022, [7, 7, 0, 3, 7], [7, 7, 0, 3, 7], { overtimePeriods: 2 }), "d").quarantined, "PERIOD_COUNT_MISMATCH");
  assert.equal(overtimeRow({ ...otEvent(2022, [1], [1]), home: { periodScores: null } }, "d").quarantined, "MISSING_PERIOD_SCORES");
  assert.equal(overtimeRow(otEvent(2019, [7, 7, 0, 3, 7, 7], [7, 7, 0, 3, 7, 0]), "d").quarantined, undefined, "pre-2021 OT2 sevens are legal under their own rules");
});

test("OT distribution is strictly as-of, regime-scoped, and refuses when thin", () => {
  const row = (eventId, season, slateDate, homeOt, awayOt) => ({ eventId, season, slateDate, homeRegulation: 10, awayRegulation: 10, homeOt, awayOt });
  const rows = [];
  for (let i = 0; i < MIN_OT_OBSERVATIONS; i++) rows.push(row(`a${i}`, 2022, "2022-10-01", [7, 8, 2], [7, 6, 0]));
  rows.push(row("pre", 2019, "2019-10-01", [7, 7, 8], [7, 7, 6])); // older regime: OT1 pools, OT2/OT3+ must not
  rows.push(row("sameDay", 2022, "2022-11-05", [3, 0, 0], [3, 3, 2]));
  const d = otDistribution(rows, "2022-11-05", 2022);
  assert.equal(d.regime, "ncaa-ot-2021");
  assert.equal(d.periods["1"].n, 2 * MIN_OT_OBSERVATIONS + 2, "OT1 pools the 2019 game; the same-day game is excluded");
  assert.deepEqual(d.periods["2"].values, [6, 8], "2019's OT2 sevens never enter the 2021-regime OT2 distribution");
  assert.equal(otDistribution(rows, "2022-10-01", 2022).refused, "OT_DISTRIBUTION_INSUFFICIENT_1_n2");
  assert.equal(otDistribution(rows, "2022-11-05", 2020).refused, "OT_RULES_NOT_ENCODED_FOR_2020");
  assert.ok(d.periods["1"].probs.every((p) => p > 0) && Math.abs(d.periods["1"].probs.reduce((s, p) => s + p, 0) - 1) < 1e-12);
});

test("world wrapper: rewriting every FUTURE outcome leaves earlier world receipts byte-identical", () => {
  const rand = mulberry32(13);
  const rows = [];
  let id = 900001000;
  for (const season of [2021, 2022]) for (let week = 1; week <= 13; week++) {
    const day = new Date(Date.UTC(season, 8, 1 + 7 * week)).toISOString().slice(0, 10);
    for (let g = 0; g < 30; g++) {
      const h = Math.floor(rand() * 60), a = (h + 1 + Math.floor(rand() * 59)) % 60;
      const hs = 7 * Math.floor(rand() * 6) + 3 * Math.floor(rand() * 2), as = 7 * Math.floor(rand() * 5) + 3 * Math.floor(rand() * 2) + 1;
      rows.push({ eventId: String(id++), season, seasonType: 2, week, startUtc: `${day}T${String(10 + (g % 10)).padStart(2, "0")}:00Z`, slateDate: day,
        homeTeamId: `ncaaf-team-${9000 + h}`, awayTeamId: `ncaaf-team-${9000 + a}`, homeConferenceId: "1", awayConferenceId: "2", homeDivision: "FBS", awayDivision: "FBS",
        pairing: "FBS-FBS", neutralSite: false, conferenceGame: false, homeScore: hs, awayScore: as, overtimePeriods: 0 });
    }
  }
  const otRows = Array.from({ length: 40 }, (_, i) => ({ eventId: `ot${i}`, season: 2020 + (i % 2), slateDate: "2020-10-01", homeRegulation: 14, awayRegulation: 14, homeOt: [7, 8, 2], awayOt: [7, 6, 0] }))
    .map((r) => ({ ...r, season: 2021 }));
  const make = () => createWorldModel(createModel({ id: "C2", lambda: 2, H: 240 }), { otRows, quarantinedIds: new Set(), n: 500 });
  const cut = "2022-10-01";
  const keep = (r) => r.slateDate < cut && r.season === 2022;
  const tampered = rows.map((r) => (r.slateDate >= cut ? { ...r, homeScore: 70, awayScore: 0 } : r));
  const a = walkForward(make(), rows, { keep }), b = walkForward(make(), tampered, { keep });
  assert.ok(a.some((f) => f.worlds && !f.worlds.refused), "some receipts were produced");
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
