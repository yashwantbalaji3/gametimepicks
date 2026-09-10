#!/usr/bin/env node
/**
 * Grade the preregistered margin-interval challenger in shadow on every settled regular-season game,
 * and record the frozen contract's verdict for the forecast generator to read.
 *
 *   node scripts/nfl/evaluate-margin-interval-shadow.mjs --now <ISO> [--write]
 *
 * Reads only committed receipts; writes one internal report. The generator publishes the challenger's
 * band only when this report says PROMOTE_CHALLENGER (see src/lib/sports/nfl/margin-interval-shadow.mjs).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHALLENGER, decide, shadowRows } from "../../src/lib/sports/nfl/margin-interval-shadow.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const NOW = val("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("--now <ISO> required"); process.exit(2); }

const dir = path.join(ROOT, "data/internal/nfl/experimental-settlement");
const docs = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const contractFile = "data/internal/research/nfl/regular-season-evaluation-contract.json";
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, contractFile), "utf8"));
const sha = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, CHALLENGER.preregistration))).digest("hex");

const rows = shadowRows(docs);
const verdict = decide({ rows, contract, preregistrationSha256: sha });
const report = {
  schemaVersion: 1,
  artifact: "nfl-margin-interval-shadow",
  dataClass: "INTERNAL_RESEARCH",
  generatedAt: NOW,
  preregistration: { file: CHALLENGER.preregistration, sha256: sha, matchesFrozen: sha === CHALLENGER.preregistrationSha256 },
  contract: { file: contractFile, frozenAt: contract.frozenAt },
  cohort: "2026 regular season (seasonType 2), each settled game once",
  ...verdict,
};
console.log(`[margin-shadow] n=${verdict.n} weeks=${verdict.weeks} · incumbent ${verdict.incumbent.coverage80} · challenger ${verdict.challenger.coverage80} → ${verdict.decision}`);
console.log(`  ${verdict.why}`);
if (args.includes("--write")) {
  const out = path.join(ROOT, "data/internal/research/nfl/reports/margin-interval-shadow-latest.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(`  wrote ${path.relative(ROOT, out)}`);
}
