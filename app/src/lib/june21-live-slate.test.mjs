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

test("World Cup Specials are date-parameterized to the live slate and role-screened (no bench/unknown)", () => {
  const sp = read("public/data/world-cup/world-cup-specials.json");
  // DATE-AGNOSTIC: the Specials generator must emit the current live slate (never the hardcoded June 20
  // demo). Pin it to the live projections date so it survives the next daily roll.
  const proj = read("public/data/world-cup/projections/latest.json");
  assert.equal(sp.date, proj.date, "Specials generator emitted the current slate (not the hardcoded June 20 demo)");
  // Either a populated slate (1..5 honestly-labeled Specials) or a valid empty end-of-slate state.
  assert.ok(sp.cards.length >= 0 && sp.cards.length <= 5, "≤5 Specials");
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
  // When The Odds API exposes no soccer player props the build honestly falls back to TEAM-MODEL cards.
  // That fallback must be flagged in diagnostics and the cards must be team-only — never fabricated players.
  if (sp.diagnostics?.fallbackMode === "team_models") {
    assert.equal(sp.diagnostics.playerPropsUnavailable, true, "team-model fallback honestly flags player props unavailable");
    for (const c of sp.cards) {
      assert.equal(c.legs.filter((l) => l.kind === "player").length, 0, `${c.id} is team-only in the team-model fallback`);
    }
  }
});

test("June 21 coverage matrix reconciles (rows + risk totals sum to grand total)", () => {
  const m = read("public/data/parlays/coverage-matrix.json");
  assert.equal(m.date, "2026-06-23");
  const rowSum = m.rows.reduce((n, r) => n + r.total, 0);
  const riskSum = Object.values(m.riskTotals).reduce((n, v) => n + v, 0);
  assert.equal(rowSum, m.grandTotal, "rows sum to grand total");
  assert.equal(riskSum, m.grandTotal, "risk totals sum to grand total");
  assert.ok(m.grandTotal > 0, "live slate produced cards");
});

test("Bank Builder June-24 run BANKED (Lane A completed, Lane B stopped) → archived; cumulative bankroll + crown intact, Moonshot settled", () => {
  const p = read("public/data/mr-dub/portfolio.json");
  assert.equal(p.currentBankroll, 19965.4, "cumulative bankroll after banking Ladder #2 (crown − $500 five real lost seeds)");
  assert.equal(p.openExposure, 0, "settled rungs released → $0 open in portfolio.json (live Step card tracked in daily-portfolio)");
  assert.equal(p.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  assert.equal(p.crownBankroll, 20465.4, "protected crown untouched (two banked $100→$10k ladders)");
  assert.equal(p.moonshot.status, "stopped", "Moonshot settled LOST → stopped");
  // The completed/stopped June-24 dual-lane run is BANKED + archived (the live artifact is a fresh cycle-2).
  const dual = read("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json").run;
  assert.equal(dual.laneA.laneStatus, "completed", "Lane A Step 5 settled WON June 24 → ladder completed");
  assert.equal((dual.laneA.steps.find((s) => s.step === 3) || {}).status, "settled", "Lane A Step 3 settled (WON) cross-slate card");
  assert.equal((dual.laneA.steps.find((s) => s.step === 3) || {}).result, "won", "Lane A Step 3 settled WON (Egypt + Algeria, official)");
  assert.equal(dual.laneB.laneStatus, "stopped", "Lane B Step 3 settled LOST June 24 → lane stopped");
});
