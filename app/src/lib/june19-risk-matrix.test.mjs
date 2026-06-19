import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = (p) => fs.readFileSync(p, "utf8");

test("Parlay Lab + WC game page render the canonical risk labels (no old bucket labels)", () => {
  const explorer = src("src/components/parlays/parlays-explorer.tsx");
  const game = src("src/components/game/game-detail-page.tsx");
  // both import the canonical labels
  assert.match(explorer, /RISK_LABELS/, "explorer uses canonical labels");
  assert.match(game, /RISK_LABELS/, "game page uses canonical labels");
  // no old bucket labels remain in these major surfaces
  for (const surface of [explorer, game]) {
    assert.ok(!/Lower variance/i.test(surface), "no 'Lower variance'");
    assert.ok(!/Higher return/i.test(surface), "no 'Higher return'");
  }
});

test("Parlay Lab shows a coverage matrix, a diagnostics drawer, and scoped empty reasons", () => {
  const explorer = src("src/components/parlays/parlays-explorer.tsx");
  assert.match(explorer, /Card coverage by sport × risk/, "coverage matrix");
  assert.match(explorer, /Why are some buckets empty/, "diagnostics drawer");
  assert.match(explorer, /buildCardFactoryDiagnostics/, "uses the card-factory diagnostics");
  assert.match(explorer, /emptyReason/, "scoped per-risk empty reason");
});

test("WC game page renders all four canonical risk buckets with scoped empties", () => {
  const game = src("src/components/game/game-detail-page.tsx");
  assert.match(game, /RISK_ORDER\.map/, "iterates all four risk buckets");
  assert.match(game, /No .* card passed the gates for this match/, "scoped empty per bucket");
});

test("card-factory diagnostics snapshot exists for the current date", () => {
  const d = JSON.parse(src("public/data/parlays/card-factory-diagnostics.json"));
  assert.ok(d.matrix && d.matrix.world_cup_single_game && d.matrix.mlb && d.matrix.mixed, "matrix scopes present");
  for (const scope of Object.keys(d.matrix)) {
    for (const b of ["low", "medium", "high", "longshot"]) {
      assert.ok(d.matrix[scope][b]?.message, `${scope}.${b} has a message`);
    }
  }
  assert.ok(typeof d.summary === "string" && d.summary.length, "summary present");
});
