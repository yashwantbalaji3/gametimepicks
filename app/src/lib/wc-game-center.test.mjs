/**
 * SOCCER / WORLD CUP GAME CENTER (2026-07-09) — market-implied dashboard.
 *
 * Pins: the Game Center is a faithful DIRECT read of the de-vigged WC projection (3-way sums to
 * 1.0, verbatim probs), unsupported soccer modules are honest-unavailable (never fabricated),
 * it makes NO 10,000-run claim (market-implied, not a Monte Carlo sim), the game-detail gates it
 * behind Generate (in postReveal, absent pre-click), the runner uses market-implied copy, money
 * md5 is unchanged, and there is no banned copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { buildWcGameCenter, getWcGameCenter } from "./wc-game-center.ts";
import { loadWorldCupProjections } from "./world-cup/projections.ts";

const app = process.cwd();
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const deriverSrc = read("src/lib/wc-game-center.ts");
const componentSrc = read("src/components/game/wc-game-center.tsx");
const runnerSrc = read("src/components/game/wc-simulation-runner.tsx");
const detailPageSrc = read("src/components/game/game-detail-page.tsx");
const detailLoaderSrc = read("src/lib/game-detail.ts");

const matchIds = () => {
  const proj = loadWorldCupProjections();
  return proj?.matches ? [...new Set(proj.matches.map((m) => String(m.matchId)))] : [];
};

test("1 · Game Center derives from the de-vigged WC projection; 3-way sums to 1.0", () => {
  const ids = matchIds();
  assert.ok(ids.length >= 1, "at least one WC fixture");
  for (const id of ids) {
    const gc = getWcGameCenter(id);
    assert.ok(gc, `game center for ${id}`);
    assert.equal(gc.method, "market_implied");
    if (gc.matchResult) {
      assert.ok(Math.abs(gc.matchResult.home + gc.matchResult.draw + gc.matchResult.away - 1) < 1e-3, "3-way de-vig sums to 1.0");
      assert.ok(["home", "draw", "away"].includes(gc.matchResult.topResult));
    }
  }
});

test("2 · Game Center is a verbatim read of the projection outcomes (no fabrication)", () => {
  const proj = loadWorldCupProjections();
  const id = matchIds()[0];
  const rows = proj.matches.filter((m) => String(m.matchId) === id);
  const ml = rows.find((r) => r.market === "moneyline_90");
  const gc = getWcGameCenter(id);
  if (ml && gc.matchResult) {
    const home = ml.outcomes.find((o) => o.side === "home").marketProbability;
    const away = ml.outcomes.find((o) => o.side === "away").marketProbability;
    assert.equal(gc.matchResult.home, home);
    assert.equal(gc.matchResult.away, away);
  }
});

test("3 · absent match yields null — nothing invented", () => {
  assert.equal(buildWcGameCenter("nope", []), null);
  assert.equal(getWcGameCenter("no-such-match"), null);
});

test("4 · unsupported soccer modules are honest-unavailable, never fabricated", () => {
  const gc = getWcGameCenter(matchIds()[0]);
  const modules = gc.unavailable.map((u) => u.module);
  for (const m of ["exact_score", "first_scorer", "player_shots", "corners", "cards", "xg"]) {
    assert.ok(modules.includes(m), `${m} declared unavailable`);
  }
  // The component never renders a fabricated shots/corners/cards value — only the module name.
  assert.doesNotMatch(componentSrc, /firstScorer|shotsOnTarget|cornersCount|cardsCount/);
});

test("5 · NO 10,000-run claim — soccer is a market-implied dashboard, not a sampled sim", () => {
  // Comments documenting the ABSENCE of a run count are allowed; the CODE/visible copy must not claim one.
  const stripComments = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  assert.doesNotMatch(stripComments(deriverSrc), /runCount|10,?000/); // no runCount field, no 10k literal
  assert.doesNotMatch(stripComments(runnerSrc), /10,?000[- ]?run|runCount/); // no run-count claim in copy
  assert.match(runnerSrc, /market-implied dashboard|Market Dashboard/i); // positively a market dashboard
});

test("6 · game-detail attaches wcGameCenter; page gates it behind Generate (postReveal)", () => {
  assert.match(detailLoaderSrc, /wcGameCenter: getWcGameCenter\(matchId\)/);
  // The WC-sim branch hands an Overview-led tabbed dashboard to the runner's postReveal (revealed after Generate).
  assert.match(detailPageSrc, /const isWcSim = detail\.sport === "world_cup" && !!detail\.wcGameCenter/);
  assert.match(detailPageSrc, /postReveal=\{<PostRevealTabs tabs=\{wcDashTabs\} \/>\}/, "WC post-reveal is a gated tabbed dashboard");
  // The WC Game Center is the gated Overview tab (still inside postReveal, absent pre-click).
  assert.match(detailPageSrc, /wcDashTabs[\s\S]*?<WcGameCenter gameCenter=\{gc\} expanded=\{detail\.wcExpanded\}/, "the WC Game Center is the gated Overview tab");
});

test("7 · money md5 unchanged; the layer is money-independent", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  assert.doesNotMatch(deriverSrc, /portfolio\.json|mr-dub|bankroll/);
});

test("8 · no banned copy in the soccer surfaces", () => {
  for (const src of [deriverSrc, componentSrc, runnerSrc]) {
    assert.doesNotMatch(stripSafeArea(src), BANNED);
  }
});

test("9 · regulation-time honesty is explicit (90-minute, ET/penalties excluded)", () => {
  assert.match(componentSrc, /90-minute|regulation/i);
  assert.match(componentSrc, /extra time|penalt/i);
  assert.match(runnerSrc, /Extra time and penalties do not count|penalt/i);
});
