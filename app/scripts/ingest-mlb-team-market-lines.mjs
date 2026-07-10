/**
 * ingest-mlb-team-market-lines.mjs — a deterministic INTERNAL snapshot of MLB team markets for a slate.
 *
 * Normalizes the de-vigged team-market Game Center (moneyline / total / run line + implied probs) into a
 * stable internal file so the full-game simulation + rolling backtest can be evaluated across many dates
 * going forward. READ-ONLY re: money; idempotent; never fabricates a line.
 *
 * Data reality: team-market lines are committed for the current slate only (public/data/mlb/team-markets).
 * A true DAILY snapshot needs a daily odds pipeline (paid Odds API or a committed refresh) — documented,
 * not faked. When a date has no committed lines the snapshot is `status: "unavailable"` (never invented).
 *
 * Output: data/internal/mlb/team-market-lines/<date>.json (public:false, NOT web-served).
 * Usage: npx tsx scripts/ingest-mlb-team-market-lines.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const TEAM_MARKETS = path.join(APP, "public", "data", "mlb", "team-markets");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "team-market-lines");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

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

function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[team-market-ingest] no date"); process.exit(1); }
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

  const out = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    kind: "team-market-lines-snapshot",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    status: lines.length > 0 ? "available" : "unavailable",
    committedSource: committed ? `public/data/mlb/team-markets/${date}.json (de-vigged)` : null,
    gameCount: lines.length,
    lines,
    note: committed
      ? "INTERNAL team-market snapshot from the committed de-vigged Game Center. NOT web-served, never touches money. A daily snapshot going forward needs a daily odds pipeline (paid Odds API / committed refresh)."
      : "No committed team-market lines for this date — a daily odds pipeline is required to snapshot other dates. Nothing fabricated.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[team-market-ingest] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} · ${out.status} · ${lines.length} games`);
  if (!WRITE) console.log("  (dry run — pass --write to persist to data/internal)");
}

main();
