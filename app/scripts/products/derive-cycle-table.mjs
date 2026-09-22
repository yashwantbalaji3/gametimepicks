/**
 * DERIVE CYCLE TABLE — v1.7 Phase 8.4 prototype (READ-ONLY over the receipts; internal output only).
 *
 * Question it answers: can a receipt-derived cycle table (cycle id, start, end/open, furthest rung,
 * result, steps/cards, no-play states, source receipts) be built from `mr-dub/settled/<date>.json`
 * plus `ladder-position.mjs` semantics alone? It reuses `laneSteps` (the same "placed" rule the
 * live position derivation uses) and applies the ladder rule exactly as `positionFromReceipts`
 * does: won → carry the REAL payout, skipping any rung the payout already clears; lost → the cycle
 * ends; void/push → same rung again; pending → the cycle is open.
 *
 * What it does NOT do: read `daily-portfolio.json`, git history, or any result to decide anything
 * about selection; render anything publicly; touch the live stores. June/July lane-days have no
 * receipt and are reported as an UNRECEIPTED era from the (internal) forensic reconstruction only
 * as a COUNT, never as cycles — the two completed June ladders exist only as ledger events in
 * `mr-dub/banked-ladders.json` and are listed under a separate LEDGER_ONLY era.
 *
 * Usage (from app/):  npx tsx scripts/products/derive-cycle-table.mjs [--write] [--root <public/data>]
 * Output:             data/internal/products/cycle-table/latest.json (with --write), else stdout summary.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { laneSteps, readReceipts } from "../../src/lib/products/ladder-position.mjs";
import { BANK_BUILDER_LADDER } from "../../src/lib/bank-builder-ladder.ts";
import { MOONSHOT_LADDER, MOONSHOT_SEED } from "../../src/lib/moonshot/moonshot-ladder.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const ROOT = path.resolve(opt("--root", path.join(REPO, "app", "public", "data")));
const OUT = path.join(REPO, "data", "internal", "products", "cycle-table", "latest.json");
const FORENSIC = path.join(REPO, "data", "internal", "products", "forensic-v17", "lane-days.json");
const BANKED = path.join(ROOT, "mr-dub", "banked-ladders.json");

const PRODUCTS = [
  { product: "bank-builder", ladder: BANK_BUILDER_LADDER, seed: BANK_BUILDER_LADDER[0].start },
  { product: "moonshot", ladder: MOONSHOT_LADDER, seed: MOONSHOT_SEED },
];
const LANES = ["A", "B"];
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Segment one lane's placed steps into cycles under the ladder rule. Pure over the rows
 * `laneSteps` returns ({date, step, stake, result, payout}).
 */
export function segmentCycles(rows, { product, lane, ladder, seed }) {
  const finalStep = ladder[ladder.length - 1].step;
  const goalOf = (s) => ladder.find((r) => r.step === s)?.goal ?? null;
  const cycles = [];
  let cur = null;
  let ruleStep = ladder[0].step;   // the rung the rule says the lane plays next
  let ruleStake = seed;
  const open = (row) => ({
    cycleId: `${product}:${lane}:${cycles.length + 1}`,
    product, lane, cycle: cycles.length + 1,
    startDate: row.date, endDate: null, result: "open",
    furthestStep: 0, furthestPublishedStep: 0, steps: [], cards: 0,
    publishedStepDivergences: 0, sourceReceipts: [],
  });
  for (const row of rows) {
    if (!cur) cur = open(row);
    const diverged = Number(row.step) !== ruleStep;
    if (diverged) cur.publishedStepDivergences += 1;
    const step = {
      date: row.date, publishedStep: Number(row.step), ruleStep, stake: row.stake, result: row.result,
      payout: Number.isFinite(row.payout) ? row.payout : null, publishedStepDiverged: diverged,
    };
    cur.steps.push(step);
    cur.cards += 1;
    cur.sourceReceipts.push(`mr-dub/settled/${row.date}.json`);
    cur.furthestStep = Math.max(cur.furthestStep, ruleStep);
    cur.furthestPublishedStep = Math.max(cur.furthestPublishedStep, Number(row.step) || 0);
    if (row.result === "won") {
      const payout = Number.isFinite(row.payout) && row.payout > 0 ? row.payout : (goalOf(ruleStep) ?? seed);
      let n = ruleStep + 1;
      while (goalOf(n) != null && payout >= goalOf(n)) n += 1;
      if (goalOf(n) == null || ruleStep >= finalStep) {
        cur.result = "completed"; cur.endDate = row.date; cur.furthestStep = finalStep;
        cycles.push(cur); cur = null; ruleStep = ladder[0].step; ruleStake = seed;
      } else { ruleStep = n; ruleStake = round2(payout); }
    } else if (row.result === "lost") {
      cur.result = "lost"; cur.endDate = row.date;
      cycles.push(cur); cur = null; ruleStep = ladder[0].step; ruleStake = seed;
    } else if (row.result === "pending") {
      cur.result = "open"; // stays open; the rule holds the lane
    } else {
      // void / push: same rung, same stake
    }
  }
  if (cur) cycles.push(cur);
  return { cycles, next: { ruleStep, ruleStake } };
}

/** No-play lane-days as the receipts record them: a lane row with no legs and no placed status. */
function noPlayFromReceipts(receipts, product, lane) {
  const out = [];
  for (const r of receipts) {
    for (const l of r.lanes ?? []) {
      if (l?.product !== product || String(l?.lane ?? "").toUpperCase() !== lane) continue;
      const placed = l.status != null ? ["active", "won", "lost", "void", "push"].includes(String(l.status)) : ["won", "lost", "void", "push"].includes(String(l.result));
      if (!placed && (l.legs ?? []).length === 0) out.push({ date: r.date, state: "NO_PLAY_RECEIPTED", note: l.note ?? l.reason ?? null });
    }
  }
  return out;
}

function main() {
  const receipts = readReceipts(ROOT, null);
  if (!receipts.length) { console.error(`no receipts under ${ROOT}/mr-dub/settled`); process.exit(2); }
  const receiptDates = receipts.map((r) => r.date).sort();

  const products = {};
  for (const p of PRODUCTS) {
    const lanes = {};
    for (const lane of LANES) {
      const rows = laneSteps(receipts, p.product, lane);
      const { cycles, next } = segmentCycles(rows, { ...p, lane });
      const noPlay = noPlayFromReceipts(receipts, p.product, lane);
      lanes[lane] = {
        placedLaneDays: rows.length,
        decidedLaneDays: rows.filter((r) => ["won", "lost", "void", "push"].includes(r.result)).length,
        pendingLaneDays: rows.filter((r) => r.result === "pending").length,
        noPlayLaneDays: noPlay.length,
        cycles, next, noPlay,
      };
    }
    const all = LANES.flatMap((l) => lanes[l].cycles);
    products[p.product] = {
      ladder: p.ladder.map((r) => ({ step: r.step, start: r.start, goal: r.goal })),
      seed: p.seed,
      counts: {
        cyclesStarted: all.length,
        cyclesLost: all.filter((c) => c.result === "lost").length,
        cyclesCompleted: all.filter((c) => c.result === "completed").length,
        cyclesOpen: all.filter((c) => c.result === "open").length,
        cyclesWithPublishedStepDivergence: all.filter((c) => c.publishedStepDivergences > 0).length,
        furthestStepMax: all.reduce((m, c) => Math.max(m, c.furthestStep), 0),
        meanFurthestStep: all.length ? round2(all.reduce((s, c) => s + c.furthestStep, 0) / all.length) : null,
        // As PUBLISHED (the rung the card was actually priced for). Differs from the rule-derived
        // number only inside the frozen-rung era (2026-08-18 → 09-09, audit S1/P255): a card priced
        // for Step 1 that the rule says was Step 2 did not clear a Step-2 goal, so rule-derived
        // "furthest" is a counterfactual there and must never be shown as ladder progress.
        furthestPublishedStepMax: all.reduce((m, c) => Math.max(m, c.furthestPublishedStep), 0),
        meanFurthestPublishedStep: all.length ? round2(all.reduce((s, c) => s + c.furthestPublishedStep, 0) / all.length) : null,
        placedLaneDays: LANES.reduce((s, l) => s + lanes[l].placedLaneDays, 0),
        decidedLaneDays: LANES.reduce((s, l) => s + lanes[l].decidedLaneDays, 0),
        noPlayLaneDays: LANES.reduce((s, l) => s + lanes[l].noPlayLaneDays, 0),
      },
      lanes,
    };
  }

  // Eras the receipts do not cover — counted, never reconstructed into cycles.
  const eras = [
    { era: "RECEIPTED", from: receiptDates[0], to: receiptDates[receiptDates.length - 1], receipts: receipts.length, source: "mr-dub/settled/<date>.json", cyclesDerived: true },
  ];
  try {
    const laneDays = JSON.parse(fs.readFileSync(FORENSIC, "utf8"));
    const lastReceipt = receiptDates[receiptDates.length - 1];
    // A placed lane-day AFTER the newest receipt is awaiting settlement, not unreceipted history.
    const pendingSettlement = laneDays.filter((r) => r.publishedStatus === "active" && !r.receiptExists && r.date > lastReceipt);
    const unreceipted = laneDays.filter((r) => r.publishedStatus === "active" && !r.receiptExists && r.date <= lastReceipt);
    const dates = [...new Set(unreceipted.map((r) => r.date))].sort();
    if (pendingSettlement.length) eras.push({ era: "PENDING_SETTLEMENT", from: pendingSettlement[0].date, to: pendingSettlement[pendingSettlement.length - 1].date, placedLaneDaysAwaitingReceipt: pendingSettlement.length, source: "forensic lane-days (publication side only)", cyclesDerived: false, note: "Placed after the newest receipt; pending is never a loss." });
    eras.push({
      era: "UNRECEIPTED", from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
      placedLaneDaysWithoutReceipt: unreceipted.length,
      byProduct: Object.fromEntries(PRODUCTS.map((p) => [p.product, unreceipted.filter((r) => r.product === p.product).length])),
      source: "data/internal/products/forensic-v17/lane-days.json (internal reconstruction; outcomes unknown here)",
      cyclesDerived: false,
      note: "No receipt exists for these placed lane-days; their outcomes live only as ledger events in the July protected base. Not reconstructed into cycles.",
    });
  } catch { eras.push({ era: "UNRECEIPTED", source: FORENSIC, note: "forensic lane-days artifact unreadable — era size UNVERIFIED", cyclesDerived: false }); }
  try {
    const banked = JSON.parse(fs.readFileSync(BANKED, "utf8"));
    eras.push({
      era: "LEDGER_ONLY", source: "mr-dub/banked-ladders.json",
      completedLadders: (banked.ladders ?? []).map((l) => ({ ladder: l.ladder, lane: l.lane, start: l.start, final: l.final, completedDate: l.completedDate, steps: (l.steps ?? []).length, official: l.official === true, source: l.source ?? null })),
      cyclesDerived: false,
      note: "Completed ladders banked from the June operator process; steps are ledger events, not nightly receipts, and were multi-sport.",
    });
  } catch { eras.push({ era: "LEDGER_ONLY", source: BANKED, note: "banked-ladders.json unreadable", cyclesDerived: false }); }

  const doc = {
    schemaVersion: 1,
    artifact: "products/cycle-table",
    dataClass: "internal-research",
    generatedAt: new Date().toISOString(),
    rule: "won → carry real payout, skip rungs the payout already clears; lost → cycle ends; void/push → same rung; pending → open. Identical to ladder-position.mjs positionFromReceipts.",
    sources: { receipts: "app/public/data/mr-dub/settled/<date>.json", ladders: ["app/src/lib/bank-builder-ladder.ts", "app/src/lib/moonshot/moonshot-ladder.mjs"] },
    coverage: { receipts: receipts.length, firstDate: receiptDates[0], lastDate: receiptDates[receiptDates.length - 1] },
    eras,
    products,
  };

  if (flag("--write")) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
    console.log(`wrote ${path.relative(REPO, OUT)}`);
  }
  for (const [name, p] of Object.entries(products)) console.log(name, JSON.stringify(p.counts));
  for (const e of eras) console.log("era", e.era, e.from ?? "", e.to ?? "", e.placedLaneDaysWithoutReceipt ?? e.receipts ?? (e.completedLadders?.length ?? ""));
}

main();
