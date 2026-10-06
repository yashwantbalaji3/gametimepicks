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
  /* The two slots re-ask on the reader's clock (kickoff-aware.tsx): a page built before kickoff moves the
     panel to the top once the game starts, without waiting for a rebuild. */
  const header = code.indexOf("</header>");
  const top = code.indexOf('<KickoffSlot kickoffUtc={f.kickoffUtc} startedAtBuild={liveTop} when="after"><div style={{ marginTop: 16 }}>{livePanel}</div></KickoffSlot>');
  const lower = code.indexOf('<KickoffSlot kickoffUtc={f.kickoffUtc} startedAtBuild={liveTop} when="before">{livePanel}</KickoffSlot>');
  const summary = code.indexOf('aria-labelledby="sim-summary"');
  assert.ok(header > 0 && top > header && top < code.indexOf("<SaveForecastButton"), "top slot follows the header, before anything else");
  assert.ok(lower > summary, "the pregame slot stays inside the forecast section");
});
