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

test("🔴 a failed nflverse download cannot skip ANY later pregame step (injuries included)", () => {
  // Every step from the nflverse capture up to the forecasts must run after a failed predecessor: `!cancelled()` or
  // `always()` in its condition. A bare `if:` means success() — one free download failing would skip, e.g., the
  // fresh injury capture the whole pregame chain conditions on.
  const from = at("Capture this season's nflverse finals and play-by-play (free)");
  const to = at("Generate public-beta NFL forecasts");
  const steps = wf.slice(from, to).split(/\n      - name: /).slice(1);
  assert.ok(steps.length >= 6, `checked ${steps.length} steps`);
  for (const st of steps) {
    const name = st.split("\n")[0];
    const cond = /\n        if: (.+)/.exec(st)?.[1] ?? "(none: success())";
    assert.match(cond, /!cancelled\(\)|always\(\)/, `${name} → if: ${cond}`);
  }
});

test("🔴 the End Zone Vault reads THIS window's player boards — it runs after them, before the receipts that read it", () => {
  /* NFL-005 (2026-10-13). The Vault ran before build-nfl-player-board, so every window evaluated the previous window's
     boards, and the first window of Week 6 found no Week 6 board at all and published "no player cleared 0.12". */
  const step = wf.slice(at("Generate public-beta NFL forecasts"));
  const pos = (cmd) => { const i = step.indexOf(`node scripts/nfl/${cmd}.mjs`); assert.ok(i > 0, `${cmd} runs in the pregame step`); return i; };
  const vault = pos("build-end-zone-vault");
  assert.ok(pos("build-nfl-player-board") < vault, "the per-game boards the Vault reads are built first");
  assert.ok(pos("build-nfl-weekly-boards") < vault, "and the weekly boards");
  assert.ok(vault < pos("build-nfl-product-receipts"), "the receipts that summarise the Vault come after it");
  /* Product eligibility also reads the Vault. It runs earlier in this step, so it must be re-derived later in the run. */
  const elig = [...wf.matchAll(/node scripts\/nfl\/build-nfl-product-eligibility\.mjs/g)].map((m) => m.index);
  const vaultAbs = wf.indexOf("node scripts/nfl/build-end-zone-vault.mjs");
  assert.ok(elig.some((i) => i > vaultAbs), "product eligibility is re-derived after the Vault in the same run");
});
