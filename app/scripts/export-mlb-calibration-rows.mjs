/**
 * export-mlb-calibration-rows.mjs — build the FULL per-prop MLB calibration dataset from committed
 * artifacts. READ-ONLY w.r.t. money; deterministic; idempotent.
 *
 * The settled ledger (public/data/mlb/results/settled_leans.jsonl) carries every graded prop's
 * outcome + edge + confidence + projection + final stat. The daily board
 * (public/data/mlb/boards/<date>.json) carries the same prop's modelProbOver/Under + edgePctOver/Under.
 * Joining them by the stable prop `id` recovers, for the LEANED side, the exact
 * (modelProbability, marketProbability) pair the pipeline scored — marketProbability = modelProbability
 * − edgePct/100. Nothing is fabricated: a field is emitted only when its source is present.
 *
 * Output (date-partitioned so daily forward generation makes small diffs):
 *   public/data/mlb/results/calibration/<date>.jsonl   — one MlbCalibrationRow per line
 *   public/data/mlb/results/calibration/index.json     — dates + per-field coverage (deterministic)
 *
 * Determinism: NO wall-clock timestamps anywhere — the index's `asOf` is the latest GRADED date, so
 * re-running on the same committed inputs reproduces byte-identical files.
 *
 * Usage:
 *   npx tsx scripts/export-mlb-calibration-rows.mjs            # dry-run summary (writes nothing)
 *   npx tsx scripts/export-mlb-calibration-rows.mjs --write    # write all dated files + index
 *   npx tsx scripts/export-mlb-calibration-rows.mjs --write --date 2026-07-08   # one date
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const RESULTS = path.join(ROOT, "public", "data", "mlb", "results");
const BOARDS = path.join(ROOT, "public", "data", "mlb", "boards");
const OUT_DIR = path.join(RESULTS, "calibration");
const SETTLED = path.join(RESULTS, "settled_leans.jsonl");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const ONLY_DATE = (() => { const i = argv.indexOf("--date"); return i >= 0 ? argv[i + 1] : null; })();
const SCHEMA_VERSION = 1;

/** Map the settled-ledger outcome label to the calibration vocabulary. Void = line landed = push. */
function normOutcome(o) {
  const s = String(o || "").toLowerCase();
  if (s === "win") return "win";
  if (s === "loss") return "loss";
  if (s === "push" || s === "void") return "push";
  return "unavailable";
}

/** Round to 4 dp when finite, else null (never emit NaN/undefined). */
function num(x) {
  return typeof x === "number" && Number.isFinite(x) ? Number(x.toFixed(4)) : null;
}

function loadSettledByDate() {
  const rows = fs.readFileSync(SETTLED, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  return byDate;
}

/** id → board lean, plus a game label lookup, for one date (or empty when no board is committed). */
function loadBoardIndex(date) {
  const p = path.join(BOARDS, `${date}.json`);
  if (!fs.existsSync(p)) return { byId: new Map(), gameLabel: new Map() };
  const board = JSON.parse(fs.readFileSync(p, "utf8"));
  const byId = new Map();
  const gameLabel = new Map();
  for (const l of board.leans || []) {
    byId.set(l.id, l);
    if (l.gamePk != null && l.awayTeamAbbr && l.homeTeamAbbr) gameLabel.set(String(l.gamePk), `${l.awayTeamAbbr} @ ${l.homeTeamAbbr}`);
  }
  return { byId, gameLabel };
}

/** Build one MlbCalibrationRow from a settled row + its (optional) board lean. Honest nulls. */
function buildRow(s, board) {
  const b = board.byId.get(s.id) || null;
  const over = s.lean === "Over";
  const modelProb = b ? (over ? b.modelProbOver : b.modelProbUnder) : undefined;
  const edge = typeof s.edgePct === "number" ? s.edgePct : (b ? (over ? b.edgePctOver : b.edgePctUnder) : undefined);
  // Recover the de-vigged market probability the pipeline used: model − edge/100 (edge in pp).
  const marketProb = (typeof modelProb === "number" && typeof edge === "number") ? modelProb - edge / 100 : undefined;
  const side = over ? "over" : s.lean === "Under" ? "under" : undefined;
  return {
    sport: "MLB",
    date: s.date,
    gameId: s.gamePk != null ? String(s.gamePk) : null,
    eventName: s.gamePk != null ? (board.gameLabel.get(String(s.gamePk)) ?? null) : null,
    market: s.marketKey ?? null,
    playerName: s.playerName ?? null,
    team: s.playerTeamAbbr ?? null,
    opponent: s.opponentAbbr ?? null,
    selection: [s.marketLabel, s.lean, s.line].filter((x) => x != null && x !== "").join(" ") || null,
    side: side ?? null,
    line: num(s.line),
    marketProbability: num(marketProb),
    modelProbability: num(modelProb),
    projection: num(s.projection),
    edgePct: num(s.edgePct),
    confidence: s.confidence ?? null,
    outcome: normOutcome(s.outcome),
    settledStat: typeof s.actual === "number" ? s.actual : (s.actual ?? null),
    settledAt: null, // the settled ledger carries no per-prop timestamp — omit honestly (never invented)
    sourceArtifact: `settled_leans.jsonl${b ? ` + boards/${s.date}.json` : ""}`,
    id: s.id ?? null,
  };
}

function main() {
  if (!fs.existsSync(SETTLED)) { console.error(`[export-cal] no settled ledger at ${SETTLED}`); process.exit(1); }
  const byDate = loadSettledByDate();
  const dates = [...byDate.keys()].sort().filter((d) => !ONLY_DATE || d === ONLY_DATE);
  if (dates.length === 0) { console.error("[export-cal] no dates to export"); process.exit(1); }

  const perDate = [];
  const cov = { edgePct: 0, modelProbability: 0, marketProbability: 0, confidence: 0, total: 0 };

  for (const date of dates) {
    const board = loadBoardIndex(date);
    const rows = byDate.get(date).map((s) => buildRow(s, board));
    let decisive = 0, pushes = 0, prob = 0;
    for (const r of rows) {
      cov.total++;
      if (r.edgePct != null) cov.edgePct++;
      if (r.modelProbability != null) cov.modelProbability++;
      if (r.marketProbability != null) { cov.marketProbability++; prob++; }
      if (r.confidence != null) cov.confidence++;
      if (r.outcome === "win" || r.outcome === "loss") decisive++;
      else if (r.outcome === "push") pushes++;
    }
    perDate.push({ date, rows: rows.length, decisive, pushes, probCoverage: Number((prob / rows.length).toFixed(3)), hasBoard: board.byId.size > 0 });
    if (WRITE) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(path.join(OUT_DIR, `${date}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
  }

  const latestGradedDate = dates[dates.length - 1];
  const pct = (n) => cov.total ? Number((n / cov.total).toFixed(3)) : 0;
  const index = {
    sport: "MLB",
    schemaVersion: SCHEMA_VERSION,
    asOf: latestGradedDate, // deterministic marker — NOT wall-clock
    latestGradedDate,
    totals: { rows: cov.total, decisive: perDate.reduce((a, d) => a + d.decisive, 0), pushes: perDate.reduce((a, d) => a + d.pushes, 0) },
    fieldCoverage: { edgePct: pct(cov.edgePct), modelProbability: pct(cov.modelProbability), marketProbability: pct(cov.marketProbability), confidence: pct(cov.confidence) },
    dates: perDate,
    note: "Per-prop MLB calibration rows joined from settled_leans.jsonl + committed boards. Money-independent; separate from the official 19-14 product record.",
  };

  if (WRITE && !ONLY_DATE) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");
  }

  console.log(`[export-cal] ${WRITE ? "WROTE" : "DRY-RUN"} ${dates.length} date(s) · ${cov.total.toLocaleString()} rows · decisive ${index.totals.decisive.toLocaleString()} · pushes ${index.totals.pushes}`);
  console.log(`[export-cal] field coverage: edgePct ${(index.fieldCoverage.edgePct * 100).toFixed(1)}% · modelProbability ${(index.fieldCoverage.modelProbability * 100).toFixed(1)}% · marketProbability ${(index.fieldCoverage.marketProbability * 100).toFixed(1)}% · confidence ${(index.fieldCoverage.confidence * 100).toFixed(1)}%`);
  if (!WRITE) console.log(`[export-cal] (dry run — pass --write to persist to ${path.relative(ROOT, OUT_DIR)})`);
}

main();
