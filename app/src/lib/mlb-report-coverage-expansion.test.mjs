/**
 * MLB REPORT COVERAGE EXPANSION + IN-PAGE GAME SELECTOR (SimTheGame catch-up, 2026-07-21).
 *
 * Pins the honest expansion of the MLB game report:
 *   1. The V2 report receives the FULL board-lean set (detail.gameLabMlb), not just the ~8/game capped picks.
 *   2. The player board renders every simulated line grouped by team, with a signal legend (model lead / aligned /
 *      watchlist) — no "supported/opposed" betting-advice wording.
 *   3. Market agreement has a by-STAT breakdown (score + gap + n per modeled market).
 *   4. An honest coverage note names the market-context-only markets (HR/RBI/Runs/Outs/ER) as NOT simulated and
 *      NOT product-eligible — no fabricated predictions.
 *   5. The in-page game selector lists the day's OTHER MLB games (never World Cup), current game highlighted,
 *      sim-ready games flagged.
 *   6. Money md5 unchanged.
 *
 * Run: npx tsx --test src/lib/mlb-report-coverage-expansion.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { siblingGames } from "./game-detail.ts";
import { buildAllGameDetails } from "./game-detail.ts";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const report = read("src/components/game/mlb-simulation-report-v2.tsx");
const detailPage = read("src/components/game/game-detail-page.tsx");

test("1 · the V2 report is wired to the FULL board-lean set (gameLab), not only the capped picks", () => {
  assert.match(detailPage, /gameLab=\{detail\.gameLabMlb \?\? null\}/, "game-detail-page threads detail.gameLabMlb into the report");
  assert.match(report, /gameLab\?\s*:\s*MlbGameLabView/, "the report declares a gameLab prop");
  assert.match(report, /const leanRows: MlbLeanRow\[\] = gameLab\?\.rows \?\? \[\]/, "the report reads the full un-capped lean set");
});

test("2 · the player board groups every simulated line by team with an honest signal legend", () => {
  assert.match(report, /Grouped by team/, "the board notes it is grouped by team");
  assert.match(report, /teamGroups\.map/, "the board iterates team groups");
  // The signal legend uses model lead / aligned / watchlist — NOT supported/opposed.
  for (const label of ["Model lead", "Aligned", "Watchlist", "Product card", "Unavailable"]) {
    assert.ok(report.includes(label), `signal legend includes "${label}"`);
  }
  assert.ok(!/>Supported<|>Opposed</.test(report), "the board does not surface raw supported/opposed wording");
});

test("3 · market agreement has a by-STAT breakdown (gap + n per modeled market)", () => {
  assert.match(report, /Agreement by stat/, "a by-stat agreement panel exists");
  assert.match(report, /leanStatGap/, "by-stat agreement is computed from the full lean set");
  assert.match(report, /n\{r\.count\}/, "each stat row shows its n (line count)");
});

test("4 · an honest coverage note names market-context-only markets as NOT simulated / NOT product-eligible", () => {
  assert.match(report, /Model-predicted markets:/, "the coverage note lists model-predicted markets");
  assert.match(report, /market context only/, "market-context framing is present");
  assert.match(report, /not simulated, not product-eligible/, "unmodeled markets are explicitly not product-eligible");
  // The unmodeled provider markets are named honestly.
  for (const m of ["Home runs", "RBIs", "Runs", "Pitcher outs", "Earned runs"]) {
    assert.ok(report.includes(m), `coverage note names ${m}`);
  }
});

test("5 · NO fabricated full-game output — the 'no projected score / win probability' negations remain", () => {
  assert.match(report, /Projected score \/ win probability/, "the 'what is not shown' negation is intact");
  // No public projected score / win probability CLAIM (only negations). The report must not assert a score.
  assert.ok(!/projected (final )?score is \d/i.test(report), "no numeric projected score is claimed");
});

test("6 · in-page game selector lists the day's OTHER MLB games, current highlighted, no World Cup", () => {
  assert.match(detailPage, /siblingGames\(detail\.sport, detail\.date/, "the page computes sibling games");
  // P184: the label is now DERIVED from the page's sport. It was hard-coded "MLB", which meant an
  // NFL game page announced "Today's MLB" above a strip of NFL games. The intent — the strip states
  // which sport's slate it lists — is better served by deriving it than by pinning one sport.
  assert.match(detailPage, /Today&apos;s \{detail\.sportLabel\}/, "the selector is labelled with the page's own sport");
  assert.match(detailPage, /aria-current="page"/, "the current game is marked aria-current");
  assert.match(detailPage, /href=\{`\/games\/\$\{s\.urlSport\}\/\$\{s\.slug\}`\}/, "each sibling links to its game page");
});

test("FUNCTIONAL · siblingGames returns same-date MLB siblings (no WC), excludes current, flags sim-ready", () => {
  const mlb = buildAllGameDetails().filter((d) => d.sport === "mlb" && d.gameLabSimulation);
  if (mlb.length < 2) { console.log("  (skip — fewer than 2 sim-ready MLB games on the current slate)"); return; }
  const cur = mlb[0];
  const sibs = siblingGames("mlb", cur.date, cur.slug);
  assert.ok(sibs.length >= 1, "there is at least one sibling");
  assert.ok(!sibs.some((s) => s.slug === cur.slug), "the current game is excluded");
  assert.ok(sibs.every((s) => s.urlSport === "mlb"), "every sibling is an MLB game (no World Cup)");
  assert.ok(sibs.every((s) => typeof s.simReady === "boolean"), "each sibling carries a simReady flag");
  // World Cup games never leak in, even if some exist in the archive build.
  const wc = siblingGames("mlb", cur.date, cur.slug).filter((s) => s.urlSport.includes("world"));
  assert.equal(wc.length, 0, "no World Cup siblings");
});

test("7 · money md5 unchanged (report is display-only)", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});
