/**
 * `monitoring` is the stage most easily claimed and least easily proven: alerting exists SOMEWHERE in
 * the repo, so it is tempting to read that as coverage. Every claim here is checked against the
 * sport's own workflow, because a settler that alerts does not help a capture that died before
 * reaching it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MONITORING, MONITORED_SPORTS, WATCHDOG, ALERT_SCRIPT, isMonitored, monitoringGaps, monitoringResiduals } from "./monitoring.mjs";

const REPO = path.join(process.cwd(), "..");
const wf = (f) => fs.readFileSync(path.join(REPO, ".github/workflows", f), "utf8");

test("the watchdog and the alert script both exist", () => {
  assert.ok(fs.existsSync(path.join(REPO, ".github/workflows", WATCHDOG.workflow)));
  assert.ok(fs.existsSync(path.join(REPO, ALERT_SCRIPT)));
});

test("every `alerted: true` claim is TRUE in that sport's own workflow", () => {
  // The check that stops "we have alerting" from being read as "this sport is alerted".
  for (const [sport, m] of Object.entries(MONITORING)) {
    const has = wf(m.workflow).includes("ops_alert.sh");
    assert.equal(has, m.alerted, `${sport}: registry says alerted=${m.alerted} but ${m.workflow} ${has ? "does" : "does not"} call ops_alert.sh`);
  }
});

test("every `watched: true` claim is backed by the watchdog actually classifying that sport", () => {
  const src = wf(WATCHDOG.workflow);
  for (const [sport, m] of Object.entries(MONITORING)) {
    // The watchdog is sport-specific through its classifier; a sport it never names is not watched.
    const named = src.includes(sport) || src.includes(WATCHDOG.classifier.replace("app/scripts/", "").replace(".mjs", ""));
    if (m.watched) assert.ok(named, `${sport}: claimed watched, but ${WATCHDOG.workflow} never references it`);
  }
});

test("an uncovered sport must NAME its gap, never leave it blank", () => {
  for (const [sport, m] of Object.entries(MONITORING)) {
    if (isMonitored(sport)) { assert.equal(m.gap, null, `${sport}: covered sports carry no gap`); continue; }
    assert.ok(m.gap && m.gap.length > 30, `${sport}: an uncovered sport must state WHY, or the gap is invisible`);
  }
});

test("the gaps are reported, and the list shrinks as sports are wired", () => {
  // A FACT about today. When a sport is wired, this list shrinks — and that shrinking is the
  // evidence `monitoring` asks for. P188 wired EPL, so it left: cron-watchdog now derives EPL
  // matchday from the fixture capture, checks whether the run happened, and dispatches when it
  // did not. UFC and NFL still have nothing watching whether their runs happened at all.
  const gaps = monitoringGaps().map((g) => g.sport).sort();
  assert.deepEqual(gaps, ["nfl", "ufc"], "uncovered sports must be exactly the ones lacking watchdog + alerting");
  assert.ok(isMonitored("mlb"), "MLB is a covered chain");
  assert.ok(isMonitored("epl"), "EPL is a covered chain as of P188");
  for (const s of ["nfl", "ufc"]) assert.equal(isMonitored(s), false, `${s} must not read as monitored`);
});

test("PARTIAL coverage must SAY so — being watched is not the same as being fully covered", () => {
  /*
   * The overstatement this guards: a sport flips `watched: true` and its entry becomes
   * indistinguishable from MLB's, whose watchdog covers a daily primary. EPL's single 14:30 UTC slot
   * genuinely catches a missed Friday opener and genuinely cannot cover a cluster's earliest kickoff
   * when that kickoff precedes the slot. That limit is recorded rather than rounded away.
   */
  const residuals = monitoringResiduals().map((r) => r.sport);
  assert.ok(residuals.includes("epl"), "EPL is watched but not completely covered, and must state it");
  for (const r of monitoringResiduals()) {
    assert.ok(r.residualGap.length > 40, `${r.sport}: a residual must describe what is NOT reached`);
    assert.equal(MONITORING[r.sport].gap, null, `${r.sport}: a residual is not a gap — the sport IS watched`);
  }
  assert.deepEqual(monitoringResiduals().filter((r) => r.sport === "mlb"), [],
    "MLB's daily watchdog carries no residual — it is not partial coverage");
});
