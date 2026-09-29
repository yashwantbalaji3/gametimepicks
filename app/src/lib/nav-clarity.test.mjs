/**
 * #797 PR B · navigation a first-time reader can trust: one destination per word, no stale notes, and a
 * Sports primary that is a switcher first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { NAV_DESTINATIONS } from "./navigation.ts";

test("🔴 one destination per word: no two main-nav destinations share 'Picks'", () => {
  const now = NAV_DESTINATIONS.filter((d) => d.group === "now");
  const picks = now.filter((d) => /\bPicks\b/.test(d.label));
  assert.deepEqual(picks.map((d) => d.href), ["/markets"], "only the picks destination is called Picks");
  assert.equal(NAV_DESTINATIONS.find((d) => d.href === "/build")?.label, "Parlays", "/build is Parlays on every surface");
});

test("🔴 no nav note makes a claim that a static list cannot keep true (which sports are live, whether a season is on)", () => {
  const live = NAV_DESTINATIONS.find((d) => d.href === "/live");
  assert.ok(live && !/\b(MLB|NFL|EPL|UFC|NBA)\b/.test(live.note ?? ""), `Live's note names no sport (got ${JSON.stringify(live?.note)})`);
  for (const d of NAV_DESTINATIONS) {
    assert.ok(!/^live$|\blive now\b|\bin season\b/i.test(d.note ?? ""), `${d.href} note "${d.note}" is a season/liveness claim`);
  }
});

test("🔴 the Sports primary leads with the four hubs, each with an ABSOLUTE fact — never 'today' or 'live'", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/sports/page.tsx"), "utf8");
  const chooser = src.indexOf("<SportChooser />"); const coverage = src.indexOf("Schedules and coverage status</h2>");
  assert.ok(chooser > 0 && chooser < coverage, "the chooser renders before the schedule/coverage section");
  const comp = fs.readFileSync(path.join(process.cwd(), "src/components/sports/sport-chooser.tsx"), "utf8");
  for (const href of ["/nfl/", "/mlb/", "/epl/", "/ufc/"]) assert.ok(comp.includes(`href: "${href}"`), `chooser links ${href}`);
  const fn = comp.slice(comp.indexOf("export default function SportChooser"));
  assert.match(fn, /crossSportToday\(/, "the dated count comes from the cross-sport owner");
  assert.match(fn, /nextEventUtc/, "the next event comes from the product day");
  const literalText = fn.replace(/\$\{[^}]*\}/g, "");  // template ${expressions} are code, not reader text
  assert.doesNotMatch(literalText, /["'`][^"'`\n]*\b(today|live)\b[^"'`\n]*["'`]/i, "no chooser string says today or live");
  assert.match(src, /<h1[^>]*>Sports<\/h1>/, "the page is named for the nav item that leads here");
});

test("🔴 /live on a quiet day is not a dead end and makes no schedule claim it cannot keep", () => {
  const tabs = fs.readFileSync(path.join(process.cwd(), "src/components/live/live-sport-tabs.tsx"), "utf8");
  assert.doesNotMatch(tabs, /No games are scheduled/, "the roster holds forecast games only — it cannot say nothing is scheduled");
  assert.match(tabs, /!showNfl && !showMlb \? \(quietDay \?\?/, "the page's quiet-day state renders when neither sport has a card");
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/live/page.tsx"), "utf8");
  const quiet = page.slice(page.indexOf("quietDay={"), page.indexOf("/>", page.indexOf("</div>", page.indexOf("quietDay={"))));
  assert.match(quiet, /<SportChooser /, "the four hubs, each with its dated count or next event");
  for (const href of ["/today/", "/simulate/", "/results/"]) assert.ok(quiet.includes(`href="${href}"`), `quiet day links ${href}`);
  assert.match(quiet, /\{etDayLabel\(nfl\.etDate\)\}/, "the quiet day names its date, so a stale page cannot pass for today");
  assert.doesNotMatch(page, /Live beta · \{nfl\.etDate\}/, "no raw ISO date in the header line");
});
