import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const board = fs.readFileSync("src/components/bank-builder/dual-ladder-board.tsx", "utf8");
const page = fs.readFileSync("src/app/bank-builder/page.tsx", "utf8");

test("board renders two lane ladders from the public view model (side-by-side desktop, stacked mobile)", () => {
  assert.match(board, /buildPublicDualLadder\(preview\.laneA, "lane-a"\)/, "Lane A view");
  assert.match(board, /buildPublicDualLadder\(preview\.laneB, "lane-b"\)/, "Lane B view");
  assert.match(board, /grid-cols-1 gap-3 lg:grid-cols-2/, "stacked mobile → two columns desktop");
  assert.match(board, /view\.steps\.map\(\(s\) => <LadderStepRow/, "renders all 5 step rows per lane");
});

test("step rows show the canonical $start → $goal money target via a vertical rail", () => {
  assert.match(board, /usd\(step\.startTarget\).*usd\(step\.goalTarget\)/s, "row shows the ladder target money path");
  assert.match(board, /step\.multiplier\.toFixed\(2\)/, "shows the required multiple");
  assert.match(board, /RailNode/, "vertical rail nodes (cleared ✓ / glow / number)");
  assert.match(board, /actual .*usd2\(step\.actualStake\).*usd2\(step\.actualReturn\)/s, "shows actual money for cleared/active steps (e.g. $100.00 → $197.88)");
});

test("each step is an expandable <details> drawer; awaiting/queued show an honest candidate or reason (no fabricated legs)", () => {
  assert.match(board, /<details/, "native details drawer");
  // The awaiting/queued body shows the next-step candidate (legs OR an honest reason), not a vague row.
  assert.match(board, /step\.candidate/, "awaiting/queued render the next-step candidate / reason");
  assert.match(board, /Unlocks once the prior step|starts this path/, "far-future rungs carry an honest unlock note");
  assert.match(board, /cand\.reason/, "candidate body shows the exact reason");
  assert.match(board, /LaneLegRow/, "card legs reuse the shared leg row (no duplicated leg logic)");
  assert.match(board, /MoneyPath/, "card drawer shows stake → return via MoneyPath");
});

test("no forbidden public copy on the board (no failed/collapsed/dead/fresh restart); per-lane Mr. Dub link present", () => {
  for (const banned of [/fresh restart/i, /\bfailed\b/i, /\bcollapsed\b/i, /\bdead\b/i]) {
    assert.ok(!banned.test(board), `board must not contain ${banned}`);
  }
  // banned marketing words too.
  for (const banned of [/\block\b/i, /\bsafe(st)?\b/i, /guarantee/i, /risk-free/i, /sure thing/i]) {
    assert.ok(!banned.test(board), `board must not contain ${banned}`);
  }
  assert.match(board, /Full ledger on Mr\. Dub/, "per-lane link to the full transparent ledger");
});

test("page leads the launched section with the DualLadderBoard", () => {
  assert.match(page, /<DualLadderBoard preview=\{bbPreview\} \/>/, "board replaces the old cramped panel for the live dual ladder");
  assert.match(page, /import DualLadderBoard from "@\/components\/bank-builder\/dual-ladder-board"/, "imported");
});
