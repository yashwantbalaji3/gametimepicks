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
  for (const href of ["/nfl/", "/mlb/", "/epl/", "/ufc/"]) assert.ok(src.includes(`href: "${href}"`), `chooser links ${href}`);
  const fn = src.slice(src.indexOf("function SportChooser"), src.indexOf("export default"));
  assert.match(fn, /crossSportToday\(/, "the dated count comes from the cross-sport owner");
  assert.match(fn, /nextEventUtc/, "the next event comes from the product day");
  const literalText = fn.replace(/\$\{[^}]*\}/g, "");  // template ${expressions} are code, not reader text
  assert.doesNotMatch(literalText, /["'`][^"'`\n]*\b(today|live)\b[^"'`\n]*["'`]/i, "no chooser string says today or live");
  assert.match(src, /<h1[^>]*>Sports<\/h1>/, "the page is named for the nav item that leads here");
});
