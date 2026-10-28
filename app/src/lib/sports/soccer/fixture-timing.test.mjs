/**
 * P0 10-28 · U7 — a league page never lists a kicked-off match as upcoming, says when its data is stale, and a failed
 * scheduled soccer-leagues run opens a tracking issue. Fixed clocks only; no build needed.
 *
 * Run (from app/): npx tsx --test src/lib/sports/soccer/fixture-timing.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KICKED_OFF_PENDING, STALE_AFTER_HOURS, dataStaleness, fixtureState, partitionFixtures, viewClock } from "./fixture-timing.mjs";

globalThis.React = React;
const { LeagueDataFreshness, LeagueFixtureBoard } = await import("../../../components/soccer/league-fixture-board.tsx");

const APP = process.cwd();
const REPO = path.resolve(APP, "..");
const ms = (iso) => Date.parse(iso);
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");

/* Ligue 1, the 10-26 shape: a file generated Sat 10-25 15:23Z with Sunday's matches still in it. */
const GENERATED = "2026-10-25T15:23:00Z";
const ROWS = [
  { eventId: "a", kickoffUtc: "2026-10-25T19:05:00Z", homeClub: "Lens", awayClub: "Lille" },       // played, graded
  { eventId: "b", kickoffUtc: "2026-10-26T14:00:00Z", homeClub: "Nice", awayClub: "Brest" },       // played, no final yet
  { eventId: "c", kickoffUtc: "2026-10-30T19:45:00Z", homeClub: "Lyon", awayClub: "Nantes" },      // still to play
];
const FINALS = { a: { home: 2, away: 1 } };

test("fixtureState: upcoming strictly before kickoff; at or after kickoff it is FINAL with a result, else KICKED_OFF", () => {
  const k = "2026-10-26T14:00:00Z";
  assert.equal(fixtureState(k, ms(k) - 1), "UPCOMING");
  assert.equal(fixtureState(k, ms(k)), "KICKED_OFF", "at the kickoff instant it is no longer upcoming");
  assert.equal(fixtureState(k, ms(k) + 60_000), "KICKED_OFF");
  assert.equal(fixtureState(k, ms(k) + 60_000, { home: 0, away: 0 }), "FINAL", "a 0–0 final is a final");
  assert.equal(fixtureState(k, ms(k) - 1, { home: 1, away: 0 }), "UPCOMING", "a stray final never moves a future kickoff");
  assert.equal(fixtureState("not a time", ms(k)), "KICKED_OFF", "an unreadable kickoff is never presented as upcoming");
});

test("partitionFixtures at fixed clocks: build clock (before) vs a view two days later", () => {
  const atBuild = partitionFixtures(ROWS, ms(GENERATED), FINALS);
  assert.deepEqual(atBuild.upcoming.map((r) => r.eventId), ["a", "b", "c"]);
  assert.equal(atBuild.started.length, 0);
  const later = partitionFixtures(ROWS, ms("2026-10-27T16:00:00Z"), FINALS);
  assert.deepEqual(later.upcoming.map((r) => r.eventId), ["c"], "the 10-26 symptom: played matches are no longer upcoming");
  assert.deepEqual(later.started.map((s) => [s.row.eventId, s.state, s.final]), [["a", "FINAL", { home: 2, away: 1 }], ["b", "KICKED_OFF", null]]);
});

test("viewClock: the viewer's clock once the page is open, never earlier than the build's", () => {
  const built = ms(GENERATED);
  assert.equal(viewClock(built, built + 48 * 3_600_000), built + 48 * 3_600_000, "two days later the view evaluates two days later");
  assert.equal(viewClock(built, built - 3_600_000), built, "a lagging viewer clock does not rewind");
  assert.equal(viewClock(built, NaN), built);
  /* The view clock is what turns the 10-26 symptom off without a rebuild: same props, later clock, fewer upcoming. */
  assert.equal(partitionFixtures(ROWS, viewClock(built, ms("2026-10-27T16:00:00Z")), FINALS).upcoming.length, 1);
});

test(`dataStaleness: stale strictly beyond ${STALE_AFTER_HOURS} h of the data's own generatedAt; unknown age is stale`, () => {
  const g = ms(GENERATED);
  assert.equal(STALE_AFTER_HOURS, 30);
  assert.equal(dataStaleness(GENERATED, g + 30 * 3_600_000).stale, false, "exactly 30 h is not yet stale");
  assert.equal(dataStaleness(GENERATED, g + 30 * 3_600_000 + 1).stale, true);
  assert.equal(dataStaleness(GENERATED, g + 2 * 3_600_000).stale, false);
  assert.equal(Math.round(dataStaleness(GENERATED, g + 48 * 3_600_000).ageHours), 48);
  assert.equal(dataStaleness(undefined, g).stale, true);
  assert.equal(dataStaleness("garbage", g).stale, true);
});

test("the board's static HTML (build clock) lists only fixtures still to play, and labels started ones", () => {
  const node = (id) => React.createElement("li", { "data-row": id }, `forecast ${id}`);
  const props = { leagueName: "Ligue 1", rows: ROWS, finals: FINALS, rowNodes: { c: node("c"), b: node("b") } };
  const html = renderToStaticMarkup(React.createElement(LeagueFixtureBoard, { ...props, serverNowMs: ms("2026-10-27T16:00:00Z") }));
  assert.match(html, /data-row="c"/, "the match still to play keeps its forecast row");
  assert.doesNotMatch(html, /data-row="b"/, "a kicked-off match never renders as an upcoming forecast row");
  const t = text(html);
  assert.match(t, new RegExp(`Nice v Brest · kicked off .*? ET · ${KICKED_OFF_PENDING}`));
  assert.match(t, /Lens v Lille · kicked off .*? ET · Full time 2–1/);
  /* A row without a server node (it had kicked off at build) is never promoted to upcoming, even on a lagging clock. */
  const early = renderToStaticMarkup(React.createElement(LeagueFixtureBoard, { ...props, serverNowMs: ms(GENERATED) }));
  assert.doesNotMatch(early, /data-row="a"/);
  assert.match(text(early), /Lens v Lille · kicked off/);
  /* Everything played: the board says there is nothing to play rather than showing an empty or stale list. */
  const done = text(renderToStaticMarkup(React.createElement(LeagueFixtureBoard, { ...props, serverNowMs: ms("2026-11-05T00:00:00Z") })));
  assert.match(done, /No Ligue 1 fixtures in the next eight days/);
});

test("the stale banner renders past 30 h with the last update in ET, and not before", () => {
  const fresh = renderToStaticMarkup(React.createElement(LeagueDataFreshness, { leagueName: "Ligue 1", generatedAt: GENERATED, serverNowMs: ms(GENERATED) + 29 * 3_600_000 }));
  assert.equal(fresh, "");
  const stale = renderToStaticMarkup(React.createElement(LeagueDataFreshness, { leagueName: "Ligue 1", generatedAt: GENERATED, serverNowMs: ms("2026-10-27T16:00:00Z") }));
  assert.match(stale, /role="status"/);
  assert.match(text(stale), /Ligue 1 data is out of date\. It was last updated Oct 25, 2026, 11:23 AM ET, more than 30 hours ago/);
});

test("the league page wires both: build-clock split, the client board and the banner (every /soccer/<league> page)", () => {
  const page = fs.readFileSync(path.join(APP, "src/components/soccer/league-forecast-page.tsx"), "utf8");
  assert.match(page, /const upcomingAtBuild = partitionFixtures\(rows, serverNowMs, finals\)\.upcoming;/);
  assert.match(page, /<LeagueFixtureBoard\b/);
  assert.match(page, /<LeagueDataFreshness leagueName=\{name\} generatedAt=\{set\.generatedAt\}/);
  assert.match(page, /rowNodes=\{Object\.fromEntries\(upcomingAtBuild\.map/, "forecast rows render only for fixtures still to play at build time");
  assert.doesNotMatch(page, /\(set\?\.rows \?\? \[\]\)\.map\(\(r\) => <FixtureRow|days\.map\(\(d\) =>/, "no unfiltered fixture list remains");
  const board = fs.readFileSync(path.join(APP, "src/components/soccer/league-fixture-board.tsx"), "utf8");
  assert.match(board, /^"use client";/, "the board re-evaluates in the browser");
  assert.match(board, /setNow\(viewClock\(serverNowMs, Date\.now\(\)\)\)/, "at the viewer's clock, never earlier than the build's");
  assert.match(board, /setInterval\(tick, 60_000\)/, "and keeps re-evaluating while open");
});

test("🔴 soccer-leagues: a failed scheduled run opens or updates ONE tracking issue; only issues:write was added", () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/soccer-leagues.yml"), "utf8");
  const perms = /^permissions:\n((?: {2}.*\n|\s*#.*\n)+)/m.exec(wf)?.[1] ?? "";
  const keys = [...perms.matchAll(/^ {2}([a-z-]+):\s*(\S+)/gm)].map((m) => `${m[1]}: ${m[2]}`);
  assert.deepEqual(keys, ["contents: write", "issues: write"], "exactly contents: write (unchanged) plus issues: write");
  assert.doesNotMatch(wf.replace(/^permissions:[\s\S]*?\njobs:/m, ""), /^\s+permissions:/m, "no job-level permission change");
  const step = wf.slice(wf.indexOf("- name: Open or update the tracking issue"));
  assert.ok(wf.indexOf("- name: Open or update the tracking issue") > wf.indexOf("- name: Commit and push"), "the step is last");
  assert.match(step, /if: failure\(\) && github\.event_name == 'schedule'/, "runs only when a scheduled run failed");
  assert.match(step, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(step, /gh issue list --state open --search 'soccer-leagues scheduled run failing in:title'/);
  assert.match(step, /gh issue comment "\$n"/);
  assert.match(step, /gh issue create --title "soccer-leagues scheduled run failing"/);
  assert.doesNotMatch(step, /git (add|commit|push)|node scripts\//, "the failure step publishes nothing");
  /* What and when the job commits is unchanged. */
  assert.match(wf, /- cron: "15 9 \* \* \*"/);
  assert.match(wf, /- cron: "0 15 \* \* 5"/);
  assert.match(wf, /- cron: "0 9 \* \* 6,0"/);
  assert.match(wf, /git add data\/internal\/research\/soccer\/\*\/corpus-openfootball-v1\.json data\/internal\/research\/soccer\/\*\/history-openfootball-v1\.json app\/public\/data\/soccer\/ 2>\/dev\/null \|\| true/);
  assert.equal((wf.match(/git commit /g) ?? []).length, 1);
});
