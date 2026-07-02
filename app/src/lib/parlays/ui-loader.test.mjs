/**
 * UI loader contract — the loader turns the engine into display data WITHOUT fabricating cards,
 * mutating protected data, or ever launching Bank Builder. Runs from app/ so process.cwd()/public
 * resolves to the committed board JSON.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadTodaySlate } from "./ui-loader.ts";

const launchDir = path.join(process.cwd(), "public", "data", "methodology", "launch");

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

test("live run (July-1 settlement): LIVE preview shows Lane A WON + Lane B LOST on Step-1, no stale-leg leak", () => {
  // The operator banked the 2nd completed ladder (Lane A 5/5 won → $10,089.23) and restarted into a new cycle.
  // The cycle then ran on the July-1 slate: Lane A WON its Step-1 (advanced, cycle 6) and Lane B LOST (stopped,
  // cycle 5). The live preview leads each lane with its settled Step-1 card; both stay publicly visible. The prior
  // won/lost cycle narratives stay in each lane's priorLane chain (and the banked archive) — they must NOT bleed
  // into the live preview.
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  assert.equal(bb.status, "launched", "the live run is launched");
  assert.equal(bb.isLadder, true, "it is a stepping ladder");
  assert.ok(bb.laneA && bb.laneB, "both lanes present");
  assert.equal(bb.currentStep, 1, "live run's lead step pointer sits on Step 1 (both lanes' open rung)");
  // Lane A is a settled-WON Step-1 (advanced). The loader never fabricates.
  assert.equal(bb.laneA.laneStatus, "advanced", "Lane A advanced (Step-1 settled-WON July-1)");
  assert.equal(bb.laneA.publicVisible, true, "Lane A is publicly visible");
  assert.equal(bb.laneA.currentStep, 1, "Lane A is on Step 1");
  assert.equal((bb.laneA.steps ?? []).length, 1, "Lane A carries its one settled Step-1 card");
  assert.equal(bb.laneA.steps[0].status, "settled", "Lane A Step-1 is settled");
  assert.equal(bb.laneA.steps[0].result, "won", "Lane A Step-1 settled WON (July-1)");
  // Lane B is a settled-LOST Step-1 (stopped).
  assert.equal(bb.laneB.laneStatus, "stopped", "Lane B stopped (Step-1 settled-LOST July-1)");
  assert.equal(bb.laneB.publicVisible, true, "Lane B is publicly visible");
  assert.equal(bb.laneB.currentStep, 1, "Lane B is on Step 1");
  assert.equal((bb.laneB.steps ?? []).length, 1, "Lane B carries its one settled-LOST Step-1 card");
  assert.equal(bb.laneB.steps[0].status, "settled", "Lane B Step-1 is settled");
  assert.equal(bb.laneB.steps[0].result, "lost", "Lane B Step-1 settled LOST (July-1)");
  // No stale legs from any PRIOR ladder (the banked cycle or either lane's priorLane chain) may surface in the
  // live preview. (Bosnia is NOT banned here — USA vs Bosnia & Herzegovina is a legitimate July-1 settled-card leg.)
  const live = JSON.stringify(bb);
  assert.ok(!/Goldschmidt|Hoskins|Turkey|Gonzales|Algeria|Australia|Curaçao|Ivory Coast|Argentina|Austria|Jordan|Egypt|France/.test(live), "no prior-ladder / priorLane legs leak into the live preview");
});

test("ARCHIVE money-integrity: the BANKED 2nd ladder ($10,089.23 final) is preserved official — Lane A completed 5/5 won, Lane B stopped on a Step-3 loss", () => {
  // The crown is the SUM of two official completed-ladder finals; the 2nd ($10,089.23) is anchored here.
  // This guard proves the banked ladder is real and official — Lane A cleared all five rungs from $100 to
  // a >$10k Step-5 payout, Lane B genuinely STOPPED on a settled loss (no fabricated completion).
  const run = JSON.parse(fs.readFileSync(path.join(launchDir, "dual-bank-builder-2026-06-24-completed.json"), "utf8")).run;
  const A = run.laneA, B = run.laneB;
  assert.equal(A.laneStatus, "completed", "archived Lane A completed the ladder");
  assert.equal(A.steps.length, 5, "five-step ladder");
  for (const s of A.steps) { assert.equal(s.status, "settled"); assert.equal(s.result, "won", "every Lane A step officially WON"); }
  assert.equal(A.steps[0].stake, 100, "started from $100");
  const a5 = A.steps[4];
  assert.equal(a5.payout, 10089.23, "Lane A Step-5 payout = the banked Ladder #2 final ($10,089.23)");
  assert.ok(a5.payout > 10000, "ladder cleared the $10k target");
  // Lane B stopped on a real settled loss — no fabricated completion, no payout on the losing rung.
  assert.equal(B.laneStatus, "stopped", "archived Lane B stopped");
  const bLost = B.steps.find((s) => s.status === "settled" && s.result === "lost");
  assert.ok(bLost, "Lane B has a real settled loss");
  assert.equal(bLost.payout, 0, "the losing rung paid $0 (no fabricated win)");
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

test("ARCHIVE: the banked ladder's Lane B Step-1 restart was plus-money (+177), settled WON, World-Cup-backed", () => {
  // Migrated to the archive: the fresh live cycle has no settled steps. The banked Lane B restart card is
  // preserved official — plus-money combined price, settled WON, with a World Cup leg per lane.
  const run = JSON.parse(fs.readFileSync(path.join(launchDir, "dual-bank-builder-2026-06-24-completed.json"), "utf8")).run;
  const step1 = run.laneB.steps.find((s) => s.step === 1);
  assert.ok(step1.combinedOdds != null && step1.combinedOdds > 0, "Step 1 combined odds are plus-money (+177)");
  assert.equal(step1.status, "settled", "Step 1 restart card settled (official)");
  assert.equal(step1.result, "won", "Step 1 restart settled WON (Argentina ML + Under 3.5, official)");
  assert.ok(step1.legs.some((l) => l.sport === "WORLD_CUP"), "Step 1 keeps a World Cup leg per lane");
  // The lane genuinely stopped later on a settled Step-3 loss (no fabricated completion).
  assert.equal(run.laneB.laneStatus, "stopped", "Lane B stopped after Step 3 settled a loss");
});

test("ARCHIVE: the banked Lane B Step-1 soccer leg is a clean team market (no BTTS in Bank Builder)", () => {
  const run = JSON.parse(fs.readFileSync(path.join(launchDir, "dual-bank-builder-2026-06-24-completed.json"), "utf8")).run;
  const step1 = run.laneB.steps.find((s) => s.step === 1);
  const soccer = step1.legs.find((l) => l.sport === "WORLD_CUP");
  assert.ok(soccer, "Lane B keeps one World Cup leg");
  assert.ok(!/both teams to score/i.test((soccer.participantName ?? "") + " " + (soccer.marketType ?? "")), "no BTTS leg in Bank Builder");
  assert.ok(["moneyline_90", "draw_no_bet", "double_chance", "match_total_goals"].includes(soccer.marketType), `soccer leg is a clean team/total market (got ${soccer.marketType})`);
});

test("ARCHIVE: banked-ladder MLB Bank Builder legs carry REAL last-5 prop history (official game logs, never fabricated)", () => {
  const run = JSON.parse(fs.readFileSync(path.join(launchDir, "dual-bank-builder-2026-06-24-completed.json"), "utf8")).run;
  const mlbLegs = [run.laneA, run.laneB].flatMap((l) => l.steps.flatMap((s) => s.legs ?? [])).filter((l) => l.sport === "MLB");
  assert.ok(mlbLegs.length >= 2, "there are MLB legs to check");
  for (const leg of mlbLegs) {
    assert.ok(leg.last5, `${leg.participantName} has a last5 block`);
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
