import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio, MOONSHOT_MAX_EXPOSURE } from "./daily-portfolio/accounting.ts";
import { buildDailyPortfolio } from "./mr-dub/daily-portfolio.ts";
import { makeSettledApprovedRoot } from "./__testsupport__/settled-ladder-root.mjs";
import { pinnedLaneRoot } from "./bank-builder/fixtures/root.mjs";

const read = (p) => fs.readFileSync(p, "utf8");
const root = pinnedLaneRoot();
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z"; // before every June-23 kickoff, outside the 30m cutoff
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));
const round2 = (n) => Math.round(n * 100) / 100;

// P192 · PINNED LANE STATE. This regression is about a specific historical lane state, so it reads a
// pinned snapshot instead of the live ladder. Reading `public/data` directly made the running
// product double as a fixture: Bank Builder and Moonshot could not advance to a live card without
// breaking assertions that require July's state to still be on disk. The assertions are unchanged —
// only where their data comes from is.
test("plan (dry-run): auto BB candidate lane + two Moonshot lanes surface as candidates, $0 exposure (dry-run places nothing)", () => {
  const plan = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ false);
  // On this historical June-23 slate no operator-approved pin applies, so the auto path proposes CANDIDATE cards
  // only — the disciplined auto-selector surfaces the qualifying Bank Builder lane(s) plus Moonshot A/B, and a
  // dry-run still places nothing (no lane goes active).
  const bb = plan.lanes.filter((l) => l.product === "bank-builder");
  const moon = plan.lanes.filter((l) => l.product === "moonshot");
  assert.ok(bb.length >= 1, "at least one Bank Builder candidate lane surfaces");
  assert.equal(moon.length, 2, "Moonshot A/B present");
  assert.equal(plan.lanes.length, bb.length + moon.length, "lanes = BB candidate lane(s) + Moonshot A/B");
  assert.equal(plan.openExposure, 0, "dry-run places no exposure");
  assert.equal(plan.availableBankroll, plan.activeBankroll, "available = active when nothing placed");
  for (const l of plan.lanes) assert.notEqual(l.status, "active", "no lane active in dry-run");
});

test("apply: exposure math — BB exposure = $100 × active lanes; Moonshot adaptive; money UNCHANGED", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ true);
  assert.equal(dp.activeBankroll, 19065.40, "active bankroll unchanged at activation (post July-5 canonical)");
  assert.equal(dp.crownBankroll, 20465.40, "crown untouched");
  // Exposure is derived from whichever lanes actually activate on the slate; Moonshot A/B still served.
  const activeBB = dp.lanes.filter((l) => l.product === "bank-builder" && l.status === "active");
  assert.equal(dp.products.bankBuilder.exposure, round2(activeBB.length * 100), "Bank Builder exposure = $100 × active lanes");
  const activeMoon = dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active");
  assert.equal(dp.products.moonshot.exposure, round2(activeMoon.length * 25), "moonshot exposure = $25 × active lanes");
  assert.ok(dp.products.moonshot.exposure <= MOONSHOT_MAX_EXPOSURE, "moonshot exposure within cap");
  assert.equal(dp.openExposure, round2(dp.products.bankBuilder.exposure + dp.products.moonshot.exposure), "open = BB + moonshot");
  assert.equal(dp.availableBankroll, round2(dp.activeBankroll - dp.openExposure), "available = active − exposure");
});

test("apply (live July-7): ZERO active BB lanes (Lane A settled WON, $0 exposure); Lane B no-play; Moonshot lanes are STRUCTURED team-market longshots (+700 floor gates activation); combined odds reconcile", () => {
  // Live July-7 activated state, SAME-DAY POST-SETTLEMENT: the operator-approved cycle-8 Step-2 card (Colombia
  // or Draw + Argentina to win) SETTLED WON at ~11pm ET — so Lane A is rendered WON / $0 exposure, NOT an active
  // $100-at-risk card. It is still SERVED (visible history), just not active. Lane B is a deliberate no-play
  // (absent). BB open exposure is $0. Moonshot B is active (clears the +700 longshot floor); Moonshot A is only a
  // CANDIDATE (below the floor → never activated).
  const LIVE_DATE = "2026-07-07";
  const LIVE_NOW = "2026-07-07T12:00:00Z"; // pre-slate: before the 16:00Z Argentina/Egypt kickoff
  // The July-21 review restart pushed the settled July-7 cycle into the live ladder's priorLane; reconstruct the
  // pre-restart settled ladder so Lane A's same-day-SETTLED (WON, $0 exposure) state is validated against canonical
  // July-7 sources. Moonshot A/B come from the slate generator (unchanged in the copy) and still reconcile.
  const { tmp, dataRoot } = makeSettledApprovedRoot(root);
  let dp;
  try {
    dp = buildPersistedDailyPortfolio(dataRoot, LIVE_NOW, LIVE_DATE, LIVE_NOW, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(bb.length, 1, "one Bank Builder lane served (Lane A cycle-8 Step 2, approved July-7; Lane B no-play)");
  assert.equal(bb[0].lane, "A", "the served lane is Lane A");
  assert.equal(bb.filter((l) => l.status === "active").length, 0, "ZERO active BB lanes — Lane A settled WON, seed no longer at risk");
  assert.equal(dp.products.bankBuilder.exposure, 0, "BB open exposure is $0 after the same-day settlement");
  for (const l of bb) {
    assert.equal(l.status, "won", `Bank Builder ${l.lane} rendered WON (same-day settled Step 2)`);
    assert.equal(l.exposure, 0, `Bank Builder ${l.lane} settled → $0 exposure`);
    assert.equal(l.clearedSteps, 2, `Bank Builder ${l.lane} Step 2 counts as a cleared rung`);
    assert.ok(l.legCount <= 4, "Bank Builder lane ≤ 4 legs (rung card)");
  }
  const servedText = JSON.stringify(bb[0].legs);
  assert.ok(/Colombia or Draw/.test(servedText) && /Argentina to win/.test(servedText), "Lane A preserves the approved July-7 survival legs as history");
  assert.equal(moon.length, 2, "Moonshot A/B present");
  for (const l of moon) {
    // NEW spec: structured team-market lanes (result + total per game) — team markets only (no player props).
    assert.ok(l.legs.every((g) => g.id.startsWith("team:") && g.player === null), `Moonshot ${l.lane}: team markets only (no player props)`);
    // The +700 longshot floor gates ACTIVATION: an active lane must clear it; a below-floor card stays candidate.
    if (l.status === "active") assert.ok(l.combinedOdds >= 700, `Moonshot ${l.lane}: active lane clears the +700 longshot floor`);
    else assert.ok(l.combinedOdds < 700, `Moonshot ${l.lane}: below-floor card stays a candidate (never activated)`);
  }
  const moonA = moon.find((l) => l.lane === "A");
  const moonB = moon.find((l) => l.lane === "B");
  assert.equal(moonA?.status, "candidate", "Moonshot A is a candidate (< +700 floor, NOT active)");
  assert.equal(moonB?.status, "active", "Moonshot B is active (clears the +700 floor)");
  for (const l of dp.lanes) {
    if (!l.legs.length) continue;
    const d = l.legs.reduce((p, g) => p * dec(g.odds), 1);
    assert.ok(Math.abs(decToAmerican(d) - l.combinedOdds) <= 3, `${l.id} combined odds reconcile from legs`);
    assert.ok(Math.abs(l.potentialReturn - l.stake * d) < 0.5, `${l.id} potential return = stake × combined decimal`);
  }
});

test("apply: Bank Builder lanes are max 1 leg/game (no SGP); Moonshot lanes are STRUCTURED (result + total per game → 2 legs/game)", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  for (const l of dp.lanes.filter((x) => x.product === "bank-builder")) {
    const games = l.legs.map((g) => g.matchup);
    assert.equal(new Set(games).size, games.length, `Bank Builder ${l.lane}: max 1 leg per game (no fabricated SGP)`);
  }
  // Moonshot is INTENTIONALLY structured: each game contributes a RESULT leg + a TOTAL/BTTS leg (2 legs/game),
  // so a game appears more than once within a lane by design.
  for (const l of dp.lanes.filter((x) => x.product === "moonshot")) {
    const perGame = new Map();
    for (const g of l.legs) perGame.set(g.matchup, [...(perGame.get(g.matchup) ?? []), g.market]);
    for (const [matchup, markets] of perGame) {
      assert.ok(markets.length >= 1, `Moonshot ${l.lane}: game ${matchup} contributes at least a result/total leg`);
      // Where a game contributes 2+ legs they are DIFFERENT markets (result + total/BTTS), not a duplicated pick.
      assert.equal(new Set(markets).size, markets.length, `Moonshot ${l.lane}: game ${matchup} pairs DISTINCT markets (result + total/BTTS), no duplicate market`);
    }
    // At least one game contributes a structured pair (2 legs) — this is the redesign's whole point.
    assert.ok([...perGame.values()].some((m) => m.length >= 2), `Moonshot ${l.lane}: at least one game contributes a result + total structured pair`);
  }
});

test("started-game guard: nothing is eligible/active once a leg's game has started", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure after kickoff (started games not activatable)");
  for (const l of after.lanes) assert.notEqual(l.status, "active", "no lane active once games started");
});

test("lane independence: Bank Builder lanes never share a leg; Moonshot A/B are TIERS that overlap by design", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  // Bank Builder lanes must be mutually independent (no shared leg). Post June-29 there are no BB lanes today,
  // so this is trivially satisfied — but assert it explicitly for the day a BB lane returns.
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const bbIds = bb.flatMap((l) => l.legs.map((g) => g.id));
  assert.equal(new Set(bbIds).size, bbIds.length, "Bank Builder lanes share no leg (independent)");
  // Moonshot A and B are now TIERS (structured ⊆ aggressive): they SHARE legs by design, so cross-lane
  // uniqueness no longer applies. Assert the tier relationship instead: Lane B is a superset of Lane A.
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  if (moon.length === 2) {
    const [a, b] = moon[0].lane === "A" ? moon : [moon[1], moon[0]];
    const aIds = new Set(a.legs.map((g) => g.id));
    const bIds = new Set(b.legs.map((g) => g.id));
    assert.ok([...aIds].every((id) => bIds.has(id)), "Moonshot Lane B is a superset of Lane A (tier overlap by design)");
    assert.ok(b.legs.length >= a.legs.length, "Lane B (aggressive) carries at least as many legs as Lane A (structured)");
    // Within EACH Moonshot lane, no leg id is duplicated (each structured pick appears once per lane).
    for (const l of moon) {
      const ids = l.legs.map((g) => g.id);
      assert.equal(new Set(ids).size, ids.length, `Moonshot ${l.lane}: no leg duplicated within the lane`);
    }
  }
});

test("persisted daily-portfolio.json (post July-5 settlement) is internally consistent + never touches canonical money", () => {
  // After Ladder #2 was banked, the daily portfolio rolls forward. Whether the day's lanes are active (real
  // cards placed) or awaiting depends on the live slate, so assert the INVARIANTS.
  const p = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(p.version, "daily-portfolio-v1");
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, "date is the current slate (rolls daily — date-agnostic)");
  assert.equal(p.activeBankroll, 19065.40); assert.equal(p.crownBankroll, 20465.40);
  const sumExp = p.lanes.filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(p.openExposure, sumExp, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(p.availableBankroll, Math.round((p.activeBankroll - p.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(p.settlement.realizedPnl, 0, "no realized P/L until official settlement");
  // Canonical money is untouched by the daily view. Banking Ladder #2 ($10,089.23) lifted the crown to the
  // Σ of the two completed-ladder finals (10,376.17 + 10,089.23 = 20,465.40). The dual-lane settlements through
  // July-5 moved the active bankroll (fourteen lost seeds → 19,065.40); Lane A then WON its July-6 cycle-8 Step-1
  // and its July-7 Step-2 (both rolled unrealized, bankroll unchanged) → record 19-14.
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(port.currentBankroll, 19065.40); assert.equal(port.crownBankroll, 20465.40);
  assert.deepEqual(port.record, { wins: 19, losses: 14, voids: 0, pending: 0 });
});

test("daily-portfolio read view reflects the persisted state + is internally consistent", () => {
  const liveDate = JSON.parse(read("public/data/mr-dub/daily-portfolio.json")).date; // current slate (date-agnostic)
  const dp = buildDailyPortfolio(root, `${liveDate}T10:00:00Z`, liveDate);
  assert.equal(dp.activeBankroll, 19065.40);
  assert.equal(Math.round((dp.exposure.core + dp.exposure.moonshot) * 100) / 100, dp.openExposure, "core + moonshot = open exposure");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(dp.anyActive, dp.cards.some((c) => c.status === "active"), "anyActive reflects the cards");
});

test("ACTIVATION NEVER mutates the legacy portfolio/crown/record", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Banking Ladder #2 ($10,089.23) lifted the crown to 20,465.40 (Σ of the two completed-ladder finals).
  // The dual-lane settlements through July-5 moved the canonical money: fourteen lost seeds total drop the
  // active bankroll to 19,065.40; Lane A then WON its July-6 cycle-8 Step-1 and its July-7 Step-2 (both rolled
  // unrealized) → record 19-14 with the bankroll unchanged. Daily-portfolio activation itself must never touch
  // this canonical money state.
  assert.equal(p.currentBankroll, 19065.40, "active bankroll (legacy) reflects banked Ladder #2 + 14 dual-lane lost seeds (a won step rolls unrealized)");
  assert.equal(p.crownBankroll, 20465.40, "crown = Σ of two completed-ladder finals");
  assert.equal(p.openExposure, 0, "legacy dual-ladder exposure $0 (settled rungs released; awaiting a fresh slate)");
  assert.deepEqual(p.record, { wins: 19, losses: 14, voids: 0, pending: 0 }, "core record 19-14-0-0 (Lane A won its July-6 cycle-8 Step-1 and July-7 Step-2)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate");
});

test("Bank Builder + Moonshot both render the shared ladder; Moonshot has a step rail", () => {
  const ladder = read("src/components/ladders/product-lanes-ladder.tsx");
  assert.match(ladder, /Step/i, "ladder renders steps");
  const moon = read("src/app/moonshot/page.tsx");
  const bank = read("src/app/bank-builder/page.tsx");
  assert.match(moon, /ProductLanesLadder/, "moonshot uses the shared step-rail ladder");
  // Bank Builder consolidated to a SINGLE ladder visualization (ClimbHero) — it renders the per-lane
  // 5-rung climb with the current step's daily legs in each lane card.
  assert.match(bank, /<ClimbHero/, "bank-builder uses the single ClimbHero ladder");
  assert.match(moon, /buildDailyPortfolio/, "moonshot reads the daily portfolio");
});
