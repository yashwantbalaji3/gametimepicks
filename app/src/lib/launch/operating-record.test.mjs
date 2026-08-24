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
import crypto from "node:crypto";
import path from "node:path";
import { execSync } from "node:child_process";

import { RELEASE_HISTORY } from "./release-history.mjs";
import { validateRecordHtml } from "../../../scripts/ops/build-operating-record.mjs";
import { assessExtraction } from "../../../scripts/ops/verify-operating-record-pdf.mjs";

const RE = /\|P[0-9]{3} (R-[A-Z0-9]+|Phase 0|L)[ :]|\(P[0-9]{3} Releases? [A-Z0-9+]+\)|\(Release [A-Z0-9+/]+\)/;
const recordPath = path.resolve(process.cwd(), "..", "data", "internal", "launch", "operating-record.html");

test("CONSERVATION · every convention-era release commit in git appears in the committed register", () => {
  const log = execSync('git log --reverse --format="%h|%s"', { encoding: "utf8" });
  const commits = log.split("\n").filter((l) => RE.test(l)).map((l) => l.split("|")[0]);
  const inRegister = new Set(RELEASE_HISTORY.map((r) => r.commit));
  /*
   * The NEWEST convention commit alone may be in flight: a release row cannot contain its own
   * SHA, so each release registers its predecessor and the newest one is registered by the next.
   * ("HEAD alone" was the first form of this rule; a routine bot commit took HEAD within the hour
   * and exposed the just-shipped release as a false conservation failure.) Anything that is not
   * the newest convention commit and is unregistered is a real hole in the record.
   */
  const newestConvention = commits[commits.length - 1];
  const missing = commits.filter((c) => !inRegister.has(c) && c !== newestConvention);
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

test("FINAL-FILE CORRUPTION · every defective-bytes fixture fails the PDF assessor (P204 R-A)", () => {
  const good = {
    pages: 8,
    fullText: [
      "Queues: 0 engineering · 7 reality · 5 founder · 0 incident",
      "MLB\n12/12 proven", "EPL\n11/12 proven", "UFC\n10/12 proven", "NFL\n9/12 proven", "NBA\n6/12 proven",
      "141-143-— 2026-08-07", "203-R-B 2026-08-24",
      ...Array.from({ length: 110 }, (_, i) => `2026-08-${String((i % 24) + 1).padStart(2, "0")}`),
      "Register complete: 110 releases",
    ].join("\n"),
    lastPageText: "Register complete: 110 releases · 141-143-— → 203-R-B",
  };
  const exp = { expectedRows: 110, first: "141-143-—", last: "203-R-B" };
  assert.deepEqual(assessExtraction(good, exp), [], "the healthy fixture passes");

  const cases = [
    ["truncated (no terminal marker on the last page)", { ...good, lastPageText: "202-R-F c99a8dace three-engine ×", fullText: good.fullText.replace("Register complete: 110 releases", "") }, /truncated|completion line/],
    ["object coercion", { ...good, fullText: good.fullText + "\n[object Object]" }, /object Object/],
    ["dropped rows in the bytes", { ...good, fullText: good.fullText.split("\n").filter((l) => !/^2026-08-1/.test(l)).join("\n") }, /rows are missing/],
    ["blank sport card", { ...good, fullText: good.fullText.replace("NBA\n6/12 proven", "NBA\n") }, /NBA card carries no posture/],
    ["queue not numeric", { ...good, fullText: good.fullText.replace("Queues: 0 engineering · 7 reality", "Queues:  engineering · [object Object] reality") }, /queue line|object Object/],
    ["declared count mismatch", { ...good, fullText: good.fullText.replace("Register complete: 110 releases", "Register complete: 87 releases"), lastPageText: "Register complete: 87 releases" }, /declares 87/],
    ["first release absent", { ...good, fullText: good.fullText.replace("141-143-—", "") , lastPageText: good.lastPageText.replace("141-143-—","") }, /first release .* absent/],
    ["zero pages", { ...good, pages: 0 }, /page count is zero/],
  ];
  for (const [name, fixture, re] of cases) {
    const errors = assessExtraction(fixture, exp);
    assert.ok(errors.some((e) => re.test(e)), `${name}: must fail (got: ${errors.join(" | ") || "PASS"})`);
  }
});

test("the PDF receipt matches the produced bytes and the /launch card renders its checksum", () => {
  const receipt = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data/internal/launch/operating-record-pdf-receipt.json"), "utf8"));
  const pdf = fs.readFileSync(path.resolve(process.cwd(), "..", "data/internal/launch/operating-record.pdf"));
  assert.equal(receipt.pdfSha256, crypto.createHash("sha256").update(pdf).digest("hex"), "receipt checksum matches the bytes on disk");
  assert.equal(receipt.releases, RELEASE_HISTORY.length, "receipt row count matches the register");
  const launch = fs.readFileSync(path.join(process.cwd(), "src/app/launch/page.tsx"), "utf8");
  assert.match(launch, /operating-record-pdf-receipt\.json/, "/launch reads the PDF receipt");
  assert.match(launch, /pdfSha256/, "/launch renders the verified PDF checksum");
});
