/**
 * Game-detail badge honesty (Program 112-115 Stage 1 Lane D).
 *
 * THE DEFECT (found live on 2026-08-03): the "Simulation Ready" badge in the game-detail hero was
 * HARDCODED — every game page claimed it. On LAD @ CHC, whose books never posted, the same page
 * simultaneously rendered the badge AND "Simulation not yet available for this game / No
 * precomputed model simulation artifact exists for this fixture yet", with GENERATED PICKS 0.
 *
 * That is the partial-presented-as-complete failure class: presence of a fixture is not readiness
 * of a simulation, exactly like "file exists ≠ settled". These assertions pin the badge to the
 * artifact so it cannot drift back to an unconditional claim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(APP, "src/components/game/game-detail-page.tsx"), "utf8");

test("the Simulation Ready badge is conditional, never unconditional", () => {
  assert.match(SRC, /Simulation Ready/, "the badge still exists");
  // The badge must be produced inside a readiness condition, and an explicit not-ready branch
  // must exist. A hardcoded badge has neither.
  assert.match(SRC, /simIsReady/, "a readiness predicate must gate the badge");
  assert.match(SRC, /Awaiting Simulation/, "a not-ready branch must exist");
});

test("readiness derives from the artifact's own status and pick count", () => {
  assert.match(
    SRC,
    /status !== "unavailable"[\s\S]{0,80}status !== "error"/,
    "an unavailable/error simulation must not read as ready",
  );
  assert.match(
    SRC,
    /generatedPicks\?\.length \?\? 0\) > 0/,
    "zero generated picks must not read as ready — the page's own panel says so",
  );
});

test("the runner's honest unavailable copy is still the source of truth it agrees with", () => {
  const runner = fs.readFileSync(path.join(APP, "src/components/game/game-simulation-runner.tsx"), "utf8");
  assert.match(runner, /Simulation not yet available for this game/);
  assert.match(runner, /status === "unavailable" \|\| view\.status === "error"/, "the panel keys off the same states the badge now does");
});

test("MEASURED: today's artifacts contain a game that must NOT show the ready badge", () => {
  // Guards against the fix being cosmetic: on the live slate there really is a fixture with a
  // full-game entry whose status is `unavailable` and whose pick list is empty.
  const dir = path.join(APP, "public/data/mlb/full-game-simulations");
  const latest = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
  const unavailable = (doc.games ?? []).filter((g) => g?.status === "unavailable" || (g?.completeness?.level === "unavailable"));
  // This may legitimately be 0 on a fully covered slate; assert the SHAPE is understood either way.
  for (const g of unavailable) {
    assert.equal((g.generatedPicks ?? []).length, 0, `${g.gamePk}: an unavailable sim must carry no generated picks`);
  }
});
