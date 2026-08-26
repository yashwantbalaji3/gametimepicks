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
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const read = (p) => fs.readFileSync(p, "utf8");
const root = pinnedLaneRoot();
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z"; // before every June-23 kickoff

const res = loadModelQualifiedProps(root, NOW, DATE);

// The two page-mount assertions that lived here (the /world-cup surface rendering the matrix with
// live counts) retired with the tournament — /world-cup is a closed destination. The tests below pin
// the model-qualified POLICY itself, which outlives any one surface: props qualify only through
// modelQualifies, and raw sportsbook inventory is never presented as a recommendation.
// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
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
  // These loaders read the *current* slate (latest.json). The current June 24 slate has no soccer
  // player-prop markets (The Odds API offers none for the World Cup), so the model-qualified build pool
  // is honestly empty — fail-closed, never a passthrough of raw inventory. The invariants still hold:
  // the pool never exceeds raw inventory, and any leg that DOES surface must sit in the addable window.
  const legs = buildWcPlayerLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections(), NOW);
  assert.ok(legs.length < 168, "never more than the 168 raw props (inventory filtered out, not passed through)");
  for (const l of legs) assert.ok(l.americanOdds >= QUALIFY_ODDS_MIN && l.americanOdds <= QUALIFY_ODDS_MAX, `${l.label} ${l.americanOdds} within addable window`);
});

test("the builder's copy states the pool is model-qualified only", () => {
  // P208: the builder is the Parlay Center's Build Your Own mode at /build/custom.
  assert.match(read("src/app/build/custom/page.tsx"), /model-qualified/, "builder note states the model-qualified default");
});

test("2nd ladder BANKED: Lane A's completed $10k ladder is archived/banked, live lanes are a fresh forward cycle, bankroll + crown reconcile, lanes separate", () => {
  // The completed cycle-1 dual run was archived when Lane A's $100→$10k ladder was BANKED. Its final state is
  // preserved there: Lane A completed (Step 5 WON → $10,089.23), Lane B stopped (Step 3 LOST on Under 2.5).
  const banked = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json"));
  assert.equal(banked.run.laneB.laneStatus, "stopped", "banked Lane B stopped (Step 3 settled LOST on Under 2.5)");
  const laneBStep3 = banked.run.laneB.steps.find((s) => s.step === 3);
  assert.equal(laneBStep3.status, "settled", "Lane B Step 3 settled");
  assert.equal(laneBStep3.result, "lost", "Lane B Step 3 settled LOST");
  assert.equal(banked.run.laneA.laneStatus, "completed", "banked Lane A completed the ladder (Step 5 settled WON)");
  const laneAPending = banked.run.laneA.steps.some((s) => s.status === "pending");
  assert.ok(!laneAPending, "banked Lane A has no pending step — every step settled WON");
  const laneAStep5 = banked.run.laneA.steps.find((s) => s.step === 5);
  assert.equal(laneAStep5.status, "settled", "Lane A Step 5 settled");
  assert.equal(laneAStep5.result, "won", "Lane A Step 5 settled WON");
  assert.ok(Math.abs(laneAStep5.payout - 10089.23) < 0.5, "Lane A Step 5 reached $10,089.23");
  // The LIVE dual artifact is a fresh forward cycle. After #1 (crown) and #2 (Lane A) were banked, the cycle ran
  // through the July settlements, then the July-21 REVIEW RESTART reset BOTH lanes to fresh Step-1 review cycles
  // (paper, $0 — MLB pitcher-strikeout review cards). Lane A = cycle 9 active; Lane B = cycle 8 active. The advanced
  // July-6/July-7 cycle (8, Steps 1 & 2 WON) moved one level down into Lane A's priorLane; the July-5 loss (cycle 7)
  // and the July-1→July-3 cycle (6) sit deeper. Banking does not leave a completed ladder sitting in the live run.
  const live = JSON.parse(read(path.join(pinnedLaneRoot(), "methodology/launch/dual-bank-builder-active.json")));
  assert.equal(live.run.laneA.cycle, 9, "live Lane A is cycle 9 (fresh Step-1 review restart, July-21)");
  assert.equal(live.run.laneA.laneStatus, "active", "live Lane A active (fresh Step-1 review)");
  const liveAStep1 = live.run.laneA.steps.find((s) => s.step === 1);
  assert.equal(liveAStep1.status, "active", "live Lane A Step 1 is the fresh review (not a settled rung)");
  assert.equal(liveAStep1.result ?? null, null, "live Lane A Step 1 is unsettled (review card, no result)");
  // The ADVANCED July-6/July-7 cycle (8, Steps 1 & 2 WON) is preserved one level down.
  const priorA = live.run.laneA.priorLane;
  assert.equal(priorA.cycle, 8, "Lane A priorLane is cycle 8 (the advanced July-6/July-7 cycle)");
  assert.equal(priorA.laneStatus, "advanced", "Lane A priorLane (cycle 8) advanced — Steps 1 & 2 settled WON");
  const priorAStep1 = priorA.steps.find((s) => s.step === 1);
  assert.equal(priorAStep1.status, "settled", "Lane A cycle-8 Step 1 settled");
  assert.equal(priorAStep1.result, "won", "Lane A cycle-8 Step 1 settled WON (July-6)");
  // Two levels down is the July-5 LOST cycle (7, stopped); the July-1→July-3 cycle (6) sits one deeper.
  const deeperA = priorA.priorLane;
  assert.equal(deeperA.cycle, 7, "Lane A cycle 7 (July-5 loss) two levels down");
  assert.equal(deeperA.steps.find((s) => s.step === 1).result, "lost", "Lane A cycle-7 Step 1 settled LOST (July-5, one level deeper)");
  // Lane B RESTARTED to a fresh Step-1 review (cycle 8); its July-5 LOSS (cycle 7) and July-3 LOSS (cycle 6) sit in priorLane.
  assert.equal(live.run.laneB.cycle, 8, "live Lane B is cycle 8 (fresh Step-1 review restart, July-21)");
  assert.equal(live.run.laneB.laneStatus, "active", "live Lane B active (fresh Step-1 review)");
  const liveBStep1 = live.run.laneB.steps.find((s) => s.step === 1);
  assert.equal(liveBStep1.status, "active", "live Lane B Step 1 is the fresh review (not settled)");
  assert.equal(liveBStep1.result ?? null, null, "live Lane B Step 1 is unsettled (review card, no result)");
  const priorBStep1 = live.run.laneB.priorLane.steps.find((s) => s.step === 1);
  assert.equal(priorBStep1.status, "settled", "Lane B priorLane (cycle 7) Step 1 settled");
  assert.equal(priorBStep1.result, "lost", "Lane B cycle-7 Step 1 settled LOST (July-5, one level down)");
  const deeperBStep1 = live.run.laneB.priorLane.priorLane.steps.find((s) => s.step === 1);
  assert.equal(deeperBStep1.status, "settled", "Lane B deeper priorLane Step 1 settled");
  assert.equal(deeperBStep1.result, "lost", "Lane B deeper priorLane Step 1 settled LOST (July-3, one level deeper)");
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Cumulative-crown: crown = Σ two banked finals; active bankroll = crown − $1400 fourteen real lost seeds.
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two banked $100→$10k ladder finals (immutable, append-only)");
  assert.equal(p.currentBankroll, 19065.4, "active bankroll = crown − $1400 fourteen real lost seeds");
  assert.equal(p.openExposure, 0, "canonical portfolio.json open exposure $0 (settled rungs released; awaiting a fresh slate)");
  assert.deepEqual(p.record, { wins: 19, losses: 14, voids: 0, pending: 0 }, "core record 19-14-0-0 (Lane A won its July-6 cycle-8 Step-1 and July-7 Step-2)");
  assert.equal(p.moonshot.exposure, 0, "moonshot exposure separate ($0)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate (0-1)");
});
