/**
 * UX audit L2, M5, L7 (2026-10-15): archived CTAs say what they open, /today uses the shared state words at a
 * readable size, and page disclosures keep the 44 px target the global `main summary` rule asks for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("hub archive CTA says 'View archived report' (DS-001 §6); the founder-approved 'Open report' stays", () => {
  const s = src("src/components/sport-hub/game-summary.tsx");
  assert.match(s, /"View archived report" : "Open report"/);
  assert.doesNotMatch(s, /"View record"/);
});

test("/today: Upcoming not 'Pregame'; a started spotlight game says Started, never 'In progress'; chips ≥ 10.5px", () => {
  const g = src("src/components/today/game-predictions.tsx");
  assert.match(g, /started \? "Started" : "Upcoming"/);
  assert.doesNotMatch(g, /"Pregame"/);
  const b = src("src/components/today/today-mlb-brief.tsx");
  assert.match(b, /slateIsPast \? "Slate finished" : "Started"/);
  assert.doesNotMatch(b, /"In progress"/);
  assert.match(g, /style=\{\{ fontSize: 10\.5 \}\}>\s*\{started \? "Started" : "Upcoming"\}/, "the state chip is 10.5px");
  assert.match(b, /fontSize: 10\.5, [^}]*\}\}>\{slateIsPast \? "Slate finished" : "Started"\}/, "the spotlight state chip is 10.5px");
});

test("disclosures on the NFL hub and game report, and the hub header, are 44px targets", () => {
  for (const p of ["src/app/nfl/game/[eventId]/page.tsx", "src/components/sport-hub/hub-header.tsx"]) {
    assert.doesNotMatch(src(p), /<summary[^>]*minHeight: 32/, `${p}: a 32px summary`);
  }
  const hub = src("src/components/sport-hub/hub-header.tsx");
  assert.equal((hub.match(/<summary[^>]*minHeight: 44/g) ?? []).length, 2);
});
