/**
 * THE RESULTS CAPTURE ASKS IN A FORM THE PROVIDER HONOURS, AND A SOURCE FAILURE IS NEVER GREEN.
 *
 * Run: npx tsx --test src/lib/soccer/epl-results-capture.test.mjs
 *
 * v1.7 F2 evidence repair (G2). From 2026-09-16T01:06Z (epl-settle run 35042672207) through
 * 2026-09-22T01:25Z (run 35675723968) every nightly run printed "SOURCE_STALE: eng.1 scoreboard
 * unavailable (no events array)" and exited 0: ESPN had started answering the date-range query form
 * with HTTP 400 while the month and single-day forms still worked. results/latest.json froze at
 * 2026-09-15T01:10:22Z and the P304 forward sample stayed at 0 with ~23 forecasts of record ungraded.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EXIT_SOURCE_STALE, scoreboardMonths, inCaptureWindow } from "./epl-results-capture.mjs";

test("season-to-date months, oldest first, including a year roll", () => {
  assert.deepEqual(scoreboardMonths("2026-08-21", "2026-09-22T01:25:50Z"), ["202608", "202609"]);
  assert.deepEqual(scoreboardMonths("2026-08-21", "2026-08-21T00:00:00Z"), ["202608"]);
  assert.deepEqual(scoreboardMonths("2026-08-21", "2027-01-03T12:00:00Z"), ["202608", "202609", "202610", "202611", "202612", "202701"]);
  assert.deepEqual(scoreboardMonths("2026-08-21", "2026-08-01T00:00:00Z"), [], "before the season start there is nothing to ask for");
  assert.deepEqual(scoreboardMonths("garbage", "2026-08-01T00:00:00Z"), []);
});

test("the capture window is season start ≤ date < end of NOW's UTC day — what the old range request meant", () => {
  const now = "2026-09-22T01:25:50Z";
  assert.equal(inCaptureWindow("2026-08-21T19:00Z", "2026-08-21", now), true, "opening night");
  assert.equal(inCaptureWindow("2026-08-20T19:00Z", "2026-08-21", now), false, "a friendly before the season");
  assert.equal(inCaptureWindow("2026-09-22T19:00Z", "2026-08-21", now), true, "today's kickoff is in the window even if not yet played");
  assert.equal(inCaptureWindow("2026-09-23T00:00Z", "2026-08-21", now), false, "tomorrow is not");
  assert.equal(inCaptureWindow(null, "2026-08-21", now), false);
});

test("SOURCE PIN · the script requests by MONTH, never by date range, and a source failure exits 4 with nothing written", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/epl/capture-epl-results.mjs"), "utf8");
  assert.equal(EXIT_SOURCE_STALE, 4);
  assert.match(src, /scoreboardMonths\(SEASON_START, NOW\)/, "one request per month of the season to date");
  assert.match(src, /dates=\$\{month\}/, "the month form is what the provider still honours");
  assert.doesNotMatch(src, /dates=\$\{from\}-\$\{to\}/, "the date-range form is the one ESPN rejects with HTTP 400");
  assert.match(src, /process\.exit\(EXIT_SOURCE_STALE\)/, "a provider failure must not exit 0");
  assert.doesNotMatch(src, /SOURCE_STALE[\s\S]{0,200}process\.exit\(0\)/, "the old exit-0-on-stale path must not return");
  assert.match(src, /if \(!res\.ok\) throw/, "an HTTP error is a source failure, not an empty scoreboard");
  // Nothing is written on the stale path: the write sits after the fetch block and is unreachable once it exits.
  assert.ok(src.indexOf("process.exit(EXIT_SOURCE_STALE)") < src.indexOf('fs.writeFileSync(path.join(OUT, "latest.json")'));
});

test("WORKFLOW PIN · epl-settle carries the capture status past the commit and RAISES it; epl-matchweek reports it and never relabels it as a quiet matchweek", () => {
  const wf = (f) => fs.readFileSync(path.join(process.cwd(), "..", ".github", "workflows", f), "utf8");
  const settle = wf("epl-settle.yml");
  const captureStep = settle.slice(settle.indexOf("- name: Capture match results"), settle.indexOf("- name: Grade team forecasts"));
  assert.match(captureStep, /set -uo pipefail/, "the step must survive a non-zero exit so the status can be carried");
  assert.doesNotMatch(captureStep, /set -euo pipefail/);
  assert.match(captureStep, /RESULTS_CAPTURE=ok/);
  assert.match(captureStep, /-eq 4[\s\S]*RESULTS_CAPTURE=stale/, "exit 4 is SOURCE_STALE");
  assert.match(captureStep, /RESULTS_CAPTURE=failed/, "any other non-zero is a crash, named as such");
  assert.doesNotMatch(captureStep, /\|\|\s*(true|echo|:)\b/, "no swallowed failure on the capture line");
  const commitAt = settle.indexOf("- name: Commit the results and the grades");
  const raiseAt = settle.indexOf("- name: Raise a grading refusal");
  assert.ok(commitAt > 0 && raiseAt > commitAt, "raised AFTER the commit so a stall never costs the run its work");
  const raise = settle.slice(raiseAt, settle.indexOf("- name: Notify on failure"));
  assert.match(raise, /RESULTS_CAPTURE:-ok.*!= "ok"/, "the carried status is read");
  assert.match(raise, /::error::EPL results capture did not run to completion/);
  assert.match(raise, /FAILED=1/);

  const mw = wf("epl-matchweek.yml");
  const settleStep = mw.slice(mw.indexOf("- name: Settle any match that has finished"), mw.indexOf("- name: Grade finished matches"));
  assert.doesNotMatch(settleStep, /no newly-settled EPL match/, "the sentence that relabelled a provider failure as a quiet matchweek");
  assert.doesNotMatch(settleStep, /capture-epl-results\.mjs[^\n]*\|\|/, "no `|| echo` on the capture line");
  assert.match(settleStep, /RESULTS_CAPTURE=stale/);
  const mwRaise = mw.slice(mw.indexOf("- name: Raise a grading refusal"), mw.indexOf("- name: Notify on failure"));
  assert.match(mwRaise, /::warning::EPL results capture did not refresh this run/, "a visible notice, owned red run stays with epl-settle");
});
