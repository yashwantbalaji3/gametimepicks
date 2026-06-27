import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadWorldCupModelPicks,
  buildDailyLaneCandidates,
  buildModelPicksTable,
  MODEL_PICKS_TABLE_COLUMNS,
} from "./world-cup/model-qualified-picks.ts";
import { buildDailyPortfolio } from "./mr-dub/daily-portfolio.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z"; // before every June-23 kickoff
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

const pool = loadWorldCupModelPicks(root, NOW, DATE);

test("unified model-pick pool: team + player legs, all pre-event, odds-backed, within window", () => {
  assert.ok(pool.length > 0, "pool has picks");
  const cats = new Set(pool.map((p) => p.category));
  assert.ok(cats.has("player"), "includes player picks");
  assert.ok(cats.has("team") || cats.has("total_btts"), "includes team/total markets");
  for (const p of pool) {
    assert.ok(typeof p.odds === "number" && p.odds >= -500 && p.odds <= 2000, `${p.selection} ${p.odds} within window (no leg < -500)`);
    assert.ok(p.provider, `${p.selection} has a provider (odds-backed)`);
    assert.ok(p.kickoffUtc && p.kickoffUtc > NOW, `${p.selection} pre-event`);
    assert.ok(p.modelProbability >= 0, "has model probability");
  }
});

test("pre-event guard: no picks once all games have started", () => {
  const after = loadWorldCupModelPicks(root, "2026-06-25T00:00:00Z", DATE);
  assert.equal(after.length, 0, "0 picks after every kickoff (no started game as a new pick)");
});

test("lane candidates: Bank Builder A/B = 2 high-hit-rate legs (≤+400), max 1 game each; honest combined odds", () => {
  const lanes = buildDailyLaneCandidates(pool, DATE);
  for (const lane of [lanes.bankBuilderA, lanes.bankBuilderB]) {
    assert.equal(lane.product, "bank-builder");
    assert.equal(lane.status, "candidate");
    assert.ok(lane.legs.length <= 2, "≤2 legs");
    assert.equal(new Set(lane.legs.map((l) => l.gameId)).size, lane.legs.length, "max 1 leg per game (Bank Builder)");
    for (const l of lane.legs) assert.ok(l.odds <= 400, `${l.selection} is not a longshot (≤ +400)`);
    if (lane.legs.length) {
      const d = lane.legs.reduce((p, l) => p * dec(l.odds), 1);
      assert.ok(Math.abs(decToAmerican(d) - lane.combinedOdds) <= 2, "combined odds reconcile from leg odds (no fabricated price)");
    }
  }
});

test("lane candidates: Moonshot A/B = up to 5 higher-upside legs; 2nd leg per game is flagged (correlation disclosed)", () => {
  const lanes = buildDailyLaneCandidates(pool, DATE);
  for (const lane of [lanes.moonshotA, lanes.moonshotB]) {
    assert.equal(lane.product, "moonshot");
    assert.equal(lane.status, "candidate");
    assert.ok(lane.legs.length <= 5, "≤5 legs");
    const games = lane.legs.map((l) => l.gameId);
    const hasSecondPerGame = new Set(games).size < games.length;
    if (hasSecondPerGame) assert.ok(lane.correlationNote, "a 2nd leg from a game must carry a correlation note");
    if (lane.legs.length) {
      const d = lane.legs.reduce((p, l) => p * dec(l.odds), 1);
      assert.ok(Math.abs(decToAmerican(d) - lane.combinedOdds) <= 3, "combined odds reconcile from leg odds");
      assert.ok(Math.abs(lane.potentialReturn - lane.stake * d) < 0.5, "potential return = stake × combined decimal");
    }
  }
});

test("no leg is duplicated across the four lanes (each model leg used once)", () => {
  const lanes = buildDailyLaneCandidates(pool, DATE);
  const all = [...lanes.bankBuilderA.legs, ...lanes.bankBuilderB.legs, ...lanes.moonshotA.legs, ...lanes.moonshotB.legs].map((l) => l.id);
  assert.equal(new Set(all).size, all.length, "no leg reused across lanes");
});

test("daily portfolio: 4 candidate lanes, $0 exposure (post-settlement — no qualified card placed), crown separate", () => {
  const dp = buildDailyPortfolio(root, NOW, DATE);
  assert.equal(dp.cards.length, 4, "Bank Builder A/B + Moonshot A/B");
  assert.deepEqual(dp.cards.map((c) => `${c.product}:${c.lane}`).sort(), ["bank-builder:A", "bank-builder:B", "moonshot:A", "moonshot:B"]);
  // June-23's lanes settled and the ladder advanced; for a day with no qualified card the lanes are
  // candidates with $0 placed (the activation math is exercised in bank-builder-moonshot-activation).
  for (const c of dp.cards) assert.notEqual(c.status, "active", `${c.id} not active (no qualified card placed)`);
  assert.equal(dp.openExposure, 0, "open exposure $0 (no active lanes)");
  assert.equal(dp.exposure.core, 0, "core exposure $0");
  assert.equal(dp.exposure.moonshot, 0, "moonshot exposure $0");
  assert.equal(dp.activeBankroll, 19965.40, "active bankroll = portfolio.currentBankroll (after June-26 Lane A Step-2 loss)");
  assert.equal(dp.availableBankroll, 19965.40, "available = active − exposure ($0)");
  assert.equal(dp.crownBankroll, 20465.40, "crown reported separately, unchanged");
});

test("daily portfolio NEVER mutates money state: portfolio.json bankroll/crown/exposure/record intact", () => {
  buildDailyPortfolio(root, NOW, DATE); // read-only
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Canonical money reflects banking Ladder #2 ($10,089.23) and the June-26 settlement: crown 20465.40 (Σ of
  // the two completed-ladder finals, unchanged) and bankroll = crown − $500 realized dual-lane losses = 19965.40;
  // record advanced to 15-5-0-0 (Lane A Step-2 LOST, Lane B Step-1 WON June-26). The read-only daily portfolio
  // must never mutate it.
  assert.equal(p.currentBankroll, 19965.40, "active bankroll = post-June-26 value");
  assert.equal(p.crownBankroll, 20465.40, "crown = Σ of two completed-ladder finals");
  assert.equal(p.openExposure, 0, "core exposure $0");
  assert.deepEqual(p.record, { wins: 15, losses: 5, voids: 0, pending: 0 }, "record 15-5-0-0");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate");
});

test("model picks table: grouped by game, has team + total/BTTS + player columns; cards column always empty", () => {
  const t = buildModelPicksTable(pool);
  assert.ok(t.rows.length >= 1, "rows present");
  const keys = MODEL_PICKS_TABLE_COLUMNS.map((c) => c.key);
  for (const k of ["team", "total_btts", "anytime_goalscorer", "shots_on_target", "assists", "shots", "cards", "best_addable"]) assert.ok(keys.includes(k), `column ${k}`);
  for (const r of t.rows) {
    assert.ok(r.matchup.includes(" vs "), "row is a game");
    assert.equal(r.cells.cards, null, "cards is never a model-qualified pick (market not offered)");
    for (const k of keys) { const c = r.cells[k]; if (c) assert.equal(typeof c.odds, "number", "populated cell is a real model pick"); }
  }
});

test("/world-cup leads with a Model Picks tab; /mr-dub shows the daily portfolio", () => {
  const wc = read("src/app/world-cup/page.tsx");
  assert.match(wc, /ModelPicksTable/, "world-cup renders the model picks table");
  assert.match(wc, /key: "model-picks"/, "world-cup registers a model-picks tab");
  const md = read("src/app/mr-dub/page.tsx");
  assert.match(md, /DailyPortfolioSection/, "mr-dub renders the daily portfolio");
  assert.match(md, /buildDailyPortfolio/, "mr-dub builds the daily portfolio");
});

test("World Cup Specials is a PERMANENT tracked product with a durable ledger ($20×5/day, archived)", () => {
  const page = read("src/app/world-cup-specials/page.tsx");
  assert.match(page, /Today's Suggested World Cup Parlays|Today&apos;s Suggested World Cup Parlays/, "page keeps the suggested-parlays title");
  // Reframed from "merged, not a separate product" → a permanent paper product with its own ledger.
  assert.match(page, /permanent paper product/i, "positions it as a permanent product");
  assert.match(page, /SpecialsLedgerSection/, "renders the durable ledger (record/ROI/P&L/win-rate)");
  assert.match(page, /buildSpecialsLedger/, "builds the ledger from archived history");
  const today = read("src/app/today/page.tsx");
  assert.match(today, /Today's paper portfolio|Today&apos;s paper portfolio/, "today shows the daily portfolio");
});
