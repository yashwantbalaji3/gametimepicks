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
  // 2026-11-13: before kickoff the panel has no live state to show, so the pregame slot holds it in a fold (same slot,
  // same place); the top slot is unchanged and still shows it open from kickoff.
  const lower = code.indexOf('<KickoffSlot kickoffUtc={f.kickoffUtc} startedAtBuild={liveTop} when="before"><MoreDisclosure title="Live game state"');
  assert.match(code.slice(lower, lower + 400), /^<KickoffSlot [^>]*when="before"><MoreDisclosure [^>]*>\{livePanel\}<\/MoreDisclosure><\/KickoffSlot>/, "the fold wraps the panel and nothing else");
  const summary = code.indexOf('aria-labelledby="sim-summary"');
  assert.ok(header > 0 && top > header && top < code.indexOf("{actionsBelowHero ? null : saveForecast}"), "top slot follows the header, before anything else");
  assert.ok(code.indexOf("{actionsBelowHero ? null : saveForecast}") > 0 && code.indexOf("<SaveForecastButton") < header, "the save control is one element, placed by the page (header position for a started game)");
  assert.ok(lower > summary, "the pregame slot stays inside the forecast section");
});
