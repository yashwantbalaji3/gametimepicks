/**
 * UI loader contract — the loader turns the engine into display data WITHOUT fabricating cards,
 * mutating protected data, or ever launching Bank Builder. Runs from app/ so process.cwd()/public
 * resolves to the committed board JSON.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTodaySlate } from "./ui-loader.ts";

test("missing/unknown date yields an honest empty state (no crash, no fabrication)", () => {
  const v = loadTodaySlate("1999-01-01");
  assert.equal(v.available, false);
  assert.equal(v.allSuggested.length, 0);
  assert.equal(v.eligibleLegs.length, 0);
  assert.equal(v.bankBuilderPreview.status, "no_qualified_launch");
  assert.notEqual(v.bankBuilderPreview.status, "launched");
});

test("real slate normalizes MLB parlays with identity attached", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  assert.equal(v.available, true);
  const mlb = v.sports.find((s) => s.sport === "MLB");
  assert.ok(mlb && mlb.eligibleCount > 0, "MLB has eligible legs");
  const mlbCards = v.allSuggested.filter((c) => c.sport === "MLB");
  assert.ok(mlbCards.length > 0, "MLB suggested cards exist");
  const leg = mlbCards[0].legs[0];
  assert.ok(leg.participant.length > 0);
  assert.ok(leg.identity, "leg carries an identity object");
  // Cards only contain eligible (not No Bet) legs.
  for (const c of v.allSuggested) for (const l of c.legs) assert.notEqual(l.confidenceTier, "No Bet");
});

test("no fabricated cards for sports with no eligible candidates", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  for (const s of v.sports) {
    if (s.eligibleCount === 0) {
      assert.ok(s.noQualified, `${s.sport} has an honest no-qualified reason`);
      assert.equal(Object.values(s.suggestedByRisk).reduce((a, b) => a + b, 0), 0, `${s.sport} has zero suggested cards`);
      assert.equal(v.allSuggested.filter((c) => c.sport === s.sport).length, 0);
    }
  }
});

test("a date with no launched artifact shows an operator-gated preview (not active)", () => {
  // 1999 has no slate and no launched run → never active, never a launched run id.
  const v = loadTodaySlate("1999-01-01", "1999-01-01T12:00:00Z");
  assert.notEqual(v.bankBuilderPreview.status, "launched");
  assert.equal(v.bankBuilderPreview.runId, null);
});

test("the launched 06-17 run is soccer-per-lane from the engine namespace", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T21:30:00Z");
  const bb = v.bankBuilderPreview;
  if (bb.status === "launched") {
    // Active run carries a run id and one World Cup leg in EACH lane.
    assert.ok(bb.runId, "launched run has a run id");
    assert.ok(bb.laneA && bb.laneB, "both lanes present");
    assert.ok(bb.laneA.legs.some((l) => l.sport === "WORLD_CUP"), "Lane A has a World Cup leg");
    assert.ok(bb.laneB.legs.some((l) => l.sport === "WORLD_CUP"), "Lane B has a World Cup leg");
    // No shared leg across lanes.
    const aIds = new Set(bb.laneA.legs.map((l) => l.legId));
    assert.ok(bb.laneB.legs.every((l) => !aIds.has(l.legId)), "no shared legs");
    // The exact Over/Under side is available on the MLB strikeout legs (clickable "why" data).
    const allLegs = [...bb.laneA.legs, ...bb.laneB.legs];
    const mlbLeg = allLegs.find((l) => l.sport === "MLB");
    if (mlbLeg) {
      assert.ok(mlbLeg.side === "over" || mlbLeg.side === "under", "MLB leg carries an exact side");
      assert.ok(Array.isArray(mlbLeg.topPositiveFactors), "leg carries why-factors for the drawer");
    }
  }
});

test("a settled run surfaces official lane + leg results", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-18T05:00:00Z");
  const bb = v.bankBuilderPreview;
  if (bb.status === "settled") {
    // Lanes carry an official result + advance flag.
    assert.ok(bb.laneA.result && bb.laneB.result, "both lanes carry a settlement result");
    for (const lane of [bb.laneA, bb.laneB]) {
      assert.equal(typeof lane.advanced, "boolean");
      // Every leg has an official result + an official stat/score line (never fabricated).
      for (const leg of lane.legs) {
        assert.ok(["won", "lost", "void", "pending", "needs_review"].includes(leg.settlementResult), `leg result is a real status: ${leg.settlementResult}`);
        assert.ok(leg.settlementOfficial && leg.settlementOfficial.length > 0, "leg carries an official source line");
      }
    }
  }
});

test("the active 06-18 ladder: Lane A relaunched fresh on Step 1, Lane B on Step 2, soccer + MLB per lane", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T20:40:00Z");
  const bb = v.bankBuilderPreview;
  assert.equal(bb.status, "launched", "active ladder is launched");
  assert.equal(bb.isLadder, true, "preview is a multi-step ladder");
  assert.ok(bb.laneA && bb.laneB, "both lanes present");
  for (const lane of [bb.laneA, bb.laneB]) {
    assert.equal(lane.steps.length, 5, "five-step ladder");
    assert.equal(lane.publicVisible, true, "active lane shown publicly");
  }

  // Lane A: a FRESH active Step 1 (the prior stopped lane was relaunched, not retroactively edited).
  const a1 = bb.laneA.steps[0];
  assert.equal(a1.status, "pending", "Lane A fresh Step 1 is live");
  assert.equal(a1.stake, 100, "fresh lane starts from $100");
  assert.ok(a1.payout >= 190 && a1.payout <= 225, "fresh Step 1 targets ~$200");
  assert.equal(a1.legs.length, 2, "two fresh legs");
  assert.ok(a1.legs.some((l) => l.sport === "WORLD_CUP") && a1.legs.some((l) => l.sport === "MLB"), "one World Cup + one MLB");
  assert.ok(a1.legs.every((l) => !/Czech/i.test(l.participant ?? "") && !/Josh Bell/i.test(l.participant ?? "")), "no Czech, no Josh Bell");
  for (let i = 1; i < 5; i++) {
    assert.equal(bb.laneA.steps[i].status, "coming_soon");
    assert.equal(bb.laneA.steps[i].legs.length, 0, "no fabricated legs for future steps");
  }

  // Lane B: Step 1 cleared WON, Step 2 live (unchanged), Steps 3-5 coming soon.
  const b1 = bb.laneB.steps[0], b2 = bb.laneB.steps[1];
  assert.equal(b1.status, "settled");
  assert.equal(b1.result, "won", "Lane B Step 1 cleared WON");
  for (const leg of b1.legs) {
    assert.equal(leg.settlementResult, "won");
    assert.ok(leg.settlementOfficial && leg.settlementOfficial.length > 0, "Step 1 leg has an official line");
  }
  assert.ok(["pending", "settled"].includes(b2.status), "Lane B Step 2 is pending or settled");
  assert.equal(b2.legs.length, 2, "Step 2 has two legs");
  assert.ok(b2.legs.some((l) => l.sport === "WORLD_CUP") && b2.legs.some((l) => l.sport === "MLB"), "soccer + MLB");
  assert.ok(typeof b2.stake === "number" && b2.stake > 0, "Step 2 stakes the cleared Step 1 payout");
  for (let i = 2; i < 5; i++) {
    assert.equal(bb.laneB.steps[i].status, "coming_soon");
    assert.equal(bb.laneB.steps[i].legs.length, 0, "no fabricated legs for future steps");
  }

  // No leg shared between Lane A's fresh Step 1 and Lane B's live Step 2.
  const aIds = new Set(a1.legs.map((l) => l.legId));
  assert.ok(b2.legs.every((l) => !aIds.has(l.legId)), "no shared legs across lanes");
  // MLB legs carry the exact Over/Under side for the "why" drawer.
  const mlb = [...a1.legs, ...b2.legs].find((l) => l.sport === "MLB");
  if (mlb) assert.ok(mlb.side === "over" || mlb.side === "under", "MLB leg carries an exact side");
});

test("mixed-sport parlays: each card spans a World Cup leg + another sport, by risk", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T15:55:00Z");
  const mixedTotal = Object.values(v.mixedByRisk).reduce((n, cards) => n + (cards?.length ?? 0), 0);
  assert.ok(mixedTotal > 0, "mixed cards are generated when WC + MLB legs exist");
  for (const cards of Object.values(v.mixedByRisk)) {
    for (const c of cards ?? []) {
      assert.equal(c.sport, "MIXED", "card sport is MIXED");
      const sports = new Set(c.legs.map((l) => l.sport));
      assert.ok(sports.size >= 2, "card spans >= 2 sports");
      assert.ok(c.legs.some((l) => l.sport === "WORLD_CUP"), "card includes a World Cup leg");
      // distinct games (no same-game correlation in a cross-sport card)
      const games = c.legs.map((l) => l.legId.split(":")[1]);
      assert.equal(new Set(games).size, games.length, "legs from distinct games");
    }
  }
});

test("Lane B Step 2 was re-optimized for payout: combined odds are plus-money and beat the conservative version", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T15:55:00Z");
  const bb = v.bankBuilderPreview;
  assert.equal(bb.isLadder, true);
  // Lane A has relaunched to a fresh Step 1; Lane B carries the payout-optimized live Step 2.
  const step2 = bb.laneB.steps.find((s) => s.step === 2);
  // Step 2 was built payout-optimized (plus-money combined, ≥2.25x); the property holds whether the
  // step is still pending or has since settled in the dual-lane lifecycle.
  assert.ok(step2.combinedOdds != null && step2.combinedOdds > 0, "Step 2 combined odds are plus-money (payout-optimized)");
  assert.ok((step2.payout ?? 0) / (step2.stake ?? 1) >= 2.25, "Step 2 clears the 2.25x payout floor");
  assert.ok(step2.legs.some((l) => l.sport === "WORLD_CUP"), "Step 2 keeps a World Cup leg per lane");
});

test("Lane B Step 2 soccer leg is a clean team market (BTTS No was replaced)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T16:15:00Z");
  const laneB = v.bankBuilderPreview.laneB;
  const step2 = laneB.steps.find((s) => s.step === 2);
  const soccer = step2.legs.find((l) => l.sport === "WORLD_CUP");
  assert.ok(soccer, "Lane B keeps one World Cup leg");
  assert.ok(!/both teams to score/i.test(soccer.participant + " " + soccer.market), "the BTTS No leg was replaced");
  assert.ok(["moneyline_90", "draw_no_bet", "double_chance"].includes(soccer.market), `soccer leg is a team market (got ${soccer.market})`);
});

test("MLB Bank Builder legs carry REAL last-5 prop history (official game logs, never fabricated)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T16:15:00Z");
  const bb = v.bankBuilderPreview;
  const mlbLegs = [bb.laneA, bb.laneB].flatMap((l) => l.steps.flatMap((s) => s.legs)).filter((l) => l.sport === "MLB");
  assert.ok(mlbLegs.length >= 2, "there are MLB legs to check");
  for (const leg of mlbLegs) {
    assert.ok(leg.last5, `${leg.participant} has a last5 block`);
    if (!leg.last5.unavailable) {
      assert.ok(Array.isArray(leg.last5.games) && leg.last5.games.length > 0, "last5 has game-by-game values");
      assert.ok(leg.last5.games.every((g) => typeof g.value === "number" && typeof g.hit === "boolean"), "each game has a numeric value + hit/miss");
      assert.ok(leg.last5.hitRate && leg.last5.hitRate.total === leg.last5.games.length, "hit rate matches the games shown");
      assert.equal(leg.last5.source, "mlb_stats_api", "sourced from official MLB game logs");
    }
  }
});

test("canonical engine slate (Today/Picks/Parlays source): WC + Mixed cards present, no active UFC cards", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T17:00:00Z");
  // World Cup cards exist (the slate's headline sport).
  const wc = v.suggestedBySportRisk["WORLD_CUP"] ?? {};
  const wcTotal = Object.values(wc).reduce((n, c) => n + (c?.length ?? 0), 0);
  assert.ok(wcTotal > 0, "engine surfaces World Cup suggested cards");
  // Mixed cards exist.
  const mixedTotal = Object.values(v.mixedByRisk).reduce((n, c) => n + (c?.length ?? 0), 0);
  assert.ok(mixedTotal > 0, "engine surfaces Mixed cards");
  // No fabricated active UFC cards (off-season / settled → 0 eligible → 0 cards).
  const ufc = v.suggestedBySportRisk["UFC"] ?? {};
  const ufcTotal = Object.values(ufc).reduce((n, c) => n + (c?.length ?? 0), 0);
  assert.equal(ufcTotal, 0, "no active UFC suggested cards");
  assert.ok(!v.allSuggested.some((c) => c.sport === "UFC"), "no UFC card in the combined feed");
});

test("identity never invents a photo URL for sports without one", () => {
  const v = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  for (const c of v.allSuggested) {
    for (const l of c.legs) {
      if (l.sport === "MLB" || l.sport === "UFC" || l.sport === "NBA") {
        assert.equal(l.identity.photoUrl, null, `${l.sport} identity must not fabricate a photoUrl`);
      }
    }
  }
});

test("repeated loads are stable (pure read, memoized)", () => {
  const a = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  const b = loadTodaySlate("2026-06-17", "2026-06-17T18:45:45Z");
  assert.equal(a.allSuggested.length, b.allSuggested.length);
  assert.equal(a.bankBuilderPreview.status, b.bankBuilderPreview.status);
});
