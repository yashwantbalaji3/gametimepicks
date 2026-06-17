#!/usr/bin/env -S npx tsx
/**
 * Methodology dry-run — run the leakage-safe methodology framework over an EXISTING generated board
 * and emit methodology-compliant candidate `PredictionOutput`s. This is a DRY RUN:
 *   • it reads board JSON read-only (the real, Python-generated model inputs),
 *   • it NEVER publishes a slate, never writes into a board/parlay/optimizer dir,
 *   • it NEVER launches or touches Bank Builder.
 *
 * Usage:
 *   cd app && npx tsx scripts/methodology-dryrun.mjs [--date YYYY-MM-DD] [--sport MLB]
 *                                                    [--no-market] [--limit N]
 *                                                    [--out <path>] [--json]
 *
 *   --date     slate date; default = latest available board for the sport
 *   --sport    MLB (default). NBA/WORLD_CUP extractors not yet wired (honest, not fabricated).
 *   --no-market   use the no_market_model path (drop market-implied + edge)
 *   --limit N  how many example predictions to print (default 8)
 *   --out P    write the full {meta, predictions} JSON to P (refused if P is a published-slate path)
 *   --json     print the full JSON to stdout instead of writing a file
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMethodology, supportedSports } from "../src/lib/methodology/adapter.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "..");
const DATA = path.join(APP_ROOT, "public", "data");

// Published-slate locations the dry-run must NEVER write into.
const FORBIDDEN_OUT = [
  path.join(DATA, "boards"),
  path.join(DATA, "mlb", "boards"),
  path.join(DATA, "parlays"),
  path.join(DATA, "world-cup"),
  path.join(DATA, "bank-builder"),
  path.join(DATA, "bankbuilder"),
];

function parseArgs(argv) {
  const a = { sport: "MLB", marketAware: true, limit: 8, date: null, out: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--no-market") a.marketAware = false;
    else if (t === "--json") a.json = true;
    else if (t === "--sport") a.sport = String(argv[++i] ?? "MLB").toUpperCase();
    else if (t === "--date") a.date = argv[++i] ?? null;
    else if (t === "--limit") a.limit = Math.max(0, parseInt(argv[++i] ?? "8", 10) || 0);
    else if (t === "--out") a.out = argv[++i] ?? null;
  }
  return a;
}

function boardDir(sport) {
  if (sport === "MLB") return path.join(DATA, "mlb", "boards");
  if (sport === "NBA") return path.join(DATA, "boards");
  return null;
}

function latestDate(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const dates = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function refuseForbiddenOut(outPath) {
  const resolved = path.resolve(outPath);
  for (const f of FORBIDDEN_OUT) {
    if (resolved === f || resolved.startsWith(f + path.sep)) {
      console.error(`\n  REFUSED: --out "${outPath}" is under a published-slate path (${f}).`);
      console.error("  The dry-run never writes a slate. Choose a scratch path outside public/data/boards.\n");
      process.exit(2);
    }
  }
}

function pct(n, d) {
  return d > 0 ? `${Math.round((100 * n) / d)}%` : "—";
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!supportedSports().includes(args.sport)) {
    console.error(`\n  Sport "${args.sport}" has no methodology extractor wired yet.`);
    console.error(`  Supported: ${supportedSports().join(", ")}. (NBA/WORLD_CUP are the next wiring step.)\n`);
    process.exit(2);
  }

  const dir = boardDir(args.sport);
  const date = args.date ?? latestDate(dir);
  if (!date) {
    console.error(`\n  No board found for ${args.sport} in ${dir}. Nothing to dry-run.\n`);
    process.exit(2);
  }
  const boardPath = path.join(dir, `${date}.json`);
  if (!fs.existsSync(boardPath)) {
    console.error(`\n  Board not found: ${boardPath}\n  (Pass --date for an existing board; this command never generates one.)\n`);
    process.exit(2);
  }

  const board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  const result = runMethodology(board, args.sport, { marketAware: args.marketAware });

  const all = [...result.accepted, ...result.rejectedByLeakage];
  const acc = result.accepted;
  const byConf = { High: 0, Medium: 0, Low: 0, "No Bet": 0 };
  const byGrade = { A: 0, B: 0, C: 0, D: 0, unavailable: 0 };
  let riskSum = 0;
  for (const p of acc.map((x) => x.output)) {
    byConf[p.confidenceScore] = (byConf[p.confidenceScore] ?? 0) + 1;
    byGrade[p.dataQuality] = (byGrade[p.dataQuality] ?? 0) + 1;
    riskSum += p.riskScore;
  }
  const avgRisk = acc.length ? riskSum / acc.length : 0;

  // ── Human summary ──────────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(72));
  console.log("  METHODOLOGY DRY RUN — no slate published, no Bank Builder launched");
  console.log("=".repeat(72));
  console.log(`  Board            : ${path.relative(APP_ROOT, boardPath)} (read-only)`);
  console.log(`  Sport            : ${result.sport}`);
  console.log(`  Slate date       : ${result.boardDate}`);
  console.log(`  Prediction time  : ${result.predictionTime}`);
  console.log(`  Model mode       : ${result.modelMode}`);
  console.log(`  Candidates       : ${all.length}`);
  console.log(`  Leakage          : ${acc.length} pass · ${result.rejectedByLeakage.length} fail (${pct(acc.length, all.length)} accepted)`);
  console.log(`  Confidence (acc) : High ${byConf.High} · Medium ${byConf.Medium} · Low ${byConf.Low} · No Bet ${byConf["No Bet"]}`);
  console.log(`  Data quality     : A ${byGrade.A} · B ${byGrade.B} · C ${byGrade.C} · D ${byGrade.D} · unavailable ${byGrade.unavailable}`);
  console.log(`  Avg risk (acc)   : ${avgRisk.toFixed(3)}`);

  const examples = acc.slice(0, args.limit).map((x) => x.output);
  if (examples.length) {
    console.log("\n  Examples (accepted):");
    for (const p of examples) {
      const edge = p.edge == null ? "—" : `${p.edge >= 0 ? "+" : ""}${p.edge.toFixed(1)}pp`;
      console.log(`  • ${p.participant} — ${p.predictionTarget} ${p.line ?? ""} [${p.confidenceScore}, risk ${p.riskScore.toFixed(2)}, DQ ${p.dataQuality}, edge ${edge}]`);
      if (p.topPositiveFactors[0]) console.log(`      + ${p.topPositiveFactors[0].label}`);
      if (p.topNegativeFactors[0]) console.log(`      − ${p.topNegativeFactors[0].label}`);
      const planned = p.missingDataFlags.filter((f) => /planned|not_available/.test(f.reason)).map((f) => f.field);
      if (planned.length) console.log(`      (planned/not-available context: ${planned.join(", ")})`);
    }
  }

  if (result.rejectedByLeakage.length) {
    console.log(`\n  ${result.rejectedByLeakage.length} candidate(s) DROPPED by the leakage gate (e.g. event already started). Not published.`);
  }

  // ── Optional artifact (never a slate path) ───────────────────────────────────────────────────
  const payload = {
    meta: {
      kind: "methodology-dryrun",
      sport: result.sport,
      slateDate: result.boardDate,
      predictionTime: result.predictionTime,
      modelMode: result.modelMode,
      sourceBoard: path.relative(APP_ROOT, boardPath),
      published: false,
      bankBuilderLaunched: false,
    },
    predictions: acc.map((x) => x.output),
    rejectedByLeakage: result.rejectedByLeakage.map((x) => ({
      eventId: x.output.eventId,
      participant: x.output.participant,
      target: x.output.predictionTarget,
      failedChecks: x.leakage.checks.filter((c) => !c.passed).map((c) => c.name),
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

  console.log("\n" + "=".repeat(72) + "\n");
}

main();
