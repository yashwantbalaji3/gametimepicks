/**
 * Every Level A suggestion type reads in reader words on /results, /results/nba and /results/date/<day>. Audit 2026-10-25:
 * the live "Model suggestions by policy and tier" table printed the NBA rows as raw policy ids
 * ("nba-game-winner-tiers@1/parlay-lab · Low Risk"), beside "Parlay Center card · Medium Risk" for the cross-sport rows.
 * Run: npx tsx --test src/lib/results/level-a-policy-labels.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { levelARecord, policyLabel, POLICY_LABEL } from "./level-a-record.mjs";

const DIR = path.resolve(process.cwd(), "..", "data/internal/products/level-a");
const jsonl = (f) => fs.readFileSync(path.join(DIR, f), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const RAW = /@\d|\//;

test("REAL RECORD: no group and no entry label is a raw policy id", () => {
  const view = levelARecord(jsonl("suggestions.jsonl"), jsonl("graded.jsonl"));
  const policies = new Set(view.byGroup.map((g) => g.policy));
  assert.ok([...policies].some((p) => p.startsWith("nba-game-winner-tiers@1/")), "the record holds NBA tier cards, or this test is vacuous");
  for (const g of view.byGroup) assert.doesNotMatch(g.label, RAW, `${g.policy}|${g.tier} reads "${g.label}"`);
  for (const e of view.entries) assert.doesNotMatch(e.label, RAW, `${e.id} reads "${e.label}"`);
});

test("the NBA and mixed-sport rules name their page; an unlisted policy still never prints its id", () => {
  assert.equal(policyLabel("nba-game-winner-tiers@1/parlay-lab"), "NBA Parlay Center card");
  assert.equal(policyLabel("nba-game-winner-tiers@1/bank-builder"), "NBA Bank Builder card");
  assert.equal(policyLabel("nba-game-winner-tiers@1/moonshot"), "NBA Moonshot card");
  assert.equal(policyLabel("level-a-mixed@1/moonshot"), "Mixed-sport Moonshot card");
  assert.equal(policyLabel("parlay-lab-suggest@1"), "Parlay Center card", "existing labels unchanged");
  assert.equal(policyLabel("some-future-rule@3/bank-builder"), "Bank Builder card");
  assert.equal(policyLabel("some-future-rule@3"), "Model suggestion");
  for (const l of Object.values(POLICY_LABEL)) assert.doesNotMatch(l, /Parlay Lab|Picks Lab|Build-a-Pick/, "no retired destination name");
});
