#!/usr/bin/env node
/**
 * DETERMINISTIC MLB GAME-SIMULATION GENERATOR — CLI (Phase 4).
 *
 * Reads an existing MLB board (`public/data/mlb/boards/<date>.json`) and writes the deterministic
 * `public/data/mlb/game-simulations/<date>.json` artifact conforming to GameSimulationArtifact.
 *
 * NO network. NO money writes. The ONLY file this script may write is the one game-simulations artifact.
 *
 * Flags:
 *   --date YYYY-MM-DD   Board/artifact date. Default: the newest board file on disk.
 *   --now <iso>         Value for the artifact's `generatedAt` (the ONE non-deterministic field).
 *                       Default: a FIXED placeholder ("1970-01-01T00:00:00.000Z") so a bare run is still
 *                       deterministic. Pass a real ISO when persisting.
 *   --dry-run           Print the plan + stats. Write NOTHING. (Default when neither --dry-run nor --write.)
 *   --write             Persist the artifact to disk.
 *
 * Runnable from the repo root OR from app/ (the data root is resolved robustly).
 *
 * Usage (from app/):
 *   npx tsx scripts/generate-mlb-game-simulations.mjs --dry-run --date 2026-07-07
 *   npx tsx scripts/generate-mlb-game-simulations.mjs --write --date 2026-07-07 --now 2026-07-08T05:00:00Z
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateGameSimulation } from "../src/lib/game-simulations/validate.ts";
import { generateMlbGameSimulations, computeArtifactHash } from "../src/lib/game-simulations/mlb-generator.ts";

const FIXED_DEFAULT_NOW = "1970-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Arg parsing (tiny, dependency-free)
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { dryRun: false, write: false, date: null, now: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--write") args.write = true;
    else if (a === "--date") args.date = argv[++i];
    else if (a === "--now") args.now = argv[++i];
    else if (a.startsWith("--date=")) args.date = a.slice("--date=".length);
    else if (a.startsWith("--now=")) args.now = a.slice("--now=".length);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Resolve the data root robustly (works from repo root or from app/).
// ---------------------------------------------------------------------------
function resolveDataRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url)); // .../app/scripts
  const candidates = [
    path.resolve(here, "..", "public", "data"), // app/public/data (script lives in app/scripts)
    path.resolve(process.cwd(), "public", "data"), // cwd = app/
    path.resolve(process.cwd(), "app", "public", "data"), // cwd = repo root
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "mlb", "boards"))) return c;
  }
  // Fall back to the app-relative path even if not found, so the error message points at the right place.
  return candidates[0];
}

function newestBoardDate(boardsDir) {
  let files;
  try {
    files = fs.readdirSync(boardsDir);
  } catch {
    return null;
  }
  const dates = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = parseArgs(process.argv.slice(2));
  // Default to dry-run when neither flag is given (safe default: never writes by accident).
  const isWrite = args.write === true;
  const isDryRun = !isWrite;

  const dataRoot = resolveDataRoot();
  const boardsDir = path.join(dataRoot, "mlb", "boards");

  const date = args.date || newestBoardDate(boardsDir);
  if (!date) {
    console.error(`[FAIL] No board date given and no board files found in ${boardsDir}`);
    process.exit(1);
  }

  const boardPath = path.join(boardsDir, `${date}.json`);
  if (!fs.existsSync(boardPath)) {
    console.error(`[FAIL] MLB board not found: ${boardPath}`);
    console.error(`       (nothing written; provide --date for an existing board)`);
    process.exit(1);
  }

  let board;
  try {
    board = JSON.parse(fs.readFileSync(boardPath, "utf8"));
  } catch (e) {
    console.error(`[FAIL] Could not parse board ${boardPath}: ${e.message}`);
    process.exit(1);
  }

  const generatedAt = args.now || FIXED_DEFAULT_NOW;

  console.log("== MLB Game-Simulation Generator (deterministic seeded simulation) ==");
  console.log(`  data root   : ${dataRoot}`);
  console.log(`  board       : ${boardPath}`);
  console.log(`  date        : ${date}`);
  console.log(`  generatedAt : ${generatedAt}${args.now ? "" : "  (fixed default — pass --now for a real timestamp)"}`);
  console.log(`  mode        : ${isWrite ? "WRITE" : "DRY-RUN (writes nothing)"}`);
  console.log("");

  const { artifact, stats } = generateMlbGameSimulations(board, generatedAt, date);

  // Validate BEFORE any write — never persist an artifact that fails the contract.
  const validation = validateGameSimulation(artifact);
  if (!validation.ok) {
    console.error(`[FAIL] Generated artifact FAILED validateGameSimulation (${validation.errors.length} errors):`);
    validation.errors.slice(0, 30).forEach((e) => console.error(`   - ${e}`));
    process.exit(1);
  }

  // Reproducibility self-check: hash is stable across a second independent build of the same board.
  const rebuilt = generateMlbGameSimulations(board, "2000-01-01T00:00:00.000Z", date).artifact;
  const hashStable = computeArtifactHash(artifact) === computeArtifactHash(rebuilt) && artifact.artifactHash === rebuilt.artifactHash;

  console.log("-- Plan / stats --");
  console.log(`  games (with leans) : ${stats.games}  (ready: ${stats.readyGames})`);
  console.log(`  total picks        : ${stats.totalPicks}`);
  console.log(`  total distributions: ${stats.totalDistributions}`);
  console.log(`  sampled leans      : ${stats.sampledLeans}  (unsampled/no-sigma: ${stats.unsampledLeans})`);
  console.log(`  runCount           : ${stats.runCount}  (real iterations drawn per sampled prop)`);
  console.log(`  sourceBoardHash    : ${stats.sourceBoardHash}`);
  console.log(`  artifactHash       : ${stats.artifactHash}`);
  console.log(`  artifactHash stable: ${hashStable ? "YES (two builds agree)" : "NO — determinism broken!"}`);
  console.log(`  validates          : YES (passes validateGameSimulation)`);
  console.log("");
  console.log("  per-game:");
  for (const g of stats.perGame) {
    console.log(
      `    ${String(g.away).padEnd(3)} @ ${String(g.home).padEnd(3)}  pk ${String(g.gamePk).padEnd(7)}  ` +
        `picks ${String(g.picks).padStart(2)}  dists ${String(g.distributions).padStart(2)}  topEdge ${String(g.topEdge).padStart(6)}  [${g.status}]`,
    );
  }
  console.log("");

  if (!hashStable) {
    console.error("[FAIL] artifactHash is NOT stable across two builds — refusing to proceed.");
    process.exit(1);
  }

  const outPath = path.join(dataRoot, "mlb", "game-simulations", `${date}.json`);

  if (isDryRun) {
    console.log(`[DRY-RUN] Would write ${outPath} — nothing written.`);
    return;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
  console.log(`[WRITE] Wrote artifact → ${outPath}`);
  console.log(`        games=${stats.games} picks=${stats.totalPicks} runCount=${stats.runCount} artifactHash=${stats.artifactHash}`);
}

main();
