/**
 * NBA experimental forecast + grading guards (N2/N3): a preseason game can never be labelled
 * regular season; the artifact is productEligible:false / PRIVATE_RESEARCH; populations stay
 * separate; grading reports minutes error and conditional production error SEPARATELY, in
 * separate preseason / regular buckets. NBA PRESEASON — EXPERIMENTAL · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/experimental-forecast.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { labelForSeasonType, populationForSeasonType, etDateOf, buildForecastArtifact, gradeForecastGame, summariseGrades, LABELS, DATA_CLASS } from "./experimental-forecast.mjs";

const NOW = "2026-09-22T12:00:00Z";
const TOR = "28", MIA = "14";
const player = (id, team, over = {}) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: true, didNotPlay: false, dnpReason: null, minutes: 30, pts: 15, reb: 6, ast: 3, threePm: 2, threePa: 5, ...over });
const box = (id, dateUtc, phase, home, away, players) => ({ schemaVersion: 1, providerEventId: id, season: 2026, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: home, homeAway: "home" }, { providerTeamId: away, homeAway: "away" }], players });
const teamPlayers = (team, prefix, mins) => Array.from({ length: 8 }, (_, i) => player(`${prefix}${i}`, team, { minutes: mins, pts: Math.round(mins * 0.5), starter: i < 5 }));
const BOX = [
  ...Array.from({ length: 4 }, (_, i) => box(`pre${i}`, `2025-10-0${i + 3}T23:00Z`, 1, TOR, MIA, [...teamPlayers(TOR, "t", 18), ...teamPlayers(MIA, "m", 20)])),
  ...Array.from({ length: 12 }, (_, i) => box(`reg${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00Z`, 2, TOR, MIA, [...teamPlayers(TOR, "t", 30), ...teamPlayers(MIA, "m", 28)])),
];
const CORPUS = BOX.map((b, i) => ({ providerEventId: b.providerEventId, season: 2026, phase: b.phase, dateUtc: b.dateUtc, home: "Toronto Raptors", away: "Miami Heat", ftHome: 100 + (i % 3), ftAway: 98, neutralSite: false }));
const sched = (id, dateUtc, seasonType, over = {}) => ({ providerEventId: id, dateUtc, seasonType, neutralSite: false, home: { abbr: "TOR", name: "Toronto Raptors", providerTeamId: TOR }, away: { abbr: "MIA", name: "Miami Heat", providerTeamId: MIA }, ...over });
const SCHED = [sched("401902644", "2026-10-03T23:00Z", 1), sched("401999999", "2026-10-04T02:00Z", 2), sched("401888888", "2026-10-04T23:00Z", 1)];
const build = (over = {}) => buildForecastArtifact({ date: "2026-10-03", now: NOW, scheduleRows: SCHED, corpusRows: CORPUS, boxscores: BOX, injuries: [], simulations: 300, ...over });

test("labels: seasonType 1 → PRESEASON EXPERIMENTAL, 2 → REGULAR SHADOW; anything else REFUSED — a preseason game can never carry the regular label", () => {
  assert.equal(labelForSeasonType(1), "NBA PRESEASON — EXPERIMENTAL");
  assert.equal(labelForSeasonType(2), "NBA REGULAR SEASON — SHADOW");
  assert.notEqual(labelForSeasonType(1), LABELS[2]);
  for (const bad of [3, 5, "1", null, undefined]) assert.throws(() => labelForSeasonType(bad), /REFUSED/);
  assert.equal(populationForSeasonType(1), "preseason");
  assert.equal(populationForSeasonType(2), "regular");
  assert.throws(() => populationForSeasonType(3), /REFUSED/);
  const { artifact } = build();
  const pre = artifact.games.find((g) => g.seasonType === 1);
  assert.equal(pre.label, LABELS[1]);
  assert.equal(pre.population, "preseason");
  const refused = buildForecastArtifact({ date: "2026-10-03", now: NOW, scheduleRows: [sched("x", "2026-10-03T23:00Z", 3)], corpusRows: CORPUS, boxscores: BOX, simulations: 10 });
  assert.equal(refused.manifest.gamesForecast, 0);
  assert.equal(refused.manifest.refused.length, 1);
  assert.match(refused.manifest.refused[0].reason, /REFUSED/);
});

test("artifact: productEligible:false, dataClass PRIVATE_RESEARCH, model/provenance stamped, ET-date slate only", () => {
  const { artifact, manifest } = build();
  assert.equal(artifact.productEligible, false);
  assert.equal(artifact.dataClass, DATA_CLASS);
  assert.equal(artifact.dataClass, "PRIVATE_RESEARCH");
  assert.match(artifact.neverReadBy, /app\/src\/app/);
  assert.equal(artifact.modelVersion, "nba-preseason-experimental-v0");
  assert.equal(artifact.inputAsOf, NOW);
  assert.equal(artifact.date, "2026-10-03");
  // 2026-10-04T02:00Z is still Oct 3 in ET; 2026-10-04T23:00Z is not.
  assert.deepEqual(artifact.games.map((g) => g.providerEventId), ["401902644", "401999999"]);
  assert.equal(etDateOf("2026-10-04T02:00Z"), "2026-10-03");
  assert.deepEqual(artifact.labels, [LABELS[1], LABELS[2]].sort());
  assert.equal(manifest.gamesOnSchedule, 2);
  assert.equal(manifest.gamesForecast, 2);
  assert.equal(artifact.ratings.targetSeason, 2027);
  assert.deepEqual(artifact.ratings.boundaryRegressionApplied, { regular: true, preseason: true });
  const g = artifact.games[0];
  assert.equal(g.forecast.simulations, 300);
  assert.equal(g.forecast.seedPolicy, "fixed-per-game: hash(providerEventId)");
  assert.ok(g.forecast.assumptions.minutes.home.population === "preseason");
  assert.equal(g.home.rating.basis, "preseason");
});

test("populations stay separate inside the artifact: preseason game uses preseason minutes (18), regular game uses regular minutes (30)", () => {
  const { artifact } = build();
  const pre = artifact.games.find((g) => g.seasonType === 1);
  const reg = artifact.games.find((g) => g.seasonType === 2);
  // Pool is rescaled to 240 in both cases; the RAW pool sum tells the population apart.
  assert.equal(pre.forecast.assumptions.minutes.home.rawPoolMinutes, 8 * 18);
  assert.equal(reg.forecast.assumptions.minutes.home.rawPoolMinutes, 8 * 30);
  assert.equal(pre.home.minutesModel.teamGamesInSeason, 4);
  assert.equal(reg.home.minutesModel.teamGamesInSeason, 12);
  assert.equal(reg.home.rating.basis, "regular");
});

test("manifest: OUT players, injuries unknown to history, teams without history are all listed", () => {
  const injuries = [{ providerTeamId: TOR, athleteId: "t0", athleteName: "Pt0", status: "Out" }, { providerTeamId: TOR, athleteId: "rookie", athleteName: "Draft Pick", status: "Out" }];
  const { manifest, artifact } = build({ injuries, scheduleRows: [SCHED[0], sched("401777777", "2026-10-03T20:00Z", 1, { away: { abbr: "RM", name: "Real Madrid", providerTeamId: "9999" } })] });
  assert.equal(manifest.playersOut, 2, "t0 is OUT in both games' TOR pools");
  assert.deepEqual(manifest.playersUnknownToHistory.map((u) => u.athleteId), ["rookie", "rookie"]);
  assert.deepEqual(manifest.teamsWithoutBoxscoreHistory, ["Real Madrid (9999) [preseason]"]);
  assert.deepEqual(manifest.teamsWithoutPreseasonHistory, ["Real Madrid (9999)"]);
  const rm = artifact.games.find((g) => g.providerEventId === "401777777");
  assert.equal(rm.away.rating.basis, "default-no-history");
  assert.equal(rm.forecast.assumptions.availability.away.poolSize, 0);
  assert.equal(rm.forecast.sim.away.mean, 0, "no pool → no points, visibly, not a guessed 110");
});

test("grading: winner Brier/log loss for Elo AND sim; minutes MAE and conditional production MAE reported separately; buckets never pooled", () => {
  const { artifact } = build();
  const pre = artifact.games.find((g) => g.seasonType === 1);
  const reg = artifact.games.find((g) => g.seasonType === 2);
  const actual = box(pre.providerEventId, pre.dateUtc, 1, TOR, MIA, [
    ...teamPlayers(TOR, "t", 24).map((p, i) => (i === 7 ? { ...p, didNotPlay: true, minutes: null, pts: null, dnpReason: "COACH'S DECISION" } : p)),
    ...teamPlayers(MIA, "m", 24), player("newguy", MIA, { minutes: 12, pts: 4 }),
  ]);
  const g1 = gradeForecastGame(pre, { ftHome: 110, ftAway: 100, source: "test" }, actual);
  assert.equal(g1.graded, true);
  assert.equal(g1.label, LABELS[1]);
  for (const m of ["elo", "sim"]) {
    assert.ok(Number.isFinite(g1.winner[m].brier) && Number.isFinite(g1.winner[m].logLoss));
    assert.ok(Math.abs(g1.winner[m].brier - (g1.winner[m].p - 1) ** 2) < 1e-4, "brier is rounded to 4 dp");
  }
  assert.equal(g1.score.totalErr, Number((pre.forecast.sim.total.mean - 210).toFixed(4)));
  assert.equal(g1.players.rows.length, 15, "7 TOR + 8 MIA matched rows");
  assert.equal(g1.players.predictedButDnp.length, 1);
  assert.equal(g1.players.playedButUnpredicted.length, 1);
  assert.equal(g1.players.playedButUnpredicted[0].providerAthleteId, "newguy");
  const r = g1.players.rows[0];
  assert.equal(r.minutesAbsErr, Number(Math.abs(r.expectedMinutes - 24).toFixed(4)));
  const pred = pre.forecast.players.home.find((p) => p.providerAthleteId === r.providerAthleteId);
  assert.equal(r.conditional.pts, Number(Math.abs(24 * pred.rates.pts - 12).toFixed(4)), "conditional = actual minutes × predicted rate vs actual pts");
  assert.notEqual(r.conditional.pts, r.unconditional.pts);
  const g2 = gradeForecastGame(reg, { ftHome: 99, ftAway: 105 }, null);
  assert.equal(g2.players, null, "no box score → player rows absent, never zero");
  assert.equal(g2.winner.elo.y, 0);
  const s = summariseGrades([g1, g2, gradeForecastGame(reg, { ftHome: 100, ftAway: 100 })]);
  assert.equal(s[LABELS[1]].games, 1);
  assert.equal(s[LABELS[2]].games, 1, "a tie is not graded");
  assert.ok(Number.isFinite(s[LABELS[1]].players.minutesMAE));
  assert.ok(Number.isFinite(s[LABELS[1]].players.conditionalMAE.pts));
  assert.equal(s[LABELS[2]].players.minutesMAE, null);
  assert.equal(s[LABELS[1]].winner.elo.n, 1);
  assert.equal(s[LABELS[2]].winner.sim.n, 1);
});
