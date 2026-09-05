/**
 * THE MAPPING NAMES THE JOB THAT RUNS — Program 235 · Release E.
 *
 * Run: npx tsx --test src/lib/offered-window/acquisition-mapping.test.mjs
 *
 * Program 234 mapped NFL to `nfl-odds-capture.yml` and UFC to `ufc-odds-refresh.yml`, concluded both
 * sports had no scheduled acquisition, and shipped that as `ACQUISITION_UNSCHEDULED`. Both are
 * dispatch-only TOOLS. The jobs that actually run are `nfl-event-window.yml` (3 crons, calls
 * `capture-nfl-odds.mjs --authorized`) and `ufc-fight-week.yml` (4 crons, Tue/Thu/Sat 11:00 UTC —
 * the exact cadence the UFC receipt authorizes — calling `capture-ufc-odds.mjs --apply`).
 *
 * Naming a workflow after a sport does not make it the job that runs. This binds the mapping to
 * evidence: the named workflow must exist AND must invoke that sport's capture script, so the
 * mapping cannot drift back onto a file that merely sounds right.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { ACQUISITION_WORKFLOW, ACQUISITION_SCRIPT, acquisitionCadences } from "./acquisition-cadence.mjs";

const WORKFLOWS = path.join(process.cwd(), "..", ".github", "workflows");
const read = (f) => { try { return fs.readFileSync(path.join(WORKFLOWS, f), "utf8"); } catch { return null; } };

test("every mapped sport has a script and a workflow — an unpaired entry proves nothing", () => {
  assert.deepEqual(Object.keys(ACQUISITION_WORKFLOW).sort(), Object.keys(ACQUISITION_SCRIPT).sort());
  assert.ok(Object.keys(ACQUISITION_WORKFLOW).length >= 4, "fewer than four sports are mapped");
});

test("THE NAMED WORKFLOW EXISTS AND INVOKES THAT SPORT'S CAPTURE", () => {
  for (const [sport, file] of Object.entries(ACQUISITION_WORKFLOW)) {
    const text = read(file);
    assert.ok(text, `${sport}: ${file} does not exist`);
    assert.ok(
      text.includes(ACQUISITION_SCRIPT[sport]),
      `${sport}: ${file} never invokes ${ACQUISITION_SCRIPT[sport]} — the mapping names a workflow that does not perform this sport's acquisition`,
    );
  }
});

test("A DISPATCH-ONLY TOOL IS NOT THE SCHEDULED CALLER", () => {
  /* The precise error being designed out. These files exist and are legitimate manual tools; they
     are simply not what runs on a schedule, and mapping to them reported two live acquisitions as
     unscheduled. */
  for (const tool of ["nfl-odds-capture.yml", "ufc-odds-refresh.yml"]) {
    const text = read(tool);
    if (!text) continue;
    const live = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    assert.doesNotMatch(live, /^\s*-\s*cron:/m, `${tool} has gained a schedule — re-check whether it is now the real caller`);
    assert.ok(
      !Object.values(ACQUISITION_WORKFLOW).includes(tool),
      `${tool} is dispatch-only and is mapped as a sport's scheduled acquisition`,
    );
  }
});

test("LIVE · every mapped sport reports a real schedule, derived from its own YAML", () => {
  const texts = {};
  for (const f of Object.values(ACQUISITION_WORKFLOW)) { const t = read(f); if (t) texts[f] = t; }
  const cadences = acquisitionCadences(texts);
  for (const [sport, c] of Object.entries(cadences)) {
    const raw = texts[c.workflow];
    if (!raw) continue;
    const live = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    const hasCron = /^\s*-\s*cron:/m.test(live) && /^\s*schedule:\s*$/m.test(live);
    assert.equal(c.scheduled, hasCron, `${sport}: cadence says ${c.scheduled}, ${c.workflow} says ${hasCron}`);
    /* Every sport in this map is currently scheduled. If one stops being, that is a finding worth
       failing on rather than absorbing silently. */
    assert.equal(c.scheduled, true, `${sport}: ${c.workflow} carries no schedule — acquisition would never run`);
  }
});
