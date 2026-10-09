/**
 * MLB-001 · OFFICIAL RULES (founder decision 6, 2026-10-09). The published engine (pa-v2) used three
 * simplifications the MLB-001 audit confirmed against the official rules; pa-v3 plays the official ones.
 *
 *   1. Extra innings: the automatic runner on 2nd is a REGULAR-SEASON rule. There is none in the postseason.
 *   2. Walk-off (Rule 9.06(f) / 5.08(b)): on anything but a home run the game ends when the winning run scores and
 *      only the runs needed to win count — a non-homer walk-off always wins by exactly one. A home run counts all.
 *   3. Inning cap: a game still tied at the cap is not a legal result. It is discarded and re-drawn (counted), and a
 *      game that cannot reach a legal final within a bounded budget is REFUSED — never handed to the home team, never
 *      simulated without bound.
 *
 * And the boundary: LEGACY_RULES (= no `rules`) is the published engine byte for byte, so every committed pa-v2
 * artifact still reproduces. A ruleset that cannot be resolved is refused under rules that depend on it.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/rules.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SeededRng } from "../../game-simulations/rng.ts";
import { DEFAULT_ENGINE_PARAMS, LEGACY_RULES, OFFICIAL_RULES_2026, automaticRunnerApplies, simulateGame } from "./engine.ts";
import { simulateFullGame } from "./simulate.ts";
import { resolveRuleset } from "./board-adapter.ts";

const mkBatter = (id, team, eh, etb) => ({ playerId: id, name: `B${id}`, team, expHits: eh, expTotalBases: etb, expHrr: eh * 2.2 });
const lineup = (base, team, eh = 0.9, etb = 1.45) => Array.from({ length: 9 }, (_, i) => mkBatter(base + i, team, eh, etb));
const fixture = (over = {}) => ({
  gamePk: 999101,
  date: "2026-10-05",
  slug: "aaa-vs-bbb-2026-10-05",
  awayTeam: "AAA",
  homeTeam: "BBB",
  awayTeamName: "A team",
  homeTeamName: "B team",
  venue: "Test Park",
  firstPitch: "2026-10-05T20:00:00Z",
  awayLineup: lineup(100, "AAA"),
  homeLineup: lineup(200, "BBB"),
  awayStarter: { playerId: 1, name: "Ace A", team: "AAA", expStrikeouts: 5 },
  homeStarter: { playerId: 2, name: "Ace B", team: "BBB", expStrikeouts: 5 },
  completeness: { level: "ready", notes: [], awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: [] },
  market: null,
  ...over,
});
const OFFICIAL = { ...DEFAULT_ENGINE_PARAMS, rules: OFFICIAL_RULES_2026 };
const LEGACY = { ...DEFAULT_ENGINE_PARAMS, rules: LEGACY_RULES };
/* An offense that can never reach base: no hits, walks or errors, and no runner ever advances on an out. */
const NO_OFFENSE = (rules) => ({
  ...DEFAULT_ENGINE_PARAMS,
  league: { ...DEFAULT_ENGINE_PARAMS.league, MIN_HIT_RATE: 0, MAX_HIT_RATE: 0, WALK_RATE: 0, REACH_ON_ERROR_RATE: 0 },
  advancement: { ...DEFAULT_ENGINE_PARAMS.advancement, productiveOutScoresFromThird: 0, freeAdvance: 0 },
  rules,
});
const opts = (engine, over = {}) => ({ runCount: 2000, modelVersion: "mlb-fg-rules-test", simulationVersion: 1, generatedAt: "2026-10-05T16:00:00Z", engine, ...over });

const sum = (lines, k) => lines.reduce((s, l) => s + l[k], 0);

test("the rule sets are what they say", () => {
  assert.deepEqual({ ...LEGACY_RULES }, { id: "mlb-rules-legacy-v2", extrasAutomaticRunner: "ALWAYS", walkOffScoring: "ALL_RUNNERS_SCORE", unresolvedAtCap: "AWARD_HOME_RUN" });
  assert.deepEqual({ ...OFFICIAL_RULES_2026 }, { id: "mlb-rules-official-2026", extrasAutomaticRunner: "REGULAR_SEASON_ONLY", walkOffScoring: "WINNING_RUN_ONLY", unresolvedAtCap: "DISCARD" });
  assert.ok(Object.isFrozen(LEGACY_RULES) && Object.isFrozen(OFFICIAL_RULES_2026));
  // Automatic runner: always under legacy; regular season only under the official rules.
  assert.equal(automaticRunnerApplies(LEGACY_RULES, "POSTSEASON"), true);
  assert.equal(automaticRunnerApplies(LEGACY_RULES, "REGULAR_SEASON"), true);
  assert.equal(automaticRunnerApplies(OFFICIAL_RULES_2026, "REGULAR_SEASON"), true);
  assert.equal(automaticRunnerApplies(OFFICIAL_RULES_2026, "POSTSEASON"), false);
});

test("legacy rules ARE the published engine: explicit LEGACY_RULES, no rules, and any ruleset replay identically", () => {
  for (let i = 0; i < 400; i += 1) {
    const base = simulateGame(fixture(), new SeededRng(`legacy|${i}`), DEFAULT_ENGINE_PARAMS);
    assert.deepEqual(simulateGame(fixture(), new SeededRng(`legacy|${i}`), LEGACY), base);
    assert.deepEqual(simulateGame(fixture({ ruleset: "POSTSEASON" }), new SeededRng(`legacy|${i}`), DEFAULT_ENGINE_PARAMS), base);
  }
  // At the artifact level: no `engineRules` field, and the hash is the published engine's.
  const published = simulateFullGame(fixture(), opts(undefined));
  const explicit = simulateFullGame(fixture({ ruleset: "POSTSEASON", rulesetBasis: "GAME_TYPE" }), opts(LEGACY));
  assert.equal(explicit.artifactHash, published.artifactHash);
  assert.equal("engineRules" in published, false);
  assert.equal("engineRules" in explicit, false);
});

test("postseason: no automatic runner — extra-inning games run longer than under the regular-season rule", () => {
  const N = 6000;
  const extras = (ruleset) => {
    let games = 0;
    let innings = 0;
    for (let i = 0; i < N; i += 1) {
      const r = simulateGame(fixture({ ruleset }), new SeededRng(`extras|${i}`), OFFICIAL);
      if (r.extra) { games += 1; innings += r.innings; }
    }
    return { games, meanInnings: innings / games };
  };
  const regular = extras("REGULAR_SEASON");
  const post = extras("POSTSEASON");
  assert.ok(regular.games > 200 && post.games > 200, "fixture premise: enough extra-inning games to compare");
  // Audit measurement (40,000 games): 10.43 innings with the runner, 11.21 without.
  assert.ok(post.meanInnings > regular.meanInnings + 0.4, `postseason extras ${post.meanInnings.toFixed(2)} vs regular ${regular.meanInnings.toFixed(2)}`);
});

test("postseason, zero offense: no runner is ever placed, so nobody scores — the game is unresolved, not won", () => {
  // With no automatic runner and no way on base, every half-inning is three up, three down. Under the regular-season
  // rule the runner is placed but can never advance either; either way the cap is reached tied.
  for (const ruleset of ["POSTSEASON", "REGULAR_SEASON"]) {
    const r = simulateGame(fixture({ ruleset }), new SeededRng(`zero|${ruleset}`), NO_OFFENSE(OFFICIAL_RULES_2026));
    assert.equal(r.awayRuns, 0);
    assert.equal(r.homeRuns, 0, "no fabricated run");
    assert.equal(r.innings, 30, "the inning cap still bounds the game");
    assert.equal(r.incomplete, true);
    assert.equal(sum(r.awayBatters, "runs") + sum(r.homeBatters, "runs"), 0);
  }
  // Legacy, same fixture: the published engine gave the home team the run.
  const legacy = simulateGame(fixture(), new SeededRng("zero|legacy"), NO_OFFENSE(LEGACY_RULES));
  assert.deepEqual([legacy.awayRuns, legacy.homeRuns, legacy.innings, legacy.incomplete], [0, 1, 30, undefined]);
});

test("walk-off: a non-homer ends at the winning run (margin exactly 1); a home run counts every runner", () => {
  // A strong home lineup so walk-offs are common and some are multi-run plays.
  const g = fixture({ ruleset: "REGULAR_SEASON", homeLineup: lineup(200, "BBB", 1.3, 2.3) });
  const N = 6000;
  const tally = (engine) => {
    const t = { other: 0, otherMargins: new Set(), hr: 0, hrMargins: new Set(), runsMismatch: 0 };
    for (let i = 0; i < N; i += 1) {
      const r = simulateGame(g, new SeededRng(`walkoff|${i}`), engine);
      // Every run is credited to exactly one batter: the team total and the box score agree.
      if (sum(r.homeBatters, "runs") !== r.homeRuns || sum(r.awayBatters, "runs") !== r.awayRuns) t.runsMismatch += 1;
      if (r.walkOff === "OTHER") { t.other += 1; t.otherMargins.add(r.homeRuns - r.awayRuns); }
      if (r.walkOff === "HOME_RUN") { t.hr += 1; t.hrMargins.add(r.homeRuns - r.awayRuns); }
      if (r.walkOff) assert.ok(r.innings >= 9 && r.homeRuns > r.awayRuns, "a walk-off is a home win in the 9th or later");
    }
    return t;
  };
  const official = tally(OFFICIAL);
  assert.ok(official.other > 100 && official.hr > 30, "fixture premise: both kinds of walk-off occur");
  assert.deepEqual([...official.otherMargins], [1], "a non-homer walk-off always wins by exactly one");
  assert.ok([...official.hrMargins].some((m) => m > 1), "a walk-off home run counts every runner");
  assert.ok([...official.hrMargins].every((m) => m >= 1 && m <= 4));
  assert.equal(official.runsMismatch, 0);

  // Premise: the published engine counted runners past the winning run on non-homers.
  const legacy = tally(LEGACY);
  assert.ok([...legacy.otherMargins].some((m) => m > 1), "legacy non-homer walk-offs could win by more than one");
  assert.equal(legacy.runsMismatch, 0);
});

test("every official game is a legal final: 9+ innings, no tie, the bottom of the last inning only when needed", () => {
  for (const ruleset of ["REGULAR_SEASON", "POSTSEASON"]) {
    for (let i = 0; i < 3000; i += 1) {
      const r = simulateGame(fixture({ ruleset }), new SeededRng(`legal|${ruleset}|${i}`), OFFICIAL);
      assert.notEqual(r.incomplete, true);
      assert.ok(r.innings >= 9 && r.innings <= 30);
      assert.notEqual(r.awayRuns, r.homeRuns);
      assert.equal(r.extra, r.innings > 9);
      // An away win can never be a walk-off; a home win in regulation without a walk-off means it led after 8½.
      if (r.awayRuns > r.homeRuns) assert.equal(r.walkOff, null);
    }
  }
});

test("simulateFullGame: unresolved games are discarded and counted, and a hopeless game is refused without hanging", () => {
  const started = Date.now();
  const g = simulateFullGame(fixture({ ruleset: "POSTSEASON", rulesetBasis: "GAME_TYPE" }), opts(NO_OFFENSE(OFFICIAL_RULES_2026), { runCount: 25 }));
  assert.ok(Date.now() - started < 10000, "bounded");
  assert.equal(g.status, "unavailable");
  assert.equal(g.winProbability, null, "no fabricated probability");
  assert.equal(g.runs, null);
  assert.deepEqual(g.finalScores, []);
  assert.equal(g.engineRules.discardedIncomplete, 26, "gives up after more discards than requested games");
  assert.equal(g.engineRules.id, "mlb-rules-official-2026");
  assert.match(g.gameStory[0], /could not reach a legal final/);

  // A normal game under the official rules carries its rule record and still plays N legal games.
  const ok = simulateFullGame(fixture({ ruleset: "POSTSEASON", rulesetBasis: "GAME_TYPE" }), opts(OFFICIAL));
  assert.equal(ok.status, "ready");
  assert.equal(ok.runCount, 2000);
  assert.deepEqual(ok.engineRules, { id: "mlb-rules-official-2026", ruleset: "POSTSEASON", rulesetBasis: "GAME_TYPE", discardedIncomplete: 0 });
  const histogram = ok.finalScores.reduce((s, f) => s + f.probability, 0);
  assert.ok(histogram <= 1 + 1e-9);
  assert.ok(Math.abs(ok.winProbability.home + ok.winProbability.away - 1) < 1e-9);
});

test("a game whose ruleset cannot be resolved is refused under the official rules — never assumed", () => {
  const g = simulateFullGame(fixture({ ruleset: null, rulesetBasis: "UNRESOLVED" }), opts(OFFICIAL));
  assert.equal(g.status, "unavailable");
  assert.equal(g.winProbability, null);
  assert.equal(g.engineRules.rulesetBasis, "UNRESOLVED");
  assert.match(g.gameStory[0], /regular-season or postseason/);
  // Legacy ignores the ruleset entirely (it always placed the runner) and is unchanged.
  assert.equal(simulateFullGame(fixture(), opts(LEGACY)).status, "ready");
});

test("resolveRuleset: StatsAPI gameType first, then the season calendar, else UNRESOLVED", () => {
  const cal = { regularSeasonStartDate: "2026-03-25", regularSeasonEndDate: "2026-09-27", postSeasonStartDate: "2026-09-28", postSeasonEndDate: "2026-10-31" };
  assert.deepEqual(resolveRuleset({ gameType: "R", date: "2026-10-05" }, cal), { ruleset: "REGULAR_SEASON", rulesetBasis: "GAME_TYPE" });
  for (const t of ["F", "D", "L", "W"]) {
    assert.deepEqual(resolveRuleset({ gameType: t, date: "2026-07-01" }, cal), { ruleset: "POSTSEASON", rulesetBasis: "GAME_TYPE" });
  }
  assert.deepEqual(resolveRuleset({ date: "2026-09-27" }, cal), { ruleset: "REGULAR_SEASON", rulesetBasis: "SEASON_CALENDAR" });
  assert.deepEqual(resolveRuleset({ date: "2026-09-28" }, cal), { ruleset: "POSTSEASON", rulesetBasis: "SEASON_CALENDAR" });
  // Spring training / exhibition / anything unknown is not guessed.
  assert.deepEqual(resolveRuleset({ gameType: "S", date: "2026-07-01" }, cal), { ruleset: null, rulesetBasis: "UNRESOLVED" });
  assert.deepEqual(resolveRuleset({ date: "2026-03-01" }, cal), { ruleset: null, rulesetBasis: "UNRESOLVED" });
  assert.deepEqual(resolveRuleset({ date: "2026-07-01" }, null), { ruleset: null, rulesetBasis: "UNRESOLVED" });
});
