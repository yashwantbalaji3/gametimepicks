#!/usr/bin/env node
/**
 * GRADE THE PRE-FIGHT SNAPSHOTS: score the model and the market on the SAME bouts.
 *
 *   npx tsx app/scripts/ufc/grade-ufc-model-vs-market.mjs --now <iso> [--write]
 *   Writes: data/internal/research/ufc/model-vs-market/graded.jsonl   (append-only)
 *           data/internal/research/ufc/model-vs-market/summary.json
 *
 * The gate has recorded UFC calibration as UNPROVEN because the model had "never been compared
 * against a no-vig line". Every ingredient was already on disk; nothing joined them. This is the
 * join, and it is append-only so a bout is scored exactly once.
 *
 * WHAT IT DOES NOT DO. It does not promote anything. Two numbers on the same bouts is evidence, and
 * the calibration stage moves against preregistered bars on a sample that does not exist yet — one
 * card is one card.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scorePreFightRows, boutKey, foldName } from "../../src/lib/sports/ufc/model-vs-market.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const WRITE = process.argv.includes("--write");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const DIR = path.join(REPO, "data/internal/research/ufc/model-vs-market");
const LEDGER = path.join(DIR, "graded.jsonl");

/* Every pre-fight snapshot, newest LAST so the latest revision of a bout wins. */
const rowsByBout = new Map();
try {
  for (const f of fs.readdirSync(DIR).filter((x) => /^snapshot-\d{12}\.json$/.test(x)).sort()) {
    const snap = read(path.join(DIR, f));
    for (const r of snap?.rows ?? []) rowsByBout.set(r.boutId, { ...r, capturedAt: snap.capturedAt, sourceFile: f });
  }
} catch { /* no snapshots yet */ }
if (rowsByBout.size === 0) { console.log("no pre-fight snapshots to grade."); process.exit(0); }

/* Official results, keyed the same date-qualified way — rematch-safe by construction. */
const results = read(path.join(APP, "public/data/ufc/results-latest.json"));
const resultsByBout = new Map();
for (const r of results?.results ?? []) {
  const k = r.boutId ?? boutKey(r.eventDate, r.fighterA, r.fighterB);
  resultsByBout.set(k, r);
  // The corpus's own key is already `date:a|b`; recompute as a fallback for any row missing one.
  resultsByBout.set(boutKey(r.eventDate, r.fighterA, r.fighterB), r);
}

/* Exactly once: a bout already in the ledger is never re-scored. */
const already = new Set();
try {
  for (const line of fs.readFileSync(LEDGER, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { already.add(JSON.parse(line).boutId); } catch { /* torn append */ }
  }
} catch { /* no ledger yet */ }

const pending = [...rowsByBout.values()].filter((r) => !already.has(r.boutId));
const out = scorePreFightRows(pending, resultsByBout);

console.log(`ufc model-vs-market grading: ${rowsByBout.size} snapshot bout(s) · ${already.size} already graded · ${out.n} newly graded · ${out.voided.length} void`);
if (out.n === 0) {
  console.log("  NOTHING_NEW — no snapshot bout has an official result that is not already in the ledger.");
  process.exit(0);
}
for (const g of out.graded) {
  console.log(`  ${g.hit ? "HIT " : "MISS"} ${g.pick.padEnd(22)} model ${(g.modelProbability * 100).toFixed(1)}%  market ${(g.marketProbability * 100).toFixed(1)}%  -> won by ${g.winner}`);
}
console.log(`  n ${out.n} · model logLoss ${out.model.logLoss} brier ${out.model.brier} accuracy ${out.model.accuracy}`);
console.log(`           · market logLoss ${out.market.logLoss} brier ${out.market.brier}`);
const delta = out.model.logLoss != null && out.market.logLoss != null ? out.model.logLoss - out.market.logLoss : null;
if (delta != null) {
  console.log(delta < 0
    ? `  the model's log loss is ${Math.abs(delta).toFixed(4)} LOWER than the market's on these ${out.n} bouts`
    : `  the model's log loss is ${delta.toFixed(4)} HIGHER than the market's on these ${out.n} bouts — it is losing to the price`);
}
console.log("  ONE CARD IS NOT A CALIBRATION. This is evidence, not a verdict.");

if (!WRITE) { console.log("dry run — pass --write to append."); process.exit(0); }
fs.mkdirSync(DIR, { recursive: true });
fs.appendFileSync(LEDGER, out.graded.map((g) => JSON.stringify({ ...g, gradedAt: NOW })).join("\n") + "\n");
fs.writeFileSync(path.join(DIR, "summary.json"), `${JSON.stringify({
  schemaVersion: 1, artifact: "ufc-model-vs-market-summary", dataClass: "INTERNAL_RESEARCH", public: false,
  generatedAt: NOW, gradedTotal: already.size + out.n,
  note: "Model and market scored on identical bouts, both recorded before the card. Not a calibration verdict — that needs preregistered bars and a sample.",
  latestRun: { n: out.n, model: out.model, market: out.market },
}, null, 1)}\n`);
console.log(`appended ${out.graded.length} row(s) to graded.jsonl`);
