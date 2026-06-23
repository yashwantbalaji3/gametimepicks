import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readLaneRungs, selectSafestTargetFitCard } from "./daily-portfolio/bank-builder-generation.ts";
import { loadWorldCupModelPicks, buildModelPicksTable, MAX_PICKS_PER_MARKET } from "./world-cup/model-qualified-picks.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const TEAM_CATS = new Set(["team", "total_btts"]);

test("Bank Builder prefers TEAM/GAME markets: when a team-only card reaches the target, no fragile prop is used", () => {
  const pool = loadWorldCupModelPicks(root, NOW, DATE);
  const { laneA, laneB } = readLaneRungs(root);
  const used = new Set();
  const a = selectSafestTargetFitCard(pool, laneA, used);
  a.legs.forEach((l) => used.add(l.id));
  const b = selectSafestTargetFitCard(pool, laneB, used);
  for (const [g, rung] of [[a, laneA], [b, laneB]]) {
    assert.equal(g.legs.length, 2, "2 legs");
    assert.ok(g.potentialReturn >= rung.targetReturn, "reaches the rung target");
    // For the June-23 pool a team-only target-fit card exists, so both legs must be team/game markets.
    for (const l of g.legs) assert.ok(TEAM_CATS.has(l.category), `${l.selection} is a team/game market (not a fragile prop)`);
  }
});

test("persisted Bank Builder cards are team/game markets only (no player props)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  for (const lane of bb) for (const leg of lane.legs) {
    // team/game leg selections have no "·" player prefix (player legs render "Name · Market line").
    assert.ok(!/·/.test(leg.selection) || /Both teams|Total|Match|Draw|Double/i.test(leg.selection), `${leg.selection} is a team/game market`);
  }
});

test("Bank Builder whyThisCard discloses the team/game-market preference", () => {
  const gen = read("src/lib/daily-portfolio/bank-builder-generation.ts");
  assert.match(gen, /team\/game markets.*preferred over fragile props/i, "selector documents the team-market priority");
});

test("model picks table supports MULTIPLE picks per market (cellsMulti, up to 3)", () => {
  const table = buildModelPicksTable(loadWorldCupModelPicks(root, NOW, DATE));
  assert.equal(MAX_PICKS_PER_MARKET, 3);
  let sawMulti = false;
  for (const row of table.rows) {
    assert.ok(row.cellsMulti, "row has cellsMulti");
    for (const k of Object.keys(row.cellsMulti)) {
      const list = row.cellsMulti[k];
      assert.ok(Array.isArray(list), `${k} is an array`);
      assert.ok(list.length <= MAX_PICKS_PER_MARKET, `${k} ≤ 3 picks`);
      // top pick mirrors the single `cells` entry.
      if (list.length) assert.equal(row.cells[k]?.id, list[0].id, "cells[k] is the top of cellsMulti[k]");
      if (list.length > 1) sawMulti = true;
    }
  }
  assert.ok(sawMulti, "at least one market surfaces more than one model-qualified pick");
});

test("WC model-picks table component renders multiple picks + full names (no aggressive truncation)", () => {
  const comp = read("src/components/world-cup/model-picks-table.tsx");
  assert.match(comp, /cellsMulti/, "component reads cellsMulti");
  assert.ok(!/\btruncate\b/.test(comp) || /break-words/.test(comp), "player names wrap (break-words) rather than truncate");
  assert.match(comp, /No model-qualified pick/, "empty cells say No model-qualified pick");
});

test("game detail shows model picks by market (per-market, up to 3) — not raw inventory", () => {
  const page = read("src/components/game/game-detail-page.tsx");
  assert.match(page, /Model picks by market/, "per-market model-picks heading");
  assert.match(page, /worldCupPlayerModelPicks/, "uses the model-pick selector");
  assert.match(page, /americanOdds >= -500 && p\.americanOdds <= 400/, "spotlight excludes raw < -500 props (no -5000)");
});

test("exposure/bankroll/crown unchanged by the upgrade (only daily-portfolio.json data changed)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(dp.openExposure, 250); assert.equal(dp.availableBankroll, 9926.17);
  assert.equal(dp.activeBankroll, 10176.17); assert.equal(dp.crownBankroll, 10376.17);
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.currentBankroll, 10176.17); assert.equal(p.crownBankroll, 10376.17);
  assert.deepEqual(p.record, { wins: 10, losses: 2, voids: 0, pending: 0 });
});
