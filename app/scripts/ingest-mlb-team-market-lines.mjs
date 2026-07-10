/**
 * ingest-mlb-team-market-lines.mjs — a deterministic INTERNAL snapshot of MLB team markets for a slate.
 *
 * Normalizes the de-vigged team-market Game Center (moneyline / total / run line + implied probs) into a
 * stable internal file so the full-game simulation + rolling backtest can be evaluated across many dates
 * going forward. READ-ONLY re: money; idempotent; never fabricates a line.
 *
 * DAILY ACCUMULATION: safe to run every slate. By default it is APPEND-ONLY — an existing snapshot for a
 * date is NOT overwritten (protects the committed historical record); pass --force / --refresh to replace
 * it. This is the core the daily wrapper (ingest-mlb-team-market-lines-daily.mjs) and the money-guarded
 * refresh_daily_products.sh both call.
 *
 * Data reality: team-market lines are committed for the current slate only (public/data/mlb/team-markets).
 * A true DAILY snapshot needs the daily odds pipeline (refresh_daily_products.sh runs it) — documented,
 * not faked. When a date has no committed lines the snapshot is `status: "unavailable"` (never invented).
 *
 * Output: data/internal/mlb/team-market-lines/<date>.json (public:false, NOT web-served).
 * Usage: npx tsx scripts/ingest-mlb-team-market-lines.mjs [--date 2026-07-09] [--write] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const TEAM_MARKETS = path.join(APP, "public", "data", "mlb", "team-markets");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "team-market-lines");

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
function gameInfo(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) if (l.gameId && !map.has(l.gameId)) map.set(l.gameId, { gamePk: l.gamePk, homeAbbr: l.homeTeamAbbr ?? "", awayAbbr: l.awayTeamAbbr ?? "" });
  return map;
}
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(4)) : null);

/** Build the internal team-market-lines snapshot for one date (pure-ish: reads committed public data only). */
export function buildTeamMarketLinesSnapshot(date) {
  const committed = fs.existsSync(path.join(TEAM_MARKETS, `${date}.json`));
  const games = gameInfo(date);
  const lines = [];
  for (const [gameId, info] of games) {
    const gc = getMlbGameCenter(date, gameId);
    if (!gc) continue;
    lines.push({
      date, gamePk: info.gamePk, gameId, awayTeam: gc.awayTeam || info.awayAbbr, homeTeam: gc.homeTeam || info.homeAbbr,
      marketSource: gc.source, method: gc.method,
      moneyline: gc.moneyline ? { homeOdds: gc.moneyline.homeOdds, awayOdds: gc.moneyline.awayOdds, homeWinProb: num(gc.moneyline.homeWinProb), awayWinProb: num(gc.moneyline.awayWinProb), favorite: gc.moneyline.favorite } : null,
      total: gc.total ? { line: gc.total.line, overProb: num(gc.total.overProb), underProb: num(gc.total.underProb), lean: gc.total.lean } : null,
      runLine: gc.runLine ? { line: gc.runLine.line, favorite: gc.runLine.favorite, favoriteCoverProb: num(gc.runLine.favoriteCoverProb) } : null,
      teamTotals: null, // not ingested for MLB yet (honest null, never faked)
    });
  }
  return {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    kind: "team-market-lines-snapshot",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    status: lines.length > 0 ? "available" : "unavailable",
    committedSource: committed ? `public/data/mlb/team-markets/${date}.json (de-vigged)` : null,
    gameCount: lines.length,
    lines,
    note: committed
      ? "INTERNAL team-market snapshot from the committed de-vigged Game Center. NOT web-served, never touches money. Captured pregame; the daily odds pipeline (refresh_daily_products.sh) produces the committed source."
      : "No committed team-market lines for this date — the daily odds pipeline is required to snapshot other dates. Nothing fabricated.",
  };
}

/**
 * Ingest one date's team-market lines to the internal snapshot. APPEND-ONLY by default: an existing
 * snapshot is preserved unless `force`. Never writes money or public data. Returns a result summary.
 */
export function ingestTeamMarketLines({ date, write = false, force = false }) {
  const out = buildTeamMarketLinesSnapshot(date);
  const target = path.join(OUT_DIR, `${date}.json`);
  const exists = fs.existsSync(target);
  let wrote = false;
  let skippedExisting = false;
  if (write) {
    if (exists && !force) {
      skippedExisting = true; // no-overwrite guard: protect the committed historical snapshot
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
      wrote = true;
    }
  }
  return { date, status: out.status, gameCount: out.gameCount, wrote, skippedExisting, exists };
}

function cli() {
  const write = process.argv.includes("--write");
  const force = process.argv.includes("--force") || process.argv.includes("--refresh");
  const di = process.argv.indexOf("--date");
  const date = di >= 0 ? process.argv[di + 1] : latestBoardDate();
  if (!date) { console.error("[team-market-ingest] no date"); process.exit(1); }
  const r = ingestTeamMarketLines({ date, write, force });
  const action = !write ? "DRY-RUN" : r.wrote ? "WROTE" : r.skippedExisting ? "SKIPPED (exists — pass --force to replace)" : "NO-OP";
  console.log(`[team-market-ingest] ${action} ${date} · ${r.status} · ${r.gameCount} games`);
  if (!write) console.log("  (dry run — pass --write to persist to data/internal; append-only unless --force)");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) cli();
