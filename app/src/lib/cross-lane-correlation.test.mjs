/**
 * Cross-lane correlation engine + World Cup Specials ledger.
 *
 * The correlation engine must catch any shared game/player/team across the two Bank Builder lanes; the
 * live lanes must score as independent. The Specials ledger must aggregate the archived history honestly
 * (records only from settled cards; pending = open exposure). Run: npx tsx --test this-file.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { scoreCrossLaneCorrelation } from "./daily-portfolio/cross-lane-correlation.ts";
import { buildSpecialsLedger, SPECIALS_STAKE_PER_CARD, SPECIALS_DAILY_ALLOCATION } from "./world-cup/specials-ledger.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";

// ── Correlation engine ────────────────────────────────────────────────────────────────────────────
test("correlation: fully independent lanes (disjoint games) score 0 and read independent", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Match Result", selection: "Croatia", player: null }];
  const b = [{ matchup: "England vs Ghana", market: "Both Teams To Score", selection: "No", player: null }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.score, 0);
  assert.equal(c.independent, true);
  assert.equal(c.warnings.length, 0);
  assert.match(c.summary, /independent/i);
});

test("correlation: a shared GAME is caught and scored (not independent)", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Match Result", selection: "Croatia", player: null }];
  const b = [{ matchup: "Panama vs Croatia", market: "Total Goals", selection: "Over 2.5", player: null }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.ok(c.score >= 0.5, "shared game scores at least the game weight");
  assert.equal(c.independent, false);
  assert.equal(c.overlaps.sameGame.length, 1);
  assert.ok(c.warnings.some((w) => /same game/i.test(w)));
});

test("correlation: a shared PLAYER is caught", () => {
  const a = [{ matchup: "Panama vs Croatia", market: "Assists", selection: "Over 0.5", player: "Ivan Perisic" }];
  const b = [{ matchup: "France vs Iraq", market: "Shots", selection: "Over 1.5", player: "Ivan Perisic" }];
  const c = scoreCrossLaneCorrelation(a, b);
  assert.equal(c.independent, false);
  assert.equal(c.overlaps.samePlayer.length, 1);
});

test("correlation: the LIVE Bank Builder lanes are independent (no shared game/player/team)", () => {
  const dp = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  const lane = (L) => (dp.lanes.find((x) => x.product === "bank-builder" && x.lane === L)?.legs ?? [])
    .map((l) => ({ matchup: l.matchup, market: l.market ?? l.marketLabel, selection: l.selection, player: l.player ?? null }));
  const c = scoreCrossLaneCorrelation(lane("A"), lane("B"));
  assert.equal(c.independent, true, "live lanes share no game/player/team");
  assert.equal(c.score, 0);
});

test("correlation: the badge is rendered on /bank-builder", () => {
  const page = read("src/app/bank-builder/page.tsx");
  assert.match(page, /CrossLaneCorrelationBadge/, "bank-builder renders the correlation badge");
});

// ── World Cup Specials ledger ─────────────────────────────────────────────────────────────────────
test("specials ledger: constants + shape ($20 × 5 = $100/day)", () => {
  assert.equal(SPECIALS_STAKE_PER_CARD, 20);
  assert.equal(SPECIALS_DAILY_ALLOCATION, 100);
  const l = buildSpecialsLedger(root, DATE);
  assert.equal(l.stakePerCard, 20);
  assert.equal(l.dailyAllocation, 100);
  assert.ok(Array.isArray(l.days), "per-slate archive present");
});

test("specials ledger: HONEST — record only from settled cards; pending = open exposure, not P&L", () => {
  const l = buildSpecialsLedger(root, DATE);
  const settled = l.record.wins + l.record.losses + l.record.pushes;
  assert.equal(settled, l.settledCards, "record reconciles to settled count");
  if (settled === 0) {
    assert.equal(l.pnl, 0, "no P&L without settled cards");
    assert.equal(l.roi, null, "ROI null until something settles");
    assert.equal(l.winRate, null, "win rate null until something settles");
  }
  // Every archived slate carries non-negative counts that reconcile.
  for (const d of l.days) {
    assert.equal(d.settled + d.pending, d.cards, `${d.date}: settled + pending = cards`);
    assert.ok(d.openExposure === d.pending * SPECIALS_STAKE_PER_CARD, "open exposure = pending × stake");
  }
});

test("specials ledger: archives every slate forever (history is not truncated)", () => {
  const l = buildSpecialsLedger(root, DATE);
  assert.ok(l.totalSlates >= 1, "at least one archived slate");
  assert.equal(l.totalSlates, l.days.length, "totalSlates = archived days");
});

test("specials ledger: rendered on /world-cup-specials as a permanent product", () => {
  const page = read("src/app/world-cup-specials/page.tsx");
  assert.match(page, /SpecialsLedgerSection/, "page renders the ledger");
  assert.match(page, /permanent paper product/i, "positioned as a permanent product");
});
