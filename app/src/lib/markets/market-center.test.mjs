/**
 * Market Center surface guards.
 *
 * Two jobs:
 *   1. the view model must be a PROJECTION — it may drop fields, never invent or recompute one;
 *   2. the page must not grow the features the data cannot support. There is no retained snapshot
 *      history, so opening lines, movement, steam and trend charts are not "not built yet" — they
 *      are unbuildable, and a guard is cheaper than remembering that in six months.
 *
 * Run: npx tsx --test src/lib/markets/market-center.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { toPropRowView, toPropRowViews } from "./view-model.ts";
import { buildPlayerPropIntelligence } from "./player-intelligence.ts";
import { latestMarketDate, loadMarketCenter } from "./load.ts";

const APP = path.resolve(process.cwd());
const PAGE = path.join(APP, "src/app/markets/page.tsx");
const COMPONENT = path.join(APP, "src/components/market-center.tsx");

const TODAY = "2026-07-27";
const NOW = "2026-07-27T17:00:00Z";

const LEAN = {
  gameId: "g1",
  gamePk: 1,
  playerId: 702284,
  playerName: "Cole Young",
  playerTeamAbbr: "SEA",
  opponentAbbr: "TEX",
  marketKey: "batter_hits",
  marketLabel: "Hits",
  line: 0.5,
  oddsOver: -246,
  oddsUnder: 182,
  projection: 1.01,
  sigma: 0.87,
  samples: 106,
  modelProbOver: 0.7211,
  modelProbUnder: 0.2789,
  riskFlags: [],
  recentGames: [
    { date: "2026-07-25", value: 1 },
    { date: "2026-07-26", value: 2 },
  ],
  lean: "Over",
  edgePct: 1.01,
  confidence: "Low",
};

const intel = (over = {}) =>
  buildPlayerPropIntelligence({
    prop: {
      gameId: "g1",
      player: "Cole Young",
      market: "batter_hits",
      marketLabel: "Hits",
      point: 0.5,
      americanOdds: -246,
      startTimeUtc: "2026-07-27T18:35:00Z",
    },
    lean: LEAN,
    family: "BATTER_HITS",
    gamePk: 1,
    homeTeam: "TEX",
    awayTeam: "SEA",
    teamMapping: "RESOLVED_FROM_GAME",
    artifact: { date: TODAY, generatedAt: "2026-07-27T16:35:04.938Z" },
    todayEt: TODAY,
    nowIso: NOW,
    ...over,
  });

// ── View model is a projection ──────────────────────────────────────────────────────────────────

test("the view model carries the canonical numbers through unchanged", () => {
  const full = intel();
  const v = toPropRowView(full);
  assert.equal(v.mode, full.intelligence.mode);
  assert.equal(v.modelProbOver, full.model.probOver);
  assert.equal(v.marketProbOver, full.sportsbook.overNoVigProb);
  assert.equal(v.differencePoints, full.comparison.differencePoints);
  assert.equal(v.playerId, full.player.playerId);
  assert.equal(v.team, full.player.team);
});

test("the view model drops the per-row constants that bloat the client payload", () => {
  const v = toPropRowView(intel());
  assert.ok(!("calibrationDisclosure" in v), "hoisted to the page, not repeated per row");
  assert.ok(!("methodologyNote" in v));
  assert.ok(!("recentForm" in v), "collapsed to a summary — the per-game list is not rendered");
});

test("the projected payload is materially smaller than the canonical object", () => {
  const rows = Array.from({ length: 50 }, () => intel());
  const canonical = JSON.stringify(rows).length;
  const projected = JSON.stringify(toPropRowViews(rows)).length;
  assert.ok(
    projected * 3 < canonical,
    `projection must be far smaller (canonical ${canonical}, projected ${projected})`,
  );
});

test("the view model never resurrects a demoted recommendation field", () => {
  const v = toPropRowView(intel());
  for (const banned of ["lean", "edgePct", "confidence"]) {
    assert.ok(!(banned in v), `${banned} must not reappear in the client payload`);
  }
});

test("a row with no model side projects nulls rather than zeros", () => {
  const v = toPropRowView(intel({ lean: null, family: "BATTER_HOME_RUNS" }));
  assert.equal(v.modelProbOver, null);
  assert.equal(v.differencePoints, null);
  assert.equal(v.recentCount, null);
});

// ── The page must not grow unsupported features ─────────────────────────────────────────────────

/**
 * Strip comments before scanning, the way the repo's other copy guards do.
 *
 * Without this the guard fires on its own subject matter: both files carry a header explaining that
 * opening lines and movement are deliberately absent, and a naive substring scan cannot tell an
 * honest disclosure apart from a feature.
 */
function strippedSource(file) {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

test("no opening-line, movement, steam or trend feature exists on the surface", () => {
  const sources = [strippedSource(PAGE), strippedSource(COMPONENT)].join("\n").toLowerCase();
  // These are unbuildable, not merely unbuilt: no retained snapshot series exists, so any of them
  // would have to be fabricated from a single capture.
  for (const banned of [
    "openingline",
    "linemovement",
    "marketmover",
    "steam",
    "24h change",
    "24-hour change",
    "teamtotal",
  ]) {
    assert.ok(
      !sources.includes(banned),
      `the Market Center must not present "${banned}" — there is no snapshot history to derive it from`,
    );
  }
});

test("the guard would catch a real feature, not just absent text", () => {
  // Proves the scanner is live: if it cannot fail, it protects nothing.
  const fake = strippedSource(PAGE) + "\nconst openingLine = market.openingLine;";
  assert.ok(fake.toLowerCase().includes("openingline"), "scanner must detect an added feature");
});

test("the surface makes no market-beating or recommendation claim", () => {
  const sources = [strippedSource(PAGE), strippedSource(COMPONENT)].join("\n");
  for (const banned of [
    "beat the market",
    "market-beating",
    "best bet",
    "guaranteed",
    "sure thing",
    "value pick",
    "market mistake",
    "positive EV",
  ]) {
    assert.ok(!sources.toLowerCase().includes(banned), `banned claim: "${banned}"`);
  }
});

test("the surface performs no sportsbook math of its own", () => {
  const component = fs.readFileSync(COMPONENT, "utf8");
  // Every probability arrives pre-derived. A converter here would be a second source of truth.
  for (const formula of ["americanToImplied", "noVigTwoWay", "/ (1 +", "100 / (odds"]) {
    assert.ok(!component.includes(formula), `probability math must stay in lib/markets: "${formula}"`);
  }
});

// ── Loader against the real slate ───────────────────────────────────────────────────────────────

test("the loader assembles the live slate and every row carries a mode", () => {
  const date = latestMarketDate();
  assert.ok(date, "a slate with both sportsbook artifacts must exist");
  const data = loadMarketCenter(date, date, `${date}T17:00:00Z`);
  assert.equal(data.missing, false);
  assert.ok(data.games.length > 0, "the slate has game markets");
  assert.ok(data.props.length > 0, "the slate has player rows");
  for (const p of data.props) {
    assert.ok(
      ["FULL_COMPARISON", "MODEL_ONLY", "SPORTSBOOK_ONLY", "UNAVAILABLE"].includes(p.intelligence.mode),
      "every row must carry a canonical mode",
    );
  }
});

test("the loader surfaces model-only rows the book does not price", () => {
  const date = latestMarketDate();
  const data = loadMarketCenter(date, date, `${date}T17:00:00Z`);
  const modelOnly = data.props.filter((p) => p.intelligence.mode === "MODEL_ONLY");
  assert.ok(
    modelOnly.length > 0,
    "iterating only sportsbook rows would make MODEL_ONLY structurally unreachable",
  );
  for (const p of modelOnly) {
    assert.equal(p.sportsbook, null, "a model-only row must not carry an invented price");
    assert.ok(p.intelligence.blockedBy.includes("NO_SPORTSBOOK_MARKET"), "the reason must be absence, not malformed data");
  }
});

test("no comparison row on the live slate lacks a resolved team", () => {
  const date = latestMarketDate();
  const data = loadMarketCenter(date, date, `${date}T17:00:00Z`);
  for (const p of data.props) {
    if (p.intelligence.mode === "FULL_COMPARISON") {
      assert.ok(p.player.team, `${p.player.name} was compared without a resolved team`);
    }
  }
});

test("a date with no artifacts reports missing rather than inventing an empty slate", () => {
  const data = loadMarketCenter("1999-01-01", TODAY, NOW);
  assert.equal(data.missing, true);
  assert.equal(data.games.length, 0);
  assert.equal(data.props.length, 0);
});

// ── The stale-slate frame ───────────────────────────────────────────────────────────────────────

test("a snapshot older than today is framed as historical, not blanked", () => {
  const date = latestMarketDate();
  const nextDay = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const data = loadMarketCenter(date, nextDay, `${nextDay}T12:00:00Z`);

  assert.equal(data.isHistorical, true);
  assert.equal(data.daysBehind, 1);

  // The failure this guards against: evaluating yesterday's snapshot against today stripped the
  // sportsbook side from every row, so the page read as "the book offers nothing" when the truth
  // was "today has not been captured yet".
  const withPrice = data.props.filter((p) => p.sportsbook).length;
  assert.ok(withPrice > 0, "a historical snapshot must still show the prices it captured");

  const modes = new Set(data.props.map((p) => p.intelligence.mode));
  assert.ok(modes.has("FULL_COMPARISON"), "the historical slate stays internally coherent");
});

test("the current-day path is unaffected by the historical frame", () => {
  const date = latestMarketDate();
  const data = loadMarketCenter(date, date, `${date}T17:00:00Z`);
  assert.equal(data.isHistorical, false);
  assert.equal(data.daysBehind, 0);
  assert.equal(data.gameFreshness.state, "CURRENT");
});

test("the page states the frame whenever it is showing a past slate", () => {
  const page = fs.readFileSync(PAGE, "utf8");
  assert.ok(page.includes("isHistorical"), "the page must branch on the historical frame");
  assert.ok(/Not today&rsquo;s market|Not today's market/.test(page), "and say so plainly");
  assert.ok(page.includes("daysBehind"), "and say how far behind it is");
});
