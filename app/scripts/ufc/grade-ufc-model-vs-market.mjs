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
import { loadOfficialUfcResults } from "../../src/lib/sports/ufc/official-results.mjs";

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

/*
 * Official results, keyed the same date-qualified way — rematch-safe by construction.
 *
 * BOTH SOURCES, because reading only the corpus meant this reported "no official result" for a card
 * whose winners were already on disk. The ufcstats corpus is rich and slow; our own ESPN capture is
 * winner-only and same-day. A bout in both must agree or it is refused rather than resolved — see
 * loadOfficialUfcResults. Every graded row records which source supplied its outcome.
 */
const results = read(path.join(APP, "public/data/ufc/results-latest.json"));
const espn = read(path.join(APP, "public/data/ufc/results/latest.json"));
const { byBout: resultsByBout, conflicts } = loadOfficialUfcResults({ corpus: results, espn });
for (const c of conflicts) {
  console.log(`  CONFLICT ${c.boutId}: corpus says ${c.corpus}, ESPN says ${c.espn} — refused, not resolved`);
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
  /*
   * AN EMPTY RUN HAS TWO CAUSES AND THEY ARE NOT THE SAME FACT.
   *
   * This printed NOTHING_NEW either way. But "every snapshot bout is already in the ledger" means
   * the loop is closed and working, while "the results corpus does not cover this card yet" means
   * we are waiting on somebody else's publication — and the second one, left unnamed, is
   * indistinguishable from a healthy no-op for as long as it lasts.
   *
   * It lasted a week. On 2026-08-23 the snapshot held ten bouts fought the previous night, the
   * ledger held none of them, and the corpus's newest event was 2026-08-15: the upstream scrape had
   * not published the card. The run reported NOTHING_NEW and exited clean, which is exactly what a
   * finished, healthy loop reports. The two states have to be told apart or a stalled source looks
   * like success indefinitely.
   */
  const corpusLatest = results?.latestEventDate ?? null;
  const uncovered = pending.filter((r) => !resultsByBout.has(r.boutId));
  if (uncovered.length > 0) {
    const oldest = uncovered.map((r) => String(r.boutId).slice(0, 10)).sort()[0];
    const lagDays = corpusLatest && oldest
      ? Math.round((Date.parse(`${oldest}T00:00:00Z`) - Date.parse(`${corpusLatest}T00:00:00Z`)) / 86_400_000)
      : null;
    console.log(`  AWAITING_RESULTS — ${uncovered.length} bout(s) from ${oldest} have no official result yet.`);
    console.log(`  The results corpus's newest event is ${corpusLatest ?? "unknown"}${lagDays != null ? `, ${lagDays} day(s) before that card` : ""}.`);
    console.log("  This is the upstream source lagging, NOT a closed loop — the comparison grades itself once the card lands.");
    process.exit(0);
  }
  console.log("  NOTHING_NEW — every snapshot bout is already in the ledger. The loop is closed.");
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
