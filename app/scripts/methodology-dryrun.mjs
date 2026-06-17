#!/usr/bin/env -S npx tsx
/**
 * Methodology dry-run — run the leakage-safe methodology framework over EXISTING generated
 * boards/projections across ANY sport and emit methodology-compliant candidate PredictionOutputs.
 * DRY RUN: reads source JSON read-only, NEVER publishes a slate, NEVER writes into a
 * board/parlay/bank-builder/results/settled dir, NEVER launches Bank Builder.
 *
 * Usage:
 *   cd app && npx tsx scripts/methodology-dryrun.mjs [--date YYYY-MM-DD] [--sport all|mlb|nba|ufc|world-cup]
 *                                                    [--no-market] [--limit N] [--out <scratch>] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractPredictionsForDate, resolveSports } from "../src/lib/methodology/sources.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const DATA = path.join(APP_ROOT, "public", "data");

// Published locations the dry-run must NEVER write into.
const FORBIDDEN_OUT = [
  path.join(DATA, "boards"),
  path.join(DATA, "mlb", "boards"),
  path.join(DATA, "parlays"),
  path.join(DATA, "world-cup"),
  path.join(DATA, "bank-builder"),
  path.join(DATA, "results"),
  path.join(DATA, "settled"),
];

function parseArgs(argv) {
  const a = { sport: "all", marketAware: true, limit: 6, date: null, out: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--no-market") a.marketAware = false;
    else if (t === "--json") a.json = true;
    else if (t === "--sport") a.sport = String(argv[++i] ?? "all");
    else if (t === "--date") a.date = argv[++i] ?? null;
    else if (t === "--limit") a.limit = Math.max(0, parseInt(argv[++i] ?? "6", 10) || 0);
    else if (t === "--out") a.out = argv[++i] ?? null;
  }
  return a;
}

function todayLocalISODate() {
  // Local current date (YYYY-MM-DD) in the app's runtime timezone.
  const d = new Date();
  const tzed = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tzed.toISOString().slice(0, 10);
}

function refuseForbiddenOut(outPath) {
  const resolved = path.resolve(outPath);
  for (const f of FORBIDDEN_OUT) {
    if (resolved === f || resolved.startsWith(f + path.sep)) {
      console.error(`\n  REFUSED: --out "${outPath}" is under a published path (${path.relative(APP_ROOT, f)}).`);
      console.error("  The dry-run never writes a slate/parlay/bank-builder file. Choose a scratch path.\n");
      process.exit(2);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date ?? todayLocalISODate();
  let sports;
  try { sports = resolveSports(args.sport); } catch (e) { console.error(`\n  ${e.message}\n`); process.exit(2); }

  const extraction = extractPredictionsForDate(date, sports, DATA, { marketAware: args.marketAware });
  const modelMode = args.marketAware ? "market_aware_model" : "no_market_model";

  const totals = { candidates: 0, leakagePassed: 0, leakageRejected: 0, noBet: 0, eligible: 0 };
  for (const r of extraction.bySport) {
    totals.candidates += r.totalCandidates;
    totals.leakagePassed += r.leakagePassed;
    totals.leakageRejected += r.leakageRejected;
    totals.noBet += r.noBetCount;
    totals.eligible += r.eligibleCandidateCount;
  }
  const withCandidates = extraction.bySport.filter((r) => r.totalCandidates > 0).map((r) => r.sport);
  const withoutCandidates = extraction.bySport.filter((r) => r.totalCandidates === 0).map((r) => r.sport);

  console.log("\n" + "=".repeat(74));
  console.log("  METHODOLOGY DRY RUN — no slate published, no Bank Builder launched");
  console.log("=".repeat(74));
  console.log(`  Date                : ${date}`);
  console.log(`  Sports requested    : ${sports.join(", ")}`);
  console.log(`  Model mode          : ${modelMode}`);
  console.log(`  Sports w/ candidates: ${withCandidates.join(", ") || "(none)"}`);
  console.log(`  Sports w/o candidates: ${withoutCandidates.join(", ") || "(none)"}`);
  console.log(`  Total candidates    : ${totals.candidates}`);
  console.log(`  Leakage             : ${totals.leakagePassed} pass · ${totals.leakageRejected} fail`);
  console.log(`  No Bet              : ${totals.noBet}`);
  console.log(`  Eligible candidates : ${totals.eligible}  (passed leakage & not No Bet)`);

  console.log("\n  By sport:");
  for (const r of extraction.bySport) {
    console.log(`  • ${r.sport.padEnd(10)} status=${r.extractorStatus.padEnd(20)} candidates=${r.totalCandidates} leakPass=${r.leakagePassed} noBet=${r.noBetCount} eligible=${r.eligibleCandidateCount}`);
    if (r.notes.length) for (const n of r.notes) console.log(`      note: ${n}`);
    const examples = r.predictions.filter((p) => p.leakage.passed && p.output.confidenceScore !== "No Bet").slice(0, args.limit);
    for (const { output: p } of examples) {
      const edge = p.edge == null ? "—" : `${p.edge >= 0 ? "+" : ""}${p.edge.toFixed(1)}pp`;
      console.log(`        ${p.participant} — ${p.predictionTarget} ${p.line ?? ""} [${p.confidenceScore}, risk ${p.riskScore.toFixed(2)}, DQ ${p.dataQuality}, edge ${edge}]`);
    }
  }

  const payload = {
    meta: {
      kind: "methodology-dryrun",
      date,
      sportsRequested: sports,
      sportsProcessed: extraction.bySport.length,
      sportsWithCandidates: withCandidates,
      sportsWithoutCandidates: withoutCandidates,
      modelMode,
      totals,
      published: false,
      bankBuilderLaunched: false,
      parlaysLaunched: false,
    },
    bySport: extraction.bySport.map((r) => ({
      sport: r.sport,
      date: r.date,
      sourcePath: r.sourcePath,
      extractorStatus: r.extractorStatus,
      totalCandidates: r.totalCandidates,
      leakagePassed: r.leakagePassed,
      leakageRejected: r.leakageRejected,
      noBetCount: r.noBetCount,
      eligibleCandidateCount: r.eligibleCandidateCount,
      missingCriticalDataCount: r.missingCriticalDataCount,
      staleCriticalDataCount: r.staleCriticalDataCount,
      notes: r.notes,
      predictionOutputs: r.predictions.map((p) => p.output),
    })),
  };

  if (args.json) {
    console.log("\n" + JSON.stringify(payload, null, 2));
  } else if (args.out) {
    refuseForbiddenOut(args.out);
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), JSON.stringify(payload, null, 2));
    console.log(`\n  Wrote dry-run artifact → ${args.out} (NOT a published slate)`);
  }

  console.log("\n" + "=".repeat(74) + "\n");
}

main();
