/**
 * Schedule cadence-receipt guards (Program 196 · Release F).
 *
 * Content-idempotent captures are right to skip committing an unchanged schedule — and they also
 * `git clean`ed every trace of the run, which made "capture ran, nothing changed" and "capture
 * stopped running" byte-identical in the repository. NBA's off-season window sat stamped 08-21
 * for days; the lane was healthy and could not prove it. The receipt separates the two stamps:
 * verifiedAt (the lane RAN) from contentStamp (the content MOVED). These pin the contract.
 *
 * Run: npx tsx --test src/lib/launch/schedule-cadence.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("the committed receipt covers every schedule-lane sport with both stamps typed", () => {
  const r = JSON.parse(read("public/data/admin/schedule-cadence.json"));
  assert.equal(r.artifact, "schedule-cadence-receipt");
  assert.deepEqual(Object.keys(r.sports).sort(), ["epl", "nba", "nfl", "ufc"]);
  for (const [sport, s] of Object.entries(r.sports)) {
    assert.ok(Number.isFinite(Date.parse(s.verifiedAt)), `${sport}: verifiedAt parses`);
    assert.ok(["CHANGED", "UNCHANGED"].includes(s.state), `${sport}: state is typed`);
  }
});

test("contentStamp restates the capture artifact's own stamp — never a third clock", () => {
  const r = JSON.parse(read("public/data/admin/schedule-cadence.json"));
  for (const sport of ["nfl", "nba"]) {
    const latest = JSON.parse(read(`public/data/${sport}/schedule/latest.json`));
    assert.equal(r.sports[sport].contentStamp, latest.generatedAt, `${sport}: receipt quotes the artifact's generatedAt`);
  }
});

test("the workflow writes and stages the receipt on EVERY run — an unchanged night still proves it ran", () => {
  const yml = read("../.github/workflows/sport-schedules.yml");
  assert.match(yml, /schedule-cadence\.json/, "the receipt is written in the commit step");
  assert.match(yml, /git add app\/public\/data\/admin\/schedule-cadence\.json/, "and staged unconditionally");
  const writeAt = yml.indexOf("schedule-cadence.json");
  const gateAt = yml.indexOf("no schedule content changed — nothing to publish");
  assert.ok(writeAt > -1 && gateAt > writeAt, "the receipt write precedes the nothing-to-publish early exit — it must not be skipped by it");
});

test("the packet reader judges NBA freshness by VERIFICATION, with the content stamp as information", () => {
  const src = read("src/lib/launch/closure-packet-sources.mjs");
  assert.match(src, /schedule-cadence\.json/, "the reader consumes the receipt");
  assert.match(src, /content last moved/, "the CURRENT detail separates the two stamps in words");
  assert.match(src, /no cadence receipt/, "absence of the receipt is stated, not silently forgiven");
});
