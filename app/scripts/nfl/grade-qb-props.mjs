#!/usr/bin/env node
/**
 * NFL QB PROPS v0 · FORWARD COUNTS (default) / GRADE (only under an approved pre-registration). EXPERIMENTAL.
 *
 *   node scripts/nfl/grade-qb-props.mjs [--write]                         counts only — never reads a final
 *   node scripts/nfl/grade-qb-props.mjs --grade --prereg <file> [--write]  refused unless sha256(<file>) is approved
 *
 * Founder ruling 2026-11-10: thresholds are approved before anyone sees graded accuracy. Counts mode reads the committed
 * shadow receipts only and writes data/internal/research/nfl/qb-props/forward-counts.json (deterministic, no clock).
 * Grade mode is refused until APPROVED_PREREG_SHA256 (qb-props-grade.mjs) lists the file's sha256; weeks 5–9 stay
 * exploratory (SEEN_EXPLORATORY_WEEKS) whatever is approved.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readShadowReceipts } from "../../src/lib/sports/nfl/sim-v2/public-receipt.mjs";
import { forwardCounts, gradingApproved, FROM_DATE } from "../../src/lib/sports/nfl/qb-props-grade.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };

if (process.argv.includes("--grade")) {
  const file = arg("--prereg");
  const sha = file && fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
  if (!gradingApproved(sha)) {
    console.error(`REFUSED: no approved pre-registration (${file ? `sha256 ${sha ?? "unreadable"} is not approved` : "--prereg <file> missing"}). Nothing was graded.`);
    process.exit(2);
  }
  console.error("REFUSED: grading is not wired on this branch until the founder approves; see the pre-registration.");
  process.exit(2);
}

const counts = forwardCounts({ entries: readShadowReceipts(ROOT), from: arg("--from", FROM_DATE) });
const text = `${JSON.stringify(counts, null, 1)}\n`;
console.log(`qb-props forward counts: ${counts.receiptsOfRecord} receipts of record · ${counts.qbRows} projected-QB rows · total ${JSON.stringify(counts.total)} · with count PMF ${counts.withCountPmf}`);
console.log(`excluded: ${JSON.stringify(counts.excluded)}`);
if (process.argv.includes("--write")) {
  const out = path.join(ROOT, "data/internal/research/nfl/qb-props/forward-counts.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`wrote ${path.relative(ROOT, out)}`);
}
