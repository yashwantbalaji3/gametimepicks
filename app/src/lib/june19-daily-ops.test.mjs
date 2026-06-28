import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { buildCardFactoryDiagnostics } from "./parlays/card-factory-diagnostics.ts";
import { getRiskBucketForCombinedOdds, INDIVIDUAL_LEG_ODDS_GUARDS } from "./parlays/risk-odds-bands.ts";
import { getGameDetail, gameSlug } from "./game-detail.ts";

test("current slate auto-detects the latest World Cup slate (now June 23)", () => {
  const v = loadTodaySlate(undefined, "2026-06-23T12:00:00Z");
  assert.equal(v.date, "2026-06-23", "latestSlateDate picks up the latest World Cup slate");
});

test("current World Cup slate is real + odds-backed, every card sits in its combined-odds band", () => {
  // DATE-AGNOSTIC: drive everything off the live WC projections pointer so it tracks the daily roll
  // (was June 24, now June 25) instead of a hardcoded date.
  const proj = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  const slateDate = proj.date;
  const v = loadTodaySlate(slateDate, `${slateDate}T12:00:00Z`);
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
  // projections artifact is odds-backed + dated to the current slate (oddsProvider carries the price source)
  assert.equal(proj.oddsProvider, "odds_api");
  assert.ok(proj.matches.every((m) => m.bookmaker && typeof m.americanOdds === "number"), "every market is odds-backed");
  // Player props are real + odds-backed for the current slate: The Odds API offers WC soccer player-prop
  // markets here, so the player-projections artifact ships real rows grouped by posted market (no fabrication).
  const pp = JSON.parse(fs.readFileSync("public/data/world-cup/player-projections/latest.json", "utf8"));
  assert.ok((pp.projectionCount ?? 0) > 0, "player props are available for the current slate");
  assert.ok(Object.keys(pp.byMarket ?? {}).length > 0, "player projections are grouped by real posted markets");
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
  // DATE-AGNOSTIC: derive the current-slate fixtures from the live projections artifact (the slate rolls
  // daily — June 24 was Switzerland/Canada etc.; June 25 is Ecuador/Germany etc.) and require every one to
  // resolve to its own detail page with projections. Slug is the deterministic <home>-vs-<away>-<date>.
  const proj = JSON.parse(fs.readFileSync("public/data/world-cup/projections/latest.json", "utf8"));
  const slugs = [...new Set(proj.matches.map((m) => gameSlug(m.homeTeam, m.awayTeam, m.date)))];
  assert.ok(slugs.length > 0, "live projections name the current World Cup fixtures");
  for (const slug of slugs) {
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

test("future slate is capped at the wall clock: June 24 MLB board does NOT surface on June 23", () => {
  // With mlb/boards/2026-06-24.json committed, the auto-resolved slate must stay June 23 when "now" is
  // June 23 (a pre-generated future board must not jump the global slate / break the World Cup slate).
  const june23 = loadTodaySlate(undefined, "2026-06-23T12:00:00Z");
  assert.equal(june23.date, "2026-06-23", "future June 24 board capped — slate stays June 23 on June 23");
  // On June 24 the same board correctly surfaces.
  const june24 = loadTodaySlate(undefined, "2026-06-24T16:00:00Z");
  assert.equal(june24.date, "2026-06-24", "June 24 board surfaces once the wall clock reaches June 24");
});
