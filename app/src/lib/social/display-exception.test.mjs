import assert from "node:assert/strict";
import test from "node:test";

import { flaggedCellsShown } from "./display-exception.mjs";

const flag = (playerId, market, verdict = "MODEL_DEFECT") => ({ playerId, market, verdict });

test("a flagged cell printed as a number is reported", () => {
  const shown = flaggedCellsShown([flag("3078576", "ast")], [["3078576.ast", "▼ 2.6"], ["3078576.pts", "Review"]]);
  assert.deepEqual(shown.map((a) => `${a.playerId}.${a.market}`), ["3078576.ast"]);
});

test("Review text, an absent cell and a genuine expectation pass", () => {
  const anomalies = [flag("1", "pts"), flag("2", "reb"), flag("3", "ast", "GENUINE_EXPECTATION")];
  assert.deepEqual(flaggedCellsShown(anomalies, [["1.pts", "Review"], ["3.ast", "● 1.7"]]), []);
});
