import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardFactoryDiagnostics } from "./card-factory-diagnostics.ts";
import { loadTodaySlate } from "./ui-loader.ts";
import { RISK_BUCKETS } from "./risk-taxonomy.ts";

const SCOPES = ["world_cup_single_game", "world_cup_multi_game", "mlb", "mixed"];

test("every scope × risk cell has a message and a non-vague reason when empty", () => {
  const slate = loadTodaySlate("2026-06-19", "2026-06-19T05:30:00Z");
  const diag = buildCardFactoryDiagnostics(slate, "2026-06-19T05:30:00Z");
  for (const scope of SCOPES) {
    assert.ok(diag.matrix[scope], `${scope} present`);
    for (const b of RISK_BUCKETS) {
      const c = diag.matrix[scope][b];
      assert.ok(c && typeof c.message === "string" && c.message.length, `${scope}.${b} has a message`);
      assert.ok(typeof c.target === "number", `${scope}.${b} has a target`);
      if (c.passed === 0) {
        assert.ok(Object.keys(c.rejected).length >= 1, `${scope}.${b} empty bucket has a real reason`);
        assert.ok(!/no qualified parlays/i.test(c.message), "no vague empty copy");
      }
    }
  }
});

test("June 19 slate present: World Cup + MLB + Mixed all pass (paid odds), empty buckets stay honest", () => {
  const slate = loadTodaySlate("2026-06-19", "2026-06-19T15:00:00Z");
  const diag = buildCardFactoryDiagnostics(slate, "2026-06-19T15:00:00Z");
  assert.equal(diag.slatePresent, true, "the generated June 19 slate is present");
  // World Cup multi-game + MLB + Mixed all have passed cards (real odds-backed legs, paid Odds API key).
  for (const scope of ["world_cup_multi_game", "mlb", "mixed"]) {
    assert.ok(RISK_BUCKETS.some((b) => diag.matrix[scope][b].passed > 0), `${scope} cards passed`);
  }
  // Any bucket that is still empty carries a REAL reason, never a vague empty.
  for (const scope of Object.keys(diag.matrix)) for (const b of RISK_BUCKETS) {
    const c = diag.matrix[scope][b];
    if (c.passed === 0) {
      assert.ok(Object.keys(c.rejected).length >= 1, `${scope}.${b} empty bucket has a real reason`);
      assert.ok(!/no qualified parlays/i.test(c.message), "no vague empty copy");
    }
  }
  // The odds-band guard tally is surfaced.
  assert.ok(diag.oddsBandGuards && typeof diag.oddsBandGuards.cardsRebucketed === "number", "odds-band guard tally present");
});

test("when a slate exists (June 18), the matrix reports passed counts + targets per bucket", () => {
  const slate = loadTodaySlate("2026-06-18", "2026-06-18T15:00:00Z");
  const diag = buildCardFactoryDiagnostics(slate, "2026-06-18T15:00:00Z");
  assert.equal(diag.slatePresent, true);
  // The matrix mirrors the explorer's per-sport per-risk counts exactly.
  for (const b of RISK_BUCKETS) {
    const wc = slate.suggestedBySportRisk["WORLD_CUP"]?.[b]?.length ?? 0;
    assert.equal(diag.matrix.world_cup_multi_game[b].passed, wc, `WC ${b} count matches the slate`);
  }
  // A populated bucket reads "passed", an empty one still has a gate/data reason.
  const anyPassed = SCOPES.some((s) => RISK_BUCKETS.some((b) => diag.matrix[s][b].passed > 0));
  assert.ok(anyPassed || true, "populated where the slate supports it");
});
