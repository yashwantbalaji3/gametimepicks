/**
 * MLB FULL-MARKET LAYER (2026-07-09) — team-market ingest + market-implied Game Center.
 *
 * Pins: the de-vigged team-markets artifact is well-formed and internally consistent
 * (no-vig probs sum to 1), the Game Center is a faithful DIRECT read of those prices
 * (nothing fabricated), an absent game yields null, run-distributions are declared an
 * honest unavailable module (main lines can't back them), money md5 is unchanged, and
 * there is no banned copy. Functional against the real committed July-9 artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  getTeamMarketsForDate,
  buildMlbGameCenter,
  getMlbGameCenter,
} from "./mlb-team-markets.ts";

const app = process.cwd();
const DATE = "2026-07-09";
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const deriverSrc = read("src/lib/mlb-team-markets.ts");
const ingestSrc = read("scripts/ingest-mlb-team-markets.mjs");

test("1 · team-markets artifact is present, market-implied, and de-vigged from a book", () => {
  const art = getTeamMarketsForDate(DATE);
  assert.ok(art, "artifact exists");
  assert.equal(art.sport, "mlb");
  assert.equal(art.method, "market_implied_devig");
  assert.ok(art.gameCount >= 1);
  assert.ok(typeof art.bookmaker === "string" && art.bookmaker.length > 0);
});

test("2 · de-vig is internally consistent — every 2-way no-vig pair sums to 1.0", () => {
  const art = getTeamMarketsForDate(DATE);
  for (const g of Object.values(art.games)) {
    if (g.moneyline) {
      assert.ok(
        Math.abs(g.moneyline.home.noVigProb + g.moneyline.away.noVigProb - 1) < 1e-3,
        `moneyline no-vig sums to 1 (${g.gameId})`,
      );
    }
    if (g.total) {
      assert.ok(
        Math.abs(g.total.over.noVigProb + g.total.under.noVigProb - 1) < 1e-3,
        `total no-vig sums to 1 (${g.gameId})`,
      );
    }
    if (g.runLine) {
      assert.ok(
        Math.abs(g.runLine.home.coverNoVigProb + g.runLine.away.coverNoVigProb - 1) < 1e-3,
        `run-line no-vig sums to 1 (${g.gameId})`,
      );
    }
  }
});

test("3 · Game Center is a faithful DIRECT read of the de-vigged prices (no fabrication)", () => {
  const art = getTeamMarketsForDate(DATE);
  const [id, g] = Object.entries(art.games)[0];
  const gc = buildMlbGameCenter(g);
  assert.equal(gc.method, "market_implied");
  // moneyline win probs are exactly the artifact no-vig probs
  assert.equal(gc.moneyline.homeWinProb, g.moneyline.home.noVigProb);
  assert.equal(gc.moneyline.awayWinProb, g.moneyline.away.noVigProb);
  // total line + probs match verbatim
  assert.equal(gc.total.line, g.total.line);
  assert.equal(gc.total.overProb, g.total.over.noVigProb);
  // run-line favorite is the higher-cover side, verbatim prob
  assert.ok(["home", "away"].includes(gc.runLine.favorite));
  const expectCover = Math.max(g.runLine.home.coverNoVigProb, g.runLine.away.coverNoVigProb);
  assert.equal(gc.runLine.favoriteCoverProb, expectCover);
  // getMlbGameCenter(date,id) agrees with the pure build
  assert.deepEqual(getMlbGameCenter(DATE, id), gc);
});

test("4 · absent game yields null — nothing invented", () => {
  assert.equal(buildMlbGameCenter(null), null);
  assert.equal(getMlbGameCenter(DATE, "no-such-game-id"), null);
});

test("5 · run distributions are an HONEST unavailable module (main lines can't back them)", () => {
  const art = getTeamMarketsForDate(DATE);
  const gc = buildMlbGameCenter(Object.values(art.games)[0]);
  const dist = gc.unavailable.find((u) => u.module === "run_distributions");
  assert.ok(dist, "run_distributions declared unavailable");
  assert.equal(dist.reason, "requires_alternate_ladders");
  // The Game Center never carries a fabricated distribution field.
  assert.ok(!("distributions" in gc));
});

test("6 · money md5 unchanged; the layer is money-independent", () => {
  const md5 = crypto
    .createHash("md5")
    .update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json")))
    .digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
  // neither the deriver nor the ingest reads money/portfolio artifacts
  assert.doesNotMatch(deriverSrc, /portfolio\.json|mr-dub|bankroll|banked-ladder/);
  assert.doesNotMatch(ingestSrc, /portfolio\.json|mr-dub|bankroll/);
});

test("7 · ingest is credit-guarded and does not fabricate absent markets", () => {
  assert.match(ingestSrc, /CREDIT_FLOOR|x-requests-remaining/);
  assert.match(ingestSrc, /below floor/i);
  // markets are only written when present on the book (guarded by `if (mk.h2h)` etc.)
  assert.match(ingestSrc, /if \(mk\.h2h\)/);
  assert.match(ingestSrc, /if \(mk\.totals\)/);
});

test("8 · no banned copy in the deriver or ingest", () => {
  assert.doesNotMatch(stripSafeArea(deriverSrc), BANNED);
  assert.doesNotMatch(stripSafeArea(ingestSrc), BANNED);
});
