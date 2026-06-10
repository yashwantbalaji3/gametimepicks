// Build the persisted Bank Builder paper-bankroll ledger from REAL settled history.
// Reuses the site's own selector + ladder + pure progression math (one source of truth).
// No fabrication: only dates with a qualifying, fully-resolved Builder Pick advance the
// ladder. Idempotent — same inputs produce byte-identical artifacts (pass a fixed
// generatedAt). Usage: npx tsx scripts/build-bank-builder-ledger.mjs [generatedAt]
import fs from "node:fs";
import path from "node:path";
import { selectPlus100BuilderSlip } from "../src/lib/parlay-suggested.ts";
import { filterOfficialSuggestedSlips } from "../src/lib/sport-capabilities.ts";
import { BANK_BUILDER_BASE, BANK_BUILDER_GOAL, resolveLadderStep } from "../src/lib/bank-builder-ladder.ts";
import { buildBankBuilderLedger } from "../src/lib/bank-builder-progression.ts";

const root = path.join(process.cwd(), "public", "data", "parlays");
const outDir = path.join(process.cwd(), "public", "data", "bank-builder");
fs.mkdirSync(outDir, { recursive: true });
const GENERATED_AT = process.argv[2] || new Date().toISOString().slice(0, 19) + "+00:00";
const CROWN = 6; // display sentinel: ladder complete (>= goal)
const stepNum = (bk) => { const r = resolveLadderStep(bk); return r ? r.step : CROWN; };

const snapDates = new Set(
  fs.readdirSync(path.join(root, "snapshots")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)),
);
const dates = fs.readdirSync(path.join(root, "graded")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && snapDates.has(d)).sort();

// 1) Collect settled, fully-resolved Builder Picks (selected by the site's own selector).
const settledPicks = [];
for (const date of dates) {
  let snap, grad;
  try {
    snap = JSON.parse(fs.readFileSync(path.join(root, "snapshots", `${date}.json`), "utf-8"));
    grad = JSON.parse(fs.readFileSync(path.join(root, "graded", `${date}.json`), "utf-8"));
  } catch { continue; }
  const pick = selectPlus100BuilderSlip(filterOfficialSuggestedSlips(snap.slips ?? []));
  if (!pick) continue; // no qualifying Builder Pick that slate
  const graded = (grad.slips ?? []).find((s) => s.slipId === pick.slip.slipId);
  const legs = graded?.legs ?? [];
  const allResolved = legs.length > 0 && legs.every((l) => ["win", "loss", "push"].includes(l.result));
  if (!graded || !allResolved) continue; // unresolved → not part of the settled ledger
  const leakage = legs.some((l) => (l.gameDate || "").slice(0, 10) > date);
  settledPicks.push({
    date, sport: pick.slip.sport, slipId: pick.slip.slipId, riskProfile: pick.slip.riskProfile,
    result: graded.status, combinedAmerican: pick.combinedAmerican,
    combinedDecimal: Math.round(pick.combinedDecimal * 1e6) / 1e6, legCount: legs.length,
    legs: legs.map((l) => ({ player: l.playerName, market: l.market, side: l.side, line: l.line,
      odds: l.oddsForSide, result: l.result, finalStat: l.finalStat, source: l.settlementSource })),
    settledAt: graded.gradedAt || grad.gradedAt, settlementSource: legs[0]?.settlementSource || "mlb_stats_api",
    audit: { officialResultConfirmed: legs.every((l) => !!l.settlementSource),
      noManualOverride: !legs.some((l) => l.manualOverride), noTargetGameLeakage: !leakage, allLegsResolved: allResolved },
  });
}

// 2) Pure ladder progression (single source of truth, unit-tested).
const { entries, summary: base } = buildBankBuilderLedger(settledPicks, { base: BANK_BUILDER_BASE, goal: BANK_BUILDER_GOAL });
for (const e of entries) {
  e.progressionStepBefore = stepNum(e.bankrollBefore);
  e.progressionStepAfter = stepNum(e.bankrollAfter);
}

// 3) Next Builder Pick (pending, post last settled date) — never invented.
const last = entries[entries.length - 1] || null;
const bankroll = base.currentBankrollUnits;
let nextEligibleDate = null, nextPick = null;
for (const d of [...snapDates].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (!last || d > last.date)).sort()) {
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(root, "snapshots", `${d}.json`), "utf-8"));
    const p = selectPlus100BuilderSlip(filterOfficialSuggestedSlips(snap.slips ?? []));
    if (p) {
      nextEligibleDate = d;
      nextPick = { date: d, slipId: p.slip.slipId, sport: p.slip.sport, combinedAmerican: p.combinedAmerican,
        legCount: (p.slip.legs ?? []).length, stakeUnits: bankroll,
        projectedPayoutUnits: Math.round(bankroll * p.combinedDecimal * 100) / 100, step: stepNum(bankroll) };
      break;
    }
  } catch { /* skip */ }
}
const nextPickStatus = nextPick ? "pending"
  : "pending generation — no qualifying Builder Pick yet for an upcoming slate";

const summary = {
  generatedAt: GENERATED_AT,
  disclaimer: "Paper bankroll — educational tracking only, not betting advice, not a guarantee.",
  ...base, currentProgressionStep: stepNum(bankroll), nextEligibleDate, nextPickStatus, nextPick,
};
fs.writeFileSync(path.join(outDir, "ledger-latest.json"),
  JSON.stringify({ generatedAt: GENERATED_AT, base: BANK_BUILDER_BASE, goal: BANK_BUILDER_GOAL, entries }, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "summary-latest.json"), JSON.stringify(summary, null, 2) + "\n");
if (last) fs.writeFileSync(path.join(outDir, `ledger-${last.date}.json`),
  JSON.stringify(entries[entries.length - 1], null, 2) + "\n");
console.log(JSON.stringify({ dates: dates.length, entries: entries.length, ...summary }, null, 2));
