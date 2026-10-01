/**
 * SESSION 4 — Ask must not contradict the NFL game page about touchdown scorers.
 *
 * On 2026-10-01 Ask answered "GameTimePicks does not hold touchdown scorer data for the Pittsburgh
 * Steelers and Cleveland Browns matchup" while the game report listed "Likely TD scorers" from the
 * same published board. The projection carried volume ranges only. The probability now travels as
 * evidence — once, with its conditioning — and only when the board PUBLISHES the family.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildEvidence } from "./evidence.mjs";

const forecastEnvelope = (players) => ({
  id: "E1", tool: "getPublishedForecasts", status: "OK",
  data: { totalMatched: 1, returned: 1, forecasts: [{ sport: "NFL", matchup: "PIT @ CLE", markets: [], players }] },
});

test("a published anytime-TD probability becomes one evidence sentence, conditioned on playing", () => {
  const ev = buildEvidence([forecastEnvelope([{ name: "Jaylen Warren", team: "PIT", anytimeTd: 0.3577, markets: [] }])]);
  const line = ev.facts.map((f) => f.text).find((t) => /anytime touchdown/.test(t));
  assert.ok(line, "the touchdown probability must reach the writer's evidence");
  assert.match(line, /Jaylen Warren \(PIT\)/);
  assert.match(line, /35\.8%/, "the same rounding the game page prints");
  assert.match(line, /conditioned on playing/);
});

test("no probability ⇒ no touchdown sentence (never an invented zero)", () => {
  const ev = buildEvidence([forecastEnvelope([{ name: "Someone", team: "CLE", anytimeTd: null, markets: [] }])]);
  assert.ok(!ev.facts.some((f) => /anytime touchdown/.test(f.text)));
});

test("the read model takes the TD probability only from a PUBLISHED family on the board", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/my/read-model.ts"), "utf8");
  assert.match(src, /published\.some\(\(\{ key \}\) => key === "anytime_td"\)/, "gated on the family's PUBLISHED state, like every range family");
  const proj = fs.readFileSync(path.join(process.cwd(), "scripts/ask/build-ask-projections.mjs"), "utf8");
  assert.match(proj, /anytimeTd: r\.anytimeTd \?\? null/, "the projection carries the read model's value, unchanged");
});
