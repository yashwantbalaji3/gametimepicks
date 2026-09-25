/**
 * THE LIVE-PROP PRODUCER'S REFUSALS AND ITS WINDOW (Phase 5 · V1).
 *
 * The scoring and settlement rules are replayed against a real ESPN response in
 * live-prop-state.test.mjs. What is pinned here is the producer's behaviour AROUND that: when it
 * declines to run at all, and that it never reaches the network to find out.
 *
 * ⚠ NO TEST HERE MAKES A NETWORK CALL. A test that hits a live provider fails for reasons that have
 * nothing to do with the code, and teaches everyone to re-run it until it passes.
 *
 * Run: npx tsx --test src/lib/sports/nfl/live-props-producer.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const SCRIPT = path.join(APP, "scripts/nfl/capture-live-props.mjs");
function run(args) {
  try {
    return { code: 0, out: execFileSync("node", [SCRIPT, ...args], { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

test("it refuses without a clock — live state is never stamped with a guessed time", () => {
  const r = run([]);
  assert.equal(r.code, 2);
  assert.match(r.out, /--now <ISO> required/);
});

test("a game that has not kicked off is OUTSIDE the window, and no provider call is made", () => {
  /*
   * A pre-kickoff read carries no stat and no score by design, so fetching one buys nothing — and
   * polling a fixture days out would be a request loop with no answer in it. The producer says so
   * and exits clean rather than writing an empty artifact that reads like a tracked game.
   */
  const r = run(["--now", "2020-01-01T00:00:00Z"]);
  assert.equal(r.code, 0, "no live game is not an error");
  assert.match(r.out, /nothing to track/);
});

test("the window closes after the game, so a finished fixture is not polled forever", () => {
  const sched = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));
  const first = sched.rows.map((r) => Date.parse(String(r.dateUtc).replace(/T(\d\d):(\d\d)Z$/, "T$1:$2:00Z"))).filter(Number.isFinite).sort((a, b) => a - b)[0];
  assert.ok(Number.isFinite(first), "the schedule must carry a parseable kickoff for this guard to mean anything");
  const wellAfter = new Date(first + 48 * 3600_000).toISOString();
  const r = run(["--now", wellAfter]);
  assert.equal(r.code, 0);
  assert.match(r.out, /nothing to track/, "48 hours after kickoff a game is long settled and must have left the window");
});

test("V1 publishes no inferred live number, anywhere in the producer", () => {
  const src = fs.readFileSync(SCRIPT, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const banned of ["onTrack", "on_track", "projectedFinish", "liveProbability", "impliedFinish", "pace"]) {
    assert.ok(!src.includes(banned),
      `${banned} implies a conditional live model that has not been validated — V1 shows facts and lets the reader compare them`);
  }
});

test("the frozen block is COPIED from the committed board, never recomputed", () => {
  const src = fs.readFileSync(SCRIPT, "utf8");
  assert.match(src, /frozen:\s*\{[\s\S]*?forecastGeneratedAt: board\.generatedAt/,
    "the frozen slot must carry the board's own stamp, so a published forecast cannot be silently re-derived here");
  assert.ok(!/simulate|buildGamePredictionDecision|projectMlb/.test(src),
    "a live producer that can compute a forecast can overwrite one");
});

test("the join is by durable id and no name is ever compared", () => {
  const src = fs.readFileSync(SCRIPT, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(src, /nfl-athlete-\(\\d\+\)/, "the espn id must be extracted from the durable board id");
  assert.ok(!/\.name\s*===|normalizePlayerName|nameKey/.test(src),
    "comparing names here would reopen the identity defect that published \"Not offered\" for eight priced players");
});
