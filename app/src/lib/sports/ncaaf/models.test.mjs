/**
 * NCAAF-002 guards: scoring rules match known values; the walk-forward runner cannot leak an outcome into a
 * same-day or earlier forecast (for every candidate, rewriting all FUTURE results leaves every earlier
 * forecast byte-identical); Elo is zero-sum and ignores home field on neutral sites; the ridge model recovers
 * known effects and gives 0.5 for identical teams on a neutral field. PRIVATE_RESEARCH.
 *
 * All games are SYNTHETIC TEST FIXTURES (teams ncaaf-team-90xx, events 9xxxxxxxx). Nothing here is real data
 * or may enter an evaluation.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/models.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { brier, calibrationSlopeIntercept, centralZ, clusterBootstrap, ece, logLoss, mulberry32, normalCrps } from "./metrics.mjs";
import { createModel } from "./models.mjs";
import { pregameView, slates, walkForward } from "./walk-forward.mjs";

const T = (n) => `ncaaf-team-${9000 + n}`;
/** SYNTHETIC_TEST_FIXTURE: a deterministic league where team i has strength 3·i points. */
function league({ seasons = [2016, 2017, 2018], teams = 12, seed = 7, neutralEvery = 9 } = {}) {
  const rand = mulberry32(seed);
  const rows = [];
  let id = 900000000;
  for (const season of seasons) {
    for (let week = 1; week <= 12; week++) {
      const day = new Date(Date.UTC(season, 8, 1 + 7 * week)).toISOString().slice(0, 10);
      const order = [...Array(teams).keys()].sort(() => rand() - 0.5);
      for (let g = 0; g < teams / 2; g++) {
        const h = order[2 * g], a = order[2 * g + 1];
        const neutral = (id % neutralEvery) === 0;
        const hs = Math.max(0, Math.round(24 + 3 * h - 1.5 * a + (neutral ? 0 : 3) + (rand() - 0.5) * 20));
        const as = Math.max(0, Math.round(24 + 3 * a - 1.5 * h + (rand() - 0.5) * 20));
        if (hs === as) continue; // no ties at final in college football
        rows.push({
          eventId: String(id++), season, seasonType: 2, week, startUtc: `${day}T18:00Z`, slateDate: day,
          homeTeamId: T(h), awayTeamId: T(a), homeConferenceId: String(h % 3), awayConferenceId: String(a % 3),
          homeDivision: "FBS", awayDivision: "FBS", pairing: "FBS-FBS", neutralSite: neutral, conferenceGame: h % 3 === a % 3,
          homeScore: hs, awayScore: as, overtimePeriods: 0,
        });
      }
    }
  }
  return rows;
}

const SPECS = [
  { id: "B0" }, { id: "B1" },
  { id: "C1", K: 30, HFA: 55, c: 0.7, dFcs: 300 },
  { id: "C2", lambda: 5, H: 240 },
  { id: "C3", lambda: 5, H: 240, lambdaC: 3 },
];

test("scoring rules match known values", () => {
  assert.ok(Math.abs(normalCrps(0, 1, 0) - 0.233695) < 1e-5, "CRPS(N(0,1), 0) = (√2 − 1)/√π");
  assert.ok(Math.abs(logLoss(0.5, 1) - Math.LN2) < 1e-12);
  assert.equal(brier(0.25, 1), 0.5625);
  assert.ok(Math.abs(centralZ(0.8) - 1.281552) < 1e-5);
  assert.equal(ece([0.2, 0.2, 0.2, 0.2, 0.2], [1, 0, 0, 0, 0]), 0);
  assert.throws(() => normalCrps(0, 0, 1), /sd must be > 0/);
});

test("calibration slope ≈ 1 and intercept ≈ 0 on calibrated synthetic forecasts; slope < 1 when overconfident", () => {
  const rand = mulberry32(3);
  const ps = Array.from({ length: 20000 }, () => 0.05 + 0.9 * rand());
  const ys = ps.map((p) => (rand() < p ? 1 : 0));
  const good = calibrationSlopeIntercept(ps, ys);
  assert.ok(Math.abs(good.slope - 1) < 0.06 && Math.abs(good.intercept) < 0.06, JSON.stringify(good));
  const sharp = ps.map((p) => 1 / (1 + Math.exp(-2 * Math.log(p / (1 - p)))));
  assert.ok(calibrationSlopeIntercept(sharp, ys).slope < 0.6);
});

test("week-cluster bootstrap is deterministic for a seed and resamples clusters, not rows", () => {
  const recs = Array.from({ length: 60 }, (_, i) => ({ cluster: `w${i % 6}`, v: i % 6 }));
  const stat = (rs) => rs.reduce((s, r) => s + r.v, 0) / rs.length;
  const a = clusterBootstrap(recs, stat, { reps: 300, seed: 11 }), b = clusterBootstrap(recs, stat, { reps: 300, seed: 11 });
  assert.deepEqual(a, b);
  assert.equal(a.clusters, 6);
  assert.ok(a.lo <= a.estimate && a.estimate <= a.hi);
});

test("pregameView strips every outcome field", () => {
  const v = pregameView(league()[0]);
  assert.equal("homeScore" in v || "awayScore" in v || "overtimePeriods" in v, false);
});

test("slates are chronological and the runner refuses a corpus that is not", () => {
  const rows = league({ seasons: [2016] });
  const days = slates([...rows].reverse()).map((s) => s.slateDate);
  assert.deepEqual(days, [...days].sort());
  const bad = { beginSlate() {}, predict() { return {}; }, observe() {} };
  assert.doesNotThrow(() => walkForward(bad, rows));
});

for (const spec of SPECS) {
  test(`${spec.id}: rewriting every FUTURE outcome leaves all earlier forecasts byte-identical (no leakage)`, () => {
    const rows = league();
    const cut = "2017-10-01";
    const tampered = rows.map((r) => (r.slateDate >= cut ? { ...r, homeScore: r.awayScore + 40, awayScore: 0 } : r));
    const keep = (r) => r.slateDate < cut;
    const a = walkForward(createModel(spec), rows, { keep });
    const b = walkForward(createModel(spec), tampered, { keep });
    assert.ok(a.length > 50);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    // …and the same-day games of the cut slate itself are also unaffected by their own results.
    const sameDay = (rs) => walkForward(createModel(spec), rs, { keep: (r) => r.slateDate === cut.replace("10-01", "10-01") });
    assert.equal(JSON.stringify(sameDay(rows)), JSON.stringify(sameDay(tampered)));
  });

  test(`${spec.id}: forecasts are valid probabilities and positive scales, deterministic across runs`, () => {
    const rows = league();
    const a = walkForward(createModel(spec), rows), b = walkForward(createModel(spec), rows);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    for (const f of a) {
      assert.ok(f.pHome > 0 && f.pHome < 1, `${spec.id} pHome ${f.pHome}`);
      assert.ok(f.marginSd > 0 && f.totalSd > 0);
      assert.ok(Number.isFinite(f.marginMean) && Number.isFinite(f.totalMean));
    }
  });
}

test("the same-day guard really bites: a model that peeks at the slate's results changes same-day forecasts", () => {
  // Mutation-style probe of the runner contract: give the model the slate's own rows BEFORE predicting.
  const rows = league();
  const leaky = () => {
    const m = createModel({ id: "C1", K: 30, HFA: 55, c: 0.7, dFcs: 300 });
    return { ...m, beginSlate(d, s) { m.beginSlate(d, s); const day = rows.filter((r) => r.slateDate === d); m.observe(day, day.map((r) => m.predict(pregameView(r)))); } };
  };
  const honest = walkForward(createModel({ id: "C1", K: 30, HFA: 55, c: 0.7, dFcs: 300 }), rows);
  const peeked = walkForward(leaky(), rows);
  assert.notEqual(JSON.stringify(honest), JSON.stringify(peeked));
});

test("C1 Elo is zero-sum per game and ignores home field on a neutral site", () => {
  const m = createModel({ id: "C1", K: 40, HFA: 70, c: 0.7, dFcs: 300 });
  const g = league({ seasons: [2016] })[0];
  m.beginSlate(g.slateDate, g.season);
  const home = m.predict(pregameView({ ...g, neutralSite: false }));
  const neutral = m.predict(pregameView({ ...g, neutralSite: true }));
  assert.ok(home.pHome > 0.5 && Math.abs(neutral.pHome - 0.5) < 1e-12, "equal new teams: 0.5 neutral, > 0.5 at home");
  m.observe([g], [neutral]);
  const after = m.predict(pregameView({ ...g, neutralSite: true }));
  assert.ok(Math.abs(after.delta + 0) !== 0, "ratings moved");
  // Zero-sum: swapping sides gives the exact opposite rating difference.
  const swapped = m.predict(pregameView({ ...g, homeTeamId: g.awayTeamId, awayTeamId: g.homeTeamId, neutralSite: true }));
  assert.ok(Math.abs(after.delta + swapped.delta) < 1e-9);
});

test("C2 recovers known team strength ordering and gives 0.5 for identical teams on a neutral field", () => {
  const rows = league({ seasons: [2016, 2017, 2018, 2019], seed: 21 });
  const m = createModel({ id: "C2", lambda: 1, H: 3650 });
  walkForward(m, rows);
  const last = rows.at(-1);
  m.beginSlate("2020-01-15", 2020);
  const strong = m.predict(pregameView({ ...last, homeTeamId: T(11), awayTeamId: T(0), neutralSite: true }));
  const weak = m.predict(pregameView({ ...last, homeTeamId: T(0), awayTeamId: T(11), neutralSite: true }));
  assert.ok(strong.pHome > 0.8 && weak.pHome < 0.2, `${strong.pHome} / ${weak.pHome}`);
  assert.ok(Math.abs(strong.marginMean + weak.marginMean) < 1e-6, "swapping sides on neutral negates the margin");
  const same = m.predict(pregameView({ ...last, homeTeamId: T(5), awayTeamId: T(5), neutralSite: true }));
  // Φ uses the A&S 7.1.26 erf (|error| < 1.5e-7), so "exactly 0.5" means within that bound.
  assert.ok(Math.abs(same.marginMean) < 1e-9 && Math.abs(same.pHome - 0.5) < 2e-7, `${same.marginMean} ${same.pHome}`);
  assert.ok(Math.abs(strong.totalSd ** 2 + strong.marginSd ** 2 - 4 * strong.sigma ** 2) < 1e-6, "margin/total variances come from one (σ, ρ)");
});
