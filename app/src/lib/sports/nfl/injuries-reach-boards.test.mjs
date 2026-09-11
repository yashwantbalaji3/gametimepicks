/**
 * New NFL designations must reach the boards (P257 · 2026-09-11).
 *
 * sport-schedules captures NFL injuries twice a day; only nfl-event-window rebuilds role evidence and the
 * boards from them. On 2026-09-11 the boards carried role evidence from 02:20 UTC against an injury file
 * from 13:29 UTC. The capture job now starts the window whenever the NFL facts (not just stamps) changed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WF = fs.readFileSync(path.join(process.cwd(), "..", ".github/workflows/sport-schedules.yml"), "utf8");

test("sport-schedules may start workflows, and starts nfl-event-window after an NFL injuries commit", () => {
  assert.match(WF, /permissions:\n  contents: write\n  actions: write/, "a GITHUB_TOKEN dispatch needs actions: write");
  const commit = WF.indexOf('git commit -m "auto: injuries facts capture [skip ci]"');
  const dispatch = WF.indexOf("gh workflow run nfl-event-window.yml");
  assert.ok(commit > 0 && dispatch > commit, "the window is started AFTER the new facts are pushed, so it reads them");
});

test("only a change in the NFL facts starts it — stamps or NBA-only changes do not", () => {
  const step = WF.slice(WF.indexOf("Rebuild the NFL boards when the NFL injury facts changed"));
  assert.match(step, /injuries\/nfl\/latest\.json/, "compares the NFL file specifically");
  assert.match(step, /delete o\.generatedAt; delete o\.sourceAsOf/, "stamps are stripped before comparing");
  assert.match(step, /HEAD~1/, "against the previous commit's NFL facts");
});
