/**
 * TRUTH-001 — the Overview's run-line comparison compares the SAME question on both sides.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/market-overview.test.mjs
 *
 * `market.runLine.line` is the home side's SIGNED line as the book posted it, and `homeCover` is the
 * book's no-vig chance home covers AT THAT LINE. The Overview used to print "<HOME> −1.5 cover" with the
 * simulation's P(home by 2+) against that market number regardless of sign, so every home-receiving
 * game compared −1.5 to +1.5 (2026-10-06 LAD @ ATL: "ours 26% · market 65%"; at +1.5 the simulation says
 * 55%).
 *
 * The model side is checked against an INDEPENDENT derivation: the game's own exact run-differential
 * counts, P(home − away > −line). Pinned games are immutable committed history (no rolling window);
 * the corpus test holds for every committed game, whatever the slate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runLineOverviewRow, formatSignedLine } from "./market-overview.ts";

const SIM_DIR = path.join(process.cwd(), "public/data/mlb/full-game-simulations");
const REPORT = path.join(process.cwd(), "src/components/game/mlb-full-game-report.tsx");

function game(date, gamePk) {
  const g = JSON.parse(fs.readFileSync(path.join(SIM_DIR, `${date}.json`), "utf8")).games.find((x) => x.gamePk === gamePk);
  assert.ok(g, `${date} ${gamePk} present`);
  return g;
}

/** P(home covers at signed line L) from exact counts: home − away > −L. Edge bins (≤−13, ≥13) are far from ±4.5. */
function coverFromHistogram(g, homeLine) {
  const bins = g.runDifferential.distribution;
  const total = bins.reduce((n, b) => n + b.count, 0);
  return bins.filter((b) => b.value > -homeLine).reduce((n, b) => n + b.count, 0) / total;
}

test("home RECEIVING +1.5 (2026-10-06 LAD @ ATL, 849819): both cells are ATL +1.5", () => {
  const g = game("2026-10-06", 849819);
  assert.equal(g.market.runLine.line, 1.5);
  const row = runLineOverviewRow(g);
  assert.equal(row.state, "COMPARED");
  assert.equal(row.lineLabel, "+1.5");
  assert.equal(row.market, 0.6458);
  // 1 − awayCover(1.5) = 1 − 0.446, NOT homeCover(1.5) = 0.262 (the old, false 26% vs 65%).
  assert.ok(Math.abs(row.ours - 0.554) < 1e-9, `ours ${row.ours}`);
  assert.ok(Math.abs(row.ours - coverFromHistogram(g, 1.5)) < 0.002, "matches the exact margin counts");
});

test("home LAYING −1.5: the model cell is P(home by 2+)", () => {
  const all = fs.readdirSync(SIM_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  let g = null;
  for (const f of all) {
    g = JSON.parse(fs.readFileSync(path.join(SIM_DIR, f), "utf8")).games.find((x) => x.market?.runLine?.line === -1.5 && x.runDifferential);
    if (g) break;
  }
  assert.ok(g, "a committed home −1.5 game exists");
  const row = runLineOverviewRow(g);
  assert.equal(row.state, "COMPARED");
  assert.equal(row.lineLabel, "−1.5");
  assert.equal(row.ours, g.runLine.find((r) => r.line === 1.5).homeCover);
  assert.ok(Math.abs(row.ours - coverFromHistogram(g, -1.5)) < 0.002);
});

test("an alternate line the simulation did not publish is withheld, never interpolated", () => {
  const g = game("2026-08-27", game0827Pk());
  const row = runLineOverviewRow(g);
  assert.equal(g.market.runLine.line > 2.5, true);
  assert.equal(row.state, "LINE_NOT_SIMULATED");
  assert.equal(row.ours, null);
  assert.equal(row.lineLabel, formatSignedLine(g.market.runLine.line));
});
function game0827Pk() {
  const g = JSON.parse(fs.readFileSync(path.join(SIM_DIR, "2026-08-27.json"), "utf8")).games
    .find((x) => (x.market?.runLine?.line ?? 0) > 2.5 && !(x.runLine ?? []).some((r) => r.line === x.market.runLine.line));
  assert.ok(g, "2026-08-27 carries an alternate +3.5/+4.5 market line (kc-vs-tor / mil-vs-nym)");
  return g.gamePk;
}

test("no market: the model cell keeps the standard home −1.5 and the market cell is empty", () => {
  const g = { gamePk: 1, runLine: [{ line: 1.5, homeCover: 0.31, awayCover: 0.42 }], market: null };
  assert.deepEqual(runLineOverviewRow(g), { state: "NO_MARKET", homeLine: -1.5, lineLabel: "−1.5", ours: 0.31, market: null });
  const noRl = { ...g, market: { bookmaker: "x", capturedAt: null, moneyline: null, total: null, runLine: null } };
  assert.equal(runLineOverviewRow(noRl).state, "NO_MARKET");
  assert.equal(runLineOverviewRow(noRl).market, null);
});

test("EVERY committed market block: the model cell answers the book's signed line", () => {
  let checked = 0;
  for (const f of fs.readdirSync(SIM_DIR).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const g of JSON.parse(fs.readFileSync(path.join(SIM_DIR, f), "utf8")).games ?? []) {
      const L = g.market?.runLine?.line;
      if (typeof L !== "number" || !g.runDifferential) continue;
      const row = runLineOverviewRow(g);
      assert.equal(row.homeLine, L, `${f} ${g.gamePk}`);
      if (row.state !== "COMPARED") continue;
      checked++;
      assert.ok(Math.abs(row.ours - coverFromHistogram(g, L)) < 0.002,
        `${f} ${g.gamePk} line ${L}: ours ${row.ours} vs histogram ${coverFromHistogram(g, L)}`);
    }
  }
  assert.ok(checked > 0, "at least one comparison checked");
});

test("the Overview renders the row from runLineOverviewRow, never market.runLine against a fixed −1.5", () => {
  const src = fs.readFileSync(REPORT, "utf8");
  assert.match(src, /runLineOverviewRow\(g\)/);
  assert.doesNotMatch(src, /market\.runLine\?\.homeCover/, "the raw market cover must not be paired by hand");
  assert.doesNotMatch(src, /−1\.5 cover`, ours: pct\(rl15/, "no fixed −1.5 label on the comparison row");
});
