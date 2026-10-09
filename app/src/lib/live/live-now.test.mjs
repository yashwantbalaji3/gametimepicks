/**
 * LIVE NOW guards (founder UX decision 2026-10-08 — live games first on Home and the hubs): only games the gateway
 * states are in play are shown, nothing is derived or invented, the strip renders nothing otherwise, it links only to
 * pages that exist in the export, and Home + the NFL and MLB hubs mount it ahead of their other content.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";

globalThis.React = React;
const { inPlayEvents } = await import("../../components/live/live-now-strip.tsx");
const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

const ev = (o) => ({ providerEventId: o.id, state: o.state, period: { label: o.label ?? null }, competitors: { away: { abbr: "TB", name: "Tampa Bay Buccaneers", score: o.a ?? 0 }, home: { abbr: "DAL", name: "Dallas Cowboys", score: o.h ?? 0 } } });

test("only games in play (LIVE or DELAYED) are shown — scheduled, final and unknown never are", () => {
  const got = inPlayEvents("nfl", { events: [ev({ id: "1", state: "LIVE", label: "13:20 - 2nd", a: 7, h: 7 }), ev({ id: "2", state: "PRE" }), ev({ id: "3", state: "FINAL" }), ev({ id: "4", state: "DELAYED" }), ev({ id: "5", state: "UNKNOWN" })] });
  assert.deepEqual(got.map((g) => g.providerEventId), ["1", "4"]);
  assert.equal(got[0].label, "13:20 - 2nd", "the period is the source's own label");
  assert.equal(got[0].away.score, 7);
});

test("an unreadable or empty payload shows nothing and invents nothing", () => {
  assert.deepEqual(inPlayEvents("mlb", null), []);
  assert.deepEqual(inPlayEvents("mlb", { events: "nope" }), []);
  const noScore = inPlayEvents("nfl", { events: [{ ...ev({ id: "9", state: "LIVE" }), competitors: { away: { abbr: "TB", name: "TB", score: null }, home: { abbr: "DAL", name: "DAL", score: undefined } } }] });
  assert.equal(noScore[0].away.score, null, "a missing score stays missing, never 0");
  assert.equal(noScore[0].home.score, null);
});

test("the strip renders nothing when no game is live, polls slowly, and only while the tab is visible", () => {
  const src = read("src/components/live/live-now-strip.tsx");
  assert.match(src, /if \(!games\.length\) return null;/);
  assert.match(src, /const POLL_MS = 60_000;/);
  assert.match(src, /document\.visibilityState === "hidden"/);
  assert.match(src, /liveReadyFor\(s\)/, "gated by the same live switch as every live surface");
  assert.doesNotMatch(src, /winProbability|liveProbability|projectedFinish/, "no live model output");
});

test("links go only to pages that exist in this export", () => {
  const src = read("src/components/live/live-now.tsx");
  assert.match(src, /loadForecastViews\(/, "NFL pages from the forecast view (the same set the game route builds)");
  assert.match(src, /buildHubRoster\(\)\.games/, "MLB pages from the live roster's canonical hrefs");
  assert.match(read("src/components/live/live-now-strip.tsx"), /\{href \? <Link href=\{href\}/, "no page, no forecast link");
});

test("Home and the NFL and MLB hubs mount Live Now ahead of their other content", () => {
  const home = read("src/app/page.tsx");
  assert.ok(home.indexOf("<LiveNow sports={[\"nfl\", \"mlb\"]} />") > 0 && home.indexOf("<LiveNow") < home.indexOf("<LandingHero"), "Home: before the hero");
  const nfl = read("src/app/nfl/page.tsx");
  assert.ok(nfl.indexOf("<LiveNow sports={[\"nfl\"]} />") > 0 && nfl.indexOf("<LiveNow") < nfl.indexOf("<SportHubNav"), "NFL hub: under the title");
  const mlb = read("src/app/mlb/page.tsx");
  assert.ok(mlb.indexOf("<LiveNow sports={[\"mlb\"]} />") > 0 && mlb.indexOf("<LiveNow") < mlb.indexOf("<SportHubNav"), "MLB hub: under the title");
});

test("a failed later check stops the cards claiming to be live and says the feed is unavailable (founder condition 5)", () => {
  const src = read("src/components/live/live-now-strip.tsx");
  assert.match(src, /if \(results\.some\(\(r\) => r === null\)\) \{ setStale\(true\); return; \}/, "any unreadable sport marks the strip stale");
  assert.match(src, /stale \? "last known" : g\.state === "DELAYED"/, "a stale card says 'last known', never 'live'");
  assert.match(src, /Live feed unavailable — scores last read/, "the status line says so, with the last read time");
  assert.match(src, /setStale\(false\);/, "a successful read clears it");
  assert.match(src, /\.then\(\(p\) => \(p \? inPlayEvents\(s, p\) : null\)\)/, "an unreadable response stays unreadable (null), never an empty \"nothing is live\" list");
});

test("the hub's build-time in-progress group says it is as of the last update (founder condition 4)", () => {
  assert.match(read("src/components/sport-hub/game-summary.tsx"), /heading="In progress at last update"/);
});
