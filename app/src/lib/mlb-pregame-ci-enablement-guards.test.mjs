/**
 * MLB PREGAME CI ENABLEMENT + MONITOR — guards (2026-07-21).
 *
 * Capped player-prop capture is enabled in CI (repo vars) with a conservative --max-events cap. These guards pin
 * the workflow controls (opt-in, cap, independent team/prop toggles, non-blocking, no PR) and the monitor output.
 *
 * Run: npx tsx --test src/lib/mlb-pregame-ci-enablement-guards.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const app = process.cwd();
const repo = path.dirname(app);
const wf = fs.readFileSync(path.join(repo, ".github/workflows/mlb-pregame-capture.yml"), "utf8");
const script = fs.readFileSync(path.join(app, "scripts/capture-mlb-pregame-player-props.mjs"), "utf8");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

test("1 · the max-events cap is enforced (workflow default 3 + script slice)", () => {
  assert.match(wf, /--max-events "\$\{\{ vars\.PREGAME_ARCHIVE_PLAYER_PROP_MAX_EVENTS \|\| '3' \}\}"/, "workflow caps at 3 even if the var is unset");
  assert.match(script, /targetEvents = dayNotStarted\.slice\(0, MAX_EVENTS\)/, "script hard-caps at MAX_EVENTS");
});

test("2 · player-prop capture requires its opt-in; team + player-prop toggles are independent", () => {
  assert.match(wf, /vars\.PREGAME_ARCHIVE_PLAYER_PROPS == 'true'/, "player props gated on their own var");
  assert.match(wf, /vars\.PREGAME_ARCHIVE_MARKETS == 'true'/, "team markets gated on their own var");
  // the two conditions are on different steps (independently controllable)
  const propIdx = wf.indexOf("PREGAME_ARCHIVE_PLAYER_PROPS == 'true'");
  const teamIdx = wf.indexOf("PREGAME_ARCHIVE_MARKETS == 'true'");
  assert.ok(propIdx !== teamIdx && propIdx > 0 && teamIdx > 0, "distinct toggles on distinct steps");
});

test("3 · the workflow is non-blocking, never on pull_request, credit-floored", () => {
  assert.ok((wf.match(/continue-on-error:\s*true/g) || []).length >= 3, "job + market + prop steps are non-blocking");
  assert.ok(!/^\s*pull_request:/m.test(wf), "no pull_request trigger");
  assert.match(wf, /github\.event_name != 'pull_request'/, "explicit PR guard");
  assert.match(wf, /ODDS_API_MIN_CREDITS_REMAINING/, "credit floor threaded to the capture steps");
});

test("4 · commit stages ONLY the archive dir — path-scoped, no blanket/money/public add", () => {
  // Check the actual `git add` commands (not mere mentions — the hardened step defensively greps money/public
  // path names in an abort-guard, which is safe and must not trip this test).
  const addLines = wf.split("\n").map((l) => l.trim()).filter((l) => /^git add /.test(l));
  assert.ok(addLines.length >= 1, "there is a git add");
  for (const l of addLines) {
    assert.ok(!/git add\s+(-A|--all|-u|\.)(\s|$)/.test(l), `no blanket add: ${l}`);
    assert.match(l, /ARCHIVE_DIR|data\/internal\/mlb\/pregame-archive/, `archive-scoped add: ${l}`);
  }
  assert.match(wf, /ARCHIVE_DIR:\s*data\/internal\/mlb\/pregame-archive/, "ARCHIVE_DIR resolves to the internal archive");
});

test("5 · the monitor report carries daily status + credit usage + 7-day progress + gate", () => {
  const mon = readJson(path.join(repo, "data/internal/mlb/pregame-archive/status/monitor.json"));
  if (!mon) { console.log("  (skip — monitor not generated in this checkout)"); return; }
  assert.equal(mon.public, false);
  assert.ok("teamMarketCapture" in mon.dailyStatus && "playerPropCapture" in mon.dailyStatus);
  if (mon.dailyStatus.playerPropCapture.status === "captured") {
    for (const k of ["eventsCaptured", "records", "eligibleRecords", "paired", "overOnly", "estimatedCredits", "actualCreditsSpent", "creditsRemaining", "providerUnavailable"]) {
      assert.ok(k in mon.dailyStatus.playerPropCapture, `daily status has ${k}`);
    }
  }
  for (const k of ["datesCollected", "marketDatesCollected", "playerPropDatesCollected", "avgEligiblePlayerPropRecordsPerDay", "estimatedDaysTo30DateGate"]) {
    assert.ok(k in mon.progress7d, `7-day progress has ${k}`);
  }
  /*
   * THE GATE HAS NOW PASSED — 30/30 dates and 48,479 settled eligible observations against a
   * threshold of 500. This asserted `met === false` as a fact about a moment, and the moment ended.
   *
   * Repointed to what the gate is FOR rather than to its not-yet state: it must keep reporting both
   * thresholds and its own verdict honestly, and passing it must not by itself change anything.
   * A collection target being reached is evidence that research COULD begin, not permission that it
   * has — which is why simulation-readiness still reads BLOCKED and is asserted separately.
   */
  for (const k of ["minDistinctDates", "minSettledEligibleObs", "dates", "settledEligible", "met"]) {
    assert.ok(k in mon.researchGate, `research gate reports ${k}`);
  }
  assert.equal(typeof mon.researchGate.met, "boolean", "the verdict is a verdict, not a hint");
});

test("6 · archive/market artifacts are NOT web-served + no product eligibility change", () => {
  const out = path.join(app, "out");
  if (fs.existsSync(out)) {
    const hit = fs.readdirSync(out, { recursive: true }).filter((p) => String(p).includes("market-snapshots") || String(p).includes("pregame-archive"));
    assert.equal(hit.length, 0, "no internal archive under out/");
  }
  const pol = fs.readFileSync(path.join(app, "src/lib/mlb/calibration/eligibility-policy.ts"), "utf8");
  assert.match(pol, /batter_hits: "MARKET_CONTEXT_ONLY"/, "calibration/product verdicts unchanged");
});

test("7 · money md5 unchanged (CI enablement + monitoring is internal + money-independent)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
