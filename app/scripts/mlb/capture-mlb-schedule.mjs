#!/usr/bin/env node
/**
 * THE DAY'S TRUE MLB EVENT POPULATION — free, and independent of anything we buy.
 *
 *   node app/scripts/mlb/capture-mlb-schedule.mjs --date 2026-09-01 [--write] [--offline]
 *
 * WHY THIS EXISTS
 * ---------------
 * The offered-window matrix has to prove that every scheduled event appears exactly once. It cannot,
 * if its population comes from the artifact that might have omitted the event. `mlb/schedule/<date>`
 * is written by `ingest-mlb-slate.mjs` from the PAID Odds API — so it is a market-driven list, it
 * only exists once the paid run has happened, and an event the provider never offered is simply
 * absent from it. A denominator derived downstream of the thing you are auditing cannot detect an
 * omission, which is the whole point of conservation.
 *
 * Observed 2026-09-01 at 15:49Z: fifteen MLB games scheduled, first pitch 22:40Z, no paid capture
 * until ~21:10Z — and the matrix answered with YESTERDAY'S twelve started games, because the newest
 * committed board was all it had. Never recycle yesterday as current.
 *
 * MLB StatsAPI is free and requires no key (it is already the source `daily-owner-slo.mjs` uses to
 * decide whether work was expected). This captures the schedule ONLY: gamePk, teams, start time and
 * status. No odds, no projections, no player data — nothing that belongs to an authorized provider.
 *
 * Written to its own path so it can never be confused with, or overwrite, the paid artifact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = path.join(APP, "public", "data", "mlb", "statsapi-schedule");

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);

const DATE = arg("--date");
if (!DATE || !/^\d{4}-\d{2}-\d{2}$/.test(DATE)) { console.error("REFUSED: --date YYYY-MM-DD required"); process.exit(2); }

const OUT = path.join(OUT_DIR, `${DATE}.json`);

if (has("--offline")) {
  console.log(`[mlb-schedule] --offline: not fetching; ${fs.existsSync(OUT) ? "a committed capture exists" : "no committed capture"} for ${DATE}`);
  process.exit(0);
}

const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`;
let payload;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  payload = await res.json();
} catch (err) {
  /*
   * A network failure is NOT an empty day. Preserving the last known capture and saying so is the
   * only safe answer: writing zero games here would erase a real slate from every consumer.
   */
  console.error(`[mlb-schedule] REFUSED: StatsAPI unreachable (${err.message}) — prior capture retained, nothing written`);
  process.exit(1);
}

const games = payload?.dates?.[0]?.games ?? [];

const rows = games
  .map((g) => ({
    gamePk: g.gamePk,
    gameDate: g.gameDate,
    status: g.status?.detailedState ?? null,
    statusCode: g.status?.statusCode ?? null,
    /*
     * The doubleheader discriminators, carried because they are the difference between two real
     * games and one game counted twice. `gameNumber` is 1 or 2 within a doubleheader.
     */
    doubleHeader: g.doubleHeader ?? "N",
    gameNumber: g.gameNumber ?? 1,
    away: { id: g.teams?.away?.team?.id ?? null, name: g.teams?.away?.team?.name ?? null },
    home: { id: g.teams?.home?.team?.id ?? null, name: g.teams?.home?.team?.name ?? null },
    venue: g.venue?.name ?? null,
  }))
  .filter((r) => r.gamePk != null)
  .sort((a, b) => String(a.gameDate).localeCompare(String(b.gameDate)) || a.gamePk - b.gamePk);

const artifact = {
  schemaVersion: 1,
  artifact: "mlb-statsapi-schedule",
  dataClass: "PUBLIC_DERIVED",
  source: "MLB StatsAPI /api/v1/schedule (free, no key, schedule only)",
  date: DATE,
  capturedAt: new Date().toISOString(),
  gameCount: rows.length,
  note:
    "The day's event POPULATION, independent of any paid capture. The offered-window matrix uses this as its denominator so an event the market never offered is still counted once.",
  games: rows,
};

console.log(`[mlb-schedule] ${DATE}: ${rows.length} game(s)`);
for (const r of rows.slice(0, 4)) console.log(`  ${r.gamePk}  ${r.away.name} @ ${r.home.name}  ${r.gameDate}  ${r.status}`);
if (rows.length > 4) console.log(`  … and ${rows.length - 4} more`);

if (!has("--write")) { console.log("[mlb-schedule] dry-run — nothing written. Re-run with --write."); process.exit(0); }

fs.mkdirSync(OUT_DIR, { recursive: true });
/* Stamp-only churn is noise: an unchanged slate must not produce a commit every run. */
const prior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
if (prior && JSON.stringify(prior.games) === JSON.stringify(artifact.games)) {
  console.log("[mlb-schedule] unchanged — keeping the existing capture (no stamp-only churn)");
  process.exit(0);
}
fs.writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`[mlb-schedule] wrote ${path.relative(process.cwd(), OUT)}`);
