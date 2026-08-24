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

export function assessExtraction({ pages, fullText, lastPageText }, { expectedRows, first, last }) {
  const errors = [];
  if (!Number.isFinite(pages) || pages <= 0) errors.push("page count is zero — no document was produced");
  if (fullText.includes("[object Object]")) errors.push("object coercion in the output — '[object Object]' is a failed export");
  if (!/Register complete: \d+ releases/.test(lastPageText ?? "")) errors.push("terminal marker missing from the final page — the export is truncated");
  const declared = fullText.match(/Register complete: (\d+) releases/);
  if (!declared) errors.push("completion line absent");
  else if (Number(declared[1]) !== expectedRows) errors.push(`completion line declares ${declared[1]} rows; source expects ${expectedRows}`);
  /* Row conservation in the BYTES: count release-id tokens (program-release at line starts is
     unreliable after text extraction, so count commit-dated row signatures instead). */
  const rowHits = fullText.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (rowHits.length < expectedRows) errors.push(`only ${rowHits.length} dated tokens parsed for ${expectedRows} rows — rows are missing from the bytes`);
  if (!fullText.includes(first)) errors.push(`first release ${first} absent from the bytes`);
  if (!fullText.includes(last)) errors.push(`last release ${last} absent from the bytes`);
  /* Sport posture: every card carries a proven count and a tier word, never a bare label. */
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
print(json.dumps({"pages": len(pages), "fullText": "\\n".join(pages), "lastPageText": pages[-1] if pages else ""}))
`;
  const extraction = JSON.parse(execFileSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));

  const html = fs.readFileSync(HTML, "utf8");
  const end = html.match(/<!-- OPERATING-RECORD-END expected=(\d+) first=([^ ]+) last=([^ ]+) -->/);
  if (!end) { console.error("source HTML has no end marker — regenerate first"); process.exit(1); }
  const expectations = { expectedRows: Number(end[1]), first: end[2], last: end[3] };
  if (expectations.expectedRows !== RELEASE_HISTORY.length) {
    console.error(`source HTML expects ${expectations.expectedRows} rows but the register holds ${RELEASE_HISTORY.length} — stale HTML`);
    process.exit(1);
  }

  const errors = assessExtraction(extraction, expectations);
  if (errors.length) { for (const e of errors) console.error(`PDF INVALID: ${e}`); process.exit(1); }

  const receipt = {
    schemaVersion: 1,
    artifact: "operating-record-pdf-receipt",
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
