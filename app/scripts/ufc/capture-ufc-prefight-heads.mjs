#!/usr/bin/env node
/**
 * PRE-FIGHT RECEIPT FOR ALL THREE HEADS: winner, method, ending round (and goes the distance).
 *
 *   npx tsx app/scripts/ufc/capture-ufc-prefight-heads.mjs --now <iso> [--write]
 *   Writes: data/internal/research/ufc/prefight-heads/heads-<stamp>.json  (internal; no prices)
 *
 * The model-vs-market snapshot freezes the winner only, and only for priced bouts. This freezes what
 * the card published for every bout with a read, priced or not, so method and round can be graded
 * from an exact pre-fight copy rather than recovered from git history. It holds no odds, changes no
 * published file and feeds no public page. Immutable per run: a stamped file is never overwritten.
 * Refuses at or after the card's start (src/lib/sports/ufc/prefight-heads.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPreFightHeads } from "../../src/lib/sports/ufc/prefight-heads.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

let card = null;
try { card = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/card-latest.json"), "utf8")); } catch { /* none */ }
if (!card) { console.error("REFUSED: no card to freeze"); process.exit(1); }

const { rows, skipped } = buildPreFightHeads({ card, capturedAt: NOW });
const incoherent = rows.filter((r) => Object.values(r.coherence).some((v) => v === false));
console.log(`ufc prefight heads: ${rows.length} bout(s) frozen · ${skipped.length} skipped · ${incoherent.length} with an incoherent head`);
for (const s of skipped.slice(0, 4)) console.log(`  skipped ${s.boutId ?? ""}: ${s.reason}`);
for (const r of incoherent) console.log(`  INCOHERENT ${r.boutId}: ${JSON.stringify(r.coherence)}`);

if (rows.length === 0) { console.log("nothing to record."); process.exit(0); }
if (!WRITE) { console.log("dry run: pass --write to persist."); process.exit(0); }

const stamp = `${NOW.slice(0, 4)}${NOW.slice(5, 7)}${NOW.slice(8, 10)}${NOW.slice(11, 13)}${NOW.slice(14, 16)}`;
const dir = path.join(REPO, "data/internal/research/ufc/prefight-heads");
const file = path.join(dir, `heads-${stamp}.json`);
if (fs.existsSync(file)) { console.log(`heads-${stamp}.json already exists: immutable, not overwritten.`); process.exit(0); }
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, `${JSON.stringify({
  schemaVersion: 1,
  artifact: "ufc-prefight-heads",
  dataClass: "INTERNAL_RESEARCH",
  public: false,
  capturedAt: NOW,
  cardGeneratedAt: card.generatedAt ?? null,
  event: { providerEventId: card.event?.providerEventId ?? null, name: card.event?.name ?? null, slateDate: card.event?.slateDate ?? null, startUtc: card.event?.startUtc ?? null },
  modelId: card.model?.id ?? null,
  verdicts: card.model?.verdicts ?? null,
  note: "Every head the card published, copied before the card started. Method is a fight-level distribution (not per fighter). Not graded here, and not public.",
  rows,
  skipped,
}, null, 1)}\n`);
console.log(`wrote data/internal/research/ufc/prefight-heads/heads-${stamp}.json`);
