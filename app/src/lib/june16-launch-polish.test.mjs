/**
 * June-16 launch-polish contract: Bank Builder V2 status surfaces, the compact Bank Builder rail,
 * the filterable Today parlays, the V2 panel, and the enhanced World Cup game accordions. Source +
 * data level checks (suite runs pre-build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("compact Bank Builder status rail shows the Run #1/#2/#3 timeline", () => {
  const src = read("src/components/bank-builder/bank-builder-status-rail.tsx");
  assert.ok(/Run #1/.test(src) && /Run #2/.test(src) && /Run #3/.test(src), "all three runs");
  assert.ok(/completed/.test(src) && /closed/.test(src), "Run #1 completed + Run #2 closed states");
  assert.ok(/Bank Builder V2/.test(src), "surfaces the V2 gate status");
});

test("Today suggested parlays are filterable by sport + variance", () => {
  const src = read("src/components/todays-parlays.tsx");
  for (const k of ["world_cup", "mlb", "mixed"]) assert.ok(src.includes(`"${k}"`), `sport filter ${k}`);
  for (const v of ["Low Risk", "Medium Risk", "High Risk"]) assert.ok(src.includes(v), `canonical risk label ${v}`);
  assert.ok(src.includes("useState"), "client-side filtering");
});

test("Bank Builder V2 panel shows per-leg survival score + blockers", () => {
  const src = read("src/components/bank-builder/bank-builder-v2-panel.tsx");
  assert.ok(/survival score/i.test(src), "explains survival score");
  assert.ok(/ScoreBar|survivalScore/.test(src), "renders a per-leg score");
  assert.ok(/Why no launch|blockers/i.test(src), "shows blockers when not launched");
});

test("World Cup surface surfaces a player prop with a portrait + a game link", () => {
  // 2026-07-09: the daily WC focus accordion moved off the compact /today Daily Model Hub. Its player-prop
  // presentation (portrait + per-game link) now lives on the World Cup model-picks table.
  const table = read("src/components/world-cup/model-picks-table.tsx");
  assert.ok(table.includes("PlayerAvatar"), "player portrait rendered on the WC model-picks table");
  const wcPage = read("src/app/world-cup/page.tsx");
  assert.ok(wcPage.includes("/games/world-cup/") || table.includes("/games/world-cup/"), "per-game link present on a WC surface");
});

test("V2 evaluation loader contract matches the artifact", () => {
  const evalDoc = JSON.parse(read("public/data/bank-builder/v2-evaluation-latest.json"));
  assert.ok(["launch", "evaluating"].includes(evalDoc.decision));
  assert.ok(typeof evalDoc.eligibleThreshold === "number");
  assert.ok(Array.isArray(evalDoc.strongestCandidates) && evalDoc.strongestCandidates.length > 0);
  // every strongest candidate carries a survival score + tier (drives the UI)
  for (const c of evalDoc.strongestCandidates) {
    assert.ok(typeof c.survivalScore === "number", "survival score present");
    assert.ok(typeof c.tier === "string", "tier present");
  }
});

test("completed crown bankroll is surfaced from the ONE canonical source (not a hardcoded literal)", async () => {
  // The status rail must NOT hardcode the crown figure — it renders the run1Bankroll prop, and the canonical
  // value comes from crownLadderSummary(banked-ladders.json). This is the anti-hardcode invariant.
  const rail = read("src/components/bank-builder/bank-builder-status-rail.tsx");
  assert.ok(!rail.includes("10,376.17"), "status rail no longer hardcodes the crown bankroll");
  assert.ok(/run1Bankroll/.test(rail), "status rail renders the run1Bankroll prop (canonical-sourced)");
  const { crownLadderSummary } = await import("./bank-builder/crown-summary.ts");
  const path = await import("node:path");
  const crown = crownLadderSummary(path.join(process.cwd(), "public", "data"));
  assert.equal(crown.final, 10376.17, "canonical crown final derives from banked-ladders");
  assert.equal(crown.recordLabel, "5–0", "canonical crown record derives from banked-ladders steps");
});
