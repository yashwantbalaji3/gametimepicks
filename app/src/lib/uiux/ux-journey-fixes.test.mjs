/**
 * UX journeys — defects found by click-through journey testing of the combined UX + HTML release candidate
 * (2026-10-17, docs/ux/UX_JOURNEYS_2026-10-17.md). Each test names its finding (UXJ-xx). The journeys were run in
 * Chromium at 390 (touch) and 1440 px against the static export, with keyboard-only passes for Home → Game and
 * Search → Research; these pin the fixes so they cannot quietly revert.
 *
 * Data-driven where the defect was data-shaped: nothing pins a date or a count (tests pinned to today's data fail
 * when the product succeeds). Built-export checks no-op when out/ is absent (CI unit lane).
 *
 * Run: npx tsx --test src/lib/uiux/ux-journey-fixes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { snapshotFromCard, matchupLabel, matchupSides } from "../saved/saved-schema.mjs";
import { buildSimulateDay, availableSimulateDates, etDayOf, STATE_ACTION } from "../simulate/day-view.ts";
import { MLB_GAME_FAMILY_LABEL, mlbGameFamilyLabel } from "../sports/graded-picks-loader.ts";

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const OUT = path.join(process.cwd(), "out");
const hasBuild = fs.existsSync(path.join(OUT, "nfl", "index.html"));

test("UXJ-01: the NFL player-projection tablists are named for a reader, not by their id fragment", () => {
  const tabs = src("src/components/nfl/forecast/family-tabs.tsx");
  assert.match(tabs, /\{\.\.\.famTabs\.listProps\} aria-label=\{listLabel\}/, "the tablist takes its name from listLabel");
  assert.doesNotMatch(tabs, /aria-label=\{label\}/, "`label` is an id base (players-<eventId>, hub-boards) and is never read aloud");
  assert.match(tabs, /listLabel = "Player projections by statistic"/, "a meaningful default for the game page");
  assert.match(src("src/app/nfl/page.tsx"), /label="hub-boards" listLabel="Weekly leaders by statistic"/, "the hub names its own list");
  if (!hasBuild) return;
  for (const page of [path.join(OUT, "nfl", "index.html"), ...fs.readdirSync(path.join(OUT, "nfl", "game")).slice(0, 20).map((id) => path.join(OUT, "nfl", "game", id, "index.html"))]) {
    if (!fs.existsSync(page)) continue;
    const html = fs.readFileSync(page, "utf8");
    assert.doesNotMatch(html, /role="tablist" aria-label="(?:players-\d+|hub-boards)"/, `${path.relative(OUT, page)}: tablist named by an id`);
  }
});

test("UXJ-02: a saved Premier League forecast names the fixture home side first, as the match page and the card do", () => {
  const card = (sport) => ({
    id: `${sport}-1`, sport, href: "/x/", startUtc: "2026-10-17T14:00:00Z", context: null,
    away: { name: "Chelsea" }, home: { name: "Everton" },
    forecast: { label: "Match result", value: "Chelsea 44%", sub: null }, signal: null,
    status: { state: "WATCH", family: null }, freshness: { updatedAt: "2026-10-16T12:00:00Z" }, settlement: null,
  });
  const snap = (sport) => snapshotFromCard(card(sport), { savedAt: "2026-10-16T13:00:00Z", sourceRoute: "/epl/match/everton-v-chelsea-2026-10-17/" });
  assert.equal(snap("epl").matchup, "Everton v Chelsea", "the match page's own title, not 'Chelsea v Everton'");
  assert.equal(snap("nfl").matchup, "Chelsea @ Everton", "away @ home is unchanged for the US sports");
  assert.equal(snap("mlb").matchup, "Chelsea @ Everton");
  assert.equal(snap("ufc").matchup, "Chelsea vs Everton");

  // One rule, not two: the snapshot's order is the prediction card's ORDER table, read from its source.
  const order = src("src/components/command-center/prediction-card.tsx").match(/const ORDER[^=]*=\s*(\{[^\n]*\});/);
  assert.ok(order, "POSITIVE CONTROL — the card's ORDER table is still where this test reads it");
  for (const [, sport, first, sep] of order[1].matchAll(/(\w+): \{ first: "(away|home)", sep: "([^"]+)" \}/g)) {
    const m = matchupSides(sport, "A", "H");
    assert.equal(m.first, first === "away" ? "A" : "H", `${sport}: first side`);
    assert.equal(m.sep, sep, `${sport}: separator`);
    assert.equal(matchupLabel(sport, "A", "H"), `${m.first} ${sep} ${m.second}`);
  }
  const button = src("src/components/saved/save-forecast-button.tsx");
  assert.match(button, /const sides = matchupSides\(card\.sport, card\.away\.name, card\.home\.name\)/, "the Save control's name uses the same order");
  assert.doesNotMatch(button, /\$\{card\.away\.name\} and \$\{card\.home\.name\}/, "never hard-wired away-first");
});

test("UXJ-03: every schedule-only Simulate card opens its own sport's hub — the NBA card no longer opens the generic /sports index", () => {
  const today = availableSimulateDates().find((d) => d >= etDayOf(new Date().toISOString())) ?? availableSimulateDates().at(-1);
  const HUB = { mlb: "/mlb", epl: "/epl", ufc: "/ufc", nfl: "/nfl", nba: "/nba" };
  let nbaSeen = 0;
  for (const date of availableSimulateDates()) {
    for (const s of buildSimulateDay(date, { today }).sections) {
      for (const e of s.events) {
        if (e.state !== "SCHEDULE_ONLY") continue;
        if (e.sport === "nba") nbaSeen++;
        assert.notEqual(e.href, "/sports", `${date} ${e.sport} ${e.matchup}: "${e.actionLabel}" opens the generic sports index`);
        if (HUB[e.sport]) assert.equal(e.href, HUB[e.sport], `${date} ${e.sport} ${e.matchup}: schedule-only card opens its hub`);
      }
    }
  }
  const day = src("src/lib/simulate/day-view.ts");
  assert.match(day, /markets: \[\], href: "\/nba", actionLabel: STATE_ACTION\.SCHEDULE_ONLY/, "the NBA composer's destination");
  if (nbaSeen === 0) assert.ok(true, "no NBA game in the window today — the source pin above still holds");
});

test("UXJ-04: the MLB game-record summary names each family with its reader label — never 'run line_posted'", () => {
  assert.equal(mlbGameFamilyLabel("run_line_posted"), "Run line (posted line)");
  assert.equal(mlbGameFamilyLabel("run_line"), "Run line (simulated ±1.5, retired)", "the two run-line records stay distinguishable");
  assert.equal(mlbGameFamilyLabel("some_new_family"), "some new family", "an unknown key is spaced out in full");
  for (const label of Object.values(MLB_GAME_FAMILY_LABEL)) assert.doesNotMatch(label, /_/);
  const rec = JSON.parse(src("public/data/mlb/results/game-predictions-record.json"));
  for (const key of Object.keys(rec.families ?? {})) {
    assert.doesNotMatch(mlbGameFamilyLabel(key), /_/, `${key} renders with an underscore`);
  }
  const index = src("src/app/results/picks/page.tsx");
  assert.doesNotMatch(index, /m\.replace\("_", " "\)/, "a first-underscore-only replace printed 'run line_posted'");
  assert.match(index, /mlbGameFamilyLabel\(m\)/);
  assert.match(src("src/app/results/picks/[sport]/page.tsx"), /mlbGameFamilyLabel\(market\)/, "both surfaces share one label table");
});

test("UXJ-05: a date with a graded NFL game lists it as a settled card instead of reading 'No NFL games on this date'", () => {
  const index = JSON.parse(src("public/data/nfl/index.json"));
  const dates = availableSimulateDates();
  const today = etDayOf(new Date().toISOString());
  let checked = 0;
  for (const e of index.events ?? []) {
    if (e.lifecycle !== "SETTLED") continue;
    const date = etDayOf(e.kickoffUtc);
    if (!dates.includes(date)) continue;
    const nfl = buildSimulateDay(date, { today }).sections.find((s) => s.sport === "nfl");
    const card = nfl.events.find((x) => x.id === `nfl:${e.providerEventId}`);
    assert.ok(card, `${date}: ${e.matchup} was played and graded but is missing from the NFL section`);
    assert.equal(card.state, "SETTLED");
    assert.equal(card.actionLabel, STATE_ACTION.SETTLED);
    assert.equal(card.href, "/results/nfl/", "the graded outcome is on the NFL results record");
    assert.doesNotMatch(nfl.note ?? "", /^No NFL games on this date/, `${date}: the empty note contradicts a played game`);
    checked++;
  }
  // Vacuous only when no graded NFL game falls inside the 14-day lobby window (the off-season); the source pin holds.
  const day = src("src/lib/simulate/day-view.ts");
  assert.match(day, /e\.lifecycle === "SETTLED" && !eligibleIds\.has\(String\(e\.providerEventId\)\)/, "graded games join the NFL section");
  assert.match(day, /for \(const e of \[\.\.\.\(elig\.events \?\? \[\]\), \.\.\.graded\]\)/, "through the one loop, so postStartState still decides the state");
  assert.match(day, /href: post === "SETTLED" \? "\/results\/nfl\/"/);
  assert.ok(checked >= 0);
});
