import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { liveRefreshPlan, LIVE_PROPS_REFRESH_MS } from "./live-refresh-plan.mjs";

const APP = path.resolve(new URL("../../..", import.meta.url).pathname);
const code = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

test("only LIVE games are refreshed; FINAL games once; PRE games never", () => {
  const plan = liveRefreshPlan([
    { id: "401", phase: "PRE", featured: 5 },
    { id: "402", phase: "LIVE", featured: 5 },
    { id: "403", phase: "LIVE", featured: 0 },   // nothing featured — nothing to measure
    { id: "404", phase: "FINAL", featured: 5 },
    { id: "../x", phase: "LIVE", featured: 5 },  // not an event id — never assembled into a URL
  ]);
  assert.deepEqual(plan.poll, ["402"]);
  assert.deepEqual(plan.once, ["404"]);
  assert.deepEqual(liveRefreshPlan([{ id: "401", phase: "PRE", featured: 5 }]), { poll: [], once: [], noProducer: [] }, "a pregame slate fetches nothing");
  assert.ok(LIVE_PROPS_REFRESH_MS >= 30_000, "the shared cadence is bounded");
});

test("a live game whose record did not exist at build is not asked for its record (a guaranteed 404)", () => {
  const plan = liveRefreshPlan([
    { id: "401", phase: "LIVE", featured: 3, producer: false },
    { id: "402", phase: "LIVE", featured: 3, producer: true },
    { id: "403", phase: "FINAL", featured: 2, producer: false },
    { id: "404", phase: "PRE", featured: 2, producer: false },
    { id: "405", phase: "LIVE", featured: 2 },
  ]);
  assert.deepEqual(plan.poll, ["401", "402", "405"], "the gateway half is still read for every live game");
  assert.deepEqual(plan.noProducer, ["401", "403"], "PRE is never fetched; unknown keeps the old behaviour");
});

test("🔴 ONE refresh owner: the page holds the only interval; cards and rows hold none", () => {
  const hub = code("src/components/live/nfl-live-hub.tsx");
  const row = code("src/components/live/featured-forecast-row.tsx");
  const owner = code("src/components/live/use-live-props.ts");
  const card = hub.slice(hub.indexOf("export function NflGameCard"), hub.indexOf("export default function NflLiveHub"));
  assert.ok(card.length > 500, "anti-vacuity: the card body was found");
  for (const [name, src] of [["NflGameCard", card], ["FeaturedForecastRow", row]]) {
    assert.doesNotMatch(src, /setInterval|setTimeout|fetch\(|useLivePropsStore|useNowMs\(/, `${name} must own no timer and make no request`);
  }
  assert.equal((hub.match(/useLivePropsStore\(/g) ?? []).length, 1, "the store is instantiated exactly once, by the page");
  assert.equal((hub.match(/useNowMs\(/g) ?? []).length, 1, "and so is the reader's clock");
  const store = owner.slice(owner.indexOf("export function useLivePropsStore"), owner.indexOf("export function useNowMs"));
  assert.equal((store.match(/setInterval\(/g) ?? []).length, 1, "the owner has exactly one interval for every live game");
  assert.match(store, /if \(ids\.length === 0\) return;/, "and none at all when nothing is live");
  assert.doesNotMatch(owner, /https?:\/\/|espn\.com|espncdn/i, "the browser never talks to ESPN or any other upstream");
  assert.match(owner, /\/data\/nfl\/live-props\/\$\{id\}\.json/, "only the static, CDN-cached record");
});
