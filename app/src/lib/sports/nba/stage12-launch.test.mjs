/**
 * Stage 12-S1 / 12-S1b — what an NBA receipt freezes before tip from opening night (founder decisions N1–N3, N5,
 * Yash 2026-10-07): the Elo winner side with its generation, the joint PRA / P+A / P+R combinations, and the
 * 2026-27 challenger's season fold. Synthetic fixtures only; nothing here reads live data.
 *
 * Run: node --test src/lib/sports/nba/stage12-launch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { simulateGame, COMBO_KEYS } from "./game-sim.mjs";
import { frozenWinnerSide, TOO_CLOSE, DECIDED_WINNER_HEAD } from "./winner-side.mjs";
import { buildForecastArtifact, FAMILIES, familySpec } from "./experimental-forecast.mjs";
import { finalsAsCorpusRows, foldBoxscores, corpusSeasonOf } from "./season-fold.mjs";
import { buildTeamRatings } from "./team-rating.mjs";
import { frozenByEveryFamily } from "../../../../scripts/nba/decide-nba-forecast-window.mjs";

/* ── fixtures ── */
const row = (id, mins) => ({ providerAthleteId: id, name: `P${id}`, expectedMinutes: mins, minutesSd: 4, starterRate: 1, gamesUsed: 10, dnpCount: 0, nullMinutesCount: 0, basis: "trailing10", availability: "active", injuryStatus: null, rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.06 }, rateSd: { pts: 0.1, reb: 0.05, ast: 0.03, threePm: 0.02 }, lastSeenDateUtc: "2026-04-01T00:00Z" });
const roster = (ids) => ({ modelVersion: "nba-minutes-model-v0", population: "regular", seasonUsed: 2026, teamGamesInWindow: 10, injuriesProvided: true, rows: ids.map((id, i) => row(id, 34 - i * 3)) });
const SIM_IN = {
  providerEventId: "401902644", inputAsOf: "2026-09-22T12:00:00Z", eloWinProbability: 0.62, simulations: 2000,
  home: { name: "Toronto Raptors", providerTeamId: "28", rating: { rating: 1520 }, minutes: roster(["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"]) },
  away: { name: "Miami Heat", providerTeamId: "14", rating: { rating: 1480 }, minutes: roster(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"]) },
};

const TOR = "28", MIA = "14";
const NOW = "2026-09-22T12:00:00Z";
const player = (id, team, mins) => ({ providerAthleteId: id, name: `P${id}`, providerTeamId: team, starter: true, didNotPlay: false, dnpReason: null, minutes: mins, pts: Math.round(mins * 0.5), reb: 6, ast: 3, threePm: 2, threePa: 5 });
const box = (id, dateUtc, phase, players) => ({ schemaVersion: 1, providerEventId: id, season: 2026, phase, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TOR, homeAway: "home" }, { providerTeamId: MIA, homeAway: "away" }], players });
const BOX = Array.from({ length: 6 }, (_, g) => box(`b${g}`, `2026-0${3 + Math.floor(g / 3)}-1${g}T00:00Z`, 2, [
  ...Array.from({ length: 8 }, (_, i) => player(`t${i}`, TOR, 30 - i * 2)), ...Array.from({ length: 8 }, (_, i) => player(`m${i}`, MIA, 30 - i * 2)),
]));
const CORPUS = BOX.map((b, i) => ({ providerEventId: b.providerEventId, season: 2026, phase: 2, dateUtc: b.dateUtc, home: "Toronto Raptors", away: "Miami Heat", ftHome: 100 + (i % 3), ftAway: 98, neutralSite: false }));
const SCHED = [{ providerEventId: "401999999", dateUtc: "2026-10-03T23:00Z", seasonType: 2, neutralSite: false, home: { abbr: "TOR", name: "Toronto Raptors", providerTeamId: TOR }, away: { abbr: "MIA", name: "Miami Heat", providerTeamId: MIA } }];

/* ── 12-S1: joint combinations ── */

test("COMBOS — PRA, P+A and P+R are joint draws of the player's own components, not sums of medians", () => {
  const out = simulateGame(SIM_IN);
  for (const p of [...out.players.home, ...out.players.away]) {
    for (const [k, parts] of Object.entries(COMBO_KEYS)) {
      const q = p[k];
      assert.ok(q && q.p10 <= q.p50 && q.p50 <= q.p90, `${p.providerAthleteId} ${k} quantiles ordered`);
      // the mean of a per-draw sum is the sum of the means (up to the 2-dp rounding of each)
      const sumOfMeans = parts.reduce((s, c) => s + p[c].mean, 0);
      assert.ok(Math.abs(q.mean - sumOfMeans) <= 0.02 * parts.length, `${k} mean ${q.mean} vs ${sumOfMeans}`);
    }
    // joint spread is wider than any one component's (positively correlated through shared minutes)
    assert.ok(p.pra.p90 - p.pra.p10 > p.pts.p90 - p.pts.p10);
  }
});

// The byte-for-byte check against the previous game-sim.mjs (main) on real slates is in the Stage 12 package evidence;
// here: the combos are pure additions and reproducible.
test("COMBOS are additions only — the player keys are the old ones plus three, and the run is reproducible", () => {
  const strip = (o) => ({ ...o, players: Object.fromEntries(Object.entries(o.players).map(([s, ps]) => [s, ps.map((p) => { const c = { ...p }; for (const k of Object.keys(COMBO_KEYS)) delete c[k]; return c; })])) });
  const a = simulateGame(SIM_IN);
  assert.deepEqual(strip(a), strip(simulateGame(SIM_IN)));
  // The combo keys are the only additions: every player object carries exactly the old keys plus the three combos.
  const keys = Object.keys(a.players.home[0]).sort();
  for (const k of Object.keys(COMBO_KEYS)) assert.ok(keys.includes(k));
  assert.deepEqual(keys.filter((k) => !(k in COMBO_KEYS)), ["ast", "availability", "basis", "expectedMinutes", "gamesUsed", "injuryStatus", "minutes", "minutesSd", "name", "providerAthleteId", "pts", "rates", "ratesBasis", "reb", "starterRate", "threePm"]);
});

/* ── 12-S1: the frozen winner side (N2) ── */

test("WINNER SIDE — Elo decides (N2), an exact 0.5 is TOO_CLOSE (N4 open: no band), a missing probability is no side", () => {
  assert.equal(DECIDED_WINNER_HEAD, "elo");
  assert.equal(frozenWinnerSide({ elo: { pHome: 0.51 }, sim: { pHome: 0.3 } }).publishedSide, "HOME", "Elo, not sim");
  assert.equal(frozenWinnerSide({ elo: { pHome: 0.49 } }).publishedSide, "AWAY", "no 'both under 50%' rule");
  assert.equal(frozenWinnerSide({ elo: { pHome: 0.5 } }).publishedSide, TOO_CLOSE);
  assert.equal(frozenWinnerSide({ elo: {} }).publishedSide, null, "never guessed");
  assert.equal(frozenWinnerSide({ elo: { pHome: 0.7 } }, { generation: "gen-x" }).sideRule.generation, "gen-x");
  assert.throws(() => frozenWinnerSide({}, { head: "market" }), /head must be one of/);
});

test("WINNER SIDE is inside every family's frozen game, with that family's exact generation", () => {
  const team = (t, p) => ({ providerTeamId: t, espnAbbr: p, canonicalTricode: p, state: "CAPTURED", reason: null, playerCount: 8, capturedAt: "2026-09-22T06:00:00Z", refused: [], players: Array.from({ length: 8 }, (_, i) => ({ providerAthleteId: `${p === "TOR" ? "t" : "m"}${i}`, displayName: "x", position: "G", experienceYears: 5, injuryStatus: null })) });
  const rosters = { artifact: "nba-roster-capture", contractVersion: "nba-roster-contract-v1", asOf: "2026-09-22T06:00:00Z", capturedAt: "2026-09-22T06:00:00Z", teams: [team(TOR, "TOR"), team(MIA, "MIA")] };
  for (const family of Object.keys(FAMILIES)) {
    const { artifact } = buildForecastArtifact({ date: "2026-10-03", now: NOW, scheduleRows: SCHED, corpusRows: CORPUS, boxscores: BOX, injuries: [], rosters, simulations: 200, family });
    assert.equal(artifact.games.length, 1, family);
    const f = artifact.games[0].forecast;
    const expected = f.elo.pHome === 0.5 ? TOO_CLOSE : f.elo.pHome > 0.5 ? "HOME" : "AWAY";
    assert.equal(f.publishedSide, expected, `${family} side from Elo`);
    assert.equal(f.sideRule.head, "elo");
    assert.equal(f.sideRule.generation, familySpec(family).modelVersion, `${family} generation recorded`);
    assert.ok(f.players.home[0].pra && f.players.home[0].ptsAst && f.players.home[0].ptsReb, `${family} combos frozen`);
  }
});

/* ── 12-S1b: the 2026-27 challenger (N3) ── */

test("CHALLENGER — v0.2 is its own family: own directory and version, v0.1's pool, champion and challenger labelled", () => {
  const c = familySpec("v0.2");
  assert.equal(c.dir, "experimental-v0.2");
  assert.equal(c.poolRule, FAMILIES["v0.1"].poolRule);
  assert.equal(c.role, "CHALLENGER");
  assert.equal(FAMILIES["v0.1"].role, "CHAMPION", "N1");
  assert.notEqual(c.dataRule, FAMILIES["v0.1"].dataRule);
});

const FINALS = {
  contract: "nba-finals-record-v1", season: "2026-27",
  finals: [
    { providerEventId: "p1", season: "2026-27", phase: "PRESEASON", dateUtc: "2026-10-03T23:00Z", home: { name: "Toronto Raptors" }, away: { name: "Miami Heat" }, ftHome: 105, ftAway: 129, firstRecordedAt: "2026-10-04T14:45:39Z", neutralSite: false },
    { providerEventId: "r1", season: "2026-27", phase: "REGULAR", dateUtc: "2026-10-21T23:00Z", home: { name: "Miami Heat" }, away: { name: "Toronto Raptors" }, ftHome: 110, ftAway: 100, firstRecordedAt: "2026-10-22T03:00:00Z" },
    { providerEventId: "late", season: "2026-27", phase: "REGULAR", dateUtc: "2026-10-22T23:00Z", home: { name: "Miami Heat" }, away: { name: "Toronto Raptors" }, ftHome: 90, ftAway: 100, firstRecordedAt: "2026-10-23T03:00:00Z" },
    { providerEventId: "disputed", season: "2026-27", phase: "REGULAR", dateUtc: "2026-10-21T23:30Z", home: { name: "Miami Heat" }, away: { name: "Toronto Raptors" }, ftHome: 99, ftAway: 98, firstRecordedAt: "2026-10-22T03:00:00Z" },
    { providerEventId: "exh", season: "2026-27", phase: "PRESEASON", exhibition: true, dateUtc: "2026-10-05T23:00Z", home: { name: "Miami Heat" }, away: { name: "Some Club", exhibition: true }, ftHome: 120, ftAway: 80, firstRecordedAt: "2026-10-06T03:00:00Z" },
    { providerEventId: "b0", season: "2026-27", phase: "REGULAR", dateUtc: "2026-10-21T20:00Z", home: { name: "Miami Heat" }, away: { name: "Toronto Raptors" }, ftHome: 101, ftAway: 100, firstRecordedAt: "2026-10-22T03:00:00Z" },
  ],
  conflicts: [{ providerEventId: "disputed" }],
};

test("SEASON FOLD — finals become corpus rows; disputed, exhibition, already-held and recorded-after-now finals never fold", () => {
  assert.equal(corpusSeasonOf("2026-27"), 2027);
  const { rows, skipped } = finalsAsCorpusRows(FINALS, { corpusIds: new Set(["b0"]), now: "2026-10-22T12:00:00Z" });
  assert.deepEqual(rows.map((r) => r.providerEventId), ["p1", "r1"]);
  assert.deepEqual(skipped, { inCorpus: 1, underReview: 1, exhibition: 1, recordedAfterNow: 1, unknownPhase: 0, malformed: 0 });
  assert.deepEqual(rows.map((r) => [r.season, r.phase]), [[2027, 1], [2027, 2]]);
  // preseason stays in the preseason Elo stream; the regular final moves the regular ratings
  const before = buildTeamRatings(CORPUS, { throughDateUtc: "2026-10-22T12:00:00Z", targetSeason: 2027 });
  const after = buildTeamRatings([...CORPUS, ...rows], { throughDateUtc: "2026-10-22T12:00:00Z", targetSeason: 2027 });
  assert.equal(after.folded.preseason, before.folded.preseason + 1);
  assert.equal(after.folded.regular, before.folded.regular + 1);
  assert.ok(after.ratings["Miami Heat"] > before.ratings["Miami Heat"], "Miami's regular-season win moves its rating");
  // opening night: before any regular-season final exists, the regular ratings are v0.1's exactly
  const opener = finalsAsCorpusRows(FINALS, { now: "2026-10-20T12:00:00Z" }).rows;
  assert.deepEqual(buildTeamRatings([...CORPUS, ...opener], { throughDateUtc: "2026-10-20T12:00:00Z", targetSeason: 2027 }).ratings, buildTeamRatings(CORPUS, { throughDateUtc: "2026-10-20T12:00:00Z", targetSeason: 2027 }).ratings);
});

test("SEASON FOLD — fetched box scores join once, get a season label, and nothing captured after now", () => {
  const fetched = [
    { providerEventId: "f1", season: null, phase: 2, dateUtc: "2026-10-21T23:00Z", capturedAt: "2026-10-22T09:00:00Z", boxscoreAvailable: true },
    { providerEventId: "b0", season: null, phase: 2, dateUtc: "2026-03-10T00:00Z", capturedAt: "2026-03-11T00:00:00Z", boxscoreAvailable: true },
    { providerEventId: "f2", season: null, phase: 2, dateUtc: "2026-10-22T23:00Z", capturedAt: "2026-10-23T09:00:00Z", boxscoreAvailable: true },
    { providerEventId: "f1", season: null, phase: 2, dateUtc: "2026-10-21T23:00Z", capturedAt: "2026-10-22T09:00:00Z", boxscoreAvailable: true },
  ];
  const { docs, added, skipped } = foldBoxscores(BOX, fetched, { now: "2026-10-22T12:00:00Z" });
  assert.equal(added, 1);
  assert.deepEqual(skipped, { duplicate: 2, capturedAfterNow: 1, noSeason: 0 });
  assert.equal(docs.find((d) => d.providerEventId === "f1").season, 2027);
  assert.equal(docs.length, BOX.length + 1);
  assert.ok(BOX.every((d) => docs.includes(d)), "the corpus docs are passed through untouched");
});

/* ── the window owes a game until EVERY family has frozen it ── */

test("WINDOW — a game v0 and v0.1 froze but the challenger did not is still owed", () => {
  const v0 = new Set(["g1", "g2"]), v01 = new Set(["g1", "g2"]), v02 = new Set(["g1"]);
  assert.deepEqual([...frozenByEveryFamily([v0, v01, v02])], ["g1"]);
  assert.deepEqual([...frozenByEveryFamily([v0, v01, new Set()])], []);
  assert.deepEqual([...frozenByEveryFamily([])], []);
});
