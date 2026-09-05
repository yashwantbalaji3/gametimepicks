/**
 * A DEADLINE NOTHING IS SCHEDULED TO MEET — Program 234 · Release G.
 *
 * Run: npx tsx --test src/lib/offered-window/acquisition-cadence.test.mjs
 *
 * Sixteen NFL events sat `NOT_YET_CAPTURED` — "scheduled, and our acquisition for it has not run
 * yet" — each carrying a `nextDeadlineUtc` of tomorrow 15:00Z. There is no NFL acquisition:
 * `nfl-odds-capture.yml` is `workflow_dispatch` only, has no `cron:`, and last ran 23 days earlier.
 * The 15:00Z came from a literal in the builder. `ufc-odds-refresh.yml` was the same, with 13:00Z
 * invented for it.
 *
 * The rule this pins: the answer to "when will this be captured" must come from the thing that would
 * do the capturing. A deadline read off a constant reports a healthy schedule where a founder gate
 * actually sits, and "wait" and "somebody has to decide" call for different actions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { parseCadence, acquisitionCadences, ACQUISITION_WORKFLOW } from "./acquisition-cadence.mjs";
import { classifyEvent } from "./offered-window.mjs";

const WORKFLOWS = path.join(process.cwd(), "..", ".github", "workflows");
const readWorkflow = (f) => { try { return fs.readFileSync(path.join(WORKFLOWS, f), "utf8"); } catch { return undefined; } };

test("a dispatch-only workflow is not a schedule", () => {
  const yml = `name: x\non:\n  workflow_dispatch:\n    inputs:\n      a:\n        type: string\njobs: {}\n`;
  const c = parseCadence(yml);
  assert.equal(c.scheduled, false);
  assert.equal(c.cronCount, 0);
  assert.match(c.reason, /dispatches it by hand/i);
});

test("a real schedule is one", () => {
  const yml = `on:\n  schedule:\n    - cron: "0 15 * * *"\n    - cron: "0 21 * * *"\n  workflow_dispatch:\n`;
  const c = parseCadence(yml);
  assert.equal(c.scheduled, true);
  assert.equal(c.cronCount, 2);
});

test("A COMMENTED-OUT CRON DOES NOT RUN", () => {
  const yml = `on:\n  workflow_dispatch:\n#  schedule:\n#    - cron: "0 15 * * *"\n`;
  assert.equal(parseCadence(yml).scheduled, false, "a comment is not a schedule");
});

test("a schedule key with no cron entries is not a schedule either", () => {
  assert.equal(parseCadence(`on:\n  schedule:\njobs: {}\n`).scheduled, false);
});

test("an unreadable workflow is unscheduled, not assumed fine", () => {
  assert.equal(parseCadence(undefined).scheduled, false);
  assert.equal(parseCadence("").scheduled, false);
});

test("LIVE · the repository's own acquisition workflows are read correctly", () => {
  const texts = {};
  for (const f of Object.values(ACQUISITION_WORKFLOW)) {
    const t = readWorkflow(f);
    if (t) texts[f] = t;
  }
  if (!Object.keys(texts).length) return;
  const cadences = acquisitionCadences(texts);

  /* Cross-checked against the files themselves rather than against a constant: whatever the answer
     is, it must be the one the YAML gives. */
  for (const [sport, c] of Object.entries(cadences)) {
    const raw = texts[c.workflow];
    if (raw === undefined) continue;
    const live = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    const hasCron = /^\s*-\s*cron:/m.test(live) && /^\s*schedule:\s*$/m.test(live);
    assert.equal(c.scheduled, hasCron, `${sport}: ${c.workflow} says schedule=${hasCron}, cadence says ${c.scheduled}`);
  }
});

test("AN UNSCHEDULED SPORT IS TYPED GATED, NOT MERELY LATE", () => {
  const base = {
    startUtc: "2026-09-10T00:20:00Z", nowMs: Date.parse("2026-09-05T20:00:00Z"),
    joined: true, sourceAgeHours: null, maxSourceAgeHours: null,
    offered: false, priced: false, forecast: false, published: false,
    refusalReason: null, settled: false, captured: false,
  };
  const late = classifyEvent({ ...base, acquisitionScheduled: true, captureDueReason: "due at 15:00Z" });
  assert.equal(late.state, "NOT_YET_CAPTURED");

  const gated = classifyEvent({ ...base, acquisitionScheduled: false, acquisitionGateReason: "no cron for NFL" });
  assert.equal(gated.state, "ACQUISITION_UNSCHEDULED", "an event nothing will ever capture must not read as pending");
  assert.match(gated.reason, /no cron for NFL/);
});

test("the distinction survives the states around it", () => {
  const base = {
    startUtc: "2026-09-10T00:20:00Z", nowMs: Date.parse("2026-09-05T20:00:00Z"),
    joined: true, sourceAgeHours: null, maxSourceAgeHours: null,
    offered: false, priced: false, forecast: false, published: false,
    refusalReason: null, settled: false, captured: false, acquisitionScheduled: false,
  };
  /* A started event is still STARTED; a settled one still SETTLED. The gate does not outrank
     facts about the event itself. */
  assert.equal(classifyEvent({ ...base, settled: true }).state, "SETTLED");
  assert.equal(classifyEvent({ ...base, nowMs: Date.parse("2026-09-11T00:00:00Z") }).state, "STARTED");
  /* And a sport that HAS captured is unaffected by whether a future capture is scheduled. */
  assert.equal(classifyEvent({ ...base, captured: true, published: true }).state, "PUBLISHED");
});

test("LIVE · no event may carry a deadline while its sport has no scheduled acquisition", () => {
  const dir = path.join(process.cwd(), "..", "data", "internal", "offered-window");
  let doc;
  try {
    const f = fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().pop();
    doc = f ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null;
  } catch { return; }
  if (!doc) return;

  const texts = {};
  for (const f of Object.values(ACQUISITION_WORKFLOW)) { const t = readWorkflow(f); if (t) texts[f] = t; }
  const cadences = acquisitionCadences(texts);

  for (const sport of doc.sports ?? []) {
    const c = cadences[sport.sport];
    if (!c || c.scheduled !== false) continue;
    for (const row of sport.rows ?? []) {
      assert.equal(
        row.nextDeadlineUtc, null,
        `${sport.sport} has no scheduled acquisition (${c.workflow} ${c.reason}) and ${row.canonicalId} still advertises a deadline of ${row.nextDeadlineUtc}`,
      );
    }
  }
});
