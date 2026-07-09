/**
 * build-mlb-product-settlement.mjs — a SEPARATE, INTERNAL MLB product-settlement ledger.
 *
 * Grades MLB product-card legs through the pure settlement rules (src/lib/mlb/product-settlement/
 * mlb-markets.ts) into a preview ledger that is EXPLICITLY not the official money record. It never
 * reads or writes mr-dub/portfolio.json or any bankroll/daily-portfolio artifact.
 *
 * Two honest modes, auto-detected per date:
 *   • FINAL date (settled_leans has rows) → grades that date's committed player-prop actuals to real
 *     win/loss/push (a settlement PROOF on real data). Team markets: pending (final scores not
 *     committed — see the audit).
 *   • NON-FINAL slate (no settled_leans, e.g. today's board) → reads the multi-sport candidate pool's
 *     MLB legs and marks every one `pending` ("game not final"). Honest — nothing is graded early.
 *
 * Output: data/internal/mlb/product-settlement/<date>.json  (public:false, NOT web-served).
 * Deterministic (asOf = the date; no wall-clock). Usage:
 *   npx tsx scripts/build-mlb-product-settlement.mjs [--date 2026-07-08] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { settleOverUnder, isMlbMarketSettleable } from "../src/lib/mlb/product-settlement/mlb-markets.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const SETTLED = path.join(APP, "public", "data", "mlb", "results", "settled_leans.jsonl");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const POOL_DIR = path.join(REPO, "data", "internal", "multi-sport", "candidate-pool");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "product-settlement");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : null; })();

function latestBoardDate() {
  const files = fs.readdirSync(BOARDS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace(".json", "") : null;
}
const sideOf = (lean) => (lean === "Over" ? "over" : lean === "Under" ? "under" : null);

/** All committed settled rows for a date (parsed — the file is pretty-printed, so never string-match it). */
function settledRowsForDate(date) {
  if (!fs.existsSync(SETTLED)) return [];
  return fs.readFileSync(SETTLED, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.date === date);
}

/** FINAL mode: grade the date's committed settled player props through the pure rules. */
function gradeFromSettled(rows) {
  const legs = [];
  for (const r of rows) {
    if (!isMlbMarketSettleable(r.marketKey)) continue; // only product-settleable markets
    const side = sideOf(r.lean);
    // The date is FINAL (rows come from the settled ledger). A missing stat here is a VOID (player
    // did not play / stat not recorded) — never "pending" (the game IS over) and never a loss.
    const res = typeof r.actual !== "number"
      ? { status: "unavailable", actual: null, reason: "voided — final stat not recorded (DNP)" }
      : side ? settleOverUnder(r.actual, side, r.line) : { status: "unavailable", reason: "no side" };
    legs.push({
      legId: r.id, sport: "MLB", marketKey: r.marketKey, gameId: r.gamePk != null ? String(r.gamePk) : null,
      selection: [r.marketLabel, r.lean, r.line].filter((x) => x != null).join(" "), line: typeof r.line === "number" ? r.line : null,
      status: res.status, actual: typeof res.actual === "number" ? res.actual : (typeof r.actual === "number" ? r.actual : null), reason: res.reason,
    });
  }
  return { mode: "final-graded", legs };
}

/** PREVIEW mode: the candidate pool's MLB legs on a non-final slate — everything pending. */
function pendingFromPool(date) {
  const poolPath = path.join(POOL_DIR, `${date}.json`);
  const legs = [];
  if (fs.existsSync(poolPath)) {
    const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
    for (const l of (pool.legs || []).filter((x) => x.sport === "MLB" && isMlbMarketSettleable(x.market))) {
      legs.push({ legId: l.gameId ? `${l.gameId}-${l.market}` : l.market, sport: "MLB", marketKey: l.market, gameId: l.gameId ?? null, selection: l.selection, line: l.line ?? null, status: "pending", actual: null, reason: "game not final — no early settlement" });
    }
  }
  return { mode: "preview-pending", legs };
}

function main() {
  const date = DATE ?? latestBoardDate();
  if (!date) { console.error("[mlb-settle] no date"); process.exit(1); }
  const finalRows = settledRowsForDate(date);
  const { mode, legs } = finalRows.length > 0 ? gradeFromSettled(finalRows) : pendingFromPool(date);

  const counts = { pending: 0, win: 0, loss: 0, push: 0, unavailable: 0 };
  for (const l of legs) counts[l.status] = (counts[l.status] ?? 0) + 1;

  const ledger = {
    sport: "MLB", date, asOf: date, public: false, internal: true,
    recordType: "mlb-product-settlement-preview", mode,
    officialMoneyRecordAffected: false,
    cards: [], // no product cards — legs only
    legCount: legs.length, counts, legs,
    note: "SEPARATE MLB product-settlement preview. NOT the official 19-14 money record; never touches portfolio.json/bankroll. FINAL mode grades committed player-prop actuals; team markets stay pending until a statsapi linescore source is wired. No exposure, no active card.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${date}.json`), JSON.stringify(ledger, null, 2) + "\n"); }
  console.log(`[mlb-settle] ${WRITE ? "WROTE" : "DRY-RUN"} ${date} (${mode}) · ${legs.length} legs · ${JSON.stringify(counts)}`);
  if (!WRITE) console.log("  (dry run — pass --write to persist)");
}

main();
