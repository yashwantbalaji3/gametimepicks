#!/usr/bin/env -S npx tsx
/**
 * Project today's slate through the full methodology → eligible-leg → parlay → dual Bank Builder
 * pipeline, and CONDITIONALLY launch. Safe by default:
 *   • --dry-run (default): computes + prints everything, writes NOTHING.
 *   • --launch: lets the dual Bank Builder reach "launched" — but ONLY if every gate passes.
 *   • --write-suggestions / --write-bank-builder: persist artifacts to the NON-published
 *     public/data/methodology/launch/ namespace (never the protected boards/parlays/bank-builder
 *     dirs, which are hard-refused). A new Bank Builder run uses a NEW run id; prior runs are never
 *     touched. If gates fail, the Bank Builder status is "no_qualified_launch" — never a forced pick.
 *
 * Usage:
 *   cd app && npx tsx scripts/project-and-launch-today.mjs [--date YYYY-MM-DD] [--sport all]
 *       [--dry-run | --launch] [--write-suggestions] [--write-bank-builder] [--now ISO]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPredictionsForDate, resolveSports } from "../src/lib/methodology/sources.ts";
import { buildLegPool, eligibleLegs } from "../src/lib/parlays/eligible-leg.ts";
import { generateDailyParlays } from "../src/lib/parlays/daily-parlays.ts";
import { generateAllSameGameParlays } from "../src/lib/parlays/same-game.ts";
import { selectDualBankBuilder } from "../src/lib/parlays/dual-bank-builder.ts";
import { buildTrackingRecords } from "../src/lib/parlays/tracking.ts";
import { RISK_LEVEL_ORDER } from "../src/lib/parlays/risk-levels.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const DATA = path.join(APP_ROOT, "public", "data");
const LAUNCH_DIR = path.join(DATA, "methodology", "launch");

const PROTECTED = [
  path.join(DATA, "boards"), path.join(DATA, "mlb", "boards"), path.join(DATA, "parlays"),
  path.join(DATA, "bank-builder"), path.join(DATA, "world-cup"), path.join(DATA, "results"), path.join(DATA, "settled"),
];

function parseArgs(argv) {
  const a = { sport: "all", date: null, launch: false, writeSuggestions: false, writeBankBuilder: false, now: null, marketAware: true };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--launch") a.launch = true;
    else if (t === "--dry-run") a.launch = false;
    else if (t === "--write-suggestions") a.writeSuggestions = true;
    else if (t === "--write-bank-builder") a.writeBankBuilder = true;
    else if (t === "--no-market") a.marketAware = false;
    else if (t === "--sport") a.sport = String(argv[++i] ?? "all");
    else if (t === "--date") a.date = argv[++i] ?? null;
    else if (t === "--now") a.now = argv[++i] ?? null;
  }
  return a;
}

function todayLocalISODate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function assertNotProtected(p) {
  const r = path.resolve(p);
  for (const f of PROTECTED) if (r === f || r.startsWith(f + path.sep)) {
    console.error(`\n  REFUSED: ${p} is under a protected/published path. The launch command never writes there.\n`);
    process.exit(2);
  }
}

function writeArtifact(name, payload) {
  const out = path.join(LAUNCH_DIR, name);
  assertNotProtected(out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`  Wrote ${path.relative(APP_ROOT, out)} (non-published methodology namespace)`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date ?? todayLocalISODate();
  let sports;
  try { sports = resolveSports(args.sport); } catch (e) { console.error(`\n  ${e.message}\n`); process.exit(2); }

  const extraction = extractPredictionsForDate(date, sports, DATA, { marketAware: args.marketAware });

  // "now" for the not-started gate: prefer an explicit --now, else the latest board prediction time
  // (the moment the slate was generated), else end-of-morning on the date.
  const predTimes = extraction.bySport.flatMap((r) => r.predictions.map((p) => p.snapshot.predictionTime)).filter(Boolean).sort();
  const nowIso = args.now ?? predTimes[predTimes.length - 1] ?? `${date}T12:00:00Z`;

  const pool = buildLegPool(extraction.bySport, nowIso, args.marketAware);
  const eligible = eligibleLegs(pool);

  // Eligible legs by sport.
  const eligibleBySport = {};
  for (const r of extraction.bySport) {
    eligibleBySport[r.sport] = eligible.filter((l) => l.sport === r.sport).length;
  }

  // Suggested parlays by sport and risk level (never forced).
  const suggestedBySport = {};
  const allSuggested = [];
  for (const r of extraction.bySport) {
    const legs = eligible.filter((l) => l.sport === r.sport);
    if (legs.length === 0) { suggestedBySport[r.sport] = {}; continue; }
    const { parlays } = generateDailyParlays(legs, date);
    allSuggested.push(...parlays);
    const byRisk = {};
    for (const lvl of RISK_LEVEL_ORDER) byRisk[lvl] = parlays.filter((p) => p.riskLevel === lvl).length;
    suggestedBySport[r.sport] = byRisk;
  }

  // Game-specific parlays.
  const sameGame = generateAllSameGameParlays(eligible, date);
  const gameSpecificParlayCount = sameGame.reduce((s, g) => s + g.parlays.length, 0);

  // Dual Bank Builder — conditional. Default dry_run; --launch lets it reach "launched" IF gates pass.
  const newRunId = `dual-bank-builder-${date}`;
  const bb = selectDualBankBuilder(eligible, date, { mode: args.launch ? "launch" : "dry_run", newRunId });

  // ── Report ──────────────────────────────────────────────────────────────────────────────────
  const withCandidates = extraction.bySport.filter((r) => r.totalCandidates > 0).map((r) => r.sport);
  const withoutCandidates = extraction.bySport.filter((r) => r.totalCandidates === 0).map((r) => r.sport);

  console.log("\n" + "=".repeat(76));
  console.log("  TODAY'S SLATE PROJECTION" + (args.launch ? " (LAUNCH MODE)" : " (DRY RUN — nothing published)"));
  console.log("=".repeat(76));
  console.log(`  Date                 : ${date}`);
  console.log(`  "Now" (not-started)  : ${nowIso}`);
  console.log(`  Sports processed     : ${extraction.bySport.length}`);
  console.log(`  Sports w/ candidates : ${withCandidates.join(", ") || "(none)"}`);
  console.log(`  Sports w/o candidates: ${withoutCandidates.join(", ") || "(none)"}`);
  console.log(`  Eligible legs        : ${JSON.stringify(eligibleBySport)}`);
  console.log(`  Suggested parlays    :`);
  for (const sport of Object.keys(suggestedBySport)) {
    const byRisk = suggestedBySport[sport];
    const total = Object.values(byRisk).reduce((s, n) => s + n, 0);
    if (total > 0) console.log(`     ${sport}: ${JSON.stringify(byRisk)}`);
  }
  if (allSuggested.length === 0) console.log("     (No Qualified Parlays)");
  console.log(`  Game-specific parlays: ${gameSpecificParlayCount}`);
  console.log(`  Best-four legs        : ${bb.selectedFourLegs.map((l) => l.label).join(" | ") || "(none qualified)"}`);
  console.log(`  Bank Builder status   : ${bb.status.toUpperCase()}`);
  if (bb.status === "no_qualified_launch") {
    console.log("    → No Qualified Bank Builder Launch. Reasons:");
    for (const reason of bb.noLaunchReasons) console.log(`        - ${reason}`);
  } else if (bb.laneA && bb.laneB) {
    console.log(`    Lane A: ${bb.laneA.legs.map((l) => l.label).join(" + ")}  [survival ${bb.laneA.laneSurvivalScore}]`);
    console.log(`    Lane B: ${bb.laneB.legs.map((l) => l.label).join(" + ")}  [survival ${bb.laneB.laneSurvivalScore}]`);
    if (bb.runId) console.log(`    Run id: ${bb.runId}`);
  }

  // ── Conditional writes (non-published namespace, never protected dirs) ──────────────────────
  const tracking = buildTrackingRecords(allSuggested);
  const noLeakageFailures = extraction.bySport.every((r) => r.leakageRejected === 0) || eligible.every((l) => l.leakageValidationPassed);

  if (args.writeSuggestions) {
    if (!noLeakageFailures) {
      console.log("\n  --write-suggestions skipped: eligible set must have zero leakage failures.");
    } else {
      writeArtifact(`suggested-parlays-${date}.json`, {
        meta: { kind: "suggested-parlays", date, published: false, modelVersion: "parlay-engine-v1" },
        suggestedBySport, parlays: allSuggested, sameGame, tracking,
      });
    }
  }
  if (args.writeBankBuilder) {
    if (bb.status !== "launched") {
      console.log(`\n  --write-bank-builder skipped: status is ${bb.status} (launch gates not all passed).`);
    } else {
      writeArtifact(`bank-builder-${bb.runId}.json`, { meta: { kind: "dual-bank-builder", published: false }, run: bb });
    }
  }

  console.log("\n" + "=".repeat(76));
  console.log(allSuggested.length === 0 && bb.status === "no_qualified_launch"
    ? "  RESULT: No Qualified Slate / No Qualified Bank Builder Launch (honest — not forced)."
    : "  RESULT: projection complete. Nothing published to the live site (UI wiring is a later phase).");
  console.log("=".repeat(76) + "\n");
}

main();
