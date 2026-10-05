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
  const commitStep = WF.slice(WF.indexOf("- name: Commit injuries captures if content changed"), WF.indexOf('git commit -m "auto: injuries facts capture [skip ci]"'));
  assert.match(commitStep, /id: injuriescommit/, "the commit step carries an id so its decision can be read");
  assert.match(commitStep, /injuries\/nfl\/latest\.json/, "compares the NFL file specifically");
  assert.match(commitStep, /delete o\.generatedAt; delete o\.sourceAsOf/, "stamps are stripped before comparing");
  assert.match(commitStep, /git show HEAD:/, "against the capture this commit replaces, read BEFORE committing");
  const afterCommit = WF.slice(WF.indexOf('git commit -m "auto: injuries facts capture [skip ci]"'));
  assert.ok(afterCommit.indexOf("git push origin HEAD:main") < afterCommit.indexOf('echo "nfl_changed=$NFL_CHANGED" >> "$GITHUB_OUTPUT"'),
    "the decision is published only after the push succeeded, so the window reads facts that are on main");
});

test("the rebuild is gated on the commit step's decision, never on whatever HEAD is by then (2026-10-05)", () => {
  /*
   * The NBA research commits run between the injuries commit and the rebuild. The old step asked
   * `git log -1` whether HEAD was the injuries commit and diffed HEAD~1, so on 2026-10-05 (15:48Z and
   * 18:19Z) it saw an NBA commit, decided "nothing committed", and never started the window.
   */
  const start = WF.indexOf("- name: Rebuild the NFL boards when the NFL injury facts changed");
  const step = WF.slice(start, WF.indexOf("- name:", start + 10));
  assert.match(step, /steps\.injuriescommit\.outputs\.nfl_changed == 'true'/);
  assert.doesNotMatch(step, /git log -1|HEAD~1/, "HEAD at this point may be an NBA commit");
  const nbaCommit = WF.indexOf('git commit -m "auto: nba experimental forecasts');
  assert.ok(nbaCommit > 0 && nbaCommit < start, "the hazard this guards: NBA commits do sit between the two steps");
});
