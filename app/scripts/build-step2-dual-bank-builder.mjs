#!/usr/bin/env -S npx tsx
/**
 * Build STEP 2 of the active Dual Bank Builder (NOT a new run, NOT a public "Run #").
 *
 * Both lanes cleared Step 1 (June 17, settled WON). This grafts a fresh, odds-backed, leakage-safe
 * Step 2 selection (today's slate) onto the SAME lanes, producing a multi-step ladder artifact:
 *   lane.steps = [ Step1 (settled, preserved verbatim), Step2 (pending, today's legs), Step3–5 (coming soon) ]
 *
 * Survival-first by construction: Step 2 legs come straight from selectDualBankBuilder (the same gated
 * engine that built Step 1), preferring one World Cup leg per lane. If the engine does not produce a
 * qualified launch, NOTHING is written and each lane's Step 2 stays "evaluating" with the exact blocker.
 *
 * Writes ONLY app/public/data/methodology/launch/dual-bank-builder-active.json (non-protected engine
 * namespace). NEVER touches public/data/bank-builder/* (protected history). Step 1 settlement is
 * copied byte-for-byte from the existing artifact — never recomputed, never fabricated.
 *
 * Usage: cd app && npx tsx scripts/build-step2-dual-bank-builder.mjs --date 2026-06-18 [--now ISO] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPredictionsForDate, resolveSports } from "../src/lib/methodology/sources.ts";
import { buildLegPool, eligibleLegs } from "../src/lib/parlays/eligible-leg.ts";
import { selectDualBankBuilder } from "../src/lib/parlays/dual-bank-builder.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const DATA = path.join(APP_ROOT, "public", "data");
const ACTIVE = path.join(DATA, "methodology", "launch", "dual-bank-builder-active.json");
const LADDER_TARGET = 10000; // crown target per lane (paper)
const TOTAL_STEPS = 5;

function parseArgs(argv) {
  const a = { date: null, now: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--date") a.date = argv[++i] ?? null;
    else if (t === "--now") a.now = argv[++i] ?? null;
    else if (t === "--dry-run") a.dryRun = true;
  }
  return a;
}

function americanToDecimal(odds) {
  if (odds == null) return null;
  return odds >= 0 ? 1 + odds / 100 : 1 + 100 / -odds;
}

/** Step 1 stake→payout from the lane's combined odds (paper $100 base). */
function step1Stake() { return 100; }

function laneStep1Payout(combinedOdds) {
  const dec = americanToDecimal(combinedOdds) ?? 1;
  return Math.round(step1Stake() * dec * 100) / 100;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date;
  if (!date) { console.error("  --date YYYY-MM-DD is required"); process.exit(2); }

  // 1) Existing settled Step 1 (preserve verbatim — never recompute).
  if (!fs.existsSync(ACTIVE)) { console.error(`  active artifact missing: ${ACTIVE}`); process.exit(2); }
  const prior = JSON.parse(fs.readFileSync(ACTIVE, "utf8"));
  const priorRun = prior.run;
  if (priorRun.laneA?.result !== "won" || priorRun.laneB?.result !== "won") {
    console.error("  Step 1 is not WON on both lanes — refusing to build Step 2 (a lane must clear Step 1 first).");
    process.exit(2);
  }

  // 2) Fresh, gated Step 2 selection from today's slate (same engine as Step 1).
  const sports = resolveSports("all");
  const extraction = extractPredictionsForDate(date, sports, DATA, { marketAware: true });
  const predTimes = extraction.bySport.flatMap((r) => r.predictions.map((p) => p.snapshot.predictionTime)).filter(Boolean).sort();
  const nowIso = args.now ?? predTimes[predTimes.length - 1] ?? `${date}T12:00:00Z`;
  const pool = buildLegPool(extraction.bySport, nowIso, true);
  const eligible = eligibleLegs(pool);
  const bb = selectDualBankBuilder(eligible, date, { mode: "launch", newRunId: priorRun.runId, preferSoccerPerLane: true });

  console.log(`\n  STEP 2 selection for ${date} (now=${nowIso})`);
  console.log(`  engine status: ${bb.status}`);

  if (bb.status !== "launched" || !bb.laneA || !bb.laneB) {
    console.log("\n  Step 2 does NOT qualify — leaving both lanes' Step 2 as 'evaluating'. Blockers:");
    for (const r of bb.noLaunchReasons ?? []) console.log(`    - ${r}`);
    // Mark Step 2 evaluating (do not fabricate legs).
    if (!args.dryRun) {
      for (const lk of ["laneA", "laneB"]) attachEvaluatingStep2(priorRun[lk], date, bb.noLaunchReasons ?? []);
      prior.run.status = "launched"; prior.run.date = date; prior.meta.date = date;
      prior.meta.step2EvaluatedAt = nowIso;
      fs.writeFileSync(ACTIVE, JSON.stringify(prior, null, 2) + "\n");
      console.log("\n  Wrote evaluating-Step-2 ladder (no fabricated legs).");
    }
    return;
  }

  // 3) Map engine lanes → existing lanes by SURVIVAL identity (laneA = survival-first lane).
  const engineLane = { laneA: bb.laneA, laneB: bb.laneB };
  for (const lk of ["laneA", "laneB"]) {
    const lane = priorRun[lk];
    const eng = engineLane[lk];
    const step1Payout = laneStep1Payout(lane.combinedOdds);
    const step2Dec = americanToDecimal(eng.combinedOdds) ?? 1;
    const step2Stake = step1Payout;
    const step2Payout = Math.round(step2Stake * step2Dec * 100) / 100;

    // Step 1 — preserved verbatim (settled, WON).
    const step1 = {
      step: 1,
      status: "settled",
      result: lane.result,                  // "won"
      slateDate: priorRun.date,             // 2026-06-17
      combinedOdds: lane.combinedOdds,
      laneSurvivalScore: lane.laneSurvivalScore,
      stake: step1Stake(),
      payout: step1Payout,
      legs: lane.legs,                      // carry settlement{} verbatim
    };
    // Step 2 — today's gated legs (pending).
    const step2 = {
      step: 2,
      status: "pending",
      result: null,
      slateDate: date,                      // 2026-06-18
      combinedOdds: eng.combinedOdds,
      laneSurvivalScore: eng.laneSurvivalScore,
      estimatedHitProbability: eng.estimatedHitProbability,
      stake: step2Stake,
      projectedPayout: step2Payout,
      legs: eng.legs,                       // full engine leg metadata (side/line/odds/factors)
    };
    const comingSoon = [];
    for (let s = 3; s <= TOTAL_STEPS; s++) comingSoon.push({ step: s, status: "coming_soon", target: LADDER_TARGET });

    // Rewrite the lane: top-level fields reflect the CURRENT step (Step 2) for back-compat; steps[] is the ladder.
    lane.steps = [step1, step2, ...comingSoon];
    lane.currentStep = 2;
    lane.target = LADDER_TARGET;
    lane.legs = eng.legs;                   // current-step legs (live pool resolves identity)
    lane.combinedOdds = eng.combinedOdds;
    lane.laneSurvivalScore = eng.laneSurvivalScore;
    lane.estimatedHitProbability = eng.estimatedHitProbability;
    lane.result = null;                     // lane is mid-ladder, not decided
    lane.advanced = false;
    lane.settledLegs = 0;
  }

  // 4) Run-level: this is the SAME active ladder, now on today's slate, Step 2 live.
  prior.run.status = "launched";
  prior.run.date = date;
  prior.run.currentStep = 2;
  prior.run.selectedFourLegs = bb.selectedFourLegs;
  prior.run.rejectedCandidates = bb.rejectedCandidates;
  prior.run.launchGateSummary = bb.launchGateSummary;
  prior.run.noLaunchReasons = bb.noLaunchReasons;
  // Preserve the Step-1 settlement block under a step-scoped key; clear the run-level settled marker.
  prior.run.step1Settlement = priorRun.settlement ?? prior.run.settlement ?? null;
  delete prior.run.settlement;
  prior.meta.date = date;
  prior.meta.step2BuiltAt = nowIso;
  prior.meta.ladder = true;

  console.log(`    Lane A Step 2: ${bb.laneA.legs.map((l) => l.label).join(" + ")}  [survival ${bb.laneA.laneSurvivalScore}, combined ${bb.laneA.combinedOdds}]`);
  console.log(`    Lane B Step 2: ${bb.laneB.legs.map((l) => l.label).join(" + ")}  [survival ${bb.laneB.laneSurvivalScore}, combined ${bb.laneB.combinedOdds}]`);

  if (args.dryRun) { console.log("\n  --dry-run: nothing written."); return; }
  fs.writeFileSync(ACTIVE, JSON.stringify(prior, null, 2) + "\n");
  console.log(`\n  Wrote Step-2 ladder → ${path.relative(APP_ROOT, ACTIVE)} (engine namespace; protected history untouched).`);
}

function attachEvaluatingStep2(lane, date, reasons) {
  if (!lane) return;
  const step1Payout = laneStep1Payout(lane.combinedOdds);
  const step1 = { step: 1, status: "settled", result: lane.result, combinedOdds: lane.combinedOdds, laneSurvivalScore: lane.laneSurvivalScore, stake: step1Stake(), payout: step1Payout, legs: lane.legs };
  const step2 = { step: 2, status: "evaluating", result: null, slateDate: date, blockers: reasons, legs: [] };
  const comingSoon = [];
  for (let s = 3; s <= TOTAL_STEPS; s++) comingSoon.push({ step: s, status: "coming_soon", target: LADDER_TARGET });
  lane.steps = [step1, step2, ...comingSoon];
  lane.currentStep = 2;
  lane.target = LADDER_TARGET;
}

main();
