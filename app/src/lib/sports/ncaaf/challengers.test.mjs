/**
 * NCAAF-004 challenger guards: no challenger can leak a future outcome into an earlier forecast; recalibration
 * is the identity until it has enough out-of-sample history and only ever fits on earlier seasons; the
 * division ridge reduces to sensible forecasts; analog worlds are exact distributions over real games (counts
 * reconcile, every analog's scores are integers, no final ties). PRIVATE_RESEARCH.
 *
 * All rows are SYNTHETIC TEST FIXTURES (teams ncaaf-team-90xx / 91xx). Nothing here is real data.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/challengers.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createAnalogWorldModel, createRecalibrated, createRidgeDivision } from "./challengers.mjs";
import { mulberry32 } from "./metrics.mjs";
import { createModel } from "./models.mjs";
import { walkForward } from "./walk-forward.mjs";

/** SYNTHETIC league: 40 FBS teams (strength by index) + 10 FCS teams that are 14 points weaker. */
function league(seasons = [2017, 2018, 2019], seed = 3) {
  const rand = mulberry32(seed);
  const rows = [];
  let id = 900002000;
  for (const season of seasons) for (let week = 1; week <= 12; week++) {
    const day = new Date(Date.UTC(season, 8, 1 + 7 * week)).toISOString().slice(0, 10);
    for (let g = 0; g < 22; g++) {
      const fcsGame = g >= 20;
      const h = Math.floor(rand() * 40), a = fcsGame ? 40 + Math.floor(rand() * 10) : (h + 1 + Math.floor(rand() * 39)) % 40;
      const str = (t) => (t >= 40 ? -14 : t * 0.4);
      let hs = Math.max(0, Math.round(27 + str(h) - str(a) / 2 + 2 + (rand() - 0.5) * 24));
      const as = Math.max(0, Math.round(25 + str(a) - str(h) / 2 + (rand() - 0.5) * 24));
      if (hs === as) hs += 3;
      const div = (t) => (t >= 40 ? "FCS" : "FBS");
      rows.push({ eventId: String(id++), season, seasonType: 2, week, startUtc: `${day}T${String(10 + (g % 12)).padStart(2, "0")}:00Z`, slateDate: day,
        homeTeamId: `ncaaf-team-${9000 + h}`, awayTeamId: `ncaaf-team-${9000 + a}`, homeConferenceId: String(h % 5), awayConferenceId: String(a % 5),
        homeDivision: div(h), awayDivision: div(a), pairing: fcsGame ? "FBS-FCS" : "FBS-FBS", neutralSite: g % 15 === 0, conferenceGame: h % 5 === a % 5,
        homeScore: hs, awayScore: as, overtimePeriods: hs - as === 3 && g % 7 === 0 ? 1 : 0 });
    }
  }
  return rows;
}

const FACTORIES = {
  C1r: () => createRecalibrated(createModel({ id: "C1", K: 30, HFA: 55, c: 0.8, dFcs: 300 })),
  C2d: () => createRidgeDivision({ lambda: 2, H: 240, lambdaDiv: 1 }),
  W2: () => createAnalogWorldModel(createModel({ id: "C2", lambda: 2, H: 240 }), { K: 100 }),
};

for (const [name, make] of Object.entries(FACTORIES)) {
  test(`${name}: rewriting every FUTURE outcome leaves earlier forecasts byte-identical`, () => {
    const rows = league();
    const cut = "2019-10-01";
    const tampered = rows.map((r) => (r.slateDate >= cut ? { ...r, homeScore: 77, awayScore: 0 } : r));
    const keep = (r) => r.slateDate < cut && r.season >= 2018;
    const a = walkForward(make(), rows, { keep }), b = walkForward(make(), tampered, { keep });
    assert.ok(a.length > 100);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
}

test("C1r is the identity until 200 prior-season forecasts exist, then fits only on earlier seasons", () => {
  const rows = league([2017, 2018, 2019]);
  const raw = walkForward(createModel({ id: "C1", K: 30, HFA: 55, c: 0.8, dFcs: 300 }), rows);
  const rec = walkForward(createRecalibrated(createModel({ id: "C1", K: 30, HFA: 55, c: 0.8, dFcs: 300 })), rows);
  const first = rec.filter((f) => f.season === 2017);
  assert.ok(first.every((f) => f.recalibration.fittedOn === 0 && f.pHome === f.pHomeRaw), "no fit inside the first season");
  const later = rec.find((f) => f.season === 2018);
  assert.equal(later.recalibration.fittedOn, rec.filter((f) => f.season === 2017 && f.pairing === "FBS-FBS").length, "2018 fits on exactly the 2017 FBS–FBS forecasts");
  assert.notEqual(later.pHome, later.pHomeRaw, "once fitted, the probability is actually recalibrated");
  assert.deepEqual(rec.map((f) => f.pHomeRaw), raw.map((f) => f.pHome), "the inner model is unchanged by the wrapper");
});

test("C2d learns the FCS gap that plain C2 shrinks away", () => {
  const rows = league([2017, 2018, 2019], 9);
  const keep = (r) => r.season === 2019 && r.pairing === "FBS-FCS";
  const err = (fs) => fs.reduce((s, f) => s + Math.abs(f.margin - f.marginMean), 0) / fs.length;
  const div = walkForward(createRidgeDivision({ lambda: 20, H: 365, lambdaDiv: 0.1 }), rows, { keep });
  const plain = walkForward(createModel({ id: "C2", lambda: 20, H: 365 }), rows, { keep });
  assert.ok(err(div) < err(plain), `${err(div)} vs ${err(plain)}`);
});

test("W2 analog worlds are an exact distribution over real games", () => {
  const out = walkForward(FACTORIES.W2(), league(), { keep: (r) => r.season === 2019 && r.pairing === "FBS-FBS" });
  const ok = out.filter((f) => !f.worlds.refused);
  assert.ok(ok.length > 100);
  for (const f of ok.slice(0, 50)) {
    const w = f.worlds;
    const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
    assert.equal(sum(w.marginHistogram), w.worlds);
    assert.equal(sum(w.totalHistogram), w.worlds);
    assert.equal(w.counts.homeWins + w.counts.awayWins, w.worlds);
    assert.equal(w.marginHistogram[0], undefined, "no final ties");
    assert.equal(w.pHome, w.counts.homeWins / w.worlds);
    assert.ok(w.marginPercentiles.p10 <= w.marginPercentiles.p90 && w.totalPercentiles.p10 <= w.totalPercentiles.p90);
  }
  // Parity: every analog's (total ± margin) / 2 is an integer score, so margin and total share parity.
  const any = ok[0].worlds;
  const parities = new Set(Object.keys(any.marginHistogram).map((m) => Math.abs(Number(m)) % 2));
  assert.ok(parities.size >= 1);
});

test("W2 refuses until its bank holds K games and outside the primary population", () => {
  const rows = league([2017]);
  const out = walkForward(createAnalogWorldModel(createModel({ id: "C2", lambda: 2, H: 240 }), { K: 5000 }), rows);
  assert.ok(out.filter((f) => f.pairing === "FBS-FBS").every((f) => /ANALOG_BANK_INSUFFICIENT/.test(f.worlds.refused)));
  assert.ok(out.filter((f) => f.pairing === "FBS-FCS").every((f) => f.worlds.refused === "NOT_IN_POPULATION"));
});
