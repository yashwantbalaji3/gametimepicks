import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  loadWorldCupModelPicks,
  buildDailyLaneCandidates,
  buildModelPicksTable,
  MODEL_PICKS_TABLE_COLUMNS,
  MOONSHOT_MIN_COMBINED_ODDS,
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

test("lane candidates: Moonshot A/B = STRUCTURED team-market lanes (result + total per game), no player props, combined odds clear +700; same-game pairs disclose correlation", () => {
  const lanes = buildDailyLaneCandidates(pool, DATE);
  for (const lane of [lanes.moonshotA, lanes.moonshotB]) {
    assert.equal(lane.product, "moonshot");
    assert.equal(lane.status, "candidate");
    // NEW spec: team markets ONLY — no player props in either Moonshot lane.
    assert.ok(lane.legs.every((l) => l.category !== "player"), "no player props (team markets only)");
    // Structured pairing: any game contributing 2+ legs (result + total/BTTS) is a correlated same-game pair,
    // and that correlation must be disclosed.
    const perGame = new Map();
    for (const l of lane.legs) perGame.set(l.gameId, (perGame.get(l.gameId) ?? 0) + 1);
    const hasSameGamePair = [...perGame.values()].some((n) => n >= 2);
    if (hasSameGamePair) assert.ok(lane.correlationNote, "same-game result + total pairs must carry a correlation note");
    if (lane.legs.length) {
      const d = lane.legs.reduce((p, l) => p * dec(l.odds), 1);
      assert.ok(Math.abs(decToAmerican(d) - lane.combinedOdds) <= 3, "combined odds reconcile from leg odds");
      assert.ok(Math.abs(lane.potentialReturn - lane.stake * d) < 0.5, "potential return = stake × combined decimal");
      assert.ok(lane.combinedOdds >= MOONSHOT_MIN_COMBINED_ODDS, "combined odds clear the +700 longshot floor");
    }
  }
  // Lane B ("aggressive") is a SUPERSET tier of Lane A ("structured") — every Lane-A leg reappears in Lane B.
  const aIds = new Set(lanes.moonshotA.legs.map((l) => l.id));
  const bIds = new Set(lanes.moonshotB.legs.map((l) => l.id));
  assert.ok([...aIds].every((id) => bIds.has(id)), "Lane B is a superset of Lane A (tiers, not independent lanes)");
});

test("lane independence: Bank Builder A/B are mutually independent (no shared leg); Moonshot A/B are TIERS that MAY overlap", () => {
  const lanes = buildDailyLaneCandidates(pool, DATE);
  // Bank Builder lanes remain independent — no leg reused between BB A and BB B (no fabricated SGP).
  const bbaIds = new Set(lanes.bankBuilderA.legs.map((l) => l.id));
  assert.equal(lanes.bankBuilderB.legs.filter((l) => bbaIds.has(l.id)).length, 0, "Bank Builder A/B share no leg (independent)");
  // Each Bank Builder lane is internally distinct (max 1 leg per game).
  for (const lane of [lanes.bankBuilderA, lanes.bankBuilderB]) {
    assert.equal(new Set(lane.legs.map((l) => l.gameId)).size, lane.legs.length, `Bank Builder ${lane.lane}: max 1 leg/game`);
  }
  // Moonshot A/B are now TIERS (structured ⊆ aggressive) — they SHARE legs by design (no longer cross-lane-unique).
  const aIds = new Set(lanes.moonshotA.legs.map((l) => l.id));
  const shared = lanes.moonshotB.legs.filter((l) => aIds.has(l.id)).length;
  assert.ok(shared === lanes.moonshotA.legs.length, "every Moonshot Lane-A leg reappears in Lane B (tier overlap by design)");
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
  assert.equal(dp.activeBankroll, 19065.40, "active bankroll = portfolio.currentBankroll (after the July-5 Step settlement)");
  assert.equal(dp.availableBankroll, 19065.40, "available = active − exposure ($0)");
  assert.equal(dp.crownBankroll, 20465.40, "crown reported separately, unchanged");
});

test("daily portfolio NEVER mutates money state: portfolio.json bankroll/crown/exposure/record intact", () => {
  buildDailyPortfolio(root, NOW, DATE); // read-only
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Canonical money reflects banking Ladder #2 ($10,089.23) and the July-5 settlement: crown 20465.40 (Σ of
  // the two completed-ladder finals, unchanged) and bankroll = crown − $1400 realized dual-lane losses = 19065.40;
  // record advanced to 19-14-0-0 (Lane A won its July-6 cycle-8 Step-1 and July-7 Step-2). The read-only daily
  // portfolio must never mutate it.
  assert.equal(p.currentBankroll, 19065.40, "active bankroll = post-July-5 value");
  assert.equal(p.crownBankroll, 20465.40, "crown = Σ of two completed-ladder finals");
  assert.equal(p.openExposure, 0, "core exposure $0");
  assert.deepEqual(p.record, { wins: 19, losses: 14, voids: 0, pending: 0 }, "record 19-14-0-0");
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
  // 2026-07-09: the /today Daily Model Hub no longer renders the old "Today's paper portfolio" card, but it
  // still SOURCES the same canonical daily-portfolio money (open exposure) and renders it as a status figure
  // (money-integrity intent preserved — the figure is read from the canonical loader, never hardcoded).
  const today = read("src/app/today/page.tsx");
  assert.match(today, /buildDailyPortfolio\(/, "today derives the daily-portfolio money");
  assert.match(today, /dailyPortfolio\.openExposure/, "today surfaces the canonical open-exposure figure");
});
