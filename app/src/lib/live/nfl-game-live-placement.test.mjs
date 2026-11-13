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

test("🔴 upcoming game: follow, research and save render once — under the hero, never also in the header", () => {
  assert.match(code, /const actionsBelowHero = !started && !archived && !isFinal;/, "only an upcoming game moves its actions");
  const hero = code.indexOf("<GameHero");
  const below = code.indexOf('{actionsBelowHero ? <div data-nfl-game-actions=""');
  assert.ok(hero > 0 && below > hero, "the moved block follows the hero");
  assert.match(code.slice(below, below + 300), /^\{actionsBelowHero \? <div data-nfl-game-actions=""[^>]*>\{followAndResearch\}\{saveForecast\}<\/div> : null\}/, "the block holds both pieces and nothing else");
  // each piece has exactly two placements, mutually exclusive on the same flag
  const count = (s) => code.split(s).length - 1;
  assert.equal(count("{actionsBelowHero ? null : followAndResearch}"), 1);
  assert.equal(count("{actionsBelowHero ? null : saveForecast}"), 1);
  assert.equal(count("{followAndResearch}"), 1, "follow/research: one below-hero use");
  assert.equal(count("{saveForecast}"), 1, "save: one below-hero use");
  assert.equal(count("<SaveForecastButton"), 1, "one save control on the page");
});

test("🔴 the pre-kickoff fold exists only where the live panel does", () => {
  /* LivePanel renders nothing unless liveReadyFor("nfl"); the fold's summary promises a live score at kickoff, so a
     flag-off build must not ship an empty fold carrying that promise (independent review, 2026-11-13). */
  assert.match(code, /const nflLiveOn = liveReadyFor\("nfl"\);/);
  assert.match(code, /\{isFinal \|\| !nflLiveOn \? null : <KickoffSlot [^>]*when="before"><MoreDisclosure title="Live game state"/);
});
