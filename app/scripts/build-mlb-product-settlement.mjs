/**
 * build-mlb-product-settlement.mjs — a SEPARATE, INTERNAL MLB product-settlement ledger.
 *
 * Grades MLB product-card legs through the pure settlement rules (src/lib/mlb/product-settlement/*)
 * into a preview ledger that is EXPLICITLY not the official money record. It never reads or writes
 * mr-dub/portfolio.json or any bankroll/daily-portfolio artifact.
 *
 *   • TEAM markets (moneyline / total / run line) grade from the committed StatsAPI linescore cache
 *     (data/internal/mlb/linescores/<date>.json). Moneyline needs only the final score; total / run
 *     line also need the committed market line (from the team-markets Game Center). A game with no
 *     final linescore stays `pending`; missing data is `unavailable` — never a loss. source:"statsapi".
 *   • PLAYER props grade from the committed settled ledger (settled_leans.jsonl) exactly as before.
 *   • A non-final slate (no linescore + no settled rows) is all-`pending`.
 *
 * Output: data/internal/mlb/product-settlement/<date>.json (public:false, NOT web-served, deterministic
 * — asOf = the date, no wall-clock). Usage:
 *   npx tsx scripts/build-mlb-product-settlement.mjs [--date 2026-07-08] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { settleOverUnder, settleMlbMoneyline, settleMlbTotal, settleMlbRunLine, isMlbMarketSettleable } from "../src/lib/mlb/product-settlement/mlb-markets.ts";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const SETTLED = path.join(APP, "public", "data", "mlb", "results", "settled_leans.jsonl");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const LINESCORES = path.join(REPO, "data", "internal", "mlb", "linescores");
const POOL_DIR = path.join(REPO, "data", "internal", "multi-sport", "candidate-pool");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "product-settlement");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

const PLAYER_MARKETS = new Set(["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"]);

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
const sideOf = (lean) => (lean === "Over" ? "over" : lean === "Under" ? "under" : null);
const numOr = (x) => (typeof x === "number" ? x : null);

/** gamePk → { gameId, homeAbbr, awayAbbr } from a date's board leans (distinct games). */
function gameInfoForDate(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  const board = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const l of board.leans || []) {
    if (l.gamePk != null && !map.has(l.gamePk)) map.set(l.gamePk, { gameId: l.gameId ?? null, homeAbbr: l.homeTeamAbbr ?? "", awayAbbr: l.awayTeamAbbr ?? "" });
  }
  return map;
}

/** gamePk → committed final linescore (or empty when the date hasn't been fetched / isn't final). */
function linescoreForDate(date) {
  const p = path.join(LINESCORES, `${date}.json`);
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const g of JSON.parse(fs.readFileSync(p, "utf8")).games || []) map.set(g.gamePk, g);
  return map;
}

/** TEAM-market legs graded from the linescore cache (+ Game Center lines for total/run line). */
function teamMarketLegs(date) {
  const games = gameInfoForDate(date);
  const ls = linescoreForDate(date);
  const legs = [];
  for (const [gamePk, info] of games) {
    const score = ls.get(gamePk) || null;
    const gameFinal = !!score && score.isFinal;
    const homeScore = score ? numOr(score.homeRuns) : null;
    const awayScore = score ? numOr(score.awayRuns) : null;
    const gc = info.gameId ? getMlbGameCenter(date, info.gameId) : null;
    const base = { sport: "MLB", gameId: info.gameId, gamePk, source: "statsapi" };

    const ml = settleMlbMoneyline({ homeScore, awayScore, selectedTeam: "home", gameFinal });
    legs.push({ ...base, legId: `${gamePk}-moneyline`, marketKey: "moneyline", selection: `${info.homeAbbr} ML`, line: null, status: ml.status, actual: ml.actual ?? null, reason: ml.reason });

    if (gc?.total) {
      const side = gc.total.lean === "balanced" ? "over" : gc.total.lean;
      const t = settleMlbTotal({ homeScore, awayScore, side, line: gc.total.line, gameFinal });
      legs.push({ ...base, legId: `${gamePk}-total`, marketKey: "total", selection: `${side === "over" ? "Over" : "Under"} ${gc.total.line}`, line: gc.total.line, status: t.status, actual: t.actual ?? null, reason: t.reason });
    }
    if (gc?.runLine) {
      const r = settleMlbRunLine({ homeScore, awayScore, selectedTeam: gc.runLine.favorite, line: gc.runLine.line, gameFinal });
      const favAbbr = gc.runLine.favorite === "home" ? info.homeAbbr : info.awayAbbr;
      legs.push({ ...base, legId: `${gamePk}-run_line`, marketKey: "run_line", selection: `${favAbbr} ${gc.runLine.line}`, line: gc.runLine.line, status: r.status, actual: r.actual ?? null, reason: r.reason });
    }
  }
  return legs;
}

/** PLAYER-prop legs: committed settled actuals (final date) graded through the rules. */
function playerPropLegsGraded(rows) {
  const legs = [];
  for (const r of rows) {
    if (!isMlbMarketSettleable(r.marketKey) || !PLAYER_MARKETS.has(r.marketKey)) continue;
    const side = sideOf(r.lean);
    const res = typeof r.actual !== "number"
      ? { status: "unavailable", actual: null, reason: "voided — final stat not recorded (DNP)" }
      : side ? settleOverUnder(r.actual, side, r.line) : { status: "unavailable", reason: "no side" };
    legs.push({ legId: r.id, sport: "MLB", marketKey: r.marketKey, gameId: r.gamePk != null ? String(r.gamePk) : null, source: "settled_leans", selection: [r.marketLabel, r.lean, r.line].filter((x) => x != null).join(" "), line: typeof r.line === "number" ? r.line : null, status: res.status, actual: typeof res.actual === "number" ? res.actual : (typeof r.actual === "number" ? r.actual : null), reason: res.reason });
  }
  return legs;
}

/** PLAYER-prop legs pending on a non-final slate, from the candidate pool. */
function playerPropLegsPending(date) {
  const poolPath = path.join(POOL_DIR, `${date}.json`);
  const legs = [];
  if (fs.existsSync(poolPath)) {
    for (const l of (JSON.parse(fs.readFileSync(poolPath, "utf8")).legs || []).filter((x) => x.sport === "MLB" && PLAYER_MARKETS.has(x.market))) {
      legs.push({ legId: l.gameId ? `${l.gameId}-${l.market}` : l.market, sport: "MLB", marketKey: l.market, gameId: l.gameId ?? null, source: "pool", selection: l.selection, line: l.line ?? null, status: "pending", actual: null, reason: "game not final — no early settlement" });
    }
  }
  return legs;
}

function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[mlb-settle] no date"); process.exit(1); }
  const finalRows = fs.existsSync(SETTLED) ? fs.readFileSync(SETTLED, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.date === date) : [];
  const teamLegs = teamMarketLegs(date);
  const playerLegs = finalRows.length > 0 ? playerPropLegsGraded(finalRows) : playerPropLegsPending(date);
  const legs = [...teamLegs, ...playerLegs];
  const teamGraded = teamLegs.filter((l) => l.status !== "pending").length;
  const mode = teamGraded > 0 || finalRows.length > 0 ? "graded" : "preview-pending";

  const counts = { pending: 0, win: 0, loss: 0, push: 0, unavailable: 0 };
  for (const l of legs) counts[l.status] = (counts[l.status] ?? 0) + 1;

  const ledger = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    recordType: "mlb-product-settlement-preview", mode,
    officialMoneyRecordAffected: false,
    cards: [], // no product cards — legs only, no activation
    legCount: legs.length,
    counts,
    bySource: { statsapi: teamLegs.length, settled_leans: playerLegs.filter((l) => l.source === "settled_leans").length, pool: playerLegs.filter((l) => l.source === "pool").length },
    legs,
    warning: "INTERNAL product-settlement ledger only; does NOT update the 19-14 official record, bankroll, or exposure. Team markets grade from official StatsAPI final scores; non-final games stay pending; missing data is unavailable, never a loss.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(ledger, null, 2) + "\n"); }
  console.log(`[mlb-settle] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} (${mode}) · ${legs.length} legs (${teamLegs.length} team / ${playerLegs.length} player) · ${JSON.stringify(counts)}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
