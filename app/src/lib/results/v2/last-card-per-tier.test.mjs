/**
 * The last PUBLISHED card in each risk tier (Workstream E, 2026-10-23): read from the frozen ladders and the lab's
 * settled receipts, newest first; never a generated, fixture or fallback card.
 * Run: npx tsx --test src/lib/results/v2/last-card-per-tier.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { lastCardPerTier } from "./suggested-history.mjs";

const root = () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-lastcard-"));
  fs.mkdirSync(path.join(r, "parlays", "risk-ladder"), { recursive: true });
  fs.mkdirSync(path.join(r, "parlays", "lab-settled"), { recursive: true });
  return r;
};
const ladder = (r, date, cards, skipped = []) => fs.writeFileSync(path.join(r, "parlays", "risk-ladder", `${date}.json`), JSON.stringify({ date, cards, skipped }));
const card = (tier, slipId, legs = 2, combinedAmerican = 150) => ({ tier, slipId, combinedAmerican, legs: Array.from({ length: legs }, () => ({ player: "x", market: "hits", side: "Over", line: 0.5, odds: -110 })) });

test("newest published card per tier, with its settled result; a later empty day does not hide it", () => {
  const r = root();
  ladder(r, "2026-09-01", [card("low", "s1"), card("high", "s2", 3, 400)]);
  ladder(r, "2026-09-05", [card("low", "s3")]);
  ladder(r, "2026-09-09", [], [{ tier: "low", reason: "no priced card" }]);
  fs.writeFileSync(path.join(r, "parlays", "lab-settled", "2026-09-05.json"), JSON.stringify({ cards: [{ slipId: "s3", result: "win", legs: ["win", "win"] }] }));
  const out = Object.fromEntries(lastCardPerTier("2026-09-10", r).map((t) => [t.tier, t.last]));
  assert.deepEqual(out.low, { date: "2026-09-05", result: "won", combinedAmerican: 150, legs: 2 });
  assert.deepEqual(out.high, { date: "2026-09-01", result: "pending", combinedAmerican: 400, legs: 3 }, "no settled receipt yet is pending, never a loss");
  assert.equal(out.medium, null);
  assert.equal(out.longshot, null);
  fs.rmSync(r, { recursive: true, force: true });
});

test("a card after the reference date is not 'last' (no peeking forward)", () => {
  const r = root();
  ladder(r, "2026-09-01", [card("low", "a")]);
  ladder(r, "2026-09-20", [card("low", "b")]);
  assert.equal(lastCardPerTier("2026-09-10", r).find((t) => t.tier === "low").last.date, "2026-09-01");
  fs.rmSync(r, { recursive: true, force: true });
});

test("the Parlay Center renders the empty-state context from its own owners (lab lanes + last cards)", () => {
  const build = fs.readFileSync(path.resolve(process.cwd(), "src/app/build/page.tsx"), "utf8");
  assert.match(build, /<EmptyTierContext emptyTiers=\{\[\.\.\.emptyTiers\]\} lastCards=\{lastTierCards\}/);
  assert.match(build, /lastCardPerTier\(ladderDate, dataRoot\)/);
  // The Parlay Center reads its OWN lane gate (lab record), never the product eligible universe.
  assert.match(build, /lanes=\{emptyTiers\.length \? \(loadLabRecord\(\)\?\.streams \?\? \[\]\)/);
  const custom = fs.readFileSync(path.resolve(process.cwd(), "src/app/build/custom/page.tsx"), "utf8");
  assert.doesNotMatch(custom, /EligibleUniverse/, "Build Your Own's pool is not decided by the product gate, so it does not show that panel");
  const comp = fs.readFileSync(path.resolve(process.cwd(), "src/components/parlays/empty-tier-context.tsx"), "utf8");
  const code = comp.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /\bFIXTURE\b|\.price\b|\.odds\b|americanOdds/, "the panel shows no fixture and no price");
  assert.doesNotMatch(code, /EligibleUniverse/, "the product universe would read 'not eligible' beside a publishing lane");
});
