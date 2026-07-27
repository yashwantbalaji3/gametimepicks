/**
 * fetch-mlb-linescores.mjs — guarded, free MLB StatsAPI final-score fetcher.
 *
 * Fetches official final team scores for a date's games from the free MLB StatsAPI schedule endpoint
 * (statsapi.mlb.com — NO Odds API credits) and caches ONLY the deterministic final-score fields to an
 * internal, non-web-served path. The cache is what the product-settlement ledger grades team markets
 * from, so grading itself needs no network and stays deterministic.
 *
 * Output: data/internal/mlb/linescores/<date>.json = { date, source:"statsapi", games:[LinescoreResult] }
 * No wall-clock timestamp is written (final scores are stable), so re-fetching a final date reproduces
 * a byte-identical file. Never reads/writes any money artifact.
 *
 * Usage:
 *   npx tsx scripts/fetch-mlb-linescores.mjs --date 2026-07-08              # dry-run (prints, writes nothing)
 *   npx tsx scripts/fetch-mlb-linescores.mjs --dates 2026-07-04,2026-07-05 --write
 */
import fs from "node:fs";
import path from "node:path";
import { parseSchedulePayload } from "../src/lib/mlb/product-settlement/statsapi-linescore.ts";

const REPO = path.join(process.cwd(), process.cwd().endsWith("app") ? ".." : "");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "linescores");
const HOST = "https://statsapi.mlb.com"; // free; guarded — the ONLY host this script contacts
const WRITE = process.argv.includes("--write");

function argDates() {
  const argv = process.argv;
  const one = argv.indexOf("--date");
  if (one >= 0 && argv[one + 1]) return [argv[one + 1]];
  const many = argv.indexOf("--dates");
  if (many >= 0 && argv[many + 1]) return argv[many + 1].split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

async function fetchSchedule(date) {
  const url = `${HOST}/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const dates = argDates();
  if (dates.length === 0) { console.error("[linescores] pass --date <D> or --dates <D1,D2,...>"); process.exit(1); }
  for (const date of dates) {
    let games;
    try {
      const payload = await fetchSchedule(date);
      games = parseSchedulePayload(payload);
    } catch (e) {
      console.error(`[linescores] ${date}: fetch failed (${String(e).slice(0, 80)}) — nothing written`);
      continue;
    }
    // The cache is a record of OFFICIAL RESULTS, so only genuinely-final games are stored — a
    // postponed or in-progress game has no result to grade and must not sit in it wearing an
    // isFinal flag. gameCount stays the number of SCHEDULED games so a partial slate is visibly
    // partial (gameCount 15 / finalCount 9) instead of looking complete.
    const finalGames = games.filter((g) => g.isFinal);
    const finals = finalGames.length;
    const cache = { date, source: "statsapi", gameCount: games.length, finalCount: finals, games: finalGames };
    if (WRITE) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(cache, null, 2) + "\n");
    }
    console.log(`[linescores] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · ${games.length} games (${finals} final)`);
  }
  if (!WRITE) console.log("  (dry run — pass --write to persist the internal cache)");
}

main();
