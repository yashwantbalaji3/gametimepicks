import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadModelQualifiedProps,
  modelQualifies,
  PROP_MARKET_COLUMNS,
  QUALIFY_ODDS_MIN,
  QUALIFY_ODDS_MAX,
} from "./world-cup/model-qualified-props.ts";
import { buildWcPlayerLegs } from "./build-legs.ts";
import { loadWorldCupProjections, loadWorldCupPlayerProjections } from "./world-cup/projections.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z"; // before every June-23 kickoff

const res = loadModelQualifiedProps(root, NOW, DATE);

test("model-qualified filter surfaces a small curated set, NOT raw sportsbook inventory", () => {
  assert.equal(res.evaluatedCount, 168, "all 168 sportsbook prop markets are evaluated");
  assert.ok(res.qualifiedCount > 0, "some props qualify");
  assert.ok(res.qualifiedCount < res.evaluatedCount * 0.25, "far fewer picks than inventory (real filter, not a passthrough)");
});

test("matrix is grouped by game with one cell per market column", () => {
  assert.ok(res.games.length >= 1, "games present");
  for (const g of res.games) {
    assert.ok(g.matchup.includes(" vs "), "each row is a game");
    for (const c of PROP_MARKET_COLUMNS) {
      assert.ok(c.key in g.cells, `cell exists for ${c.key}`);
      const cell = g.cells[c.key];
      if (cell) assert.equal(cell.isModelPick, true, "a populated cell is a model pick");
    }
  }
});

test("matrix has the required market columns (anytime GS, SOT, assists, shots, cards)", () => {
  const keys = PROP_MARKET_COLUMNS.map((c) => c.key);
  for (const k of ["anytime_goalscorer", "shots_on_target", "assists", "shots", "cards"]) {
    assert.ok(keys.includes(k), `column ${k} present`);
  }
});

test("Cards is not a posted market → it never qualifies a pick (No model-qualified pick)", () => {
  for (const g of res.games) assert.equal(g.cells.cards, null, "cards cell is always empty (market not offered)");
});

test("at least one (game × market) cell is empty → renders as No model-qualified pick", () => {
  const anyEmpty = res.games.some((g) => PROP_MARKET_COLUMNS.some((c) => c.sourceMarket && g.cells[c.key] === null));
  assert.ok(anyEmpty, "some market cells have no qualifying pick");
});

test("every model-qualified pick is odds-backed, has a provider, and is within the addable odds window", () => {
  for (const g of res.games) for (const c of PROP_MARKET_COLUMNS) {
    const cell = g.cells[c.key];
    if (!cell) continue;
    assert.equal(typeof cell.odds, "number", `${cell.player} has real odds`);
    assert.ok(cell.odds >= QUALIFY_ODDS_MIN && cell.odds <= QUALIFY_ODDS_MAX, `${cell.player} ${cell.odds} within [${QUALIFY_ODDS_MIN}, ${QUALIFY_ODDS_MAX}]`);
    assert.ok(cell.provider, `${cell.player} has a provider`);
    assert.equal(cell.marketKey, c.key, "pick is in the right column");
  }
});

test("pre-event guard: after every kickoff, nothing qualifies (no started game shown as a new pick)", () => {
  const started = loadModelQualifiedProps(root, "2026-06-25T00:00:00Z", DATE);
  assert.equal(started.qualifiedCount, 0, "0 qualified once all games have started");
  for (const g of started.games) assert.equal(g.started, true, "all games flagged started");
});

test("modelQualifies predicate: rejects ineligible role, out-of-range odds, below-floor probability, missing provider", () => {
  const good = { market: "player_goal_scorer_anytime", americanOdds: -150, bookmaker: "draftkings", modelProbability: 0.6 };
  assert.equal(modelQualifies(good, true), true, "a role-eligible, in-range, above-floor, provider-backed prop qualifies");
  assert.equal(modelQualifies(good, false), false, "role-ineligible (GK/bench/defender) → excluded");
  assert.equal(modelQualifies({ ...good, americanOdds: -900 }, true), false, "shorter than -500 → excluded");
  assert.equal(modelQualifies({ ...good, americanOdds: 900 }, true), false, "longer than +400 → excluded (longshot lane, not addable)");
  assert.equal(modelQualifies({ ...good, modelProbability: 0.2 }, true), false, "below the market probability floor → excluded");
  assert.equal(modelQualifies({ ...good, bookmaker: null }, true), false, "no provider → not odds-backed → excluded");
  assert.equal(modelQualifies({ ...good, market: "player_cards" }, true), false, "market not settlement-supported → excluded");
});

test("/build leg pool defaults to model-qualified WC player legs (raw inventory excluded)", () => {
  const legs = buildWcPlayerLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections(), NOW);
  assert.ok(legs.length > 0, "some model-qualified build legs");
  assert.ok(legs.length < 168, "far fewer than the 168 raw props (inventory filtered out)");
  for (const l of legs) assert.ok(l.americanOdds >= QUALIFY_ODDS_MIN && l.americanOdds <= QUALIFY_ODDS_MAX, `${l.label} ${l.americanOdds} within addable window`);
});

test("/world-cup page surfaces model-only props + counts, and demotes raw inventory honestly", () => {
  const page = read("src/app/world-cup/page.tsx");
  assert.match(page, /Model Player Prop Picks/, "headline names the model-only board");
  assert.match(page, /ModelPlayerPropsMatrix/, "page renders the matrix");
  assert.match(page, /Available sportsbook markets — not model recommendations/, "raw inventory is labelled NOT recommendations");
  const matrix = read("src/components/world-cup/model-player-props-matrix.tsx");
  assert.match(matrix, /sportsbook prop markets evaluated/, "shows evaluated count");
  assert.match(matrix, /model-qualified player-prop/, "shows model-qualified pick count");
  assert.match(matrix, /No model-qualified pick/, "empty cells say No model-qualified pick");
});

test("/build copy states the pool is model-qualified only", () => {
  assert.match(read("src/app/build/page.tsx"), /model-qualified legs only/, "build note states model-qualified default");
});

test("/today shows the June 23 readiness strip incl. Model Player Props", () => {
  const today = read("src/app/today/page.tsx");
  assert.match(today, /what&apos;s live/, "readiness strip heading present");
  assert.match(today, /Model Player Props/, "model player props module present");
  assert.match(today, /loadModelQualifiedProps/, "today reads model-qualified prop counts");
});

test("settlement state intact: Lane A + Lane B WON, bankroll + crown unchanged, lanes separate", () => {
  const dual = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json"));
  assert.equal(dual.run.laneB.laneStatus, "advanced", "Lane B advanced (Step 1 WON)");
  assert.equal(dual.run.laneA.laneStatus, "advanced", "Lane A advanced (Step 3 settled WON, Algeria final)");
  const laneAPending = dual.run.laneA.steps.some((s) => s.status === "pending");
  assert.ok(!laneAPending, "Lane A has no pending step — Step 3 settled WON (Algeria final)");
  const laneAStep3 = dual.run.laneA.steps.find((s) => s.step === 3);
  assert.equal(laneAStep3.status, "settled", "Lane A Step 3 settled");
  assert.equal(laneAStep3.result, "won", "Lane A Step 3 settled WON");
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.currentBankroll, 10176.17, "active bankroll unchanged");
  assert.equal(p.crownBankroll, 10376.17, "crown untouched");
  assert.equal(p.openExposure, 0, "core exposure $0 (Lane A + Lane B settled WON)");
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 }, "core record 12-2-0-0");
  assert.equal(p.moonshot.exposure, 0, "moonshot exposure separate ($0)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate (0-1)");
});
