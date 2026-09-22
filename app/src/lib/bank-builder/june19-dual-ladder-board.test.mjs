/**
 * v1.7 UX P-1 (docs/V17_UX_AUDIT_PLAY_SURFACES.md): the unmounted dual-ladder-board.tsx was deleted and
 * the four tests that pinned its source went with it — a test that reads an unreachable component proves
 * nothing a user can see. The page-level assertion below is what remains.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");

test("page leads the launched section with the ClimbHero live climb", () => {
  // The dense DualLadderBoard was replaced as the page's LEAD by the ClimbHero flagship — a single,
  // plain-English live-climb hero that still presents BOTH lanes (built from the public dual-ladder
  // view models). The board component was deleted in v1.7 (UX P-1); nothing imports it.
  assert.match(page, /<ClimbHero/, "ClimbHero leads the launched section");
  assert.match(page, /import ClimbHero[^\n]*from "@\/components\/bank-builder\/climb-hero"/, "imported");
  assert.match(page, /buildPublicDualLadder\(/, "both lanes built from the public dual-ladder view model");
});
