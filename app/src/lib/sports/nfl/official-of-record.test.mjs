/**
 * CANON-01 (founder 2026-11-09) — ONE NFL official forecast of record, whatever surface asks.
 *
 * Found through PR #1295: for a settled week the Simulation Theater rebuilt its "Official Forecast" from the internal
 * receipts (a second snapshot builder), while the settled game page and grading read the archived revision through
 * officialSnapshotFor. Same forecast revision, same player board — but the second builder left out the World Model
 * supporting source and hashed differently, so CAR @ GB 401873023 printed snapshot 47d5131f… on the Theater and
 * f6fccaa4… on the game page. On 2026-11-09 every settled game with a Theater page (58 of 58) had the split; no game had
 * a different REVISION. The fix is forward-only and at the source: both surfaces ask nflOfficialOfRecord.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/official-of-record.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { nflOfficialOfRecord } from "./official-of-record.mjs";
import { nflTheaterOfficial } from "../../simulation-theater/loader.mjs";
import { readShadowReceipts } from "./sim-v2/public-receipt.mjs";

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const PUBLIC = path.join(APP, "public");
const THEATER_IDS = [...new Set(readShadowReceipts(REPO).map((r) => String(r.receipt.eventId)))].sort();

test("CAR @ GB 401873023: the record is the archived 2026-10-29T16:04:09Z revision (the one Production served at kickoff)", () => {
  const r = nflOfficialOfRecord(PUBLIC, "401873023");
  assert.equal(r.basis, "ARCHIVED_RECORD");
  assert.equal(r.forecast.generatedAt, "2026-10-29T16:04:09Z");
  assert.equal(r.snapshot.snapshotId, "f6fccaa46511557ee31ef916f477317e3c0db86021ef0355e32e817d948209fb");
  assert.ok(r.snapshot.sources.some((s) => s.role === "SUPPORTING_SIMULATION"), "the World Model source the second builder dropped");
});

test("every NFL game with a Theater page: the Theater's Official Forecast IS the record selector's snapshot (live or settled)", () => {
  assert.ok(THEATER_IDS.length >= 50);
  const split = [];
  for (const id of THEATER_IDS) {
    const rec = nflOfficialOfRecord(PUBLIC, id);
    const th = nflTheaterOfficial(REPO, id);
    if (!rec) { assert.equal(th.snapshot, null, `${id}: no record ⇒ the Theater shows no Official Forecast`); continue; }
    if ((th.snapshot?.snapshotId ?? null) !== (rec.snapshot?.snapshotId ?? null)) split.push(id);
  }
  assert.deepEqual(split, [], "one snapshot id per game on both surfaces");
});

test("no second builder: the Theater loader never rebuilds an official snapshot from the internal receipts", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/simulation-theater/loader.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const body = (name) => { const i = src.indexOf(`export function ${name}(`); return src.slice(i, src.indexOf("\n}\n", i)); };
  for (const fn of ["nflGamePageOfficial", "nflTheaterOfficial"]) assert.doesNotMatch(body(fn), /nflOfficial\(|readNflOfficialInputs\(|officialSnapshotFor\(/, fn);
  assert.match(body("nflGamePageOfficial"), /nflOfficialOfRecord\(/);
});

test("forward-only: the selector reads committed records and never re-picks a revision (no clock, no generation-time rule)", () => {
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/official-of-record.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(src, /Date\.now\(|new Date\(\)|forecastOfRecord\(/);
});
