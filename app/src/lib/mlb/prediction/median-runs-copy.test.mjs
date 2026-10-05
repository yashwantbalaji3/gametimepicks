/**
 * MLB projected score copy: two team medians must never read like a predicted final (MLB Department, 2026-10-05).
 *
 * Run: npx tsx --test src/lib/mlb/prediction/median-runs-copy.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { medianRunsCopy, MEDIAN_RUNS_LABEL } from "./median-runs-copy.mjs";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");

test("a tie is named as equal medians, never as a predicted tie or a final score", () => {
  const c = medianRunsCopy({ away: 4, home: 4, label: "Median simulation score" }, "CWS", "CLE");
  assert.equal(c.tied, true);
  assert.equal(c.label, MEDIAN_RUNS_LABEL);
  assert.equal(c.text, "CWS 4 · CLE 4");
  assert.match(c.note, /not a predicted tie/i);
  assert.match(c.note, /not a final score/i);
});

test("a non-tie keeps the owner's numbers verbatim and still says it is not a final score", () => {
  const c = medianRunsCopy({ away: 5, home: 4 }, "SD", "MIL");
  assert.equal(c.tied, false);
  assert.equal(c.text, "SD 5 · MIL 4");
  assert.match(c.note, /not a predicted final score/i);
});

test("the copy never uses a score dash between the two medians", () => {
  for (const s of [{ away: 3, home: 3 }, { away: 2, home: 6 }]) {
    assert.ok(!/[–—-]/.test(medianRunsCopy(s, "A", "B").text), "a dash makes two medians read like a scoreline");
  }
});

test("missing or non-numeric medians render nothing (missing is not zero)", () => {
  assert.equal(medianRunsCopy(null, "A", "B"), null);
  assert.equal(medianRunsCopy({ away: null, home: 4 }, "A", "B"), null);
  assert.equal(medianRunsCopy({ away: 4 }, "A", "B"), null);
});

test("the MLB game-page surfaces show the projected score only through this copy", () => {
  const report = read("src/components/game/mlb-full-game-report.tsx");
  const story = read("src/lib/simulate/presentation/mlb.ts");
  for (const [name, src] of [["mlb-full-game-report.tsx", report], ["presentation/mlb.ts", story]]) {
    assert.match(src, /medianRunsCopy\(/, `${name} formats the projected score through medianRunsCopy`);
    assert.ok(!/projectedScore\.label/.test(src), `${name} must not print the owner's "score" label as the heading`);
    assert.ok(!/projectedScore\.away\}\s*[–—-]\s*\{[^}]*projectedScore\.home/.test(src), `${name} must not join the medians with a score dash`);
  }
  assert.ok(!/Median final/.test(story), "the story chapter must not call two medians a final");
});
