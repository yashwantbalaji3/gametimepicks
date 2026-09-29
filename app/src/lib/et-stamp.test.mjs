/**
 * #761 PR 3 · absolute, hydration-safe ET stamps; no freshness claim without a timestamp.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { etStamp } from "./et-stamp.mjs";

test("an ET stamp is absolute, dated, and plain ASCII — the same bytes on server and browser", () => {
  assert.equal(etStamp("2031-09-28T21:10:00Z"), "Sep 28, 5:10 PM ET");
  assert.equal(etStamp("2031-09-29T00:15:00Z"), "Sep 28, 8:15 PM ET", "ET, not UTC: a Monday-night time stays Monday");
  assert.ok(!/[  ]/.test(etStamp("2031-09-28T21:10:00Z")), "no no-break spaces (they differ across ICU builds)");
});

test("🔴 a missing or unreadable time yields NOTHING — never 'recently'", () => {
  assert.equal(etStamp(null), null);
  assert.equal(etStamp(""), null);
  assert.equal(etStamp("not a date"), null);
});

test("🔴 the MLB report's generation line reads no clock during render and claims nothing without a stamp", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/game/game-simulation-runner.tsx"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /generated recently/i, "no freshness claim without a timestamp");
  assert.doesNotMatch(code, /Date\.now\(\)/, "no reader-or-build clock in render (hydration mismatch)");
  assert.match(code, /etStamp\(iso\)/, "the generation time comes from the shared absolute stamp");
  assert.match(code, /generatedLabel\(view\.generatedAt\) \? <span/, "and renders only when it exists");
});
