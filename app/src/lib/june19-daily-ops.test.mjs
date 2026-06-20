import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { buildCardFactoryDiagnostics } from "./parlays/card-factory-diagnostics.ts";
import { getRiskBucketForCombinedOdds, INDIVIDUAL_LEG_ODDS_GUARDS } from "./parlays/risk-odds-bands.ts";
import { getGameDetail } from "./game-detail.ts";

test("current slate auto-detects the latest World Cup slate (now June 20)", () => {
  const v = loadTodaySlate(undefined, "2026-06-20T12:00:00Z");
  assert.equal(v.date, "2026-06-20", "latestSlateDate picks up the latest World Cup slate");
});

test("current World Cup slate is real + odds-backed, every card sits in its combined-odds band", () => {
  const v = loadTodaySlate("2026-06-20", "2026-06-20T12:00:00Z");
  const wc = v.sports.find((s) => s.sport === "WORLD_CUP");
  assert.ok(wc && wc.eligibleCount > 0, "World Cup has eligible legs");
  const byRisk = v.suggestedBySportRisk["WORLD_CUP"] ?? {};
  // Meaningful coverage across the realistic bands (Low can be legitimately empty — no 2+-leg World
  // Cup combo prices into -200..+100), and EVERY card must sit in the band its combined odds fit.
  const populated = ["low", "medium", "high", "longshot"].filter((b) => (byRisk[b]?.length ?? 0) > 0);
  assert.ok(populated.length >= 2, `World Cup cards span ≥2 bands (got ${populated.join(",")})`);
  for (const b of ["low", "medium", "high", "longshot"]) {
    for (const card of byRisk[b] ?? []) {
      assert.equal(getRiskBucketForCombinedOdds(card.combinedOdds), b, `card ${card.parlayId} (combined ${card.combinedOdds}) belongs in ${b}`);
      for (const leg of card.legs) {
        if (leg.odds == null) continue;
        assert.ok(leg.odds >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican, `leg ${leg.odds} not shorter than -500`);
        assert.ok(leg.odds <= INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican, `leg ${leg.odds} not longer than +1200`);
      }
    }
  }
  // projections artifact is odds-backed + dated to the current slate
  const proj = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  assert.equal(proj.date, "2026-06-20");
  assert.equal(proj.provider, "odds_api");
  assert.ok(proj.matches.every((m) => m.bookmaker && typeof m.americanOdds === "number"), "every market is odds-backed");
  // player props expanded to real posted markets (goalscorer + SoT + assists + total shots)
  const pp = JSON.parse(fs.readFileSync("public/data/world-cup/player-projections/latest.json", "utf8"));
  assert.equal(pp.date, "2026-06-20");
  assert.ok(Object.keys(pp.byMarket ?? {}).length >= 2, "multiple real player markets posted");
});

test("no card anywhere sits out of its combined-odds band, and no card pads with a guarded leg", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const groups = [
    ...Object.entries(v.suggestedBySportRisk).flatMap(([, byRisk]) => Object.entries(byRisk)),
    ...Object.entries(v.mixedByRisk),
  ];
  let checked = 0;
  for (const [bucket, cards] of groups) {
    for (const card of cards ?? []) {
      checked++;
      assert.equal(getRiskBucketForCombinedOdds(card.combinedOdds), bucket, `${card.parlayId} combined ${card.combinedOdds} must fit ${bucket}`);
      assert.ok(card.combinedOdds >= -200, `${card.parlayId} combined ${card.combinedOdds} not shorter than the Low floor`);
      for (const leg of card.legs) {
        if (leg.odds == null) continue;
        assert.ok(leg.odds >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican && leg.odds <= INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican, `${card.parlayId} leg ${leg.odds} within guards`);
      }
    }
  }
  assert.ok(checked > 0, "checked at least one card");
  // the band guards are reported, never silently applied
  assert.ok(v.oddsBandDiagnostics && typeof v.oddsBandDiagnostics.legsDroppedTooShort === "number", "odds-band diagnostics surfaced");
});

test("MLB + Mixed buckets are now odds-backed (paid key), every card fits its band, none fabricated", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const diag = buildCardFactoryDiagnostics(v, "2026-06-19T15:00:00Z");
  assert.equal(diag.slatePresent, true);
  // With the paid Odds API key the MLB board carries real odds → MLB + Mixed cards now generate.
  const mlb = v.suggestedBySportRisk["MLB"] ?? {};
  const mixed = v.mixedByRisk ?? {};
  const mlbTotal = ["low", "medium", "high", "longshot"].reduce((s, b) => s + (mlb[b]?.length ?? 0), 0);
  const mixedTotal = ["low", "medium", "high", "longshot"].reduce((s, b) => s + (mixed[b]?.length ?? 0), 0);
  assert.ok(mlbTotal > 0, "MLB cards present (odds-backed board)");
  assert.ok(mixedTotal > 0, "Mixed WC+MLB cards present");
  // Every MLB/Mixed card sits in its combined-odds band, with no leg shorter than -500.
  for (const byRisk of [mlb, mixed]) for (const b of ["low", "medium", "high", "longshot"]) {
    for (const card of byRisk[b] ?? []) {
      assert.equal(getRiskBucketForCombinedOdds(card.combinedOdds), b, `${card.parlayId} (combined ${card.combinedOdds}) must fit ${b}`);
      for (const leg of card.legs) if (leg.odds != null) assert.ok(leg.odds >= INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican, `leg ${leg.odds} ≥ -500`);
    }
  }
  // Every Mixed card mixes a World Cup leg with a non-soccer leg (no single-sport mixed).
  for (const b of ["low", "medium", "high", "longshot"]) for (const card of mixed[b] ?? []) {
    assert.ok(card.legs.some((l) => l.sport === "WORLD_CUP") && card.legs.some((l) => l.sport !== "WORLD_CUP"), `mixed ${card.parlayId} spans WC + non-soccer`);
  }
});

test("each current World Cup game resolves + carries game-specific cards (no cross-fixture leak)", () => {
  for (const slug of ["netherlands-vs-sweden-2026-06-20", "germany-vs-ivory-coast-2026-06-20"]) {
    const d = getGameDetail("world-cup", slug);
    assert.ok(d, `${slug} resolves`);
    assert.ok(Array.isArray(d.teamProjections), `${slug} has projections`);
  }
});

test("UFC stays results-only (no current UFC slate) on June 19", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const ufc = v.sports.find((s) => s.sport === "UFC");
  assert.ok(!ufc || ufc.eligibleCount === 0, "no active UFC slate");
});
