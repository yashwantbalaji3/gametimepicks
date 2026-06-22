import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// June 21 live data refresh — guards that the real odds-backed June 21 slate is present and clean,
// and that the date-parameterized Specials generator emitted June 21 (not the hardcoded June 20 demo).
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

test("June 21 World Cup projections are live + odds-backed", () => {
  const proj = read("public/data/world-cup/projections/2026-06-21.json");
  assert.equal(proj.date, "2026-06-21");
  assert.equal(proj.provider, "odds_api", "odds-backed, not fabricated");
  assert.ok((proj.matches ?? []).length > 0, "has market projections");
  assert.ok(proj.matches.every((m) => m.bookmaker && typeof m.americanOdds === "number"), "every market carries a real book price");
});

test("June 21 World Cup Specials are date-parameterized to June 21 and role-screened (no bench/unknown)", () => {
  const sp = read("public/data/world-cup/world-cup-specials.json");
  assert.equal(sp.date, "2026-06-21", "Specials generator emitted the June 21 slate (not the hardcoded June 20 demo)");
  assert.ok(sp.cards.length >= 1 && sp.cards.length <= 5, "1..5 Specials");
  for (const c of sp.cards) {
    assert.ok(c.combinedOdds > 700 && c.combinedOdds < 3000, `${c.id} combined ${c.combinedOdds} in band`);
    for (const l of c.legs) {
      if (l.odds != null) assert.ok(l.odds > -250 && l.odds < 200, `${l.participant} ${l.odds} in leg band`);
      // No bench / unknown / rotation-risk player legs may appear in a Special.
      if (l.kind === "player") {
        assert.ok(["confirmed_starter", "key_attacker", "projected_starter"].includes(l.roleTier),
          `${l.participant} role ${l.roleTier} is screened (no bench/unknown)`);
      }
    }
  }
});

test("June 21 coverage matrix reconciles (rows + risk totals sum to grand total)", () => {
  const m = read("public/data/parlays/coverage-matrix.json");
  assert.equal(m.date, "2026-06-21");
  const rowSum = m.rows.reduce((n, r) => n + r.total, 0);
  const riskSum = Object.values(m.riskTotals).reduce((n, v) => n + v, 0);
  assert.equal(rowSum, m.grandTotal, "rows sum to grand total");
  assert.equal(riskSum, m.grandTotal, "risk totals sum to grand total");
  assert.ok(m.grandTotal > 0, "live slate produced cards");
});

test("Bank Builder / Moonshot resumed ACTIVE cross-slate — real exposure; corrected bankroll + crown intact", () => {
  const p = read("public/data/mr-dub/portfolio.json");
  assert.equal(p.currentBankroll, 10176.17, "reconciled bankroll preserved (pending cards don't realize)");
  assert.equal(p.openExposure, 200, "Lane A + Lane B core seeds placed as active cross-slate cards");
  assert.equal(p.totalOpenExposure, 225, "core $200 + moonshot $25");
  assert.equal(p.crownBankroll, 10376.17, "protected crown untouched");
  assert.equal(p.moonshot.status, "active", "Moonshot resumed active");
  const dual = read("public/data/methodology/launch/dual-bank-builder-active.json").run;
  assert.equal(dual.laneA.laneStatus, "active");
  assert.equal((dual.laneA.steps.find((s) => s.step === 3) || {}).status, "pending", "Lane A Step 3 placed (pending) cross-slate card");
  assert.equal(dual.laneB.laneStatus, "active");
});
