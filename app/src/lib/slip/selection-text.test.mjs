import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { selectionText } from "./selection-text.mjs";

test("F18: side + line + market said once", () => {
  assert.equal(selectionText("Over 0.5", 0.5, "Hits"), "Over 0.5 Hits", "the audit's row");
  assert.equal(selectionText("Over", 0.5, "Hits"), "Over 0.5 Hits");
  assert.equal(selectionText("Under 7", 7, "Total runs"), "Under 7 Total runs");
  assert.equal(selectionText("Over 1.5", 0.5, "Hits"), "Over 1.5 0.5 Hits", "a different number is not swallowed (no guessing)");
  assert.equal(selectionText("Over 10.5", 0.5, "Hits"), "Over 10.5 0.5 Hits", "10.5 does not end in the line 0.5 as a token");
  assert.equal(selectionText("Yes", null, "Anytime TD"), "Yes Anytime TD");
});

test("every slip/leg renderer that printed side and line goes through selectionText", () => {
  for (const f of ["src/components/slip/slip-drawer.tsx", "src/components/parlays/lab/for-you-spotlight.tsx", "src/components/parlays/leg-swap-panel.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\{(?:l|cand)\.side\} \{(?:l|cand)\.line\}/, `${f} prints side and line raw`);
    assert.match(src, /selectionText\(/, f);
  }
});
