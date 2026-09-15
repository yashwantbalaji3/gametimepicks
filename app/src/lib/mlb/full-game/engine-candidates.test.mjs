/**
 * ENGINE CANDIDATES (P317) — the candidate the generator runs forward is exactly the registered one.
 * Run: npx tsx --test src/lib/mlb/full-game/engine-candidates.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ENGINE_LEVEL_CANDIDATE_V1, engineParamsFor } from "./engine-candidates.ts";
import { DEFAULT_ENGINE_PARAMS } from "./engine.ts";

const repo = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : ".");

test("the forward candidate's override equals its registered protocol, byte for byte", () => {
  const protocol = JSON.parse(fs.readFileSync(path.join(repo, ENGINE_LEVEL_CANDIDATE_V1.protocol), "utf8"));
  assert.equal(protocol.candidate.id, ENGINE_LEVEL_CANDIDATE_V1.id);
  assert.equal(protocol.status, "REGISTERED_FORWARD_ONLY");
  assert.deepEqual(ENGINE_LEVEL_CANDIDATE_V1.override, protocol.candidate.engineParamsOverride);
});

test("the candidate changes only the registered mechanisms; everything else is the published engine", () => {
  const p = engineParamsFor(ENGINE_LEVEL_CANDIDATE_V1);
  assert.equal(p.league.PA_PER_GAME, DEFAULT_ENGINE_PARAMS.league.PA_PER_GAME, "the PA divisor stays as published (the protocol says so)");
  assert.equal(p.advancement.singleScoresRunnerFromSecond, DEFAULT_ENGINE_PARAMS.advancement.singleScoresRunnerFromSecond);
  assert.deepEqual(p.starter, DEFAULT_ENGINE_PARAMS.starter);
  assert.equal(p.league.WALK_RATE, 0.093);
  assert.equal(p.advancement.groundIntoDoublePlay, 0.12);
});
