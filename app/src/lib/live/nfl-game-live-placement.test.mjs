/**
 * #794 PR 4 · live clarity on the NFL game page. Source guards: one live panel, placed under the header
 * once the game has started (or is archived), and in the forecast section before kickoff.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
const code = page.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("🔴 exactly ONE live panel element — two slots, never two panels or two fetches", () => {
  assert.equal((code.match(/<LivePanel\b/g) ?? []).length, 1);
  assert.match(code, /const livePanel = \(\s*<LivePanel\b/);
});

test("🔴 started or archived → the panel sits directly under the header; before kickoff it stays with the forecast", () => {
  assert.match(code, /const liveTop = started \|\| !!archived;/);
  const header = code.indexOf("</header>");
  const top = code.indexOf("{liveTop ? <div");
  const lower = code.indexOf("{liveTop ? null : livePanel}");
  const summary = code.indexOf('aria-labelledby="sim-summary"');
  assert.ok(header > 0 && top > header && top < code.indexOf("<SaveForecastButton"), "top slot follows the header, before anything else");
  assert.ok(lower > summary, "the pregame slot stays inside the forecast section");
});
