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

  /**
   * SPRINT 041 — games whose BOARD identity was corrupted before the doubleheader fix landed.
   *
   * These are not surface disagreements; they are a generation defect. `_team_lookup_from_schedule`
   * indexed team-name -> one context, so both halves of a doubleheader collapsed onto one gamePk and
   * one game's markets were joined to the other's model output. Fixed upstream in
   * generate_mlb_board.py (nearest-start resolution) and covered by
   * pipeline/mlb/generate_mlb_board_identity_test.py.
   *
   * The fix cannot repair an ALREADY-GENERATED board — regenerating 2026-07-28 would need that day's
   * paid market fetch. So this one game is excluded BY ID, not by date: every other game on the slate,
   * including the other half of the same doubleheader, is still fully compared.
   *
   * event-identity.test.mjs independently pins the collision count on this exact board and fails if a
   * board dated after the fix ever collides.
   */
  const PRE_FIX_CORRUPTED_GAME_IDS = new Set([
    "979a29c09433f74c9cf81057e852ddf2", // 2026-07-28 CLE@CIN game 1 — mapped to game 2's gamePk 824489
  ]);

  let compared = 0;
  let skippedPreFix = 0;
  for (const g of center.games) {
    const r = report.get(g.gameId);
    if (!r) continue;
    if (PRE_FIX_CORRUPTED_GAME_IDS.has(g.gameId)) {
      skippedPreFix += 1;
      continue;
    }
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
  // The exclusion must stay tiny and must not quietly grow. One corrupted game is a known pre-fix
  // artifact; several would mean the upstream fix is not holding.
  assert.ok(
    skippedPreFix <= 1,
    `${skippedPreFix} games skipped as pre-fix — investigate, do not append to the exclusion list`,
  );
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
