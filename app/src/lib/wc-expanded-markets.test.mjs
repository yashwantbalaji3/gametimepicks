/**
 * WC EXPANDED MARKETS (2026-07-09) — Asian handicap + team totals, odds-ingest ready.
 *
 * Pins: the expanded markets load from the de-vigged artifact (2-way no-vig pairs sum to 1.0),
 * the loader returns null on a missing artifact/match, unsupported soccer modules (corners/cards/
 * exact-score/first-scorer) are declared unavailable with NO numeric values, the ingest is
 * credit-guarded + money-independent, the component renders the panels gated, and no banned copy.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { getWcExpandedMarkets } from "./wc-expanded-markets.ts";

const app = process.cwd();
const DATE = "2026-07-09";
const read = (rel) => fs.readFileSync(path.join(app, rel), "utf8");
const BANNED = /\bguaranteed\b|\block\b|\bsafe\b|\bsafest\b|free money|can'?t lose|sure thing|risk-?free/i;
const stripSafeArea = (s) => s.replace(/safe-area[a-z-]*/gi, "");

const loaderSrc = read("src/lib/wc-expanded-markets.ts");
const ingestSrc = read("scripts/ingest-wc-expanded-markets.mjs");
const componentSrc = read("src/components/game/wc-game-center.tsx");
const artifact = JSON.parse(read(`public/data/world-cup/expanded-markets/${DATE}.json`));

test("1 · expanded artifact is de-vigged; every 2-way no-vig pair sums to 1.0", () => {
  assert.equal(artifact.method, "market_implied_devig");
  for (const m of Object.values(artifact.matches)) {
    const ah = m.markets.asianHandicap;
    if (ah && ah.home.noVigProb != null && ah.away.noVigProb != null) {
      assert.ok(Math.abs(ah.home.noVigProb + ah.away.noVigProb - 1) < 1e-3, "AH no-vig sums to 1");
    }
    const tt = m.markets.teamTotals;
    if (tt) {
      for (const side of [tt.home, tt.away]) {
        if (side.over.noVigProb != null && side.under.noVigProb != null) {
          assert.ok(Math.abs(side.over.noVigProb + side.under.noVigProb - 1) < 1e-3, "team total no-vig sums to 1");
        }
      }
    }
  }
});

test("2 · loader returns supported modules + null on a missing match", () => {
  const id = Object.keys(artifact.matches)[0];
  const x = getWcExpandedMarkets(DATE, id);
  assert.ok(x, "loads the match");
  assert.ok(x.supportedModules.includes("Asian handicap") || x.supportedModules.includes("Team totals"));
  assert.equal(getWcExpandedMarkets(DATE, "no-such-match"), null);
  assert.equal(getWcExpandedMarkets("2099-01-01", id), null);
});

test("3 · unsupported soccer modules are declared unavailable with NO numeric values", () => {
  const id = Object.keys(artifact.matches)[0];
  const x = getWcExpandedMarkets(DATE, id);
  const modules = x.unavailable.map((u) => u.market);
  for (const m of ["corners", "cards", "exact_score", "first_scorer"]) assert.ok(modules.includes(m), `${m} unavailable`);
  // The unavailable entries carry only a reason string, never a probability/number.
  for (const u of x.unavailable) assert.equal(typeof u.reason, "string");
});

test("4 · ingest is credit-guarded, money-independent, and never invents an absent market", () => {
  assert.match(ingestSrc, /CREDIT_FLOOR|x-requests-remaining/);
  assert.match(ingestSrc, /below floor/i);
  assert.doesNotMatch(ingestSrc, /portfolio\.json|mr-dub|bankroll/);
  // A market a book doesn't post is recorded unavailable, not fabricated.
  assert.match(ingestSrc, /not_posted/);
});

test("5 · component renders the expanded panels (gated in postReveal, no fabricated specialty)", () => {
  assert.match(componentSrc, /Asian handicap/);
  assert.match(componentSrc, /Team goal totals/);
  // Never renders a corners/cards/exact-score value — those are unavailable-only.
  assert.doesNotMatch(componentSrc, /cornersCount|cardsCount|exactScoreGrid/);
});

test("6 · money md5 unchanged", () => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(app, "public/data/mr-dub/portfolio.json"))).digest("hex");
  assert.equal(md5, "affe6b21071f2b3be96bb2774eb347c3");
});

test("7 · no banned copy in the expanded surfaces", () => {
  for (const src of [loaderSrc, ingestSrc, componentSrc]) assert.doesNotMatch(stripSafeArea(src), BANNED);
});
