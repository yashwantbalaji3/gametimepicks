#!/usr/bin/env node
/**
 * Stage 3C — the append-only NFL winner correction log (founder Q4 = HIGHER).
 *
 * Lists every settled NFL winner grade whose stored side used the superseded "P(home) > 0.5 else away" rule and that
 * no committed correction log restates yet (lib/results/nfl-model-favored.mjs pendingCorrections). The settler's
 * dated grade files and the receipts are never edited: a restatement is a NEW write-once file under
 * data/internal/nfl/winner-corrections/.
 *
 *   node app/scripts/results/nfl-winner-corrections.mjs            # check: exit 1 when a grade needs restating
 *   node app/scripts/results/nfl-winner-corrections.mjs --write --id 2026-10-07-q4-higher [--now <iso>]
 *
 * --write refuses to overwrite an existing file and writes nothing when there is nothing to restate.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CORRECTIONS_DIR, CORRECTION_SCHEMA, DECISION_REF, NFL_MODEL_FAVORED_RULE, SUPERSEDED_RULE, pendingCorrections,
} from "../../src/lib/results/nfl-model-favored.mjs";
import { readGradedReceipt, readNflSideCutover, readNflWinnerCorrections } from "../../src/lib/results/nfl-model-favored-io.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] ?? null : null; };
const WRITE = process.argv.includes("--write");

const dir = path.join(ROOT, "data/internal/nfl/experimental-settlement");
const graded = [];
for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
  for (const event of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).events ?? []) {
    graded.push({ event, receipt: readGradedReceipt(ROOT, event), gradedIn: `data/internal/nfl/experimental-settlement/${f}` });
  }
}
const existing = readNflWinnerCorrections(ROOT);
const entries = pendingCorrections(graded, existing, { cutoverAt: readNflSideCutover(ROOT) });
console.log(`nfl winner corrections: ${graded.length} settled grades read · ${existing.size} already restated · ${entries.length} to restate`);
for (const e of entries) console.log(`  ${e.providerEventId} ${e.matchup}: ${e.before.modelFavoured} ${e.before.correct} → ${e.after.modelFavoured} ${e.after.correct}`);

if (!WRITE) process.exit(entries.length ? 1 : 0);
if (!entries.length) { console.log("nothing to restate; no file written"); process.exit(0); }
const id = arg("--id");
if (!id || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$/.test(id)) { console.error("--id <yyyy-mm-dd-slug> is required"); process.exit(1); }
const out = path.join(ROOT, CORRECTIONS_DIR, `${id}.json`);
if (fs.existsSync(out)) { console.error(`REFUSED: ${path.relative(ROOT, out)} exists; correction logs are write-once`); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  schemaVersion: CORRECTION_SCHEMA,
  correctionId: id,
  createdAt: arg("--now") ?? new Date().toISOString(),
  decision: DECISION_REF,
  supersededRule: SUPERSEDED_RULE,
  rule: NFL_MODEL_FAVORED_RULE,
  label: "historical model-favored winner accuracy",
  scope: "NFL game-winner forecasts with frozen team win probabilities and no frozen published side",
  appendOnly: "The receipts and the settler's dated grade files are unchanged. Readers apply these entries; nothing is deleted.",
  entries,
}, null, 1) + "\n");
console.log(`wrote ${path.relative(ROOT, out)}`);
