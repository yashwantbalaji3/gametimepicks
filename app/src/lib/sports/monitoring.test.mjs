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

import { MONITORING, MONITORED_SPORTS, WATCHDOG, ALERT_SCRIPT, isMonitored, monitoringGaps } from "./monitoring.mjs";

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

test("the gaps are reported, and today only MLB is covered", () => {
  // A FACT about today, and the point of the stage: three sports can fail silently. When a sport is
  // wired, this list shrinks — and that shrinking is the evidence `monitoring` asks for.
  const gaps = monitoringGaps().map((g) => g.sport).sort();
  assert.deepEqual(gaps, ["epl", "nfl", "ufc"], "uncovered sports must be exactly the ones lacking watchdog + alerting");
  assert.ok(isMonitored("mlb"), "MLB is the covered chain");
  for (const s of MONITORED_SPORTS) if (s !== "mlb") assert.equal(isMonitored(s), false, `${s} must not read as monitored`);
});
