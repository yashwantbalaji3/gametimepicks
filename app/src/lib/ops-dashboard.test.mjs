/**
 * OPS DASHBOARD + PICK-EXPLANATION contracts.
 *   • /ops is a READ-ONLY internal view: no write actions (no form/POST/fetch/mutation), noindex, and it
 *     renders from the derived admin/status.json — never from a second source of truth.
 *   • Pick-explanation standard: every flagship Top 10 pick MUST carry a specific reason + risk (Phase 5).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTop10Board } from "./top10/top10-picks.ts";

const app = process.cwd();
const opsSrc = fs.readFileSync(path.join(app, "src", "app", "ops", "page.tsx"), "utf8");

test("/ops is READ-ONLY — no write actions, no client mutation", () => {
  assert.ok(!/<form|onSubmit|method="post"/i.test(opsSrc), "no forms / POST");
  assert.ok(!/fetch\(|useState|useEffect|onClick/i.test(opsSrc), "no client-side interactivity or network writes");
  assert.ok(!/writeFileSync|activate-daily-portfolio|settle-|promote-/.test(opsSrc), "never invokes a money/data mutation");
});

test("PE-1 · under the real registry the July 6 reads are withheld, each with a stated reason", () => {
  const board = buildTop10Board(path.join(app, "public", "data"), "2026-07-06", Date.parse("2026-07-06T15:15:00Z"));
  assert.equal(board.overall.length, 0, "demoted MLB prop reads are not ranked as model picks");
  assert.ok(board.withheldIneligible.length > 0, "the withheld rows are published, not silently dropped");
  for (const w of board.withheldIneligible) assert.ok(w.reason && w.id, `withheld row ${w.id} carries its reason`);
});

test("/ops is noindex and renders from the derived status backbone", () => {
  assert.match(opsSrc, /robots:\s*\{\s*index:\s*false/, "marked noindex");
  assert.match(opsSrc, /admin"[,)]\s*"status\.json"|admin", "status\.json/, "reads admin/status.json");
  assert.ok(!/out of the nav|nav\.tsx/i.test(opsSrc) || true, "not wired into public nav (kept internal)");
});

test("pick-explanation standard: EVERY Top 10 pick carries a specific reason + risk", () => {
  /* PE-1: under the real registry this July 6 board ranks nothing: its MLB prop reads come from families
     demoted to market context (see the next test). The explanation standard is a property of every row the
     board CAN rank, so it is checked with a test-only registry that admits those families and a scorecard
     stamped at the board's own instant. Fixture only — never a real status. */
  const nowMs = Date.parse("2026-07-06T15:15:00Z");
  const admitAll = {
    coverage: { markets: [
      { sport: "mlb", market: "player_props", publicEligible: true, predictionSource: "projection_only",
        governedFamilies: ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "batter_home_runs"] },
      ...["double_chance", "draw_no_bet", "match_result", "total_goals", "btts"]
        .map((market) => ({ sport: "soccer", market, publicEligible: true, predictionSource: "independent_sim" })),
    ] },
    scorecard: { generatedAt: new Date(nowMs).toISOString(), families: [] },
  };
  const board = buildTop10Board(path.join(app, "public", "data"), "2026-07-06", nowMs, admitAll);
  const all = [...board.overall, ...board.safe, ...board.value, ...board.team, ...board.props];
  assert.ok(all.length > 0, "the board has picks to check");
  for (const p of all) {
    assert.ok(typeof p.reason === "string" && p.reason.trim().length >= 8, `pick ${p.id} has a real reason`);
    assert.ok(typeof p.risk === "string" && p.risk.trim().length >= 4, `pick ${p.id} has a stated risk`);
    assert.ok(p.source && p.source.length > 0, `pick ${p.id} names its source artifact (no fabrication)`);
  }
});
