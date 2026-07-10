/**
 * ingest-mlb-team-market-lines-daily.mjs — the DAILY operator entry for accumulating a real multi-date
 * MLB team-market sample. Safe to run every slate; APPEND-ONLY (never overwrites a committed historical
 * snapshot unless --force). Internal-only, money-independent, never fabricates a line.
 *
 * This is the single binding unlock for a real rolling backtest: run it each slate (pregame) and
 * `data/internal/mlb/team-market-lines/` grows one date at a time. It reuses the shared core in
 * ingest-mlb-team-market-lines.mjs; it is also wired (guarded, non-fatal) into refresh_daily_products.sh.
 *
 * Usage: npx tsx scripts/ingest-mlb-team-market-lines-daily.mjs --date 2026-07-09 [--force]
 *   (omit --date to use the latest board date)
 */
import fs from "node:fs";
import path from "node:path";
import { ingestTeamMarketLines } from "./ingest-mlb-team-market-lines.mjs";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");

function latestBoardDate() {
  if (!fs.existsSync(BOARDS)) return null;
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}

function main() {
  const di = process.argv.indexOf("--date");
  const date = di >= 0 ? process.argv[di + 1] : latestBoardDate();
  const force = process.argv.includes("--force") || process.argv.includes("--refresh");
  if (!date) { console.error("[team-market-daily] no board date found — nothing to snapshot"); process.exit(0); }

  const r = ingestTeamMarketLines({ date, write: true, force });
  if (r.status === "unavailable") {
    // Honest: no committed lines for this date → an `unavailable` snapshot, never invented lines.
    console.log(`[team-market-daily] ${date} · UNAVAILABLE (no committed team markets) — wrote honest blocked snapshot`);
  } else if (r.skippedExisting) {
    console.log(`[team-market-daily] ${date} · already snapshotted (${r.gameCount} games) — append-only, pass --force to replace`);
  } else {
    console.log(`[team-market-daily] ${date} · captured ${r.gameCount} games → data/internal/mlb/team-market-lines/${date}.json`);
  }
  // Never fatal: the daily refresh must not break if a snapshot can't be written.
}

main();
