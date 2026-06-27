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
  // These loaders read the *current* slate (latest.json). The current June 24 slate has no soccer
  // player-prop markets (The Odds API offers none for the World Cup), so the model-qualified build pool
  // is honestly empty — fail-closed, never a passthrough of raw inventory. The invariants still hold:
  // the pool never exceeds raw inventory, and any leg that DOES surface must sit in the addable window.
  const legs = buildWcPlayerLegs(loadWorldCupProjections(), loadWorldCupPlayerProjections(), NOW);
  assert.ok(legs.length < 168, "never more than the 168 raw props (inventory filtered out, not passed through)");
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

test("2nd ladder BANKED: Lane A's completed $10k ladder is archived/banked, live lanes are a fresh cycle-2, bankroll + crown reconcile, lanes separate", () => {
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
  // The LIVE dual artifact is a fresh cycle-3 (banking does not leave a completed ladder sitting in the live run);
  // cycle 3 = the push for a third $100→$10K ladder after #1 (crown) and #2 (Lane A) were banked.
  const live = JSON.parse(read("public/data/methodology/launch/dual-bank-builder-active.json"));
  assert.equal(live.run.laneA.cycle, 3, "live Lane A is cycle 3 ($100 start after banking the 2nd ladder)");
  // June-26 settlement: Lane A Step 1 WON (June 25) then Step 2 LOST (June 26) → lane STOPPED.
  assert.equal(live.run.laneA.laneStatus, "stopped", "live Lane A stopped — Step 2 settled LOST June 26 (Cape Verde 0-0 BTTS Yes missed)");
  const liveAStep1 = live.run.laneA.steps.find((s) => s.step === 1);
  assert.equal(liveAStep1.status, "settled", "live Lane A Step 1 settled");
  assert.equal(liveAStep1.result, "won", "live Lane A Step 1 settled WON (June 25)");
  const liveAStep2 = live.run.laneA.steps.find((s) => s.step === 2);
  assert.equal(liveAStep2.status, "settled", "live Lane A Step 2 settled");
  assert.equal(liveAStep2.result, "lost", "live Lane A Step 2 settled LOST (June 26 — lane stopped)");
  // Lane B's cycle-3 Step 1 settled WON June-26 → lane ADVANCED to Step 2; priorLane preserves the
  // June-25 LOST step from the prior restart.
  assert.equal(live.run.laneB.laneStatus, "advanced", "live Lane B advanced — Step 1 settled WON June 26");
  const liveBStep1 = live.run.laneB.steps.find((s) => s.step === 1);
  assert.equal(liveBStep1.status, "settled", "live Lane B Step 1 settled");
  assert.equal(liveBStep1.result, "won", "live Lane B Step 1 settled WON (June 26 — Egypt or Draw + France)");
  const priorBStep1 = live.run.laneB.priorLane.steps.find((s) => s.step === 1);
  assert.equal(priorBStep1.status, "settled", "live Lane B priorLane Step 1 settled");
  assert.equal(priorBStep1.result, "lost", "live Lane B priorLane Step 1 settled LOST (June 25)");
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Cumulative-crown: crown = Σ two banked finals; active bankroll = crown − $500 five real lost seeds.
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two banked $100→$10k ladder finals (immutable, append-only)");
  assert.equal(p.currentBankroll, 19965.4, "active bankroll = crown − $500 five real lost seeds");
  assert.equal(p.openExposure, 0, "canonical portfolio.json open exposure $0 (settled rungs released; live Step cards tracked in daily-portfolio, not portfolio.json)");
  assert.deepEqual(p.record, { wins: 15, losses: 5, voids: 0, pending: 0 }, "core record 15-5-0-0 (banking is not a bet)");
  assert.equal(p.moonshot.exposure, 0, "moonshot exposure separate ($0)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate (0-1)");
});
