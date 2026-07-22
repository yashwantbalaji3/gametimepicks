/**
 * Phase 5 — the generic per-team-side resolver `loadPerTeamSide` serves team_offensive_form, opponent_defense, and
 * travel_rest. This pins: correct home/away side, freshest-eligible selection, post-start (ineligible) rejection,
 * team-side inversion prevention, and null-safety. A side inversion must NOT pass silently. No modeling.
 *
 * Run: npx tsx --test src/lib/mlb-per-team-side-resolver.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPerTeamSide } from "../../scripts/build-mlb-research-observations.mjs";

function tmp(fam, date, gamePk, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pts-"));
  const dir = path.join(root, fam, date);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, obj] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(obj));
  return root;
}

test("1 · home/away side correctness — no inversion", () => {
  const feat = tmp("opponent-defense", "2026-07-24", 555, {
    "555-141-2026-07-24T15-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: true, fielding: { errors: 3 } },
    "555-147-2026-07-24T15-00-00-000Z.json": { side: "away", teamId: 147, researchEligible: true, fielding: { errors: 9 } },
  });
  const r = loadPerTeamSide(feat, "opponent-defense", "2026-07-24", 555);
  assert.equal(r.home.teamId, 141, "home resolves to the home teamId");
  assert.equal(r.away.teamId, 147, "away resolves to the away teamId");
  assert.notEqual(r.home.teamId, r.away.teamId, "home and away are distinct — no side inversion");
  assert.equal(r.home.fielding.errors, 3);
});

test("2 · freshest ELIGIBLE capture per side wins", () => {
  const feat = tmp("team-offensive-form", "2026-07-24", 555, {
    "555-141-2026-07-24T11-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: true, last10: { runs: 1 } },
    "555-141-2026-07-24T15-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: true, last10: { runs: 99 } },
  });
  assert.equal(loadPerTeamSide(feat, "team-offensive-form", "2026-07-24", 555).home.last10.runs, 99, "latest eligible wins");
});

test("3 · a post-start (ineligible) capture is rejected — never attached", () => {
  const feat = tmp("travel-rest", "2026-07-24", 555, {
    "555-141-2026-07-24T11-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: true, daysRest: 2 },
    "555-141-2026-07-24T20-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: false, daysRest: 999 },
  });
  const r = loadPerTeamSide(feat, "travel-rest", "2026-07-24", 555);
  assert.equal(r.home.daysRest, 2, "the eligible record is used, not the later ineligible one");
});

test("4 · when only ineligible captures exist, that side is null (never fabricated)", () => {
  const feat = tmp("opponent-defense", "2026-07-24", 555, {
    "555-141-2026-07-24T20-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: false, fielding: {} },
  });
  assert.equal(loadPerTeamSide(feat, "opponent-defense", "2026-07-24", 555), null, "no eligible record ⇒ null");
});

test("5 · null-safe: missing directory / other game's files do not resolve", () => {
  assert.equal(loadPerTeamSide("/no/such/root", "opponent-defense", "2026-07-24", 555), null);
  const feat = tmp("travel-rest", "2026-07-24", 999, { "999-141-2026-07-24T11-00-00-000Z.json": { side: "home", teamId: 141, researchEligible: true } });
  assert.equal(loadPerTeamSide(feat, "travel-rest", "2026-07-24", 555), null, "a different gamePk's file must not resolve for game 555");
});
