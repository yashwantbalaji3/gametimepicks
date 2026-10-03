/** Session 9 overnight · F2 — Suggested Parlays day history: the frozen published cards + their settled grades. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { suggestedCardsFor, suggestedCardDates } from "./suggested-history.mjs";

function fixture({ ladder, settled }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-sp-"));
  fs.mkdirSync(path.join(root, "parlays/risk-ladder"), { recursive: true });
  fs.mkdirSync(path.join(root, "parlays/lab-settled"), { recursive: true });
  if (ladder) fs.writeFileSync(path.join(root, "parlays/risk-ladder/2026-09-27.json"), JSON.stringify(ladder));
  if (settled) fs.writeFileSync(path.join(root, "parlays/lab-settled/2026-09-27.json"), JSON.stringify(settled));
  return root;
}
const LADDER = { date: "2026-09-27", generatedAt: "2026-09-27T10:00:00Z", record: { wins: 99, losses: 1 },
  cards: [
    { tier: "high", slipId: "h1", combinedAmerican: 400, legs: [{ player: "A", marketLabel: "Hits", side: "Over", line: 0.5, odds: -150 }, { player: "B", marketLabel: "Hits", side: "Over", line: 0.5, odds: 120 }] },
    { tier: "medium", slipId: "m1", combinedAmerican: 150, legs: [{ player: "C", marketLabel: "Hits", side: "Over", line: 0.5, odds: -200 }] },
  ],
  skipped: [{ tier: "low", reason: "no priced card in this tier on today's slate" }] };

test("published cards in tier order, graded by slipId from the lab's settled receipt; skipped tiers keep their reason", () => {
  const root = fixture({ ladder: LADDER, settled: { settledAt: "2026-09-28T10:00:00Z", cards: [{ sport: "mlb", slipId: "h1", result: "loss", legs: ["win", "loss"] }, { sport: "ufc", slipId: "m1", result: "win", legs: ["win"] }] } });
  const d = suggestedCardsFor("2026-09-27", root);
  assert.deepEqual(d.cards.map((c) => [c.tier, c.result]), [["medium", "pending"], ["high", "lost"]], "another sport's receipt never grades an MLB card");
  assert.deepEqual(d.cards[1].legs.map((g) => g.result), ["won", "lost"]);
  assert.deepEqual(d.skipped, [{ tier: "low", tierLabel: "Low Risk", reason: "no priced card in this tier on today's slate" }]);
});

test("mutation probes: pending is never a loss; misaligned leg grades are not guessed; the candidate record never appears", () => {
  const unsettled = suggestedCardsFor("2026-09-27", fixture({ ladder: LADDER, settled: null }));
  assert.ok(unsettled.cards.every((c) => c.result === "pending" && c.legs.every((g) => g.result === "pending")), "no settled receipt → pending, never lost");
  const misaligned = suggestedCardsFor("2026-09-27", fixture({ ladder: LADDER, settled: { cards: [{ sport: "mlb", slipId: "h1", result: "loss", legs: ["loss"] }] } }));
  assert.deepEqual(misaligned.cards[1].legs.map((g) => g.result), ["pending", "pending"], "a leg grade is never assigned by position when the counts disagree");
  assert.equal(misaligned.cards[1].result, "lost", "the card's own grade still stands");
  assert.ok(!JSON.stringify(misaligned).includes("99"), "the ladder's candidate-pool record is not the published history");
});

test("no ladder file → no section; dates come from the published ladders only", () => {
  assert.equal(suggestedCardsFor("2026-09-27", fixture({ ladder: null })), null);
  assert.equal(suggestedCardsFor("not-a-date"), null);
  assert.deepEqual(suggestedCardDates(fixture({ ladder: LADDER })), ["2026-09-27"]);
});

test("the real committed history joins: every settled MLB card that has a published ladder card is graded", () => {
  const dates = suggestedCardDates();
  assert.ok(dates.length > 0);
  let graded = 0;
  for (const d of dates) for (const c of suggestedCardsFor(d)?.cards ?? []) if (c.result !== "pending") graded += 1;
  assert.ok(graded > 0, "at least one published card carries a settled grade");
});

test("the day page renders the Suggested Parlays section and generates a page (and admits the 404 gate) for every ladder day", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/results/date/[date]/page.tsx"), "utf8");
  assert.match(page, /<SuggestedReceipts date=\{date\} \/>/);
  assert.match(page, /\.\.\.suggestedCardDates\(\), \.\.\.resultsDayDates\(\)/, "generateStaticParams enumerates every published ladder day");
  assert.match(page, /const dayDates = new Set\(\[[^\]]*\.\.\.suggestedCardDates\(\)\]\)/, "the 404 gate accepts a ladder day");
});
