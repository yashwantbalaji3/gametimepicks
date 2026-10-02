/**
 * leg-floor@2 vs ProductEligibleLeg v1 — on every committed daily universe, V2 admits EXACTLY the legs V1
 * admitted. This is what makes routing Bank Builder / Moonshot through the V2 floor a no-op for today's
 * pool (MLB team markets), so a V2 policy difference can only come from the policy, never the pool.
 *
 * Run: npx tsx --test src/lib/products/engine-v2/floor-parity.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { receiptFromV1Candidate } from "./sources.mjs";
import { evaluateReceiptV2 } from "./eligibility.mjs";
import { V2_CANDIDATES, POLICIES } from "../selector/policies.mjs";

const DIR = path.join(process.cwd(), "..", "data/internal/products/eligible-legs");
const days = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
const key = (sport, eventId, marketKey, side, line) => [sport, eventId, marketKey, side, line ?? ""].join("|");

test("the committed universes exist, so the parity check is not vacuous", () => {
  assert.ok(days.length >= 5, `only ${days.length} committed daily universes`);
});

for (const f of days) {
  test(`${f.slice(0, 10)}: leg-floor@2 admits exactly the V1-eligible set`, () => {
    const day = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const v1 = new Set(day.legs.filter((l) => l.productEligible).map((l) => key(l.sport, l.eventId, l.marketKey, l.side, l.line)));
    const v2 = new Set(day.legs.map((l) => receiptFromV1Candidate(l)).filter((r) => evaluateReceiptV2(r, { asOf: day.asOf }).eligible)
      .map((r) => key(r.identity.sport, r.identity.eventId, r.market.marketKey, r.market.side, r.market.line)));
    assert.deepEqual([...v2].sort(), [...v1].sort());
  });
}

test("the V2 candidates are preregistered policies, not new ones", () => {
  for (const name of Object.values(V2_CANDIDATES)) assert.ok(POLICIES[name], `${name} is not in the frozen registry`);
});
