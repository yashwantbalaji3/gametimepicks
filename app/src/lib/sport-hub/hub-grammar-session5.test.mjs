/**
 * Session 5 · B8 — hub grammar truth fixes found by the four-hub audit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const code = (p) => fs.readFileSync(p, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("every rendered hub section has its strip item (EPL Fixtures, NFL Simulations)", () => {
  const epl = code("src/app/epl/page.tsx");
  const eplAnchors = epl.slice(epl.indexOf("anchors={["), epl.indexOf("]}", epl.indexOf("anchors={[")));
  assert.match(epl, /<section id="epl-games"/);
  assert.match(eplAnchors, /"epl-games"/, "the Fixtures section renders, so its strip item must");
  const nfl = code("src/app/nfl/page.tsx");
  const nflAnchors = nfl.slice(nfl.indexOf("anchors={["), nfl.indexOf("]}", nfl.indexOf("anchors={[")));
  assert.match(nflAnchors, /\(forecastArtifact\?\.forecasts \?\? \[\]\)\.length \? \["nfl-reports"\] : \[\]/, "same condition as the section's own render");
});

test("hub dates are ET days — never the UTC instant's first ten characters", () => {
  for (const p of ["src/app/nfl/page.tsx", "src/app/epl/page.tsx"]) {
    assert.doesNotMatch(code(p), /(dateUtc|kickoffUtc)[^;\n]{0,20}\.slice\(0, 10\)/, `${p}: an evening ET game's UTC date is the next day`);
  }
});

test("the NFL hub's empty fallback states a fact, not a lapsed authorisation", () => {
  const a = code("src/lib/sport-hub/adapters.ts");
  assert.doesNotMatch(a, /allowance has lapsed/);
  assert.match(a, /No NFL games are in the committed schedule capture, so the hub shows the most recent window on file\./);
});
