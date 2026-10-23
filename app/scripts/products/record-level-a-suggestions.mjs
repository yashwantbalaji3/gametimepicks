#!/usr/bin/env node
/**
 * RECORD TODAY'S LEVEL A SUGGESTIONS → data/internal/products/level-a/suggestions.jsonl (append-only). The ONE writer.
 * OFFLINE: reads the committed official forecasts only; no network, no key, no price. Separate from every priced
 * record (lab ledger, product receipts, settlement); a forward grader reads it later.
 *
 *   npx tsx scripts/products/record-level-a-suggestions.mjs --now <ISO> [--day YYYY-MM-DD] [--write]
 *   Default: dry run (prints what would be appended).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLevelAModel } from "../../src/lib/products/level-a/model.mjs";
import { appendRecord, recordEntries, recordViolations } from "../../src/lib/products/level-a/record.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
export const LEVEL_A_RECORD_PATH = path.join(REPO, "data", "internal", "products", "level-a", "suggestions.jsonl");

export function runRecord({ now, day = null, write = false, file = LEVEL_A_RECORD_PATH, repoRoot = REPO }) {
  if (!Number.isFinite(Date.parse(now ?? ""))) throw new Error("--now <ISO> required");
  const model = buildLevelAModel({ repoRoot, now, productDay: day });
  const beforeText = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const existing = beforeText.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const added = appendRecord(existing, recordEntries(model, { recordedAt: new Date(Date.parse(now)).toISOString() }));
  const afterText = beforeText + added.map((e) => `${JSON.stringify(e)}\n`).join("");
  const v = recordViolations({ beforeText, afterText });
  if (v.length) throw new Error(`record guard: ${v.join("; ")}`);
  if (write && added.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (beforeText) fs.appendFileSync(file, afterText.slice(beforeText.length));
    else fs.writeFileSync(file, afterText, { flag: "wx" });
    if (fs.readFileSync(file, "utf8") !== afterText) throw new Error("post-write check failed");
  }
  return { productDay: model.productDay, added: added.length, wrote: write && added.length > 0, entries: added.map((e) => `${e.policy}/${e.tier}: ${e.legs.map((l) => `${l.sport}:${l.selection.label}`).join(" + ")}`) };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : null; };
  console.log(JSON.stringify(runRecord({ now: arg("--now"), day: arg("--day"), write: process.argv.includes("--write") }), null, 2));
}
