import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadMoonshotLane } from "./moonshot/moonshot-lane.ts";
import { resolveMobileNavBucket } from "./nav-active-route.ts";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const read = (p) => fs.readFileSync(p, "utf8");

// P196: the surfaces DERIVE their destinations from src/lib/navigation.ts, so a reachability check
// must read the canonical list too — the href no longer appears literally in the surface file. The
// assertion is unchanged; it now looks where the answer actually lives.
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

/*
 * The July-21 card's COMPOSITION is a fact about that card, so it is asserted against the pinned
 * snapshot — not against whatever the lane is running today. Read live, this test made the product
 * unable to move: it pinned "two MLB pitcher_strikeouts legs", and the 2026-08-17 slate qualified
 * one. That is a different card, not a defect, and it is exactly the coupling the pinned root was
 * introduced to break for the other thirty-three lane regressions. This one only survived because
 * the intervening cards happened to match.
 */
test("Moonshot lane artifact is ACTIVE (fresh July-21 MLB review card) and its record stays separate (0-1, not in core)", () => {
  const lane = loadMoonshotLane(pinnedLaneRoot());
  assert.ok(lane, "moonshot lane present");
  assert.equal(lane.status, "active", "lane active (July-21 MLB review)");
  const card = lane.ladder[0].card;
  assert.ok(card, "Step 1 review card present");
  assert.ok(card.result == null, "fresh review card carries no settled result");
  // The fresh review card is two independent MLB pitcher-strikeout legs, unsettled (no fabricated result).
  const mlbKs = (card.legs ?? []).filter((l) => l.sport === "MLB" && l.market === "pitcher_strikeouts");
  assert.equal(mlbKs.length, 2, "two MLB pitcher_strikeouts legs");
  for (const l of mlbKs) assert.equal(l.settlement?.result, null, `${l.participant} is unsettled (no settled result)`);
  // Portfolio keeps the moonshot record SEPARATE from the core record (paper review, $0 exposure).
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.deepEqual(portfolio.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot 0-1, separate");
  assert.equal(portfolio.moonshot.exposure, 0, "moonshot exposure 0 (paper review, nothing placed)");
  assert.deepEqual(portfolio.record, { wins: 19, losses: 14, voids: 0, pending: 0 }, "core record after Lane A WON its July-6 cycle-8 Step-1 and its July-7 Step-2 (record +2 → 19-14; July-5 losses remain in priorLane) — moonshot not blended in");
});

/*
 * What must hold of WHATEVER card is live today. The test above moved to the pinned July-21 root so
 * the product can change; this one keeps the live artifact guarded, asserting shape and honesty
 * rather than a particular slate's picks — so it stays true tomorrow without being edited.
 */
test("the LIVE Moonshot lane is structurally sound and never ships a pre-graded leg", () => {
  const lane = loadMoonshotLane();
  assert.ok(lane, "a live moonshot lane is published");

  /*
   * EVERY lane, not just the back-compat alias. The document stores lane A's ladder twice — once
   * under `lanes[0]` and again at the top level for readers that predate multi-lane — so a guard
   * written against `lane.ladder` silently checks lane A and leaves lane B unguarded. That is not
   * a hypothetical: the first version of this test did exactly that, and a probe that mutated
   * `lanes[0]` passed clean because the test was reading the other copy.
   */
  const lanes = Array.isArray(lane.lanes) && lane.lanes.length ? lane.lanes : [lane];
  const cards = lanes.map((l) => l.ladder?.[0]?.card).filter(Boolean);
  if (!cards.length) return; // open lanes with no qualifying card are a legitimate state

  // The duplicate must stay a duplicate; two readers of the same lane must never see two cards.
  if (Array.isArray(lane.lanes) && lane.lanes.length && lane.ladder?.[0]?.card) {
    assert.deepEqual(lane.ladder[0].card, lane.lanes[0].ladder?.[0]?.card,
      "the top-level ladder alias still mirrors lane A exactly");
  }

  const legs = cards.flatMap((c) => c.legs ?? []);
  assert.ok(legs.length > 0, "a placed card carries its legs");
  for (const l of legs) {
    assert.ok(l.participant, "every leg names its selection");
    assert.ok(l.market, "every leg names the market it settles on");
    assert.equal(l.settlement?.result, null, `${l.participant} is ungraded until official results arrive`);
  }

  /*
   * The team beside a pick must be the player's OWN side. Until 2026-08-17 it was the fixture's
   * home team for every leg, which filed three away-team players under their opponent's name.
   *
   * Checking the team merely APPEARS in the fixture string does not catch that — "Arizona
   * Diamondbacks @ Boston Red Sox" contains "Boston Red Sox", so a mislabelled away player passes
   * a containment test cleanly. The only real check is against an independent answer, so this
   * compares each leg to the board's own `playerTeamAbbr` for the same gamePk and player.
   */
  const boardPath = `public/data/mlb/boards/${lane.slateDate}.json`;
  if (!fs.existsSync(boardPath)) return;
  const board = JSON.parse(read(boardPath));
  const truth = new Map();
  for (const r of board.leans ?? []) {
    if (!r.playerTeamAbbr || !r.playerName) continue;
    const full = r.playerTeamAbbr === r.homeTeamAbbr ? r.homeTeamName : r.playerTeamAbbr === r.awayTeamAbbr ? r.awayTeamName : null;
    if (full) truth.set(`${r.gamePk}|${r.playerName}`, full);
  }
  let checked = 0;
  for (const l of legs) {
    const name = String(l.participant).split(/ (?:Over|Under) /)[0];
    const expected = truth.get(`${l.legId.split(":")[2]}|${name}`);
    if (!expected) continue; // the board has no answer for this player — the leg carries null, not a guess
    assert.equal(l.team, expected, `${name} plays for ${expected}, not ${l.team}`);
    checked++;
  }
  assert.ok(checked > 0, "at least one leg was cross-checked against the board's own player-team answer");
});

test("Moonshot is reachable: command rail + top nav include it; mobile has its own Moonshot bucket", () => {
  const rail = read("src/components/command-rail.tsx") + read("src/lib/navigation.ts");
  const nav = read("src/components/nav.tsx") + read("src/lib/navigation.ts");
  assert.match(rail, /href: "\/moonshot"/, "command rail has a Moonshot entry");
  assert.match(nav, /href: "\/moonshot"/, "top nav has a Moonshot entry");
  // Moonshot is a first-class product → its own bottom-nav slot (was folded into Bank).
  assert.equal(resolveMobileNavBucket("/moonshot"), "moonshot", "mobile highlights the dedicated Moonshot bucket");
});

test("Today + Bank Builder + Mr. Dub link to the Moonshot tracker", () => {
  assert.match(read("src/components/bank-builder/bank-builder-status-rail.tsx"), /href="\/moonshot"/, "today's BB rail links to the tracker");
  assert.match(read("src/components/bank-builder/moonshot-lane-card.tsx"), /href="\/moonshot"/, "bank-builder moonshot card links to the tracker");
  assert.match(read("src/app/mr-dub/page.tsx"), /MoonshotLaneTracker/, "Mr. Dub renders the inline Moonshot tracker");
});

test("Moonshot candidates: none live this slate (empty) — no WC player-prop candidates, nothing placed", () => {
  const lane = loadMoonshotLane();
  // The July-21 review runs an ACTIVE Step-1 card and carries NO pre-event candidate cards.
  assert.ok(Array.isArray(lane.candidates), "candidates is an array");
  assert.equal(lane.candidates.length, 0, "no live candidates this slate (WC candidates cleared)");
  // Eligibility invariant preserved: no settlement-pending player-prop leg is ever exposed as a candidate.
  const SETTLEMENT_PENDING = /^player_/i;
  for (const c of lane.candidates) for (const l of c.legs ?? []) assert.ok(!SETTLEMENT_PENDING.test(l.market), `${l.participant} is not a settlement-pending player prop`);
  // Candidates do NOT place exposure or change the record.
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(portfolio.moonshot.exposure, 0, "moonshot exposure still 0 (candidates not placed)");
  assert.deepEqual(portfolio.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record unchanged (0-1)");
  assert.equal(portfolio.totalOpenExposure, 0, "total exposure unchanged by candidates ($0 core — Lane A completed, Lane B lost; moonshot $0)");
  // The tracker still renders the candidates section.
  const tracker = read("src/components/moonshot/moonshot-lane-tracker.tsx");
  assert.match(tracker, /Moonshot Candidates/, "tracker renders a candidates section");
});

test("protected crown is the cumulative banked total ($20,465.40 = two completed $100→$10k ladders), 19-14", () => {
  const portfolio = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Cumulative-crown: crown = Σ official completed-ladder finals ($10,376.17 + $10,089.23). Banking the 2nd
  // ladder grows the crown but never rewrites it downward — the crown is immutable per completed ladder.
  assert.equal(portfolio.crownBankroll, 20465.4, "crown bankroll = Σ two banked ladder finals (immutable, append-only)");
  assert.equal(portfolio.currentBankroll, 19065.4, "active bankroll = crown − $1400 realized dual-lane losses (stopped seeds after July-5)");
});
