/**
 * The MLB props board withholds offers an ineligible (offshore) operator priced, and STATES how many —
 * a hidden offer is an accurate "not shown" state, never a silent gap. Eligible rows are untouched.
 *
 * Run: npx tsx --test src/lib/mlb/mlb-props-eligibility.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMlbPropsBoard, countIneligibleMlbProps } from "./mlb-props.ts";

const fixture = (props) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mlb-props-elig-"));
  fs.mkdirSync(path.join(root, "mlb", "player-props"), { recursive: true });
  fs.writeFileSync(path.join(root, "mlb", "player-props", "2026-10-18.json"), JSON.stringify({ date: "2026-10-18", props }));
  return root;
};
const row = (player, provider, group = "hits", americanOdds = -150) => ({ player, provider, group, market: "batter_hits", marketLabel: "Hits", selection: "Over 0.5", point: 0.5, americanOdds, gameId: "g1", matchup: "TB @ CLE" });

test("offshore-priced offers are withheld and counted; eligible offers are kept as they are", () => {
  const root = fixture([row("A", "DraftKings"), row("B", "BetOnline.ag"), row("C", "BetMGM"), row("D", "Bovada", "pitchers"), row("E", "Unknown Book")]);
  try {
    const shown = loadMlbPropsBoard(root, "2026-10-18").map((p) => p.player).sort();
    assert.deepEqual(shown, ["A", "C"], "only eligible operators' offers are shown (unknown books fail closed)");
    assert.deepEqual(countIneligibleMlbProps(root, "2026-10-18"), { batter: 2, pitchers: 1 }, "every withheld offer is counted for the page to state");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a board with no ineligible offers reports zero withheld", () => {
  const root = fixture([row("A", "DraftKings"), row("B", "FanDuel")]);
  try { assert.deepEqual(countIneligibleMlbProps(root, "2026-10-18"), { batter: 0, pitchers: 0 }); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});
