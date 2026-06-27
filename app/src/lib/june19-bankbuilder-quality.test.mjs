import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wcTeamCodeFromName } from "./data-world-cup.ts";

// The June-19 quality-replacement card COMPLETED the $10k ladder (Lane A banked June 24) and is now
// archived; the live engine artifact is a fresh cycle-2. These assertions are about the HISTORICAL
// June-19 placed card (Jax→Gonzales replacement, USA ML kept, Turkey Double Chance correction), so
// read its placed legs from the archived completed run. Raw artifact legs use engine field names
// (participantName, marketType); the UI enrichment (last5/identity) is a live-loader concern and is
// covered by the pure-function + source-file assertions below.
const run = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json", "utf8")).run;
const portfolio = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
const ledger = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));
// The placed June-19 card legs live at the lane's top level in the archive.
const placedLegs = (lane) => lane.legs ?? [];

test("Griffin Jax (2/5) was replaced — no weak pitcher-strikeout-under leg remains in the June-19 placed card", () => {
  const allPlaced = [...placedLegs(run.laneA), ...placedLegs(run.laneB)];
  assert.ok(allPlaced.length > 0, "archived June-19 placed legs present");
  assert.ok(!allPlaced.some((l) => /Griffin Jax/.test(l.participantName ?? "")), "Jax removed from the placed lanes");
  // No pitcher strikeout prop in the placed cards (the replacement is a position-player prop).
  assert.ok(!allPlaced.some((l) => /Strikeouts/i.test(l.marketType ?? "")), "no pitcher-K leg in the placed Bank Builder cards");
});

test("Lane A: USA ML kept + Nick Gonzales replacement, card in $600-750 target", () => {
  const legs = placedLegs(run.laneA);
  assert.ok(legs.some((l) => /USA|United States/.test(l.participantName ?? "")), "USA moneyline kept");
  const gonz = legs.find((l) => /Gonzales/.test(l.participantName ?? ""));
  assert.ok(gonz, "Nick Gonzales is the replacement");
  // The replacement is a position-player prop (HRR), not the dropped pitcher-strikeout leg.
  assert.match(gonz.marketType, /Hits \+ Runs \+ RBIs/, "Gonzales replacement is a position-player HRR prop");
  const step2 = run.laneA.steps.find((s) => s.step === 2);
  assert.ok(step2.payout >= 600 && step2.payout <= 750, `Lane A projected ~$601.56 in target (got ${step2.payout})`);
});

test("Turkey or Draw (Double Chance) and Draw No Bet are distinct markets — never conflated", () => {
  // The corrected Lane B leg is the Double Chance market, not DNB.
  const turkey = placedLegs(run.laneB).find((l) => /Turkey/.test(l.participantName ?? ""));
  assert.ok(turkey, "Lane B keeps a Turkey leg");
  assert.equal(turkey.marketType, "double_chance", "Lane B uses the Double Chance market");
  assert.match(turkey.participantName, /Turkey or Draw/, "label reads 'Turkey or Draw' (Double Chance)");
  assert.ok(!/draw no bet|draw_no_bet/i.test(turkey.participantName), "Double Chance is not labeled Draw No Bet");
  // The UI prettifier keeps the two market labels separate.
  const panel = fs.readFileSync("src/components/parlays/bank-builder-preview-panel.tsx", "utf8");
  assert.match(panel, /draw_no_bet: "Draw No Bet"/, "DNB label distinct");
  assert.match(panel, /double_chance: "Double Chance"/, "Double Chance label distinct");
});

test("World Cup team codes resolve for the flag badge — USA → US, Turkey → TR (incl. market suffixes)", () => {
  assert.equal(wcTeamCodeFromName("USA"), "US");
  assert.equal(wcTeamCodeFromName("Turkey"), "TR");
  assert.equal(wcTeamCodeFromName("Turkey or Draw"), "TR", "strips the 'or Draw' suffix");
  assert.equal(wcTeamCodeFromName("Türkiye (draw no bet)"), "TR", "strips the DNB suffix");
  assert.equal(wcTeamCodeFromName("Under 2.5"), null, "no team in a totals label → no flag");
  // The placed USA + Turkey legs resolve to a country code (this is exactly what the UI loader feeds FlagBadge).
  const usa = placedLegs(run.laneA).find((l) => /USA/.test(l.participantName ?? ""));
  const turkey = placedLegs(run.laneB).find((l) => /Turkey/.test(l.participantName ?? ""));
  assert.equal(wcTeamCodeFromName(usa.participantName), "US", "USA flag code present");
  assert.equal(wcTeamCodeFromName(turkey.participantName), "TR", "Turkey flag code present");
});

test("placed Bank Builder leg rows carry start times; the row component renders matchup + flag + start time", () => {
  for (const lane of [run.laneA, run.laneB]) {
    for (const l of placedLegs(lane)) {
      assert.ok(l.startTime && l.startTime.length, `${l.participantName} carries a start time`);
    }
  }
  // LaneLegRow renders the matchup line + flag avatar + start time.
  const panel = fs.readFileSync("src/components/parlays/bank-builder-preview-panel.tsx", "utf8");
  assert.match(panel, /vs \$\{leg\.opponent\}/, "row renders 'vs {opponent}'");
  assert.match(panel, /shortStart\(leg\.startTime\)/, "row renders the start time");
  assert.match(panel, /FlagBadge code=\{id\.countryCode\}/, "WC legs render a flag badge");
});

test("four distinct games across both lanes (no shared/correlated game)", () => {
  const games = [...placedLegs(run.laneA), ...placedLegs(run.laneB)].map((l) => l.legId.split(":")[1]);
  assert.equal(new Set(games).size, games.length, "all four legs are from distinct games");
});

test("Mr. Dub after the June-24 BANKING: no active card, Lane A ladder BANKED (Ladder #2) + Lane B STOPPED, exposure $0; the archived lanes carry the right top-level legs", () => {
  assert.equal(portfolio.openExposure, 0, "June-24 settled (Lane A WON Step 5 → ladder complete; Lane B LOST Step 3 seed) → no open exposure");
  assert.equal((portfolio.activeCards ?? []).length, 0, "no active card — the June-24 cards are settled and banked");
  // After June 24, Lane A COMPLETED the $10k ladder and the operator BANKED it (pendingLaneCompletions removed),
  // so it is a realized completedLadders entry — no operator-gated completion flag remains.
  // After the June-26 settlement Lane A STOPPED (Step 2 LOST) while Lane B advanced (Step 1 WON) and is awaiting
  // its next qualified card.
  const awaiting = portfolio.awaitingCards ?? [];
  assert.ok(awaiting.every((c) => c.kind === "awaiting_next_card"), "no operator-gated completion left — only awaiting-next-card markers");
  assert.ok(awaiting.some((c) => c.laneId === "lane-b"), "Lane B advanced (Step 1 WON June 26) → awaiting next qualified card");
  const banked = (portfolio.completedLadders ?? []).find((l) => l.completedDate === "2026-06-24");
  assert.ok(banked, "Ladder #2 recorded in completedLadders");
  assert.equal(banked.final, 10089.23, "Lane A banked $100→$10,089.23 (official)");
  assert.equal(banked.official, true, "banked ladder is official");
  // The settled June 19 cards live in the ARCHIVED Bank Builder artifact top-level legs.
  const aLegs = JSON.stringify(run.laneA.legs);
  const bLegs = JSON.stringify(run.laneB.legs);
  assert.ok(/Gonzales/.test(aLegs) && /USA/.test(aLegs), "Lane A top-level legs = USA + Gonzales");
  assert.ok(/Hoskins/.test(bLegs) && /Turkey or Draw/.test(bLegs), "Lane B top-level legs = Turkey or Draw + Hoskins");
  assert.ok(ledger.events.some((e) => /lane-a/.test(e.laneId ?? "")), "Lane A events present in the ledger");
});
