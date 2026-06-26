/**
 * Methodology page content contract (June 15 rebuild). The public /methodology
 * page must explain the FULL multi-sport product, not just NBA — and must carry
 * the UFC 250 learning, the Bank Builder completed result, the odds-backed vs
 * model-only distinction, official-settlement-only integrity, parlay
 * concentration risk, and zero banned copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);

test("covers every supported sport/module (not NBA-only)", () => {
  for (const kw of ["UFC", "MLB", "NBA", "World Cup", "Soccer", "Bank Builder", "Suggested cards"]) {
    assert.ok(src.includes(kw), `methodology must mention ${kw}`);
  }
});

test("distinguishes odds-backed vs model-only", () => {
  assert.ok(/odds-backed/i.test(src), "mentions odds-backed");
  assert.ok(/model-only/i.test(src), "mentions model-only");
  assert.ok(/not parlay eligible/i.test(src), "model-only is not parlay eligible");
});

test("states official-settlement-only integrity", () => {
  assert.ok(/official settlement only/i.test(src), "official settlement only");
  assert.ok(/never from screenshots|never from .*user reports|not.*screenshots/i.test(src),
    "settles from official sources, not screenshots/user reports");
});

test("includes the universal math (no-vig, edge, confidence, data quality, parlay)", () => {
  assert.ok(/no-vig|novig/i.test(src), "no-vig");
  assert.ok(/edge_pp|edge =|edge/i.test(src), "edge");
  assert.ok(/composite confidence|confidence/i.test(src), "confidence");
  assert.ok(/data-quality|data quality/i.test(src), "data quality");
  assert.ok(/parlay/i.test(src), "parlay odds");
});

test("includes the UFC 250 first-slate learning + concentration lesson", () => {
  assert.ok(src.includes("6–1") || src.includes("6-1"), "6–1 moneyline");
  assert.ok(src.includes("0–4") || src.includes("0-4"), "0–4 cards");
  assert.ok(/Topuria/i.test(src), "names Topuria miss");
  assert.ok(/Hokit/i.test(src), "names Hokit +320 hit");
  assert.ok(/concentration/i.test(src), "concentration risk lesson");
  assert.ok(/\+320/.test(src), "the +320 underdog price");
});

test("preserves the Bank Builder completed result honestly — from the ONE canonical source", async () => {
  // The page must NOT hardcode the crown figure; it interpolates crownLadderSummary(banked-ladders.json).
  assert.ok(!src.includes("10,376.17"), "no hardcoded crown literal in the page source");
  assert.ok(/crownLadderSummary|crownReached/.test(src), "derives the completed result from the canonical crown summary");
  assert.ok(/completed/i.test(src), "run completed");
  assert.ok(/coming soon/i.test(src), "new ladder coming soon, no active pending step");
  // The canonical source still yields the real figures (proves the interpolation is correct).
  const { crownLadderSummary } = await import("../../lib/bank-builder/crown-summary.ts");
  const path = await import("node:path");
  const crown = crownLadderSummary(path.join(process.cwd(), "public", "data"));
  assert.equal(crown.finalLabel, "$10,376.17", "canonical crown final");
  assert.equal(crown.recordLabel, "5–0", "canonical crown record");
});

test("explains parlay concentration risk", () => {
  assert.ok(/concentration score/i.test(src), "cards carry a concentration score");
  assert.ok(/anchor every card|single anchor|anchor every/i.test(src),
    "no single anchor across every card");
});

test("no banned public copy", () => {
  // Whole-word matches only — avoids false hits like 'unsafe' substring etc.
  const banned = [
    /\block\b/i, /\bsafe\b/i, /\bsafest\b/i, /\bguaranteed\b/i, /\bguarantee\b/i,
    /\bsure thing\b/i, /\bfree money\b/i, /\brisk-free\b/i, /\bcan't miss\b/i,
    /\bcant miss\b/i,
  ];
  for (const re of banned) {
    assert.ok(!re.test(src), `banned copy present: ${re}`);
  }
});
