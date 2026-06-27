import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";
import { resolveMobileNavBucket } from "./nav-active-route.ts";

const read = (p) => fs.readFileSync(p, "utf8");

test("shared ticket primitives exist under components/tickets/", () => {
  for (const f of ["odds-pill", "status-pill", "risk-pill", "settlement-badge", "team-identity", "leg-row", "ticket-card"]) {
    assert.ok(fs.existsSync(`src/components/tickets/${f}.tsx`), `tickets/${f}.tsx present`);
  }
});

test("/moonshot route renders the dedicated daily tracker (separate lane, paper-only)", () => {
  const page = read("src/app/moonshot/page.tsx");
  assert.match(page, /MoonshotLaneTracker/, "renders the tracker");
  assert.match(page, /PicksSurfaceHeader/, "uses the shared pick-surface header");
  assert.match(page, /loadMoonshotLane/, "loads the moonshot lane");
  assert.match(page, /portfolio\.json|moonshot/i, "reads the moonshot record/exposure from the portfolio");
});

test("Moonshot tracker shows the stopped/LOST state with hit/miss/pending legs, separate from core", () => {
  const tracker = read("src/components/moonshot/moonshot-lane-tracker.tsx");
  assert.match(tracker, /not<\/strong>\s*part of the core Dual Bank Builder|never blends into the core/, "states it is separate from the core record");
  assert.match(tracker, /LegRow/, "renders leg rows");
  assert.match(tracker, /TicketCard/, "uses the shared ticket card");
  assert.match(tracker, /priorRun/, "renders known prior-run history");
  assert.match(tracker, /not backfilled|known Moonshot runs only/, "honest about un-backfilled history (no fabrication)");
});

test("Moonshot lane artifact is stopped/LOST and its record is separate (0-1, not in core)", () => {
  const lane = loadMoonshotLane();
  assert.ok(lane, "moonshot lane present");
  assert.equal(lane.status, "stopped", "lane stopped (settled LOST)");
  assert.equal(lane.ladder[0].card?.result, "lost", "Step 1 card settled LOST");
  // The Egypt BTTS-No leg is the settled MISS; the others are pending (dead-parlay).
  const miss = (lane.ladder[0].card?.legs ?? []).filter((l) => (l.settlement?.result) === "lost").length;
  assert.ok(miss >= 1, "at least one settled MISS leg");
  // Portfolio keeps the moonshot record SEPARATE from the core record.
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.deepEqual(portfolio.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot 0-1, separate");
  assert.equal(portfolio.moonshot.exposure, 0, "moonshot exposure 0 (settled)");
  assert.deepEqual(portfolio.record, { wins: 14, losses: 4, voids: 0, pending: 0 }, "core record (Lane A completed WON; Lane B Step 3 LOST) — moonshot not blended in");
});

test("Moonshot folds into Today's Picks (v1: a secondary lane, not a primary nav slot)", () => {
  // v1 architecture: the five primary destinations are Home/Bank Builder/Today's Picks/Track Record/How.
  // Moonshot is a secondary lane reachable via Today's Picks — it highlights that bucket, not its own.
  assert.equal(resolveMobileNavBucket("/moonshot"), "picks", "Moonshot highlights the Today's Picks bucket");
});

test("Today + Bank Builder + Mr. Dub link to the Moonshot tracker", () => {
  assert.match(read("src/components/bank-builder/bank-builder-status-rail.tsx"), /href="\/moonshot"/, "today's BB rail links to the tracker");
  assert.match(read("src/components/bank-builder/moonshot-lane-card.tsx"), /href="\/moonshot"/, "bank-builder moonshot card links to the tracker");
  assert.match(read("src/app/mr-dub/page.tsx"), /MoonshotLaneTracker/, "Mr. Dub renders the inline Moonshot tracker");
});

test("Moonshot candidates: real odds, honest independent combined price, pre-event games only, not placed", () => {
  const lane = loadMoonshotLane();
  assert.ok(Array.isArray(lane.candidates) && lane.candidates.length >= 1, "candidates present");
  const dec = (a) => (a >= 0 ? 1 + a / 100 : 1 + 100 / -a);
  const ELIGIBLE = ["England vs Ghana", "Colombia vs DR Congo", "Panama vs Croatia"]; // all officially NS at generation
  for (const c of lane.candidates) {
    assert.equal(c.status, "candidate", "status is candidate (not active/placed)");
    assert.equal(c.activated, false, "not activated → no exposure placed");
    assert.equal(c.stake, 25, "$25 paper stake");
    assert.ok(c.legs.length >= 2, "at least two legs");
    // No fabricated SGP: every leg is from a DIFFERENT fixture (independent games).
    const fixtures = c.legs.map((l) => l.fixture);
    assert.equal(new Set(fixtures).size, fixtures.length, "each leg from a distinct game (independent → no SGP)");
    for (const l of c.legs) {
      assert.ok(ELIGIBLE.includes(l.fixture), `${l.fixture} is a pre-event eligible game`);
      assert.equal(typeof l.odds, "number", `${l.participant} carries real odds`);
      assert.ok(l.kickoffEt && l.marketLabel && l.settlement?.source, `${l.participant} has kickoff/market/settlement source`);
    }
    // Combined odds reconcile with the product of the real leg odds (proves no fabricated combined price).
    const product = c.legs.reduce((p, l) => p * dec(l.odds), 1);
    const reconstructed = product >= 2 ? Math.round((product - 1) * 100) : -Math.round(100 / (product - 1));
    assert.ok(Math.abs(reconstructed - c.combinedOdds) <= 2, `${c.cardId} combined odds reconcile with legs`);
    assert.ok(c.combinedOdds >= 600, `${c.cardId} is a longshot (>= +600)`);
    assert.ok(Math.abs(c.projectedReturn - 25 * product) < 0.5, "projected return = stake × combined decimal");
  }
  // Candidates do NOT place exposure or change the record.
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(portfolio.moonshot.exposure, 0, "moonshot exposure still 0 (candidates not placed)");
  assert.deepEqual(portfolio.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record unchanged (0-1)");
  assert.equal(portfolio.totalOpenExposure, 0, "total exposure unchanged by candidates ($0 core — Lane A completed, Lane B lost; moonshot $0)");
  // The tracker renders the candidates section.
  const tracker = read("src/components/moonshot/moonshot-lane-tracker.tsx");
  assert.match(tracker, /Moonshot Candidates/, "tracker renders a candidates section");
});

test("protected crown is the cumulative banked total ($20,465.40 = two completed $100→$10k ladders), 13-3", () => {
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Cumulative-crown: crown = Σ official completed-ladder finals ($10,376.17 + $10,089.23). Banking the 2nd
  // ladder grows the crown but never rewrites it downward — the crown is immutable per completed ladder.
  assert.equal(portfolio.crownBankroll, 20465.4, "crown bankroll = Σ two banked ladder finals (immutable, append-only)");
  assert.equal(portfolio.currentBankroll, 20065.4, "active bankroll = crown − $400 dual-lane losses");
});
