/**
 * UFC 250 official settlement invariants: graded only from the official source, cards won only
 * if every leg hit, expanded model-only props graded without betting P&L, and settled UFC cards
 * no longer appear as active /picks. Bank Builder stays completed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const s = JSON.parse(fs.readFileSync(path.join(dir, "ufc", "results-settled-latest.json"), "utf8"));

test("UFC settlement is final, sourced from the official ESPN MMA feed", () => {
  assert.equal(s.status, "final");
  assert.match(s.source, /espn/i, "official ESPN MMA source recorded");
  assert.equal(s.fights.length, 7, "all 7 fights settled");
  for (const f of s.fights) {
    assert.ok(f.officialWinner, `${f.fighters?.join(" vs ")}: official winner recorded`);
    assert.ok(["win", "loss"].includes(f.moneyline.result), "each moneyline graded win/loss");
  }
});

test("moneyline record matches the per-fight grades (no hand-typed total)", () => {
  const wins = s.fights.filter((f) => f.moneyline.result === "win").length;
  const losses = s.fights.length - wins;
  assert.equal(s.moneyline.record, `${wins}-${losses}`, "record is derived from the graded fights");
  assert.equal(s.moneyline.accuracyPct, Math.round((100 * wins) / s.fights.length));
});

test("a suggested card is WON only if every leg officially hit", () => {
  for (const c of s.suggestedCards.cards) {
    const allHit = c.legs.every((l) => l.result === "win");
    assert.equal(c.result, allHit ? "won" : "lost", `${c.riskLabel}: settled correctly vs legs`);
    if (c.result === "lost") assert.ok(c.bustedBy.length > 0, "a lost card names the losing leg(s)");
  }
});

test("expanded model-only props are graded for learning, never as priced P&L", () => {
  // The settlement carries grade counts but no profit/return on expanded markets.
  const blob = JSON.stringify(s.expandedModelOnly).toLowerCase();
  assert.ok(!/payout|return|profit|stake/.test(blob), "no betting P&L on model-only props");
  assert.ok(s.expandedModelOnly.goesDistance.graded > 0, "goes-distance graded for calibration");
});

test("settled UFC cards are gated out of every active suggested-card slate", () => {
  // The gate moved from /picks into lib/picks/suggested-cards.ts (Program 142 step 3C) so Build's
  // Suggested Cards mode reuses it rather than cloning it. Same rule, wider protection — checking
  // the page would now pass on a page that had stopped applying it.
  const loader = fs.readFileSync("src/lib/picks/suggested-cards.ts", "utf8");
  assert.ok(loader.includes("ufcSettled()"), "the shared loader checks UFC settlement");
  assert.ok(/ufcSettled\(\) \? null/.test(loader), "settled → UFC cards excluded from the live slate");
  // And every consumer must go through it rather than composing its own list.
  const picks = fs.readFileSync("src/app/picks/page.tsx", "utf8");
  assert.ok(picks.includes("loadSuggestedCards("), "/picks consumes the shared loader");
});

test("Bank Builder remains the completed crown (untouched by UFC settlement)", () => {
  const sum = JSON.parse(fs.readFileSync(path.join(dir, "bank-builder", "public-summary-latest.json"), "utf8"));
  assert.equal(sum.currentBankrollUnits, 10376.17);
  assert.deepEqual(sum.record, { wins: 5, losses: 0, pushes: 0 });
  assert.equal(sum.runStatus, "completed");
});
