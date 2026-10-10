#!/usr/bin/env node
/**
 * DRY-RUN REPORT: what the proposed "withdrawn pairing" rule (UFC-001 · U4 / D3) WOULD say about
 * every card in the committed model-vs-market snapshots. READ-ONLY. It writes nothing, anywhere.
 *
 *   npx tsx app/scripts/ufc/report-pairing-status.mjs --now <iso> [--json] [--espn-file <path>]
 *
 * Reads:  data/internal/research/ufc/model-vs-market/snapshot-*.json   (frozen pre-start snapshots)
 *         data/internal/research/ufc/model-vs-market/graded.jsonl      (cross-check only)
 *         data/internal/research/ufc/model-vs-market/summary.json      (today's reconciliation, for the diff)
 *         app/public/data/ufc/results-latest.json + results/latest.json (official results, both sources)
 *
 * For each card it prints the proposed classification beside today's summary.json reconciliation,
 * and it cross-checks every GRADED pairing against the ledger: same bout, same hit, same probability,
 * same source snapshot. A mismatch there would mean the rule changes a graded denominator, which it
 * must not.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOfficialUfcResults } from "../../src/lib/sports/ufc/official-results.mjs";
import { classifyPairings, canonicalBoutId, PAIRING_STATUS } from "../../src/lib/sports/ufc/pairing-status.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.join(APP, "..");
const DIR = path.join(REPO, "data/internal/research/ufc/model-vs-market");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
const JSON_OUT = process.argv.includes("--json");
if (process.argv.includes("--write")) { console.error("REFUSED: this report is read-only; there is no --write"); process.exit(1); }
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const snapshots = fs.readdirSync(DIR).filter((f) => /^snapshot-\d{12}\.json$/.test(f)).sort()
  .map((file) => ({ file, ...read(path.join(DIR, file)) }))
  .filter((s) => s.event);

/* Official results through the ONE shared reader (conflicts refused there), then the corpus's own
 * draw / no_contest word re-attached — the shared reader collapses both into void:true. */
const corpus = read(path.join(APP, "public/data/ufc/results-latest.json"));
// --espn-file lets a dry run read a capture held OUTSIDE the repo (e.g. a scratch copy), never written by this script.
const espn = read(arg("--espn-file") ?? path.join(APP, "public/data/ufc/results/latest.json"));
const { byBout, conflicts } = loadOfficialUfcResults({ corpus, espn });
const corpusStatus = new Map((corpus?.results ?? []).filter((r) => r.boutId).map((r) => [canonicalBoutId(r.boutId), r.resultStatus ?? null]));
const results = [...byBout.values()].map((r) => ({ ...r, resultStatus: corpusStatus.get(canonicalBoutId(r.boutId)) ?? null }));

const ledger = (() => {
  try {
    return fs.readFileSync(path.join(DIR, "graded.jsonl"), "utf8").split("\n").filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
})();
const ledgerById = new Map(ledger.map((r) => [r.boutId, r]));
/*
 * THE LEDGER IS AN OFFICIAL RESULT ALREADY APPLIED. The ESPN capture is a rolling window, so a card
 * graded from it weeks ago may have no result on disk today except the one the ledger recorded. Each
 * ledger row joins as a result record stamped with its gradedAt, so it is the EARLIEST record for its
 * bout: a later source that disagrees is flagged RESULT_CHANGED_NOT_APPLIED, never applied.
 */
for (const l of ledger) {
  if (!l.boutId || l.void === true || !l.winner) continue;
  results.push({ boutId: l.boutId, eventDate: l.eventDate, winner: l.winner, loser: [l.pick, l.opponent].find((n) => n && n !== l.winner) ?? null, void: false, source: "graded_ledger", recordedAt: l.gradedAt ?? null });
}
const today = new Map((read(path.join(DIR, "summary.json"))?.reconciliation ?? []).map((r) => [r.slateDate, r]));

const out = classifyPairings({ snapshots, results, now: NOW });

/* Cross-check: the rule must not move a single graded bout. */
const mismatches = [];
for (const c of out.cards) {
  for (const p of c.pairings) {
    const l = ledgerById.get(p.boutId);
    const graded = p.status === PAIRING_STATUS.GRADED_WIN || p.status === PAIRING_STATUS.GRADED_LOSS;
    if (graded && !l) { mismatches.push({ boutId: p.boutId, issue: `classified ${p.status} but not in the ledger yet (the grader would append it)` }); continue; }
    if (!graded && l) { mismatches.push({ boutId: p.boutId, issue: `in the ledger but classified ${p.status}` }); continue; }
    if (!l) continue;
    if ((p.status === PAIRING_STATUS.GRADED_WIN) !== (l.hit === true)) mismatches.push({ boutId: p.boutId, issue: "hit differs from the ledger" });
    if (p.forecast.modelProbability !== l.modelProbability) mismatches.push({ boutId: p.boutId, issue: "model probability differs from the ledger" });
    if (p.forecast.sourceFile !== l.sourceFile) mismatches.push({ boutId: p.boutId, issue: `record snapshot ${p.forecast.sourceFile} vs ledger ${l.sourceFile}` });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ now: NOW, conflicts, mismatches, cards: out.cards }, null, 1));
  process.exit(0);
}

console.log(`UFC pairing-status DRY RUN (proposal U4/D3 — nothing applied, nothing written) · now ${NOW}`);
console.log(`snapshots ${snapshots.length} · official results ${results.length} · ledger rows ${ledger.length} · source conflicts ${conflicts.length}`);
console.log("");
const pad = (v, n) => String(v).padEnd(n);
console.log(`${pad("card", 11)}${pad("event", 42)}${pad("frozen", 7)}${pad("W", 4)}${pad("L", 4)}${pad("void", 5)}${pad("wdrn", 5)}${pad("pend", 5)}${pad("unpr", 5)}${pad("noRd", 5)}today (summary.json)`);
for (const c of out.cards) {
  const k = c.counts;
  const t = today.get(c.slateDate);
  const was = t ? `frozen ${t.frozen} graded ${t.graded} void ${t.void} pending ${t.pending}` : "not in summary";
  console.log(`${pad(c.slateDate, 11)}${pad(String(c.eventName ?? "").slice(0, 40), 42)}${pad(k.frozen, 7)}${pad(k.wins, 4)}${pad(k.losses, 4)}${pad(k.void, 5)}${pad(k.withdrawn, 5)}${pad(k.pending, 5)}${pad(k.unpricedExcluded, 5)}${pad(k.noReadExcluded, 5)}${was}${c.reconciles ? "" : "  RECONCILIATION BROKEN"}${c.started ? "" : "  (card not started — provisional)"}`);
}

console.log("");
/* Routine rows are counted, not listed: a graded bout confirmed by the ledger AND a current source
 * (DUPLICATE_RESULT only), and an in-final-snapshot bout simply waiting on its result. */
const routine = { confirmed: 0, waiting: new Map() };
for (const c of out.cards) {
  for (const p of c.pairings) {
    const graded = p.status === PAIRING_STATUS.GRADED_WIN || p.status === PAIRING_STATUS.GRADED_LOSS;
    if (graded && p.flags.every((f) => f === "DUPLICATE_RESULT")) { if (p.flags.length) routine.confirmed += 1; continue; }
    if (graded) { console.log(`  ${p.status} ${p.boutId} flags ${p.flags.join(",")}`); continue; }
    if (p.status === PAIRING_STATUS.AWAITING_RESULT && p.evidence.inFinalSnapshot && p.flags.every((f) => f === "CARD_NOT_STARTED")) {
      routine.waiting.set(c.slateDate, (routine.waiting.get(c.slateDate) ?? 0) + 1);
      continue;
    }
    console.log(`  ${p.status} ${p.boutId} (providerBoutId ${p.providerBoutId})`);
    console.log(`      forecast of record: pick ${p.forecast.pick} @ ${p.forecast.modelProbability} (market ${p.forecast.marketProbability}) from ${p.forecast.sourceFile}`);
    console.log(`      frozen in ${p.evidence.snapshotsContaining} snapshot(s): first ${p.evidence.firstSnapshot.file}, last ${p.evidence.lastSnapshot.file}; final ${p.evidence.finalSnapshot?.file ?? "none"} ${p.evidence.inFinalSnapshot ? "holds it" : "does NOT hold it"}`);
    if (p.evidence.replacement) console.log(`      replacement: ${p.evidence.replacement.boutId}${p.evidence.replacement.providerBoutId ? ` (providerBoutId ${p.evidence.replacement.providerBoutId})` : ""} shares ${p.evidence.replacement.sharedFighters.join(", ") || "the provider bout id"} — from ${p.evidence.replacement.source}`);
    if (p.flags.length) console.log(`      flags: ${p.flags.join(", ")}`);
  }
}
console.log(`  ${routine.confirmed} graded pairing(s) confirmed by both the ledger and a current official source (DUPLICATE_RESULT, agreeing)`);
for (const [d, n] of routine.waiting) {
  const c = out.cards.find((x) => x.slateDate === d);
  console.log(`  ${d}: ${n} pairing(s) in the final pre-start snapshot ${c.finalSnapshot?.file ?? "none"} AWAITING_RESULT${c.started ? "" : " (card not started — provisional)"}`);
}

console.log("");
for (const x of conflicts) console.log(`  SOURCE CONFLICT ${x.boutId}: corpus ${x.corpus} vs ESPN ${x.espn} — refused by the shared reader`);
console.log(mismatches.length === 0
  ? "ledger cross-check: every GRADED pairing matches graded.jsonl (bout, hit, probability, source snapshot) — no graded denominator moves"
  : `ledger cross-check: ${mismatches.length} difference(s)`);
for (const m of mismatches) console.log(`  ${m.boutId}: ${m.issue}`);
console.log("dry run — this script has no write path.");
