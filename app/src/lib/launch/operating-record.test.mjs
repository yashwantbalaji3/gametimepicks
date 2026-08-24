/**
 * Operating-record guards (Program 203 · Release A).
 *
 * The record is GENERATED from the committed register and self-validates. These prove the three
 * legs mechanically: (1) register↔git conservation — every convention-era release commit appears
 * in RELEASE_HISTORY, so a release can never silently vanish from the record; (2) the committed
 * HTML passes the validator; (3) the validator actually FAILS on truncation, reordering and
 * dropped rows (corruption fixtures — a validator no fixture can fail is decoration).
 *
 * Run: npx tsx --test src/lib/launch/operating-record.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { RELEASE_HISTORY } from "./release-history.mjs";
import { validateRecordHtml } from "../../../scripts/ops/build-operating-record.mjs";

const RE = /\|P[0-9]{3} (R-[A-Z0-9]+|Phase 0|L)[ :]|\(P[0-9]{3} Releases? [A-Z0-9+]+\)|\(Release [A-Z0-9+/]+\)/;
const recordPath = path.resolve(process.cwd(), "..", "data", "internal", "launch", "operating-record.html");

test("CONSERVATION · every convention-era release commit in git appears in the committed register", () => {
  const log = execSync('git log --reverse --format="%h|%s"', { encoding: "utf8" });
  const commits = log.split("\n").filter((l) => RE.test(l)).map((l) => l.split("|")[0]);
  const inRegister = new Set(RELEASE_HISTORY.map((r) => r.commit));
  /*
   * The HEAD commit alone may be in flight: a release row cannot contain its own SHA (the SHA
   * does not exist until the commit does), so each release appends its PREDECESSOR's row and the
   * newest convention commit is registered by the next one. Anything older and unregistered is a
   * real hole in the record.
   */
  const head = execSync('git rev-parse --short HEAD', { encoding: "utf8" }).trim();
  const missing = commits.filter((c) => !inRegister.has(c) && c !== head);
  assert.deepEqual(missing, [],
    `release commits missing from the register (run scripts/ops/append-release-history.mjs --emit):\n  ${missing.join("\n  ")}`);
});

test("the committed record HTML validates: end marker, count, first/last, chronology", () => {
  const doc = fs.readFileSync(recordPath, "utf8");
  assert.deepEqual(validateRecordHtml(doc), []);
  const m = doc.match(/data-expected-releases="(\d+)"/);
  assert.equal(Number(m[1]), RELEASE_HISTORY.length, "the record renders exactly the register's rows");
});

test("CORRUPTION · truncation, a dropped row, and reordering each fail the validator", () => {
  const doc = fs.readFileSync(recordPath, "utf8");
  // Truncation: cut before the end marker.
  const truncated = doc.slice(0, doc.indexOf("<!-- OPERATING-RECORD-END"));
  assert.ok(validateRecordHtml(truncated).some((e) => /truncated/.test(e)), "truncation fails");
  // Dropped row: remove one <tr>.
  const firstTr = doc.indexOf("<tr><td class=\"num\">");
  const trEnd = doc.indexOf("</tr>", firstTr) + 5;
  const dropped = doc.slice(0, firstTr) + doc.slice(trEnd);
  assert.ok(validateRecordHtml(dropped).some((e) => /row count/.test(e)), "a dropped row fails");
  // Reordering: swap the dates of the first two rows so chronology breaks.
  const rows = [...doc.matchAll(/<tr><td class="num">[^<]+<\/td><td class="num">[^<]*<\/td><td class="num">([0-9-]+)<\/td>/g)];
  const d1 = rows[0][1], later = rows.find((r) => r[1] > d1);
  if (later) {
    const reordered = doc.replace(rows[0][0], rows[0][0].replace(`>${d1}<`, `>2027-01-01<`));
    assert.ok(validateRecordHtml(reordered).some((e) => /chronology/.test(e)), "reordering fails");
  }
});
