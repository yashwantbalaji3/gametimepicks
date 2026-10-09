/**
 * TRUTH-001 — "N / 10,000" is exact only when the count was persisted; otherwise it says "≈".
 *
 * Run: npx tsx --test src/lib/sim-frequency.test.mjs
 *
 * Pinned on immutable committed history: 2026-10-08 CLE @ CWS (849832) stores winProbability
 * {away 0.531, home 0.469} and exact run-differential counts. The report printed "5,310 of 10,000"
 * (0.531 × 10,000); the persisted counts say 5,307 / 4,693.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { approxFrequency, exactFrequency, exactWinCounts } from "./sim-frequency.ts";

const SIM_DIR = path.join(process.cwd(), "public/data/mlb/full-game-simulations");

test("849832: exact win counts come from the persisted counts, not the rounded probability", () => {
  const g = JSON.parse(fs.readFileSync(path.join(SIM_DIR, "2026-10-08.json"), "utf8")).games.find((x) => x.gamePk === 849832);
  assert.deepEqual(g.winProbability, { away: 0.531, home: 0.469 });
  assert.deepEqual(exactWinCounts(g), { away: 5307, home: 4693, runCount: 10000 });
  assert.equal(exactFrequency(5307, 10000, "games"), "5,307 / 10,000 games");
});

test("no persisted count → approximate, and says so", () => {
  assert.equal(approxFrequency(0.531, 10000, "games"), "≈ 5,310 / 10,000 games");
  assert.equal(approxFrequency(null, 10000, "games"), null);
  assert.equal(approxFrequency(0.5, 0, "games"), null);
});

test("counts that do not add up, or a tie bin, are not exact", () => {
  assert.equal(exactWinCounts({ runCount: 10, runDifferential: { distribution: [{ value: -1, count: 4 }, { value: 2, count: 5 }] } }), null);
  assert.equal(exactWinCounts({ runCount: 10, runDifferential: { distribution: [{ value: -1, count: 4 }, { value: 0, count: 1 }, { value: 2, count: 5 }] } }), null);
  assert.equal(exactWinCounts({ runCount: 10, runDifferential: null }), null);
});

test("EVERY committed game: exact counts agree with the published probability to its rounding", () => {
  let n = 0;
  for (const f of fs.readdirSync(SIM_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const g of JSON.parse(fs.readFileSync(path.join(SIM_DIR, f), "utf8")).games ?? []) {
      const e = exactWinCounts(g);
      if (!e || !g.winProbability) continue;
      n++;
      assert.ok(Math.abs(e.home / e.runCount - g.winProbability.home) <= 0.0005 + 1e-9, `${f} ${g.gamePk}`);
      assert.equal(e.home + e.away, e.runCount);
    }
  }
  assert.ok(n > 0);
});

test("no public MLB surface rebuilds an unmarked count from a probability", () => {
  const files = ["src/components/game/mlb-full-game-report.tsx", "src/components/entity/simulation-card.tsx", "src/components/entity/index.tsx", "src/lib/mlb/prediction/story.ts"];
  for (const f of files) {
    const src = fs.readFileSync(path.join(process.cwd(), f), "utf8");
    // The old pattern: Math.round(p * N).toLocaleString(...) followed by " / " or "of" with no "≈".
    assert.doesNotMatch(src, /`\$\{Math\.round\([^`]*\* (?:runCount|simulationCount|N)\)\.toLocaleString\("en-US"\)\} \/ /, f);
  }
});
