/**
 * PAPER-CARD SETTLEMENT — grades paper cards from committed official data only, never touches money.
 *
 * Pins the leg-settlement mapping (MLB team markets via the tested rules; player props / soccer stay
 * PENDING, never a loss), the card-result rollup (one loss ⇒ lost, all win ⇒ won, push dropped), the
 * paper P/L math, and that the settle script writes no money artifact.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { settleLeg, cardPnlUnits } from "../../../scripts/settle-paper-product-cards.mjs";
import { resolveCardResult } from "./schema.ts";

const app = process.cwd();
// Real committed 2026-07-08 final: SF Giants (home) 0, Toronto (away) 10.
const finalScore = { homeRuns: 0, awayRuns: 10, isFinal: true };
const nonFinal = { homeRuns: 3, awayRuns: 2, isFinal: false };
const mlb = (marketKey, side, line, legId = marketKey) => ({ legId, sport: "MLB", marketKey, side, line, gameId: "g", oddsAmerican: -110 });

test("1 · MLB team markets settle from a final score via the tested rules (win/loss/push)", () => {
  assert.equal(settleLeg(mlb("moneyline", "away"), finalScore).status, "win", "TOR (away) won 10-0");
  assert.equal(settleLeg(mlb("moneyline", "home"), finalScore).status, "loss", "SF (home) lost 0-10");
  assert.equal(settleLeg(mlb("total", "over", 9), finalScore).status, "win", "total 10 > 9");
  assert.equal(settleLeg(mlb("total", "under", 9), finalScore).status, "loss");
  assert.equal(settleLeg(mlb("total", "over", 10), finalScore).status, "push", "total 10 == 10");
  assert.equal(settleLeg(mlb("run_line", "away", 1.5), finalScore).status, "win", "TOR +1.5 covers");
  assert.equal(settleLeg(mlb("run_line", "home", -1.5), finalScore).status, "loss", "SF -1.5 does not cover");
});

test("2 · non-final games + unwired markets stay PENDING (never a loss)", () => {
  assert.equal(settleLeg(mlb("moneyline", "away"), nonFinal).status, "pending", "not final");
  assert.equal(settleLeg(mlb("moneyline", "away"), undefined).status, "pending", "no score");
  assert.equal(settleLeg(mlb("batter_hits", "over", 0.5), finalScore).status, "pending", "player prop not wired");
  assert.equal(settleLeg({ legId: "s", sport: "Soccer", marketKey: "double_chance", gameId: "g" }, undefined).status, "pending", "soccer not wired here");
});

test("3 · card result rollup — one loss ⇒ lost; all win ⇒ won; a pending leg keeps it pending", () => {
  const allWin = [settleLeg(mlb("moneyline", "away", undefined, "a"), finalScore), settleLeg(mlb("total", "over", 9, "b"), finalScore)];
  assert.equal(resolveCardResult(allWin).cardResult, "won");
  const oneLoss = [settleLeg(mlb("moneyline", "away", undefined, "a"), finalScore), settleLeg(mlb("moneyline", "home", undefined, "b"), finalScore)];
  assert.equal(resolveCardResult(oneLoss).cardResult, "lost");
  const onePending = [settleLeg(mlb("moneyline", "away", undefined, "a"), finalScore), settleLeg(mlb("batter_hits", "over", 0.5, "b"), finalScore)];
  assert.equal(resolveCardResult(onePending).cardResult, "pending");
});

test("4 · paper P/L math — won pays fair parlay units, lost is −stake, pending is 0", () => {
  const card = { paperStakeUnits: 1, legs: [mlb("moneyline", "away", undefined, "a"), mlb("total", "over", 9, "b")] };
  const won = [{ legId: "a", status: "win" }, { legId: "b", status: "win" }];
  assert.ok(cardPnlUnits(card, won, "won") > 0, "a won parlay returns positive paper units");
  assert.equal(cardPnlUnits(card, [{ legId: "a", status: "loss" }], "lost"), -1, "lost = −stake");
  assert.equal(cardPnlUnits(card, [{ legId: "a", status: "pending" }], "pending"), 0, "pending = 0");
});

test("5 · the settle script writes NO money artifact and writes only under data/internal/product-cards", () => {
  const src = fs.readFileSync(path.join(app, "scripts", "settle-paper-product-cards.mjs"), "utf8");
  assert.doesNotMatch(src, /writeFileSync[^\n]*(mr-dub|portfolio\.json|bankroll|daily-portfolio)/, "no money write");
  assert.doesNotMatch(src, /writeFileSync[^\n]*public\//, "never writes under public/");
  assert.match(src, /product-cards[^\n]*settlements/, "writes settlement entries under product-cards/settlements");
});
