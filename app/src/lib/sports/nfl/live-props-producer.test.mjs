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
const REPO_ROOT = path.resolve(APP, "..");
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

test("the producer DELEGATES the rules — it does not carry a second copy of them", () => {
  /*
   * ⚠ REPOINTED, NOT DELETED (2026-09-25). These two guards used to scan this script for the
   * sealing expression and the athlete-id regex. Both moved into live-prop-state.mjs when the row
   * builder was extracted, so the guards went red while the invariants were perfectly intact —
   * the classic reason a guard gets quietly removed. They now assert the thing that actually
   * matters at this layer: that the script owns NO rule of its own.
   */
  const src = fs.readFileSync(SCRIPT, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(src, /buildLiveRows/, "row building must come from the library");
  assert.ok(!/nfl-athlete-\(/.test(src),
    "the athlete-id rule has ONE owner (espnAthleteId); a second copy here is how the three-copies-of-the-ESPN-id-rule defect happened before");
  assert.ok(!/previous\?\.frozen|priorById/.test(src),
    "the sealing rule has one owner too — a producer that can decide what 'frozen' means can unfreeze it");
  assert.ok(!/simulate|buildGamePredictionDecision|projectMlb/.test(src),
    "a live producer that can compute a forecast can overwrite one");
});

test("the library owns the sealing rule and the durable-id join", async () => {
  /*
   * ⚠ THIS SCANNED FOR AN EXACT EXPRESSION AND BROKE WHEN THE EXPRESSION CHANGED SHAPE — twice now,
   * first when the rule moved out of the producer and again when pregame provenance was added. The
   * invariant never moved; only the line did. So it is asserted BEHAVIOURALLY: feed the builder a
   * prior and a newer board, and check what comes out. A source scan can only ever pin today's
   * phrasing, and a guard that breaks on a refactor teaches people to delete it.
   */
  const { buildLiveRows, espnAthleteId } = await import("./live-prop-state.mjs");
  const board = (line, at) => ({ generatedAt: "2026-09-17T14:00:00Z", players: [{ playerId: "nfl-athlete-1", name: "P", markets: {
    player_rush_yds: { median: 50, market: { line, sportsbook: "draftkings", capturedAt: at } } } }] });
  const args = { providerEventId: "E", kickoffUtc: "2026-09-18T00:15:00Z", summary: { header: { competitions: [{ status: { type: { state: "pre" } } }] } }, hashOf: (o) => JSON.stringify(o) };
  const first = buildLiveRows({ ...args, board: board(38.5, "2026-09-17T14:00:00Z"), observedAt: "t1" });
  assert.equal(first.rows[0].frozen.market.line, 38.5);
  const later = buildLiveRows({ ...args, board: board(44.5, "2026-09-17T14:00:00Z"), prior: first, observedAt: "t2" });
  assert.equal(later.rows[0].frozen.market.line, 38.5, "a published frozen block survives a newer board");
  assert.equal(later.frozenRefusedNewerBoard, 1, "and the refusal is counted");

  assert.equal(espnAthleteId("nfl-athlete-42"), "42");
  assert.equal(espnAthleteId("42"), null, "a bare number is not a durable board id — the loose pattern is how the third copy of this rule went wrong");
});

test("a FINAL game stays in the loop until its reconciliation window closes", async () => {
  /*
   * ⚠ THIS USED TO STOP AT THE FIRST FINAL RESPONSE, and that was wrong: ESPN can mark a game final
   * before every player block has published, so a merely-delayed player became permanently
   * ungraded — and because polling had stopped, no later read could correct it. The window is the
   * fix, and it is bounded so termination stays deterministic.
   */
  const { shouldPollEvent } = await import("./live-prop-state.mjs");
  const FIRST = "2026-09-18T04:00:00Z";
  const artifact = (rows) => ({ phase: "FINAL", finalFirstObservedAt: FIRST, rows });
  const settled = [{ settlement: { state: "SETTLED" } }, { settlement: { state: "NO_MEASUREMENT" } }];

  assert.equal(shouldPollEvent(null, FIRST).poll, true, "never observed — poll it");
  assert.equal(shouldPollEvent({ phase: "IN_PROGRESS", rows: [] }, FIRST).poll, true);
  assert.equal(shouldPollEvent({ phase: "FINAL", rows: [] }, FIRST).poll, true,
    "final with no recorded first-final instant — this read establishes it");

  assert.equal(shouldPollEvent(artifact(settled), "2026-09-18T05:00:00Z").poll, true,
    "an hour after FINAL a late stat or correction can still arrive");
  assert.equal(shouldPollEvent(artifact(settled), "2026-09-18T07:30:00Z").poll, false,
    "past the window the game is canonical and leaves the loop");
  assert.match(shouldPollEvent(artifact(settled), "2026-09-18T07:30:00Z").reason, /window closed/);
});

test("the producer delegates the polling decision too", () => {
  const src = fs.readFileSync(SCRIPT, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(src, /shouldPollEvent\(/, "the decision comes from the library");
  assert.ok(!/phase === "FINAL"/.test(src), "and the script keeps no second copy of the rule");
});

test("the live cadence is dense, kickoff-relative, and spends nothing", () => {
  const wf = fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/nfl-live-props.yml"), "utf8");
  const crons = [...wf.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(crons.length >= 3, "the live window spans several game days");
  for (const c of crons) {
    const step = /^\*\/(\d+)$/.exec(c.trim().split(/\s+/)[0]);
    assert.ok(step && Number(step[1]) <= 15,
      `"${c}" is too sparse — individual runs here are hours late, so only a dense STREAM lands inside a live game`);
  }
  assert.ok(crons.some((c) => /\*\s*0$/.test(c.trim())), "Sunday must be covered");
  /*
   * ⚠ A PAID LANE MAY LIVE HERE ONLY IF IT BOUNDS ITSELF.
   *
   * This asserted `!/ODDS_API_KEY/` — no provider key in this workflow at all — because a paid call
   * on a 15-minute cron spends by the clock. The fear is exactly right and the blanket ban was the
   * wrong shape for it: on 2026-09-26 the founder authorized a bounded in-play odds probe and pilot,
   * and this is the only job that runs WHILE games are in play, so it is where they belong.
   *
   * The property that actually matters is that the CRON IS NEVER THE SPEND CONTROL. So a step given
   * the key must run a script that enforces its own interval against the last recorded call and its
   * own credit budget — both read from the ledger, neither from the schedule. A future paid step
   * added here without those bounds fails this, which is what the blanket ban was reaching for.
   */
  const keyedSteps = [...wf.matchAll(/- name: ([^\n]+)\n(?:(?!\n      - name:)[\s\S])*?ODDS_API_KEY[\s\S]*?run: ([^\n]+)/g)];
  if (/ODDS_API_KEY/.test(wf)) {
    assert.ok(keyedSteps.length > 0, "a provider key appears but no step could be attributed to it");
    for (const [, name, run] of keyedSteps) {
      const script = /scripts\/[\w/-]+\.mjs/.exec(run)?.[0];
      assert.ok(script, `"${name}" is given the key but runs no identifiable script`);
      const src = fs.readFileSync(path.join(REPO_ROOT, "app", script), "utf8");
      const selfBounded =
        /MIN_INTERVAL_MS|ALREADY PROBED/.test(src) &&        // its own cadence, or fires once ever
        /purposeBudget|assertCallAllowed/.test(src);          // and its own ceiling
      assert.ok(selfBounded, `"${name}" runs ${script} on a 15-minute cron without its own interval and budget bounds`);
    }
  }
  assert.match(wf, /group:\s*gtp-generated-artifacts/, "it commits generated data and must share the writer queue");
});
