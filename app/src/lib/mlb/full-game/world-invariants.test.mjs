/**
 * MLB-005 · coherent worlds: every simulated game must reconcile (score, runs, RBI, outs, lineup order, batter and
 * starter lines, ending, extras, workload). Research only; nothing public reads the observer or these checks.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/world-invariants.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SeededRng } from "../../game-simulations/rng.ts";
import { DEFAULT_ENGINE_PARAMS, LEGACY_RULES, OFFICIAL_RULES_2026, automaticRunnerApplies, simulateGame } from "./engine.ts";
import { buildPaOutcome } from "./plate-appearance.ts";
import { checkWorld, worldFingerprint } from "./world-invariants.mjs";

const mkBatter = (id, team, eh, etb) => ({ playerId: id, name: `B${id}`, team, expHits: eh, expTotalBases: etb, expHrr: eh * 2.2 });
const lineup = (base, team, eh = 0.9, etb = 1.45) => Array.from({ length: 9 }, (_, i) => mkBatter(base + i, team, eh + (i % 3) * 0.1, etb + (i % 4) * 0.15));
const fixture = (over = {}) => ({
  gamePk: 999201, date: "2026-07-05", slug: "aaa-vs-bbb", awayTeam: "AAA", homeTeam: "BBB", awayTeamName: "A", homeTeamName: "B",
  venue: "Test Park", firstPitch: "2026-07-05T20:00:00Z", awayLineup: lineup(100, "AAA"), homeLineup: lineup(200, "BBB"),
  awayStarter: { playerId: 1, name: "SP A", team: "AAA", expStrikeouts: 5.5 }, homeStarter: { playerId: 2, name: "SP B", team: "BBB", expStrikeouts: 4.5 },
  completeness: { level: "ready", notes: [], awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: [] },
  market: null, ruleset: "REGULAR_SEASON", rulesetBasis: "GAME_TYPE", ...over,
});
const OFFICIAL = { ...DEFAULT_ENGINE_PARAMS, rules: OFFICIAL_RULES_2026 };
const LEGACY = { ...DEFAULT_ENGINE_PARAMS, rules: LEGACY_RULES };
/** A higher-offense engine with every research advancement mechanism on, to exercise rare paths (DP, free advance, ROE). */
const BUSY = (rules) => ({
  ...DEFAULT_ENGINE_PARAMS, rules,
  league: { ...DEFAULT_ENGINE_PARAMS.league, REACH_ON_ERROR_RATE: 0.012 },
  advancement: { ...DEFAULT_ENGINE_PARAMS.advancement, groundIntoDoublePlay: 0.12, freeAdvance: 0.02 },
});

function world(game, params, seed) {
  const events = [];
  const result = simulateGame(game, new SeededRng(seed), params, (e) => events.push(e));
  return { result, events };
}
function sweep(game, params, n, tag) {
  const auto = automaticRunnerApplies(params.rules ?? LEGACY_RULES, game.ruleset);
  const bad = [];
  let extras = 0; let walkOffs = 0; let incomplete = 0;
  for (let i = 0; i < n; i += 1) {
    const { result, events } = world(game, params, `${tag}|${i}`);
    if (result.extra) extras += 1;
    if (result.walkOff) walkOffs += 1;
    if (result.incomplete) { incomplete += 1; continue; }
    const v = checkWorld({ game, result, events, rules: params.rules, automaticRunner: auto });
    if (v.length) bad.push({ i, v: v.slice(0, 3) });
  }
  return { bad, extras, walkOffs, incomplete };
}

test("official rules, regular season: every world is coherent (3,000 games, extras and walk-offs exercised)", () => {
  const r = sweep(fixture(), OFFICIAL, 3000, "reg");
  assert.deepEqual(r.bad, []);
  assert.ok(r.extras > 100 && r.walkOffs > 100, JSON.stringify(r));
});

test("official rules, postseason: no automatic runner, every world coherent", () => {
  const r = sweep(fixture({ ruleset: "POSTSEASON" }), OFFICIAL, 3000, "post");
  assert.deepEqual(r.bad, []);
  assert.ok(r.extras > 100, JSON.stringify(r));
});

test("every research advancement path (double plays, free advances, errors) stays coherent", () => {
  for (const ruleset of ["REGULAR_SEASON", "POSTSEASON"]) {
    const r = sweep(fixture({ ruleset }), BUSY(OFFICIAL_RULES_2026), 2000, `busy-${ruleset}`);
    assert.deepEqual(r.bad, [], ruleset);
  }
});

test("explicit per-batter PA distributions and a drawn starter workload stay coherent; workload honoured", () => {
  const pa = (eh, k) => ({ vsStarter: buildPaOutcome({ expHits: eh, expTotalBases: eh * 1.6, pitcherKRate: k }), vsBullpen: buildPaOutcome({ expHits: eh, expTotalBases: eh * 1.6, pitcherKRate: 0.24 }) });
  const withPa = (l) => l.map((b, i) => ({ ...b, pa: pa(0.8 + (i % 3) * 0.15, 0.18 + (i % 2) * 0.06) }));
  const pmf = Array.from({ length: 31 }, (_, bf) => (bf >= 12 && bf <= 28 ? 1 : 0)); const z = pmf.reduce((a, b) => a + b, 0);
  const g = fixture({ awayLineup: withPa(lineup(100, "AAA")), homeLineup: withPa(lineup(200, "BBB")), awayStarter: { ...fixture().awayStarter, bfLimitPmf: pmf.map((x) => x / z) }, homeStarter: { ...fixture().homeStarter, bfLimitPmf: pmf.map((x) => x / z) } });
  const params = { ...OFFICIAL, research: { explicitPa: true, workloadPmf: true } };
  const r = sweep(g, params, 2000, "explicit");
  assert.deepEqual(r.bad, []);
  // The drawn limit is honoured: no starter ever faces more than 28.
  let maxBf = 0;
  for (let i = 0; i < 500; i += 1) { const { result } = world(g, params, `wl|${i}`); maxBf = Math.max(maxBf, result.awayStarter.battersFaced, result.homeStarter.battersFaced); }
  assert.ok(maxBf <= 28, `max BF ${maxBf}`);
});

test("research modes fail closed: a batter without a PA distribution, or a starter without a workload, is refused", () => {
  assert.throws(() => simulateGame(fixture(), new SeededRng("x"), { ...OFFICIAL, research: { explicitPa: true } }), /explicitPa/);
  assert.throws(() => simulateGame(fixture(), new SeededRng("x"), { ...OFFICIAL, research: { workloadPmf: true } }), /workloadPmf/);
});

test("the observer changes nothing: same seed, same result with or without it (published and official rules)", () => {
  for (const params of [DEFAULT_ENGINE_PARAMS, OFFICIAL]) {
    for (let i = 0; i < 200; i += 1) {
      const plain = simulateGame(fixture(), new SeededRng(`obs|${i}`), params);
      const { result } = world(fixture(), params, `obs|${i}`);
      assert.deepEqual(result, plain);
    }
  }
});

test("reproducible: the same seed and inputs give the same world fingerprint; a different seed does not", () => {
  const a = world(fixture(), OFFICIAL, "repro|1"); const b = world(fixture(), OFFICIAL, "repro|1"); const c = world(fixture(), OFFICIAL, "repro|2");
  assert.equal(worldFingerprint(a.result, a.events), worldFingerprint(b.result, b.events));
  assert.notEqual(worldFingerprint(a.result, a.events), worldFingerprint(c.result, c.events));
});

test("the checker catches what it claims to (mutation probes)", () => {
  const g = fixture();
  let w = null;
  for (let i = 0; i < 400 && !w; i += 1) { const x = world(g, OFFICIAL, `mut|${i}`); if (x.result.awayRuns >= 2 && x.events.some((e) => e.kind === "PA" && e.scored.length && e.rbi)) w = x; }
  assert.ok(w);
  const ok = (r, ev) => checkWorld({ game: g, result: r, events: ev, rules: OFFICIAL.rules, automaticRunner: true });
  assert.deepEqual(ok(w.result, w.events), []);
  const clone = () => JSON.parse(JSON.stringify(w));
  // 1. a fabricated run on the scoreboard (the legacy safety-cap award)
  let m = clone(); m.result.homeRuns += 1; assert.ok(ok(m.result, m.events).some((x) => /score/.test(x)));
  // 2. an RBI with no run
  m = clone(); m.result.awayBatters[0].rbi += 1; assert.ok(ok(m.result, m.events).length > 0);
  // 3. a runner who scores without being on base
  m = clone(); const pa = m.events.find((e) => e.kind === "PA" && e.outcome === "single"); pa.scored.push(pa.batterSlot); assert.ok(ok(m.result, m.events).some((x) => /without being on base/.test(x)));
  // 4. lineup order broken
  m = clone(); const pas = m.events.filter((e) => e.kind === "PA" && e.half === "TOP"); pas[3].batterSlot = (pas[3].batterSlot + 2) % 9; assert.ok(ok(m.result, m.events).some((x) => /batted after/.test(x)));
  // 5. a starter's strikeouts not matching his batters
  m = clone(); m.result.homeStarter.strikeouts += 1; assert.ok(ok(m.result, m.events).some((x) => /strikeouts/.test(x)));
  // 6. a half-inning that ends on two outs without a walk-off
  m = clone(); const end = m.events.find((e) => e.kind === "HALF_END" && e.half === "TOP"); end.outs = 2; assert.ok(ok(m.result, m.events).length > 0);
});

test("legacy rules are detectably incoherent at the inning cap: the awarded run belongs to no batter", () => {
  // An offense that never reaches base reaches the cap every game; legacy hands the home team a run no one scored.
  const NO_OFFENSE = (rules) => ({ ...DEFAULT_ENGINE_PARAMS, rules, league: { ...DEFAULT_ENGINE_PARAMS.league, MIN_HIT_RATE: 0, MAX_HIT_RATE: 0, WALK_RATE: 0, REACH_ON_ERROR_RATE: 0 }, advancement: { ...DEFAULT_ENGINE_PARAMS.advancement, productiveOutScoresFromThird: 0, freeAdvance: 0 } });
  const g = fixture({ awayLineup: lineup(100, "AAA", 0, 0), homeLineup: lineup(200, "BBB", 0, 0), ruleset: "POSTSEASON" });
  const leg = world(g, NO_OFFENSE(LEGACY_RULES), "cap|1");
  assert.equal(leg.result.homeRuns, 1);
  assert.ok(checkWorld({ game: g, result: leg.result, events: leg.events, rules: LEGACY_RULES, automaticRunner: true }).some((x) => /score 1 ≠ Σ batter runs 0/.test(x)));
  const off = world(g, NO_OFFENSE(OFFICIAL_RULES_2026), "cap|1");
  assert.equal(off.result.incomplete, true); // reported, never awarded
});
