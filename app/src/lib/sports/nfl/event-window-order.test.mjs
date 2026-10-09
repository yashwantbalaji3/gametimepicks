/**
 * NFL-005 / LEDGER-001 (2026-10-09) · A FINAL IS CAPTURED AND GRADED IN THE SAME EVENT-WINDOW RUN.
 *
 * The player-event capture reads the nflverse current-season file. With the nflverse capture running AFTER it, a game
 * final on nflverse reached the World Model V2 grader one window late: TB @ DAL (final ~03:30Z Oct 9) was still
 * ungraded after the 16:07Z run, which captured stat lines from the stale game list and only then refreshed it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const wf = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/nfl-event-window.yml"), "utf8");
const at = (name) => { const i = wf.indexOf(`- name: ${name}`); assert.ok(i > 0, `step "${name}" exists`); return i; };

test("🔴 nflverse finals are captured BEFORE the player events that read them, and both before grading", () => {
  const nflverse = at("Capture this season's nflverse finals and play-by-play (free)");
  const events = at("Capture current-season player events");
  const forecasts = at("Generate public-beta NFL forecasts");
  const grader = wf.indexOf("node scripts/nfl/grade-nfl-world-model-v2.mjs");
  assert.ok(nflverse < events, "the game list is refreshed before stat lines are captured from it");
  assert.ok(events < forecasts && forecasts < grader, "stat lines exist before the grader reads them");
  assert.equal(wf.split("node scripts/nfl/capture-nflverse-season.mjs").length - 1, 1, "captured once per run");
});

test("a failed nflverse download cannot skip the player-event capture or the role shares", () => {
  for (const name of ["Capture current-season player events", "Rebuild NFL role shares against the fresh roster"]) {
    const step = wf.slice(at(name), at(name) + 200);
    assert.match(step, /if: \$\{\{ !cancelled\(\) && steps\.window\.outputs\.events != '0' \}\}/, `${name} runs after a failed predecessor`);
  }
});
