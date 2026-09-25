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

import { RELEASE_HISTORY } from "./release-history.mjs";
import { validateRecordHtml } from "../../../scripts/ops/build-operating-record.mjs";
import { assessExtraction } from "../../../scripts/ops/verify-operating-record-pdf.mjs";
import { conventionCommits, isShallowRepository, missingFromRegister, shaMatches } from "../../../scripts/ops/append-release-history.mjs";

const recordPath = path.resolve(process.cwd(), "..", "data", "internal", "launch", "operating-record.html");

test("CONSERVATION · every convention-era release commit in git appears in the committed register", () => {
  /*
   * ── TWO WAYS THIS GUARD PASSED WITHOUT CHECKING ANYTHING ────────────────────────────────────
   *
   * 1. IT COMPARED TWO ABBREVIATIONS. Both sides were `%h`, and `%h` is not an identifier: git
   *    scales it with the object count. The register was written when `%h` gave 9 characters and the
   *    repo has since crossed into 10, so the string compare stopped matching on every row at once —
   *    119 releases reading as missing from a register that held all 119. The derivation and the
   *    prefix-against-`%H` comparison now live in append-release-history.mjs, imported here, so the
   *    guard and the tool that repairs it can no longer disagree about what a match is.
   *
   * 2. IT RAN ON A SHALLOW CLONE. `git log` then returns only the fetched window, `commits` comes
   *    back nearly empty, and "nothing missing" is true of nothing. That is the hole the first
   *    defect hid behind for as long as it existed. A clone that cannot see the convention era must
   *    fail, not pass.
   */
  assert.equal(
    isShallowRepository(), false,
    "shallow clone: git log cannot see the convention era, so this guard would pass by absence — check out with fetch-depth: 0",
  );

  const commits = conventionCommits();
  assert.ok(commits.length >= 100, `expected the full convention era, saw ${commits.length} commits — history is truncated`);

  /*
   * The NEWEST convention commit alone may be in flight: a release row cannot contain its own
   * SHA, so each release registers its predecessor and the newest one is registered by the next.
   * ("HEAD alone" was the first form of this rule; a routine bot commit took HEAD within the hour
   * and exposed the just-shipped release as a false conservation failure.) Anything that is not
   * the newest convention commit and is unregistered is a real hole in the record.
   */
  const newest = commits[commits.length - 1]?.commit;
  const missing = missingFromRegister(commits).filter((c) => c.commit !== newest).map((c) => c.commit.slice(0, 12));
  assert.deepEqual(missing, [],
    `release commits missing from the register (run scripts/ops/append-release-history.mjs --emit):\n  ${missing.join("\n  ")}`);
});

test("CONSERVATION · the match is by commit identity, not by abbreviation length", () => {
  /*
   * The defect above, as a fixture. A register row holds a prefix of whatever length was current
   * the day it was written; every one of these is the same commit and must read as registered.
   */
  const full = "2da735a7c5c3f8eed881c56f71d9424a03c5ac75";
  for (const abbrev of [full.slice(0, 7), full.slice(0, 8), full.slice(0, 9), full.slice(0, 10), full.slice(0, 12), full]) {
    assert.equal(shaMatches(abbrev, full), true, `${abbrev.length}-character prefix must match the same commit`);
  }
  // Too short to identify a commit, and a genuinely different commit, both refuse.
  assert.equal(shaMatches(full.slice(0, 6), full), false, "six characters is not an identification");
  assert.equal(shaMatches("2da735a7d", full), false, "a different commit is not a match");

  // And the real register: its stored abbreviations must resolve against real full shas in git.
  const registered = conventionCommits().filter((c) => RELEASE_HISTORY.some((r) => shaMatches(r.commit, c.commit)));
  assert.ok(registered.length >= 100, `the register must match real commits, matched ${registered.length}`);
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

test("FINAL-FILE CORRUPTION · every defective-bytes fixture fails the v2 structural assessor (P205 R-A)", () => {
  // Synthetic five-row register: rows are line-anchored "<id> [commit] <date>" — the structural
  // shape; page-1 metadata mentions the last id WITHOUT that shape and must never count.
  const ids = ["144-147-A-I", "176-Phase 0", "202-R-C fix", "203-R-B", "203-R-K"];
  const rows = [
    "144-147-A-I 281de088 2026-08-08 ledger v2",
    "176-Phase 0 fecbcbe74 2026-08-13 kickoff lock proven",
    "202-R-C fix 89445a32b 2026-08-24 ratchet was right",
    "203-R-B f494d06db 2026-08-24 pair four closes",
    "203-R-K 9f0247a71 2026-08-24 final assurance",
  ];
  const head = [
    "Generated 2026-08-25 · last 203-R-K (2026-08-24)",   // metadata mention — must not satisfy rows
    "Queues: 0 engineering · 7 reality · 5 founder · 0 incident",
    "MLB\n12/12 proven", "EPL\n11/12 proven", "UFC\n10/12 proven", "NFL\n9/12 proven", "NBA\n6/12 proven",
  ];
  const tail = ["Register complete: 5 releases · 144-147-A-I → 203-R-K"];
  const mk = (rowsArr, tailArr = tail) => {
    const pages = [head.join("\n"), rowsArr.join("\n") + "\n" + tailArr.join("\n")];
    return { pages: pages.length, pageTexts: pages, fullText: pages.join("\n"), lastPageText: pages[pages.length - 1] };
  };
  const exp = { expectedRows: 5, first: "144-147-A-I", last: "203-R-K", orderedIds: ids };
  assert.deepEqual(assessExtraction(mk(rows), exp), [], "the healthy fixture passes");

  const cases = [
    ["metadata-only last id (rows stop early)", mk(rows.slice(0, 4)), /absent or out of order|does not contain the final/],
    ["truncated (no terminal marker)", mk(rows, ["203-R-K 9f0247a71 2026-08-24 final assu"]), /truncated|declares/],
    ["orphan fragment page", { ...mk(rows), pages: 3, pageTexts: [head.join("\n"), rows.join("\n") + "\n" + tail[0], "H)"], lastPageText: "H)" }, /orphan fragment|terminal marker/],
    ["repeated last row breaks the sequence", mk([...rows.slice(0, 4), rows[4], rows[4]]), /duplicated or invented|absent or out of order/],
    ["reordered rows", mk([rows[1], rows[0], ...rows.slice(2)]), /absent or out of order/],
    ["object coercion", mk([...rows.slice(0, 4), rows[4] + " [object Object]"]), /object Object/],
    ["blank sport card", { ...mk(rows), fullText: mk(rows).fullText.replace("NBA\n6/12 proven", "NBA\n") }, /NBA card/],
    ["zero pages", { ...mk(rows), pages: 0 }, /page count is zero/],
  ];
  for (const [name, fixture, re] of cases) {
    const errors = assessExtraction(fixture, exp);
    assert.ok(errors.some((e) => re.test(e)), `${name}: must fail (got: ${errors.join(" | ") || "PASS"})`);
  }
});

test("REGISTER IDENTITY · no row ships a null program or release (the P205 null-null class)", () => {
  for (const r of RELEASE_HISTORY) {
    assert.ok(r.program && r.program !== "null", `${r.commit}: program is real`);
    assert.ok(r.release && r.release !== "null", `${r.commit}: release is real`);
  }
});

test("PACKAGING EQUALITY · published embed = receipt = content-addressed console copy = manifest (build-blocking)", () => {
  const dir = path.resolve(process.cwd(), "..", "data/internal/launch");
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, "operating-record-pdf-receipt.json"), "utf8"));
  const published = fs.readFileSync(path.join(dir, "operating-record-published.html"), "utf8");
  const b64 = published.match(/var B64 = "([A-Za-z0-9+/=]+)"/);
  assert.ok(b64, "the published page embeds the verified bytes");
  const embedded = Buffer.from(b64[1], "base64");
  assert.equal(crypto.createHash("sha256").update(embedded).digest("hex"), receipt.pdfSha256,
    "the bytes the download button hands out are EXACTLY the verified bytes");
  const sha16 = receipt.pdfSha256.slice(0, 16);
  const served = fs.readFileSync(path.join(process.cwd(), "public/data/admin", `operating-record-${sha16}.pdf`));
  assert.equal(crypto.createHash("sha256").update(served).digest("hex"), receipt.pdfSha256,
    "the content-addressed console copy is the same bytes");
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/admin/operating-record-manifest.json"), "utf8"));
  assert.equal(manifest.pdfSha256, receipt.pdfSha256, "the manifest agrees");
  assert.deepEqual(manifest.orderedIds, receipt.orderedIds, "manifest ids = verifier ids, in order");
  assert.match(published, /printing or exporting this view/i, "the boundary is stated to the reader in words");
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
