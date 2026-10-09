/**
 * TRUTH-001 — "Aligned" means a model probability exists and sits within 5 pts of the market.
 *
 * Run: npx tsx --test src/lib/mlb-board-signal-display.test.mjs
 *
 * The v2 board rendered every `neutral` lean as "Aligned · model ≈ market". `neutral` only means
 * "neither supported nor opposed", so it also covered rows with NO model probability (edge null) and
 * Low-confidence rows with a large gap. Pinned rows are verbatim from the immutable committed board
 * `mlb/boards/2026-10-08.json` (CLE @ CWS, gamePk 849832); the corpus test holds for every board.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { classifyMlbLeanSignal, mlbBoardSignalDisplay, SUPPORTED_EDGE_MIN } from "./game-lab/mlb-report.ts";

const BOARDS = path.join(process.cwd(), "public/data/mlb/boards");
const REPORT = path.join(process.cwd(), "src/components/game/mlb-simulation-report-v2.tsx");
const display = (l) => mlbBoardSignalDisplay(classifyMlbLeanSignal(l.edgePct ?? null, l.confidence ?? null), l.edgePct, l.confidence);

function lean(name, market, line) {
  const b = JSON.parse(fs.readFileSync(path.join(BOARDS, "2026-10-08.json"), "utf8"));
  const l = b.leans.find((x) => x.gamePk === 849832 && x.playerName === name && x.marketKey === market && x.line === line);
  assert.ok(l, `${name} ${market} ${line}`);
  return l;
}

test("a row with no model probability is Unavailable, not Aligned (Jose Ramirez hits 0.5)", () => {
  const l = lean("Jose Ramirez", "batter_hits", 0.5);
  assert.equal(l.edgePct, null);
  assert.equal(classifyMlbLeanSignal(l.edgePct, l.confidence), "neutral", "the bucket is unchanged");
  assert.equal(display(l), "unavailable");
});

test("a +25-pt Low-confidence gap is Low confidence, not Aligned (Brenton Doyle H+R+RBI 0.5)", () => {
  const l = lean("Brenton Doyle", "batter_hits_runs_rbis", 0.5);
  assert.ok(l.edgePct > 20 && l.confidence === "Low", `${l.edgePct} ${l.confidence}`);
  assert.equal(display(l), "low_confidence_gap");
});

test("the documented bands", () => {
  assert.equal(mlbBoardSignalDisplay("supported", 7, "Medium"), "model_lead");
  assert.equal(mlbBoardSignalDisplay("opposed", -3, "High"), "watchlist");
  assert.equal(mlbBoardSignalDisplay("neutral", 2.5, "Medium"), "aligned");
  assert.equal(mlbBoardSignalDisplay("neutral", SUPPORTED_EDGE_MIN, "Low"), "low_confidence_gap");
  assert.equal(mlbBoardSignalDisplay("neutral", null, null), "unavailable");
  assert.equal(mlbBoardSignalDisplay("neutral", Number.NaN, null), "unavailable");
  assert.equal(mlbBoardSignalDisplay("something-new", 2, null), "unavailable", "an unknown signal never reads Aligned");
});

test("EVERY committed board: Aligned only when 0 < gap < 5 pts", () => {
  let aligned = 0;
  for (const f of fs.readdirSync(BOARDS).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const l of JSON.parse(fs.readFileSync(path.join(BOARDS, f), "utf8")).leans ?? []) {
      if (display(l) !== "aligned") continue;
      aligned++;
      assert.ok(typeof l.edgePct === "number" && l.edgePct > 0 && l.edgePct < SUPPORTED_EDGE_MIN, `${f} ${l.id} edge ${l.edgePct}`);
    }
  }
  assert.ok(aligned > 0);
});

test("the v2 board's signal cell reads mlbBoardSignalDisplay with the row's gap and confidence", () => {
  const src = fs.readFileSync(REPORT, "utf8");
  assert.match(src, /mlbBoardSignalDisplay\(signal, gap, confidence\)/);
  assert.match(src, /<SignalCell signal=\{r\.signal\} gap=\{r\.gap\} confidence=\{r\.confidence\} \/>/);
  assert.doesNotMatch(src, /SIGNAL_DISPLAY\[signal\] \?\? SIGNAL_DISPLAY\.neutral/, "no silent fallback to Aligned");
  assert.doesNotMatch(src, /model ≈ market/);
});
