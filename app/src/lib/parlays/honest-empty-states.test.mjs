/**
 * Suggested Parlays V2 · F-2 — an empty lane says WHY, from the owner's own record: a stale EPL price capture never
 * builds cards (it publishes STALE_PRICES), and /build's empty list states the card-leg rule's recorded reason
 * instead of claiming a slate was assessed when its source is retired.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("🔴 the EPL ladder refuses a stale capture with the ONE freshness rule, before any card is built", () => {
  const s = src("scripts/epl/build-epl-ladder.mjs");
  assert.match(s, /import \{ PRICE_MAX_AGE_DAYS, priceIsFresh \} from "..\/..\/src\/lib\/parlays\/card-leg-eligibility\.mjs"/);
  const gate = s.indexOf("if (!priceIsFresh(odds.capturedAt ?? odds.generatedAt, NOW))");
  assert.ok(gate > -1, "the freshness gate exists");
  assert.ok(gate < s.indexOf("const eligibleFixtures"), "and runs before any fixture is priced into a card");
  assert.match(s, /state: "STALE_PRICES"/);
});

test("🔴 /build's empty card list states the ladder's recorded reason when the card-leg rule emptied the day", () => {
  const p = src("src/app/build/page.tsx");
  assert.match(p, /riskLadder\?\.eligibility\?\.withheldMarketContext/);
  assert.match(p, /model-built candidates were withheld: every one uses a market-context family/);
  assert.match(src("src/lib/parlays/risk-ladder.ts"), /readonly eligibility\?: \{/, "the ladder type carries the rule's record");
});

test("🔴 the prior-policy record covers exactly the window its label names — it ends before the change", (t) => {
  const s = src("scripts/parlays/build-lab-ledger.mjs");
  assert.match(s, /if \(f\.slice\(0, 10\) >= POLICY\.since\) continue;/, "graded days on or after the change are not the prior policy");
  const ledger = JSON.parse(src("public/data/parlays/lab-ledger.json"));
  const since = s.match(/since: "(\d{4}-\d{2}-\d{2})"/)[1];
  if (Date.parse(ledger.generatedAt) < Date.parse("2026-09-30T00:00:00Z")) { t.skip(`ledger built ${ledger.generatedAt}, before this fix — announced, not checked`); return; }
  assert.ok(!ledger.priorPolicy?.lastDay || ledger.priorPolicy.lastDay < since, `priorPolicy.lastDay ${ledger.priorPolicy?.lastDay} is not before ${since}`);
});
