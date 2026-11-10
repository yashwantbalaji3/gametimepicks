/**
 * nba-elo-ha-walkforward@1 + nba-elo-inseason-walkforward@1 — the walk-forward challengers and their pre-registration gate. SYNTHETIC
 * corpora, forecasts and outcomes only, and a synthetic approval: no real outcome is ever scored here (blind until the
 * founder approves the pre-registration).
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/elo-ha-walkforward.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  CHALLENGER_ID, PREREG_DOC, PREREG_DRAFT_SHA256, APPROVED_PREREG_SHA256, PREREG_APPROVED_AT, MIN_PAIRED_N, VERDICT,
  historySamples, seasonSamples, trainingSamples, fitHomeAdvantage, challengerForecast, scoringRefusal, scoreChallengers,
  INSEASON_CHALLENGER_ID, officialPreseasonRatings, inseasonState, inseasonForecast,
} from "./elo-ha-walkforward.mjs";
import { buildTeamRatings, winProbability, NBA_ELO_PARAMS } from "./team-rating.mjs";
import { PREREG } from "./grader-metrics.mjs";
import { mulberry32 } from "./bootstrap.mjs";
import { LABELS } from "./experimental-forecast.mjs";

const REPO = path.resolve(process.cwd(), "..");
const TEAMS = ["SYN-A", "SYN-B", "SYN-C", "SYN-D", "SYN-E", "SYN-F"];

/** SYNTHETIC corpus: `seasons` seasons of daily games among six teams, home side favoured by a planted logit edge. */
function syntheticCorpus({ seasons = 2, perSeason = 300, seed = 3, neutralEvery = 0, preseasonEvery = 0 } = {}) {
  const rnd = mulberry32(seed);
  const rows = [];
  for (let s = 0; s < seasons; s += 1) {
    for (let i = 0; i < perSeason; i += 1) {
      const h = Math.floor(rnd() * TEAMS.length);
      let a = Math.floor(rnd() * (TEAMS.length - 1)); if (a >= h) a += 1;
      const day = new Date(Date.UTC(2030 + s, 9, 20) + Math.floor(i / 3) * 86400e3 + (i % 3) * 3600e3 + 23 * 3600e3);
      const homeWins = rnd() < 0.6;
      rows.push({
        providerEventId: `syn-${s}-${i}`, home: TEAMS[h], away: TEAMS[a],
        ftHome: homeWins ? 110 : 100, ftAway: homeWins ? 100 : 110,
        dateUtc: day.toISOString().replace(/:\d\d\.\d{3}Z$/, "Z"), season: 2031 + s,
        phase: preseasonEvery && i % preseasonEvery === 0 ? 1 : 2,
        neutralSite: neutralEvery ? i % neutralEvery === 0 : false,
      });
    }
  }
  return rows;
}

/** A frozen official forecast game (SYNTHETIC) priced by the official formula from the official ratings. */
function officialGame(rows, { home = "SYN-A", away = "SYN-B", dateUtc = "2032-01-15T00:30Z", inputAsOf = "2032-01-14T11:00:00Z", neutralSite = false } = {}) {
  const built = buildTeamRatings(rows, { throughDateUtc: inputAsOf });
  const rh = built.ratings[home], ra = built.ratings[away];
  return {
    providerEventId: "syn-target", dateUtc, neutralSite,
    forecast: { inputAsOf, elo: { home: { rating: rh }, away: { rating: ra }, pHome: Number(winProbability(rh, ra, { neutralSite }).toFixed(4)) } },
  };
}

test("fold observer: read-only — ratings and the return value are byte-identical with and without it", () => {
  const rows = syntheticCorpus({ preseasonEvery: 7, neutralEvery: 11 });
  const seen = [];
  const a = buildTeamRatings(rows, { throughDateUtc: "2032-06-01T00:00:00Z" });
  const b = buildTeamRatings(rows, { throughDateUtc: "2032-06-01T00:00:00Z", onFold: (g) => seen.push(g) });
  assert.deepEqual(a, b);
  assert.equal(seen.length, rows.length);
  for (const g of seen) assert.equal(g.pHome, winProbability(g.ratingHome, g.ratingAway, { neutralSite: g.neutralSite }));
});

test("historySamples: the regular population at home sites only, with the PRE-game official rating difference", () => {
  const rows = syntheticCorpus({ preseasonEvery: 7, neutralEvery: 11 });
  const samples = historySamples(rows, { throughDateUtc: "2032-06-01T00:00:00Z" });
  const regularHome = rows.filter((r) => r.phase !== 1 && !r.neutralSite).length;
  assert.equal(samples.length, regularHome);
  assert.ok(samples.every((s) => !rows.find((r) => r.providerEventId === s.providerEventId).neutralSite));
  // the very first regular game is between two 1500 teams
  assert.equal(samples[0].diff, 0);
});

test("fitHomeAdvantage: MLE recovers a planted home advantage on the official scale; boundary reported", () => {
  const rnd = mulberry32(5);
  const planted = 40;
  const xs = Array.from({ length: 20000 }, () => {
    const diff = -200 + 400 * rnd();
    const p = 1 / (1 + Math.pow(10, -(diff + planted) / NBA_ELO_PARAMS.SCALE));
    return { diff, homeWon: rnd() < p ? 1 : 0 };
  });
  const fit = fitHomeAdvantage(xs);
  assert.equal(fit.n, 20000);
  assert.equal(fit.boundary, null);
  assert.ok(Math.abs(fit.h - planted) < 8, `fitted ${fit.h}`);
  assert.deepEqual(fitHomeAdvantage([]), { h: null, n: 0, boundary: null });
  assert.equal(fitHomeAdvantage([{ diff: 0, homeWon: 1 }]).boundary, "upper");
  assert.equal(fitHomeAdvantage([{ diff: 0, homeWon: 0 }]).boundary, "lower");
});

test("walk-forward leakage: nothing on or after the game's ET date (or after inputAsOf) changes the challenger", () => {
  const rows = syntheticCorpus({ seasons: 3 });
  const game = officialGame(rows);
  const base = challengerForecast(game, historySamples(rows, { throughDateUtc: "2040-01-01T00:00:00Z" }));
  assert.equal(base.ok, true);
  // flip every result on/after the game's ET date (2032-01-14 ET for a 00:30Z tip) — the fit must not move
  const flipped = rows.map((r) => (Date.parse(r.dateUtc) >= Date.parse("2032-01-14T05:00:00Z") ? { ...r, ftHome: r.ftAway, ftAway: r.ftHome } : r));
  const after = challengerForecast(game, historySamples(flipped, { throughDateUtc: "2040-01-01T00:00:00Z" }));
  assert.deepEqual(after, base);
  // an extra game the same ET date, before inputAsOf, is still excluded by the ET-date rule
  const sameDay = [...rows, { providerEventId: "syn-sameday", home: "SYN-C", away: "SYN-D", ftHome: 120, ftAway: 90, dateUtc: "2032-01-14T06:00Z", season: 2032, phase: 2, neutralSite: false }];
  assert.equal(challengerForecast(game, historySamples(sameDay, { throughDateUtc: "2040-01-01T00:00:00Z" })).homeAdvantage, base.homeAdvantage);
  // and history BEFORE the cutoff does move it (the fit is live, not a constant)
  const earlier = rows.map((r) => (Date.parse(r.dateUtc) < Date.parse("2031-06-01T00:00:00Z") ? { ...r, ftHome: 100, ftAway: 110 } : r));
  assert.notEqual(challengerForecast(game, historySamples(earlier, { throughDateUtc: "2040-01-01T00:00:00Z" })).homeAdvantage, base.homeAdvantage);
  assert.ok(Date.parse(base.fit.lastTrainingDateUtc) < Date.parse(game.forecast.inputAsOf));
});

test("everything else identical: official ratings in, official pHome reproduced, neutral site = the official value", () => {
  const rows = syntheticCorpus();
  const samples = historySamples(rows, { throughDateUtc: "2040-01-01T00:00:00Z" });
  const g = officialGame(rows);
  const c = challengerForecast(g, samples);
  assert.equal(c.challenger, CHALLENGER_ID);
  assert.equal(c.ratingHome, g.forecast.elo.home.rating);
  assert.equal(c.officialPHome, g.forecast.elo.pHome);
  const expected = 1 / (1 + Math.pow(10, -(c.ratingHome - c.ratingAway + c.homeAdvantage) / 400));
  assert.ok(Math.abs(c.pHome - expected) < 1e-4);
  const n = officialGame(rows, { neutralSite: true });
  const cn = challengerForecast(n, samples);
  assert.equal(cn.homeAdvantage, 0);
  assert.equal(cn.pHome, n.forecast.elo.pHome);
});

test("refusals: a frozen pHome the official formula does not reproduce, a forecast not before tip, no history", () => {
  const rows = syntheticCorpus();
  const samples = historySamples(rows, { throughDateUtc: "2040-01-01T00:00:00Z" });
  const g = officialGame(rows);
  assert.equal(challengerForecast({ ...g, forecast: { ...g.forecast, elo: { ...g.forecast.elo, pHome: 0.01 } } }, samples).reason, "OFFICIAL_PHOME_NOT_REPRODUCED");
  assert.equal(challengerForecast({ ...g, dateUtc: "2032-01-14T10:00Z" }, samples).reason, "FORECAST_NOT_BEFORE_TIP");
  assert.equal(challengerForecast(g, []).reason, "NO_HISTORY");
  assert.equal(challengerForecast({ ...g, forecast: { ...g.forecast, inputAsOf: null } }, samples).reason, "NO_FORECAST_INSTANT");
});

test("determinism: row order does not matter and repeated runs are identical", () => {
  const rows = syntheticCorpus({ seasons: 3 });
  const shuffled = [...rows].reverse();
  const a = historySamples(rows, { throughDateUtc: "2040-01-01T00:00:00Z" });
  const b = historySamples(shuffled, { throughDateUtc: "2040-01-01T00:00:00Z" });
  assert.deepEqual(a, b);
  const g = officialGame(rows);
  assert.deepEqual(challengerForecast(g, a), challengerForecast(g, b));
});

/** SYNTHETIC frozen current-season forecasts + a SYNTHETIC finals record (finals-record.mjs shape). */
function seasonFixture() {
  const fz = (id, dateUtc, rh, ra, extra = {}) => ({ providerEventId: id, label: LABELS[2], dateUtc, neutralSite: false, forecast: { inputAsOf: "2032-11-01T10:00:00Z", elo: { home: { rating: rh }, away: { rating: ra }, pHome: 0.5 } }, ...extra });
  const games = [
    fz("s1", "2032-11-02T00:00Z", 1600, 1500),
    fz("s2", "2032-11-02T01:00Z", 1500, 1550),
    fz("s3", "2032-11-02T02:00Z", 1500, 1500, { neutralSite: true }),
    fz("s4", "2032-11-02T03:00Z", 1500, 1500, { label: LABELS[1] }),
    fz("s5", "2032-11-02T04:00Z", 1520, 1500),
    fz("s6", "2032-11-03T00:00Z", 1510, 1500),
  ];
  const fin = (id, h, a) => ({ providerEventId: id, ftHome: h, ftAway: a, winnerSide: h > a ? "home" : "away", home: { tricode: "H" }, away: { tricode: "A" }, phase: "REGULAR" });
  const record = { finals: [fin("s1", 110, 100), fin("s2", 101, 100), fin("s3", 90, 100), fin("s4", 100, 90), fin("s5", 100, 90)], conflicts: [{ providerEventId: "s5" }] };
  return { games, record };
}

test("seasonSamples: regular-season frozen forecasts with an official FINAL, carrying the frozen official ratings", () => {
  const { games, record } = seasonFixture();
  const xs = seasonSamples(games, record);
  // s3 neutral, s4 preseason label, s5 under review, s6 pending → only s1 and s2
  assert.deepEqual(xs.map((x) => [x.providerEventId, x.diff, x.homeWon]), [["s1", 100, 1], ["s2", -50, 1]]);
  // a game frozen twice keeps the latest freeze before tip
  const twice = [...games, { ...games[0], forecast: { ...games[0].forecast, inputAsOf: "2032-11-01T20:00:00Z", elo: { ...games[0].forecast.elo, home: { rating: 1700 } } } }];
  assert.equal(seasonSamples(twice, record).find((x) => x.providerEventId === "s1").diff, 200);
  // a "freeze" after tip is never used
  const late = [{ ...games[1], forecast: { ...games[1].forecast, inputAsOf: "2032-11-02T05:00:00Z" } }];
  assert.deepEqual(seasonSamples(late, record), []);
});

test("trainingSamples: corpus history plus the current season, each game once, in date order", () => {
  const rows = syntheticCorpus();
  const { games, record } = seasonFixture();
  const all = trainingSamples({ corpusRows: rows, throughDateUtc: "2040-01-01T00:00:00Z", forecastGames: games, finalsRecord: record });
  const hist = historySamples(rows, { throughDateUtc: "2040-01-01T00:00:00Z" });
  assert.equal(all.length, hist.length + 2);
  assert.equal(new Set(all.map((x) => x.providerEventId)).size, all.length);
  for (let i = 1; i < all.length; i += 1) assert.ok(Date.parse(all[i - 1].dateUtc) <= Date.parse(all[i].dateUtc));
});

test("pre-registration drift: the committed draft's bytes hash to PREREG_DRAFT_SHA256; nothing is approved", () => {
  const bytes = fs.readFileSync(path.join(REPO, PREREG_DOC));
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), PREREG_DRAFT_SHA256);
  assert.deepEqual([...APPROVED_PREREG_SHA256], []);
  assert.deepEqual({ ...PREREG_APPROVED_AT }, {});
  assert.ok(Object.isFrozen(APPROVED_PREREG_SHA256) && Object.isFrozen(PREREG_APPROVED_AT));
  assert.equal(MIN_PAIRED_N, PREREG.winner.minN);
  assert.equal(MIN_PAIRED_N, 300);
  assert.match(bytes.toString("utf8"), /FROZEN, NOT APPROVED/);
});

test("blind: with the committed (empty) approvals, scoring refuses — even for the draft's own sha256", () => {
  assert.equal(scoringRefusal(PREREG_DRAFT_SHA256), "no approved pre-registration");
  assert.throws(() => scoreChallengers([], { preregSha256: PREREG_DRAFT_SHA256 }), /REFUSED: no approved pre-registration/);
  assert.equal(scoringRefusal("x", ["x"], {}), "the approved pre-registration has no approval timestamp");
});

/** SYNTHETIC scored rows: n games after the synthetic approval instant + `before` exploratory ones. */
function rows({ n, before = 0, challengerEdge = 0, haEdge = 0, seed = 9 }) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n + before; i += 1) {
    const truth = 0.35 + 0.3 * rnd();
    const y = rnd() < truth ? 1 : 0;
    const official = Math.min(0.95, truth + 0.12);
    const inseason = Math.min(0.95, Math.max(0.05, official - challengerEdge));
    const haOnly = Math.min(0.95, Math.max(0.05, official - haEdge));
    const tipUtc = new Date(Date.parse(i < before ? "2030-01-01T00:00:00Z" : "2030-03-01T00:00:00Z") + i * 3600e3).toISOString();
    out.push({ providerEventId: `syn-${i}`, tipUtc, homeWon: y, official, inseason, haOnly });
  }
  return out;
}
const SYN = { preregSha256: "synthetic-test", approvals: ["synthetic-test"], approvedAt: { "synthetic-test": "2030-02-01T00:00:00Z" } };

test("scoring (synthetic approval): ONE primary verdict — the in-season challenger vs the official", () => {
  assert.equal(scoreChallengers(rows({ n: 299, challengerEdge: 0.12 }), SYN).primary.verdict, VERDICT.INSUFFICIENT_N);
  const better = scoreChallengers(rows({ n: 600, challengerEdge: 0.12 }), SYN);
  assert.equal(better.primary.challenger, INSEASON_CHALLENGER_ID);
  assert.equal(better.primary.verdict, VERDICT.CHALLENGER_BETTER);
  assert.ok(better.primary.ci95[1] < 0);
  assert.equal(scoreChallengers(rows({ n: 600, challengerEdge: -0.12 }), SYN).primary.verdict, VERDICT.CHALLENGER_WORSE);
  assert.equal(scoreChallengers(rows({ n: 600, challengerEdge: 0 }), SYN).primary.verdict, VERDICT.INCONCLUSIVE);
  assert.equal(better.promotes, false);
  assert.equal(better.minN, 300);
});

test("scoring: the HA-only challenger and calibration are reported secondaries, never a verdict", () => {
  // a clearly better HA-only challenger with an inconclusive primary: the verdict stays the primary's
  const r = scoreChallengers(rows({ n: 600, challengerEdge: 0, haEdge: 0.12 }), SYN);
  assert.equal(r.primary.verdict, VERDICT.INCONCLUSIVE);
  assert.ok(r.secondary.haOnly.pairedLogLoss.ci95[1] < 0);
  assert.equal(r.secondary.haOnly.verdict, undefined);
  for (const k of ["official", "inseason", "haOnly"]) {
    const c = r.secondary.calibration[k];
    assert.equal(c.n, 600);
    assert.ok(c.eceCi95[0] <= c.ece && c.ece <= c.eceCi95[1]);
    assert.ok(c.homeBiasCi95[0] <= c.homeBias && c.homeBias <= c.homeBiasCi95[1]);
  }
  assert.ok(r.secondary.calibration.official.homeBias > 0.05, "the planted +0.12 over-favour shows in the official's home bias");
});

test("scoring: exploratory games are counted, never scored — changing their outcomes changes nothing", () => {
  const rs = rows({ n: 400, before: 150, challengerEdge: 0.05 });
  const a = scoreChallengers(rs, SYN);
  const b = scoreChallengers(rs.map((r, i) => (i < 150 ? { ...r, homeWon: 1 - r.homeWon, inseason: 0.99, haOnly: 0.01 } : r)), SYN);
  assert.deepEqual(a, b);
  assert.equal(a.n, 400);
  assert.equal(a.window.exploratoryCountedNotScored, 150);
  assert.throws(() => scoreChallengers([...rs, rs[0]], SYN), /duplicate game/);
});

/* ───────────── nba-elo-inseason-walkforward@1 (SYNTHETIC season) ───────────── */

const IDS = ["1", "2", "3", "4"];
/** SYNTHETIC finals record (finals-record.mjs shape) for one season of games among four team ids. */
function seasonFinals({ n = 120, seed = 21, extra = [] } = {}) {
  const rnd = mulberry32(seed);
  const finals = [];
  for (let i = 0; i < n; i += 1) {
    const h = Math.floor(rnd() * 4); let a = Math.floor(rnd() * 3); if (a >= h) a += 1;
    const homeWins = rnd() < 0.55 + 0.05 * (h - a);
    const dateUtc = new Date(Date.UTC(2032, 9, 22) + Math.floor(i / 2) * 86400e3 + (i % 2) * 3600e3).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");
    finals.push({ providerEventId: `f${i}`, dateUtc, phase: "REGULAR", exhibition: false, neutralSite: false, home: { providerTeamId: IDS[h] }, away: { providerTeamId: IDS[a] }, ftHome: homeWins ? 110 : 100, ftAway: homeWins ? 100 : 110 });
  }
  return { finals: [...finals, ...extra], conflicts: [] };
}
const START = new Map([["1", 1550], ["2", 1500], ["3", 1480], ["4", 1470]]);
const inseasonGame = ({ dateUtc = "2032-12-10T00:30Z", inputAsOf = "2032-12-09T11:00:00Z", neutralSite = false } = {}) => ({
  providerEventId: "target", dateUtc, neutralSite, home: { providerTeamId: "1" }, away: { providerTeamId: "2" },
  forecast: { inputAsOf, elo: { home: { rating: 1550 }, away: { rating: 1500 }, pHome: Number(winProbability(1550, 1500, { neutralSite }).toFixed(4)) } },
});

test("officialPreseasonRatings: the constant frozen official rating per team id; refuses if a team's rating moved", () => {
  const fz = (h, a, rh, ra) => ({ label: LABELS[2], home: { providerTeamId: h }, away: { providerTeamId: a }, forecast: { elo: { home: { rating: rh }, away: { rating: ra } } } });
  const ok = officialPreseasonRatings([fz("1", "2", 1550, 1500), fz("2", "3", 1500, 1480), { ...fz("1", "4", 9999, 1), label: LABELS[1] }]);
  assert.equal(ok.ok, true);
  assert.deepEqual([...ok.ratings.entries()], [["1", 1550], ["2", 1500], ["3", 1480]]);
  assert.deepEqual(officialPreseasonRatings([fz("1", "2", 1550, 1500), fz("1", "3", 1551, 1480)]), { ok: false, reason: "OFFICIAL_RATINGS_NOT_CONSTANT", teamId: "1" });
});

test("in-season update = the model card's rule as team-rating.mjs fold() implements it (K 20, win/loss, HA 70)", () => {
  const rec = seasonFinals({ n: 60 });
  const st = inseasonState(START, rec, { cutoffUtc: "2040-01-01T00:00:00Z", gameEt: "2040-01-01" });
  assert.equal(st.updates, 60);
  // the same games through the official fold, one season, starting at the same ratings via a synthetic seed season
  let R = new Map(START);
  for (const f of rec.finals) {
    const h = f.home.providerTeamId, a = f.away.providerTeamId;
    const e = winProbability(R.get(h), R.get(a));
    const s = f.ftHome > f.ftAway ? 1 : 0;
    R = new Map(R).set(h, R.get(h) + NBA_ELO_PARAMS.K * (s - e)).set(a, R.get(a) + NBA_ELO_PARAMS.K * ((1 - s) - (1 - e)));
  }
  assert.deepEqual([...st.ratings.entries()], [...R.entries()]);
  // and starting from 1500 everywhere it matches buildTeamRatings on the same rows exactly
  const flat = new Map(IDS.map((id) => [id, 1500]));
  const st2 = inseasonState(flat, rec, { cutoffUtc: "2040-01-01T00:00:00Z", gameEt: "2040-01-01" });
  const corpus = rec.finals.map((f) => ({ providerEventId: f.providerEventId, home: f.home.providerTeamId, away: f.away.providerTeamId, ftHome: f.ftHome, ftAway: f.ftAway, dateUtc: f.dateUtc, season: 2033, phase: 2, neutralSite: false }));
  const built = buildTeamRatings(corpus, { throughDateUtc: "2040-01-01T00:00:00Z" });
  for (const id of IDS) assert.equal(Number(st2.ratings.get(id).toFixed(4)), built.ratings[id]);
});

test("in-season walk-forward leakage: no final on/after the game's ET date or after inputAsOf moves the forecast", () => {
  const rec = seasonFinals();
  const history = historySamples(syntheticCorpus(), { throughDateUtc: "2040-01-01T00:00:00Z" });
  const game = inseasonGame();
  const base = inseasonForecast(game, { history, startRatings: START, finalsRecord: rec });
  assert.equal(base.ok, true);
  assert.equal(base.challenger, INSEASON_CHALLENGER_ID);
  const flipAfter = { ...rec, finals: rec.finals.map((f) => (Date.parse(f.dateUtc) >= Date.parse("2032-12-09T05:00:00Z") ? { ...f, ftHome: f.ftAway, ftAway: f.ftHome } : f)) };
  assert.deepEqual(inseasonForecast(game, { history, startRatings: START, finalsRecord: flipAfter }), base);
  // a final dated the same ET date, even before inputAsOf, is not used
  const sameDay = { ...rec, finals: [...rec.finals, { providerEventId: "same", dateUtc: "2032-12-09T06:00Z", phase: "REGULAR", exhibition: false, neutralSite: false, home: { providerTeamId: "1" }, away: { providerTeamId: "2" }, ftHome: 90, ftAway: 130 }] };
  assert.deepEqual(inseasonForecast(game, { history, startRatings: START, finalsRecord: sameDay }), base);
  // an earlier final DOES move the ratings (the updates are live)
  const flipBefore = { ...rec, finals: rec.finals.map((f, i) => (i === 0 ? { ...f, ftHome: f.ftAway, ftAway: f.ftHome } : f)) };
  assert.notEqual(inseasonForecast(game, { history, startRatings: START, finalsRecord: flipBefore }).ratingHome, base.ratingHome);
  assert.ok(base.updates > 0 && base.updates < rec.finals.length);
});

test("in-season: preseason, exhibition and under-review finals never update; a neutral final updates without home advantage and is not a fit sample", () => {
  const rec = seasonFinals({ n: 10 });
  const mk = (id, extra) => ({ providerEventId: id, dateUtc: "2032-10-23T02:00Z", home: { providerTeamId: "3" }, away: { providerTeamId: "4" }, ftHome: 120, ftAway: 80, phase: "REGULAR", exhibition: false, neutralSite: false, ...extra });
  const base = inseasonState(START, rec, { cutoffUtc: "2040-01-01T00:00:00Z", gameEt: "2040-01-01" });
  const withJunk = { finals: [...rec.finals, mk("pre", { phase: "PRESEASON" }), mk("exh", { exhibition: true }), mk("rev", {})], conflicts: [{ providerEventId: "rev" }] };
  assert.deepEqual(inseasonState(START, withJunk, { cutoffUtc: "2040-01-01T00:00:00Z", gameEt: "2040-01-01" }), base);
  const neutral = inseasonState(START, { finals: [mk("n", { neutralSite: true })], conflicts: [] }, { cutoffUtc: "2040-01-01T00:00:00Z", gameEt: "2040-01-01" });
  const e = winProbability(1480, 1470, { neutralSite: true });
  assert.equal(neutral.ratings.get("3"), 1480 + 20 * (1 - e));
  assert.deepEqual(neutral.samples, []);
});

test("in-season: the home advantage is re-fit on this model's own pre-game differences; refusals; determinism", () => {
  const rec = seasonFinals();
  const history = historySamples(syntheticCorpus(), { throughDateUtc: "2040-01-01T00:00:00Z" });
  const game = inseasonGame();
  const a = inseasonForecast(game, { history, startRatings: START, finalsRecord: rec });
  const b = inseasonForecast(game, { history, startRatings: START, finalsRecord: { ...rec, finals: [...rec.finals].reverse() } });
  assert.deepEqual(a, b);
  const expected = 1 / (1 + Math.pow(10, -(a.ratingHome - a.ratingAway + a.homeAdvantage) / 400));
  assert.ok(Math.abs(a.pHome - expected) < 1e-4);
  const st = inseasonState(START, rec, { cutoffUtc: game.forecast.inputAsOf, gameEt: "2032-12-09" });
  const own = fitHomeAdvantage([...history.filter((x) => Date.parse(x.dateUtc) < Date.parse(game.forecast.inputAsOf)), ...st.samples]);
  assert.equal(a.homeAdvantage, Number(own.h.toFixed(4)));
  assert.equal(inseasonForecast(inseasonGame({ neutralSite: true }), { history, startRatings: START, finalsRecord: rec }).homeAdvantage, 0);
  assert.equal(inseasonForecast(game, { history, startRatings: new Map([["1", 1500]]), finalsRecord: rec }).reason, "NO_START_RATING");
  assert.equal(inseasonForecast(inseasonGame({ inputAsOf: "2032-12-10T01:00:00Z" }), { history, startRatings: START, finalsRecord: rec }).reason, "FORECAST_NOT_BEFORE_TIP");
  assert.equal(inseasonForecast(game, { history: [], startRatings: START, finalsRecord: { finals: [], conflicts: [] } }).reason, "NO_HISTORY");
});

test("the challengers feed no public surface: nothing outside their own tests imports the module", () => {
  const roots = ["src/app", "src/components", "src/lib", "scripts"].map((d) => path.join(process.cwd(), d));
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!/\.(mjs|js|ts|tsx)$/.test(e.name) || /elo-ha-walkforward(\.test)?\.mjs$/.test(e.name)) continue;
      if (fs.readFileSync(p, "utf8").includes("elo-ha-walkforward")) hits.push(path.relative(process.cwd(), p));
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  assert.deepEqual(hits, []);
});
