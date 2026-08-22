#!/usr/bin/env node
/**
 * PRE-FIGHT SNAPSHOT: what the model said, and what the market said, on the same bouts.
 *
 *   npx tsx app/scripts/ufc/capture-ufc-model-vs-market.mjs --now <iso> [--write]
 *   Writes: data/internal/research/ufc/model-vs-market/snapshot-<stamp>.json  (PRIVATE)
 *
 * PRIVATE because it contains de-vigged paid odds. What reaches a reader is the model's own
 * probability, which is already public; the comparison is research.
 *
 * IMMUTABLE PER RUN. The EPL grader was reading a forecast written the night before because the
 * dated file had been overwritten by a later run, and it lost the market baseline on the one match
 * where model and market disagreed sharply. A stamped snapshot cannot be overwritten by the next run.
 *
 * REFUSES AT OR AFTER THE FIRST BOUT. A snapshot taken once the card is under way can already see a
 * result, which is exactly the leakage this artifact exists to be free of.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPreFightRows } from "../../src/lib/sports/ufc/model-vs-market.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const card = read(path.join(APP, "public/data/ufc/card-latest.json"));
const odds = read(path.join(APP, "public/data/ufc/odds-latest.json"));
if (!card || !odds) { console.error("REFUSED: no card or odds capture to compare"); process.exit(1); }

const { rows, skipped } = buildPreFightRows({ card, odds, capturedAt: NOW });

console.log(`ufc model-vs-market: ${rows.length} bout(s) with BOTH a model read and a usable price · ${skipped.length} skipped`);
for (const r of rows) {
  const gap = r.modelProbability - r.marketProbability;
  console.log(`  ${r.pick.padEnd(22)} model ${(r.modelProbability * 100).toFixed(1).padStart(5)}%  market ${(r.marketProbability * 100).toFixed(1).padStart(5)}%  ${gap >= 0 ? "+" : ""}${(gap * 100).toFixed(1)}pp`);
}
for (const s of skipped.slice(0, 4)) console.log(`  skipped ${s.boutId ?? ""}: ${s.reason}`);

if (rows.length === 0) { console.log("nothing to record."); process.exit(0); }
if (!WRITE) { console.log("dry run — pass --write to persist."); process.exit(0); }

const stamp = `${NOW.slice(0, 4)}${NOW.slice(5, 7)}${NOW.slice(8, 10)}${NOW.slice(11, 13)}${NOW.slice(14, 16)}`;
const dir = path.join(REPO, "data/internal/research/ufc/model-vs-market");
fs.mkdirSync(dir, { recursive: true });
const out = {
  schemaVersion: 1,
  artifact: "ufc-model-vs-market-prefight",
  dataClass: "INTERNAL_RESEARCH",
  public: false,
  capturedAt: NOW,
  event: { name: card.event?.name ?? null, slateDate: card.event?.slateDate ?? null, startUtc: card.event?.startUtc ?? null },
  modelId: card.model?.id ?? null,
  note: "Both probabilities recorded BEFORE the card. Re-deriving the market later would compare the model to a price that did not exist when it spoke.",
  rows,
  skipped,
};
fs.writeFileSync(path.join(dir, `snapshot-${stamp}.json`), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote data/internal/research/ufc/model-vs-market/snapshot-${stamp}.json`);
