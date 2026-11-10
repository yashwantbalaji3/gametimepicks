#!/usr/bin/env node
/**
 * NFL QB PROPS v0 · FORWARD COUNTS (default) / GRADE (only under an approved pre-registration). EXPERIMENTAL.
 *
 *   node scripts/nfl/grade-qb-props.mjs [--write]                         counts only — never reads a final
 *   npx tsx scripts/nfl/grade-qb-props.mjs --grade --prereg <file> [--write]  refused unless sha256(<file>) is approved
 *                                                                           and timestamped (APPROVED_PREREG_SHA256 +
 *                                                                           PREREG_APPROVED_AT); then writes qb-props/ledger.json
 *                                                                           (tsx: R5 reads nflOfficialOfRecord, which imports .ts)
 *
 * Founder ruling 2026-11-10: thresholds are approved before anyone sees graded accuracy. Counts mode reads the committed
 * shadow receipts only and writes data/internal/research/nfl/qb-props/forward-counts.json (deterministic, no clock).
 * It also writes the per-slate dashboard (dashboard.json: market status, forward rows, the challenger slot; no outcome
 * while grading is locked) — run after every slate. Grade mode is refused until APPROVED_PREREG_SHA256 (qb-props-grade.mjs) lists the
 * file's sha256 with its approval timestamp; counts mode never loads the grade-mode inputs module. Weeks 5–9 stay exploratory (SEEN_EXPLORATORY_WEEKS) whatever is approved.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { readShadowReceipts } from "../../src/lib/sports/nfl/sim-v2/public-receipt.mjs";
import { forwardCounts, FROM_DATE, gradeRefusal } from "../../src/lib/sports/nfl/qb-props-grade.mjs";
import { buildDashboard } from "../../src/lib/sports/nfl/qb-props-markets.mjs";
import { NFL_SIM_V2_ENGINE, NFL_SIM_V2_VERSION } from "../../src/lib/sports/nfl/sim-v2/engine.mjs";
import { SIMULATION_RECEIPT_SCHEMA } from "../../src/lib/sports/nfl/sim-v2/receipt.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };

if (process.argv.includes("--grade")) {
  // THE GATE COMES FIRST: nothing past this point (not even the grade-mode inputs module) loads unless the file's sha256
  // is approved and timestamped; runGrade checks the same gate again
  const file = arg("--prereg");
  const sha = file && fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
  const refuse = (why) => { console.error(`REFUSED: ${why} (${file ? `sha256 ${sha ?? "unreadable"}` : "--prereg <file> missing"}). Nothing was graded.`); process.exit(2); };
  const why = gradeRefusal(sha);
  if (why) refuse(why);
  const { runGrade } = await import("../../src/lib/sports/nfl/qb-props-inputs.mjs");
  const r = runGrade({ root: ROOT, preregSha256: sha, write: process.argv.includes("--write") });
  if (r.refused) refuse(r.refused);
  console.log(`qb-props ledger: ${r.ledger.counts.qbGames} QB-games · ${r.ledger.counts.confirmatoryQbGames} confirmatory${r.wrote ? ` · wrote ${r.wrote}` : ""}`);
  process.exit(0);
}

const entries = readShadowReceipts(ROOT);
const counts = forwardCounts({ entries, from: arg("--from", FROM_DATE) });
const text = `${JSON.stringify(counts, null, 1)}\n`;
console.log(`qb-props forward counts: ${counts.receiptsOfRecord} receipts of record · ${counts.qbRows} projected-QB rows · total ${JSON.stringify(counts.total)} · with count PMF ${counts.withCountPmf}`);
console.log(`excluded: ${JSON.stringify(counts.excluded)}`);
if (process.argv.includes("--write")) {
  const out = path.join(ROOT, "data/internal/research/nfl/qb-props/forward-counts.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  const dash = buildDashboard({ counts, gradingLocked: true, incumbent: { engine: NFL_SIM_V2_ENGINE, engineVersion: NFL_SIM_V2_VERSION, receiptSchema: SIMULATION_RECEIPT_SCHEMA } });
  const dout = path.join(path.dirname(out), "dashboard.json");
  fs.writeFileSync(dout, `${JSON.stringify(dash, null, 1)}\n`);
  console.log(`wrote ${path.relative(ROOT, out)} and ${path.relative(ROOT, dout)}`);
}
