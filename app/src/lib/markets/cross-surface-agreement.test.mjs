/**
 * CROSS-SURFACE AGREEMENT (Sprint 030 · Phase 1).
 *
 * The end-state acceptance criterion is that the same market/event values do not disagree across
 * surfaces. That cannot be assured by inspection — two pages can drift apart silently the moment one
 * of them derives a number locally. So this asserts it against the LIVE slate: for every game the
 * Market Center and the Game Report both cover, every probability, line, price, difference and
 * intelligence mode must be identical.
 *
 * Run: npx tsx --test src/lib/markets/cross-surface-agreement.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { latestMarketDate, loadMarketCenter } from "./load.ts";
import { getGameDetail, gameDetailParams } from "../game-detail.ts";

const APP = path.resolve(process.cwd());

/** The report's games, keyed the way the Market Center keys its own. */
function reportGamesByGameId() {
  const out = new Map();
  for (const p of gameDetailParams()) {
    if (p.sport !== "mlb") continue;
    const detail = getGameDetail("mlb", p.gameId);
    const intel = detail?.marketIntelligence;
    if (intel) out.set(intel.gameId, intel);
  }
  return out;
}

test("the Game Report and Market Center agree on every shared game", () => {
  const date = latestMarketDate();
  assert.ok(date, "a slate must exist");
  const center = loadMarketCenter(date, date, `${date}T17:00:00Z`);
  const report = reportGamesByGameId();

  assert.ok(report.size > 0, "the report must expose canonical market intelligence for MLB games");

  let compared = 0;
  for (const g of center.games) {
    const r = report.get(g.gameId);
    if (!r) continue;
    compared += 1;

    assert.equal(r.homeTeam, g.homeTeam, `${g.gameId} home team`);
    assert.equal(r.awayTeam, g.awayTeam, `${g.gameId} away team`);

    for (const family of ["moneyline", "runLine", "total"]) {
      assert.equal(
        r[family].intelligence.mode,
        g[family].intelligence.mode,
        `${g.gameId} ${family} mode must match across surfaces`,
      );
      // The numbers themselves, not just the verdict — a mode can agree while a probability drifts.
      assert.deepEqual(
        r[family].sportsbook,
        g[family].sportsbook,
        `${g.gameId} ${family} sportsbook figures must match`,
      );
      assert.deepEqual(
        r[family].comparison,
        g[family].comparison,
        `${g.gameId} ${family} comparison must match`,
      );
    }
    // The run line is the one most likely to drift, because its sign handling is non-obvious.
    if (r.runLine.model && g.runLine.model) {
      assert.equal(r.runLine.homeLine, g.runLine.homeLine, `${g.gameId} signed home line`);
      assert.equal(
        r.runLine.model.derivation,
        g.runLine.model.derivation,
        `${g.gameId} run-line derivation must match — a divergence here means one surface re-derived the sign`,
      );
    }
  }

  assert.ok(compared > 0, "at least one game must be covered by both surfaces");
});

test("the report never re-derives sportsbook probabilities itself", () => {
  const component = fs.readFileSync(
    path.join(APP, "src/components/game/model-market-comparison.tsx"),
    "utf8",
  );
  for (const formula of ["americanToImplied", "noVigTwoWay", "impliedFromPrice", "deVigPair", "/ (1 +"]) {
    assert.ok(
      !component.includes(formula),
      `sportsbook math must stay in lib/markets, not in the report: "${formula}"`,
    );
  }
});

test("the report never decides intelligence mode itself", () => {
  const component = fs.readFileSync(
    path.join(APP, "src/components/game/model-market-comparison.tsx"),
    "utf8",
  );
  assert.ok(
    !component.includes("getMarketIntelligenceMode"),
    "the report must render the decided mode, never make the decision a second time",
  );
});

test("the report's market section makes no recommendation claim", () => {
  const component = fs
    .readFileSync(path.join(APP, "src/components/game/model-market-comparison.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .toLowerCase();
  for (const banned of ["beat the market", "market-beating", "best bet", "guaranteed", "sure thing", "value pick", "positive ev"]) {
    assert.ok(!component.includes(banned), `banned claim: "${banned}"`);
  }
});

test("a game with no sportsbook artifact still yields a usable report", () => {
  // The report must remain a valid simulation report when the market side is absent — the tab is
  // simply not offered, rather than rendering an empty shell.
  const params = gameDetailParams().filter((p) => p.sport === "mlb");
  assert.ok(params.length > 0);
  for (const p of params) {
    const detail = getGameDetail("mlb", p.gameId);
    if (!detail) continue;
    if (!detail.marketIntelligence) {
      assert.ok(
        detail.fullGameSim !== undefined,
        "a report without market intelligence must still carry its simulation fields",
      );
    }
  }
});

test("the shared freshness rule is used, not re-implemented per surface", () => {
  const detail = fs.readFileSync(path.join(APP, "src/lib/game-detail.ts"), "utf8");
  const load = fs.readFileSync(path.join(APP, "src/lib/markets/load.ts"), "utf8");
  for (const [name, src] of [["game-detail", detail], ["load", load]]) {
    assert.ok(
      src.includes("resolveFreshnessReference"),
      `${name} must use the shared reference rule so surfaces cannot disagree about currency`,
    );
  }
});
