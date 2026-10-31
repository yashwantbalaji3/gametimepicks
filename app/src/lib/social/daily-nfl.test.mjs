import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { captureOn, reportFailures, weekOf } from "../../../scripts/social/daily-nfl.mjs";

test("captureOn reads the Eastern date of the stamp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-cap-"));
  for (const d of ["20261101T030000Z", "20261101T140000Z", "20261102T030000Z", "coverage"]) fs.mkdirSync(path.join(dir, d));
  assert.equal(captureOn("2026-10-31", dir), "20261101T030000Z", "11 PM Saturday Eastern");
  assert.equal(captureOn("2026-11-01", dir), "20261102T030000Z");
  assert.equal(captureOn("2026-11-03", dir), null);
});

test("weekOf reads the slate; no games, no week", () => {
  const views = [{ seasonType: 2, week: 8, kickoffUtc: "2026-11-01T18:00Z" }];
  assert.equal(weekOf("2026-11-01", views), 8);
  assert.equal(weekOf("2026-11-03", views), null);
});

test("a failure leaves its own report, never the NBA one; success clears it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nfl-rep-"));
  const file = reportFailures("2026-11-01", "t", ["NO_CAPTURE"], dir);
  assert.equal(path.basename(file), "FAILED-nfl-2026-11-01.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).reasons, ["NO_CAPTURE"]);
  assert.equal(reportFailures("2026-11-01", "t", [], dir), null);
  assert.equal(fs.existsSync(file), false);
});

test("the shell wrapper fixes its zone and its FAILED path", () => {
  const sh = fs.readFileSync(new URL("../../../scripts/social/daily-nfl.sh", import.meta.url), "utf8");
  assert.match(sh, /TZ=America\/New_York date/);
  assert.match(sh, /FAILED-nfl-\$day\.json/);
  assert.ok(!/ODDS|KEY=/.test(sh.replace(/reads no key/, "")));
});
