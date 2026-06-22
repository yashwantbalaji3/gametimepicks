import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";
import { wcTeamCodeFromName } from "./data-world-cup.ts";

const run = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
const portfolio = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
const ledger = JSON.parse(fs.readFileSync("public/data/mr-dub/ledger.json", "utf8"));
const bb = loadTodaySlate("2026-06-19", "2026-06-19T17:45:00Z").bankBuilderPreview;
// After June 19 settlement no step is "pending"; the lane's current-card legs (now settled) carry the
// same participants + identity, so quality assertions on the placed card still hold.
const activeLegs = (lane) => (lane.legs?.length ? lane.legs : lane.steps.find((s) => s.status === "pending")?.legs ?? []);

test("Griffin Jax (2/5) was replaced — no weak pitcher-strikeout-under leg remains in active Bank Builder", () => {
  const allActive = [...activeLegs(bb.laneA), ...activeLegs(bb.laneB)];
  assert.ok(!allActive.some((l) => /Griffin Jax/.test(l.participant)), "Jax removed from active lanes");
  // No pitcher strikeout prop in the active cards (the replacement is a position-player prop).
  assert.ok(!allActive.some((l) => /Strikeouts/i.test(l.market)), "no pitcher-K leg in active Bank Builder cards");
});

test("Lane A: USA ML kept + Nick Gonzales replacement with 5/5 last-5, card in $600-750 target", () => {
  const legs = activeLegs(bb.laneA);
  assert.ok(legs.some((l) => /USA|United States/.test(l.participant)), "USA moneyline kept");
  const gonz = legs.find((l) => /Gonzales/.test(l.participant));
  assert.ok(gonz, "Nick Gonzales is the replacement");
  assert.ok(gonz.last5 && gonz.last5.hitRate.hits >= 4, `Gonzales last-5 ≥ 4/5 (got ${gonz.last5?.hitRate.hits})`);
  const step2 = bb.laneA.steps.find((s) => s.step === 2);
  assert.ok(step2.payout >= 600 && step2.payout <= 750, `Lane A projected ~$601.56 in target (got ${step2.payout})`);
});

test("Turkey or Draw (Double Chance) and Draw No Bet are distinct markets — never conflated", () => {
  // The corrected Lane B leg is the Double Chance market, not DNB.
  const turkey = activeLegs(bb.laneB).find((l) => /Turkey/.test(l.participant));
  assert.ok(turkey, "Lane B keeps a Turkey leg");
  assert.equal(turkey.market, "double_chance", "Lane B uses the Double Chance market");
  assert.match(turkey.participant, /Turkey or Draw/, "label reads 'Turkey or Draw' (Double Chance)");
  assert.ok(!/draw no bet|draw_no_bet/i.test(turkey.participant), "Double Chance is not labeled Draw No Bet");
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
  // Live: USA + Turkey legs carry a country code so FlagBadge renders.
  const usa = activeLegs(bb.laneA).find((l) => /USA/.test(l.participant));
  const turkey = activeLegs(bb.laneB).find((l) => /Turkey/.test(l.participant));
  assert.equal(usa.identity.countryCode, "US", "USA flag code present");
  assert.equal(turkey.identity.countryCode, "TR", "Turkey flag code present");
});

test("active Bank Builder leg rows expose opponent + start time; MLB legs carry last-5", () => {
  for (const lane of [bb.laneA, bb.laneB]) {
    for (const l of activeLegs(lane)) {
      assert.ok(l.opponent && l.opponent.length, `${l.participant} shows an opponent`);
      assert.ok(l.startTime && l.startTime.length, `${l.participant} shows a start time`);
      if (l.sport === "MLB") assert.ok(l.last5 && l.last5.games.length > 0 && l.last5.source === "mlb_stats_api", `${l.participant} carries official last-5`);
    }
  }
  // LaneLegRow renders the matchup line + flag avatar.
  const panel = fs.readFileSync("src/components/parlays/bank-builder-preview-panel.tsx", "utf8");
  assert.match(panel, /vs \$\{leg\.opponent\}/, "row renders 'vs {opponent}'");
  assert.match(panel, /shortStart\(leg\.startTime\)/, "row renders the start time");
  assert.match(panel, /FlagBadge code=\{id\.countryCode\}/, "WC legs render a flag badge");
});

test("four distinct games across both lanes (no shared/correlated game)", () => {
  const games = [...activeLegs(bb.laneA), ...activeLegs(bb.laneB)].map((l) => l.legId.split(":")[1]);
  assert.equal(new Set(games).size, games.length, "all four legs are from distinct games");
});

test("Mr. Dub after cross-slate resume: two active cards, exposure $200; settled lanes carry the right top-level legs", () => {
  assert.equal(portfolio.openExposure, 200, "Lane A Step 3 + Lane B Step 1 placed (pending) → $200 open exposure");
  assert.equal((portfolio.activeCards ?? []).length, 2, "two active cards after the cross-slate resume");
  // The settled June 19 cards still live in the Bank Builder artifact top-level legs (unchanged).
  const aLegs = JSON.stringify(run.laneA.legs);
  const bLegs = JSON.stringify(run.laneB.legs);
  assert.ok(/Gonzales/.test(aLegs) && /USA/.test(aLegs), "Lane A top-level legs = USA + Gonzales");
  assert.ok(/Hoskins/.test(bLegs) && /Turkey or Draw/.test(bLegs), "Lane B top-level legs = Turkey or Draw + Hoskins");
  assert.ok(ledger.events.some((e) => /lane-a/.test(e.laneId ?? "")), "Lane A events present in the ledger");
});
