#!/usr/bin/env node
/**
 * FINAL-FILE VERIFIER — the bytes people receive, not the generator's memory (Program 204 · R-A).
 *
 *   npx tsx scripts/ops/verify-operating-record-pdf.mjs
 *
 * P203 shipped a green generator whose PUBLISHED file rendered "[object Object]" twelve times in
 * the queue line and an empty posture span on every sport card — and the founder's print of it
 * ended mid-row at eight pages. The in-memory validator checked the register table and nothing
 * else. So this verifier renders the ACTUAL PDF (chromium print, Letter), extracts its text, and
 * asserts on the output:
 *
 *   · page count > 0 and the terminal "Register complete" line is on the final page;
 *   · parsed register row count equals the source register's expectation;
 *   · first and last release identifiers match the source;
 *   · "[object Object]" appears nowhere — object coercion is a failed export;
 *   · every sport card carries real posture (never a bare label);
 *   · the queue line carries four numeric counts.
 *
 * On success it writes operating-record-pdf-receipt.json (sha256, pages, rows, stamps) — the
 * checksum /launch links. Any failure exits 1. `assessExtraction` is exported so the guard test
 * can prove every corruption fixture FAILS.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { RELEASE_HISTORY } from "../../src/lib/launch/release-history.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HTML = path.resolve(APP, "..", "data", "internal", "launch", "operating-record.html");
const PDF = path.resolve(APP, "..", "data", "internal", "launch", "operating-record.pdf");
const RECEIPT = path.resolve(APP, "..", "data", "internal", "launch", "operating-record-pdf-receipt.json");

export function assessExtraction({ pages, pageTexts, fullText, lastPageText }, { expectedRows, first, last, orderedIds }) {
  const errors = [];
  if (!Number.isFinite(pages) || pages <= 0) errors.push("page count is zero — no document was produced");
  if (fullText.includes("[object Object]")) errors.push("object coercion in the output — '[object Object]' is a failed export");
  if (!/Register complete: \d+ releases/.test(lastPageText ?? "")) errors.push("terminal marker missing from the final page — the export is truncated");
  const declared = fullText.match(/Register complete: (\d+) releases/);
  if (!declared) errors.push("completion line absent");
  else if (Number(declared[1]) !== expectedRows) errors.push(`completion line declares ${declared[1]} rows; source expects ${expectedRows}`);

  /*
   * STRUCTURAL ROWS, never metadata (P205 R-A). Page 1 legitimately says "last 203-R-K" in its
   * stamp line, so id PRESENCE proves nothing — the P0's exact trap. A register row in the text
   * layer is the adjacency  <id> [<commit>] <date>  (the one legacy summary row has no commit).
   * Rows are enumerated by that structure and compared to the source ids as an ORDERED SEQUENCE:
   * set equality catches missing/invented/duplicated rows, order equality catches reordering.
   */
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const scanText = fullText.replace(/-\n/g, "-");
  if (orderedIds) {
    let cursor = 0;
    const missing = [];
    for (const id of orderedIds) {
      const re = new RegExp(`(^|\n)${escRe(id)}\\s+(?:[a-f0-9]{8,11}\\s+)?\\d{4}-\\d{2}-\\d{2}`, "g");
      re.lastIndex = cursor;
      const m = re.exec(scanText);
      if (!m) { missing.push(id); continue; }
      cursor = m.index + m[0].length;
    }
    if (missing.length) {
      errors.push(`${missing.length} register row(s) absent or out of order in the bytes: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? " …" : ""}`);
    }
    const lastRe = new RegExp(`(^|\n)${escRe(last)}\\s+(?:[a-f0-9]{8,11}\\s+)?\\d{4}-\\d{2}-\\d{2}`);
    if (!lastRe.test(scanText)) errors.push(`final row ${last} absent as a STRUCTURAL row (metadata does not count)`);
    /* Invented/duplicated rows AFTER the final register row: anything row-shaped past the last
       match is a row the source never had. */
    const extraRe = /(^|\n)(\d{3}(?:-\d{3})?-[^\n]{1,24}?)\s+(?:[a-f0-9]{8,11}\s+)?\d{4}-\d{2}-\d{2}\s/g;
    extraRe.lastIndex = cursor;
    const extra = extraRe.exec(scanText);
    if (extra) errors.push(`row-shaped content after the final register row ("${extra[2]}") — duplicated or invented rows`);
  }
  if (!fullText.includes(first)) errors.push(`first release ${first} absent from the bytes`);
  if (!fullText.includes(last)) errors.push(`last release ${last} absent from the bytes`);

  /* Blank / orphan-fragment pages: every page carries substance, and the LAST page carries the
     terminal marker AND the final row — a page holding only a fragment ("H)") or whitespace is
     invalid, and a mid-entry cut leaves exactly that. */
  for (const [i, t] of (pageTexts ?? []).entries()) {
    const body = (t ?? "").replace(/\s+/g, " ").trim();
    if (body.length < 40) errors.push(`page ${i + 1} is blank or an orphan fragment (${body.length} chars: "${body.slice(0, 30)}")`);
  }
  if (lastPageText && orderedIds && !lastPageText.replace(/-\n/g, "-").includes(orderedIds[orderedIds.length - 1])) {
    errors.push("the final page does not contain the final register row — the register ends early");
  }

  for (const sport of ["MLB", "EPL", "UFC", "NFL", "NBA"]) {
    const re = new RegExp(`${sport}\\s*\\n?\\s*(\\d+/\\d+ proven|posture unavailable)`);
    if (!re.test(fullText)) errors.push(`${sport} card carries no posture in the bytes`);
  }
  if (!/Queues:\s*\d+ engineering · \d+ reality · \d+ founder · \d+ incident/.test(fullText.replace(/\n/g, " "))) {
    errors.push("queue line is not four numeric counts");
  }
  return errors;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + HTML, { waitUntil: "networkidle" });
  await p.pdf({ path: PDF, format: "Letter", printBackground: true });
  await b.close();

  const py = `
import json, sys
from pypdf import PdfReader
rd = PdfReader(${JSON.stringify(PDF)})
pages = [pg.extract_text() or "" for pg in rd.pages]
print(json.dumps({"pages": len(pages), "pageTexts": pages, "fullText": "\\n".join(pages), "lastPageText": pages[-1] if pages else ""}))
`;
  const extraction = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));

  const html = fs.readFileSync(HTML, "utf8");
  const end = html.match(/<!-- OPERATING-RECORD-END expected=(\d+) first=([^ ]+) last=([^ ]+) -->/);
  if (!end) { console.error("source HTML has no end marker — regenerate first"); process.exit(1); }
  /* Ordered ids from the SOURCE register, chronological exactly as the builder sorts. */
  const progNum = (r) => Number(String(r.program).match(/^\d+/)?.[0] ?? 0);
  const orderedRows = [...RELEASE_HISTORY].reverse().sort((a, b) =>
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (progNum(a) - progNum(b)));
  const orderedIds = orderedRows.map((r) => `${r.program}-${r.release}`);
  const expectations = { expectedRows: Number(end[1]), first: end[2], last: end[3], orderedIds };
  if (expectations.expectedRows !== RELEASE_HISTORY.length) {
    console.error(`source HTML expects ${expectations.expectedRows} rows but the register holds ${RELEASE_HISTORY.length} — stale HTML`);
    process.exit(1);
  }

  const errors = assessExtraction(extraction, expectations);
  if (errors.length) { for (const e of errors) console.error(`PDF INVALID: ${e}`); process.exit(1); }

  const receipt = {
    schemaVersion: 2,
    artifact: "operating-record-pdf-receipt",
    rendererVersion: "chromium-print/letter · verifier v2 (structural rows)",
    orderedIds,
    verifiedAt: new Date().toISOString(),
    pdfSha256: crypto.createHash("sha256").update(fs.readFileSync(PDF)).digest("hex"),
    htmlSha256: crypto.createHash("sha256").update(html).digest("hex"),
    pages: extraction.pages,
    releases: expectations.expectedRows,
    first: expectations.first,
    last: expectations.last,
  };
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 1) + "\n");
  console.log(`operating-record.pdf VERIFIED: ${extraction.pages} pages · ${expectations.expectedRows} rows (${expectations.first} → ${expectations.last}) · sha256 ${receipt.pdfSha256.slice(0, 16)}…`);
}
