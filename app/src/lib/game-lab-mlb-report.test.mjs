/**
 * MLB GAME LAB REPORT (Plan 0008 Phase 2A · chunk 2). Pins that the per-game MLB model report is built
 * verbatim from the REAL board (no fabrication, no simulation claim), the supported/neutral/opposed
 * thresholds are documented + deterministic, product mapping is link-only (never a soccer flagship), and
 * the unavailable modules render as honest "not yet simulated" placeholders. Money is never touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const lib = read("src/lib/game-lab/mlb-report.ts");
const comp = read("src/components/game/mlb-game-lab-report.tsx");
const page = read("src/components/game/game-detail-page.tsx");
const detail = read("src/lib/game-detail.ts");

// A "simulation CLAIM" = a number followed by "simulations/runs", or "we simulated" — NOT the honest
// negation "not a simulated distribution" the copy uses. This regex must not flag those negations.
const SIM_CLAIM = /\b\d[\d,]*\s*(simulation|run)s\b|we (ran|simulated)\b|monte[- ]?carlo (ran|of this)/i;
const BANNED = /\bguaranteed\b|\block\b|\bsafest\b|can'?t lose/i;

test("thresholds are documented + exported (no invented magic numbers)", async () => {
  const m = await import("./game-lab/mlb-report.ts");
  assert.equal(m.SUPPORTED_EDGE_MIN, 5, "supported edge floor documented as a const");
  assert.equal(m.OPPOSED_EDGE_MAX, 0, "opposed edge ceiling documented as a const");
});

test("FUNCTIONAL: builds a real per-game MLB report from the board (no fabrication)", async () => {
  const { getMlbBoardForDate } = await import("./data-mlb.ts");
  const { buildMlbGameLabReport } = await import("./game-lab/mlb-report.ts");
  const board = getMlbBoardForDate("2026-07-07");
  const gp = board.leans?.[0]?.gamePk;
  assert.ok(gp != null, "the board has leans");
  const v = buildMlbGameLabReport(board, gp);
  assert.ok(v, "a view is built for a real gamePk");
  assert.ok(v.homeTeamAbbr && v.awayTeamAbbr, "teams present");
  assert.ok(v.leanCount >= 1 && v.rows.length === v.leanCount, "rows == leanCount");
  // Every row is a real lean with a derived signal in the 3 buckets.
  for (const r of v.rows) {
    assert.ok(["supported", "neutral", "opposed"].includes(r.signal), "row carries a valid signal");
    assert.ok(Number.isFinite(r.projection) && Number.isFinite(r.edgePct), "real projection + edge (never NaN)");
  }
  // supported/neutral/opposed partition the rows exactly once each.
  assert.equal(v.supported.length + v.neutral.length + v.opposed.length, v.rows.length, "signals partition the rows");
});

test("biggest leans are ranked by |edgePct| desc", async () => {
  const { getMlbBoardForDate } = await import("./data-mlb.ts");
  const { buildMlbGameLabReport } = await import("./game-lab/mlb-report.ts");
  const board = getMlbBoardForDate("2026-07-07");
  // pick a game with multiple leans if possible
  const counts = {};
  for (const l of board.leans ?? []) counts[l.gamePk] = (counts[l.gamePk] ?? 0) + 1;
  const gp = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const v = buildMlbGameLabReport(board, gp);
  assert.ok(v && v.biggestLeans.length >= 1, "biggest leans present");
  for (let i = 1; i < v.biggestLeans.length; i++) {
    assert.ok(Math.abs(v.biggestLeans[i - 1].edgePct) >= Math.abs(v.biggestLeans[i].edgePct), "sorted by |edge| desc");
  }
});

test("supported/neutral/opposed thresholds apply deterministically", async () => {
  const { getMlbBoardForDate, ...rest } = await import("./data-mlb.ts");
  const { buildMlbGameLabReport, SUPPORTED_EDGE_MIN, OPPOSED_EDGE_MAX } = await import("./game-lab/mlb-report.ts");
  const board = getMlbBoardForDate("2026-07-07");
  for (const l of board.leans ?? []) {
    const v = buildMlbGameLabReport(board, l.gamePk);
    if (!v) continue;
    for (const r of v.rows) {
      if (r.edgePct >= SUPPORTED_EDGE_MIN && String(r.confidence).toLowerCase() !== "low") assert.equal(r.signal, "supported", `edge ${r.edgePct} conf ${r.confidence} ⇒ supported`);
      else if (r.edgePct <= OPPOSED_EDGE_MAX) assert.equal(r.signal, "opposed", `edge ${r.edgePct} ⇒ opposed`);
      else assert.equal(r.signal, "neutral", `edge ${r.edgePct} conf ${r.confidence} ⇒ neutral`);
    }
    break; // one game is enough to prove the mapping
  }
});

test("recent form carries the REAL recentGames + sigma (projection ± sigma band, not a distribution)", async () => {
  const { getMlbBoardForDate } = await import("./data-mlb.ts");
  const { buildMlbGameLabReport } = await import("./game-lab/mlb-report.ts");
  const board = getMlbBoardForDate("2026-07-07");
  const withForm = (board.leans ?? []).find((l) => Array.isArray(l.recentGames) && l.recentGames.length > 0);
  const v = buildMlbGameLabReport(board, withForm.gamePk);
  const r = v.rows.find((x) => x.recentGames && x.recentGames.length > 0);
  assert.ok(r, "a row has recent games");
  assert.ok(Array.isArray(r.recentGames) && r.recentGames.length > 0, "recentGames present");
  assert.ok(r.sigma == null || Number.isFinite(r.sigma), "sigma is a real number or null (never NaN)");
});

test("product mapping is LINK-ONLY and never a soccer flagship (BB / Moonshot / WC Specials)", async () => {
  const { getMlbBoardForDate } = await import("./data-mlb.ts");
  const { buildMlbGameLabReport } = await import("./game-lab/mlb-report.ts");
  const board = getMlbBoardForDate("2026-07-07");
  const v = buildMlbGameLabReport(board, board.leans[0].gamePk);
  assert.ok(v.productMapping.length >= 1, "has mapping links");
  for (const p of v.productMapping) {
    assert.ok(typeof p.href === "string" && p.href.startsWith("/"), `link-only href: ${p.href}`);
    assert.ok(!/Bank Builder|Moonshot|WC Specials/i.test(p.label), `no soccer flagship in MLB mapping: ${p.label}`);
  }
});

test("unavailable modules render as honest 'not yet simulated' placeholders (never fabricated)", async () => {
  const { getMlbBoardForDate } = await import("./data-mlb.ts");
  const { buildMlbGameLabReport } = await import("./game-lab/mlb-report.ts");
  const board = getMlbBoardForDate("2026-07-07");
  const v = buildMlbGameLabReport(board, board.leans[0].gamePk);
  assert.ok(v.unavailable.length >= 1, "unavailable placeholders exist");
  for (const u of v.unavailable) assert.match(u.reason, /not yet simulated|no persisted/i, "honest reason");
});

test("NO simulation CLAIM anywhere; honest negations only; paper-only copy present; no banned copy", () => {
  // Strip comments first: the lib's honesty DOCSTRING legitimately quotes "10,000 simulations" to STATE
  // the rule — only rendered/code strings can make an actual claim, so we check the comment-stripped source.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  assert.ok(!SIM_CLAIM.test(strip(lib)), "lib code makes no 'N simulations/runs' claim");
  assert.ok(!SIM_CLAIM.test(strip(comp)), "component renders no simulation claim");
  assert.ok(/paper-only|educational/i.test(comp), "paper-only / educational copy present");
  assert.ok(!BANNED.test(comp), "no guaranteed/lock/safest/can't-lose in the component");
  // The honest negation the copy uses must still be there (proves it's not silently claiming sims).
  assert.match(comp, /not a simulated distribution/i, "explicitly states the band is NOT a simulated distribution");
});

test("the game-detail page renders the MLB Game Lab report (MLB only), wired from the board", () => {
  assert.match(detail, /gameLabMlb\?: MlbGameLabView \| null/, "PublicGameDetail carries the MLB report");
  assert.match(detail, /buildMlbGameLabReport\(board, d\.matchId\)/, "populated verbatim from the MLB board");
  assert.match(page, /import MlbGameLabReport from "@\/components\/game\/mlb-game-lab-report"/, "page imports the report");
  assert.match(page, /detail\.gameLabMlb \? <div[^>]*><MlbGameLabReport view=\{detail\.gameLabMlb\}/, "renders it only when present (MLB)");
});
