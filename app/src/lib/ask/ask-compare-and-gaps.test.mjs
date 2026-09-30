/**
 * Phase E · E-4 — a player comparison reaches the writer WITH the owner's numbers (it used to carry two names and a
 * list of stat families), and the fake planner now exercises the compare tools instead of routing to help.
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { buildEvidence } from "./evidence.mjs";
import { verifyAnswer } from "./verifier.mjs";
import { createFakeProvider } from "./provider-fake.mjs";

const cmp = {
  sport: "NFL", selectedSeason: "NFL-2025", stat: { key: "NFL.receivingYards", label: "Receiving yards", unit: "yards" }, sharedFamilies: ["NFL.receivingYards"],
  a: { id: "a", label: "CeeDee Lamb", season: { n: 14, mean: 76.9, total: 1077, min: 0, max: 121 }, windows: [{ size: 5, n: 5, complete: true, mean: 66.6 }] },
  b: { id: "b", label: "Justin Jefferson", season: { n: 17, mean: 61.6, total: 1048, min: 4, max: 126 }, windows: [{ size: 5, n: 5, complete: true, mean: 49.8 }] },
  links: [],
};

test("🔴 the comparison's recorded numbers, per side, are evidence — and an answer can be checked against them", () => {
  const ev = buildEvidence([{ id: "E1", tool: "getPlayerComparison", status: "OK", data: cmp }]);
  const text = ev.facts.map((f) => f.text).join("\n");
  assert.match(text, /CeeDee Lamb · Receiving yards in the 2025 season: 14 recorded games, average 76\.9, total 1077, range 0 to 121/);
  assert.match(text, /Justin Jefferson · Receiving yards over the last 5 recorded games: average 49\.8/);
  assert.match(text, /names no better player/);
  assert.equal(verifyAnswer("In the 2025 season CeeDee Lamb averaged 76.9 receiving yards over 14 games; Justin Jefferson averaged 61.6 over 17.", ev).ok, true);
  assert.equal(verifyAnswer("CeeDee Lamb averaged 88.2 receiving yards in 2025.", ev).ok, false, "an invented average is refused");
});

test("the tool reads the builder's real shape (per-side season/windows), not keys that never existed", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/ask/tools/compare.mjs"), "utf8");
  assert.match(src, /a: compareSide\(built\.a\),/);
  assert.doesNotMatch(src, /season: built\.season \?\? null/);
});

test("the fake planner resolves both names and calls the comparison (it used to route 'compare' to help)", async () => {
  const fake = createFakeProvider({});
  const out = await fake.plan({ system: "", user: "QUESTION: Compare CeeDee Lamb and Justin Jefferson in the NFL" });
  const plan = JSON.parse(out.text ?? out);
  assert.deepEqual(plan.calls.map((c) => c.name), ["resolveEntity", "resolveEntity", "getPlayerComparison"]);
  assert.deepEqual(plan.calls.slice(0, 2).map((c) => c.arguments.text), ["CeeDee Lamb", "Justin Jefferson"]);
});
