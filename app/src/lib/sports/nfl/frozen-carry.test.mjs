/**
 * THE NFL WEEKLY ROLLOVER — a started game stays published while it is still in progress.
 * Pure fixtures, fixture dates (2031), no committed artifact is read.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { selectFrozenReceipts, terminalEventIds, carriedThroughRollover } from "./frozen-carry.mjs";
import { unionFrozenForecasts } from "./public-forecast-union.mjs";

// Week 3's Monday-night game kicks off 2031-09-30T00:15Z; Week 4 starts Thursday.
const MNF = "2031-09-30T00:15:00Z";
const receipt = (id, week, kickoffUtc, generatedAt, extra = {}) => ({
  providerEventId: id, seasonType: 2, week, kickoffUtc, generatedAt, forecastSummary: { projectedScore: { home: 20, away: 17 } }, ...extra,
});
const W3_MNF = receipt("801", 3, MNF, "2031-09-29T21:00:00Z");
const W3_SUN = receipt("790", 3, "2031-09-28T17:00:00Z", "2031-09-28T15:00:00Z");
const WEEK4 = { seasonType: 2, week: 4 };
const WEEK3 = { seasonType: 2, week: 3 };
const pick = (o) => selectFrozenReceipts({ liveIds: new Set(), terminalIds: new Set(), ...o }).map((r) => r.providerEventId);

test("1 · Week N game PRE → normal publication: not frozen (latest.json owns a game that has not started)", () => {
  assert.deepEqual(pick({ receipts: [W3_MNF], currentPeriod: WEEK3, nowIso: "2031-09-29T22:00:00Z" }), []);
  const live = { generatedAt: "G", forecasts: [{ providerEventId: "801" }] };
  assert.deepEqual(unionFrozenForecasts(live, { generatedAt: "G", forecasts: [] }).forecasts.map((f) => f.providerEventId), ["801"]);
});

test("🔴 2 · Week N game LIVE while Week N+1 publishes → it remains in the published set", () => {
  // 00:50Z: 35 minutes into the game, the current week has rolled to 4.
  assert.deepEqual(pick({ receipts: [W3_MNF], currentPeriod: WEEK4, nowIso: "2031-09-30T00:50:00Z" }), ["801"]);
  // …and it is carried exactly as its last PRE-kickoff receipt, never a later one.
  const later = receipt("801", 3, MNF, "2031-09-30T00:20:00Z"); // stamped after kickoff
  const earlier = receipt("801", 3, MNF, "2031-09-29T18:00:00Z");
  const [chosen] = selectFrozenReceipts({ receipts: [earlier, W3_MNF, later], currentPeriod: WEEK4, nowIso: "2031-09-30T00:50:00Z", liveIds: new Set(), terminalIds: new Set() });
  assert.equal(chosen.generatedAt, W3_MNF.generatedAt, "the latest pre-kickoff revision; a post-kickoff receipt is never carried");
});

test("🔴 3 · Week N game reaches a terminal state → no longer carried by the rollover rule", () => {
  const t = (ids) => ({ receipts: [W3_MNF], currentPeriod: WEEK4, nowIso: "2031-09-30T02:00:00Z", terminalIds: new Set(ids) });
  assert.deepEqual(pick(t([])), ["801"], "in progress, not final: carried");
  assert.deepEqual(pick(t(["801"])), [], "final or settled: out");
  assert.deepEqual([...terminalEventIds({ resultsRows: [{ providerEventId: "801", statusRaw: "STATUS_FINAL" }] })], ["801"]);
  assert.deepEqual([...terminalEventIds({ resultsRows: [{ providerEventId: "801", statusRaw: "STATUS_IN_PROGRESS" }] })], []);
  assert.deepEqual([...terminalEventIds({ settledIds: [801] })], ["801"]);
  // No stale survival: with no final ever arriving, the clock bound (NFL_DURATION_HOURS) ends it.
  assert.deepEqual(pick({ receipts: [W3_MNF], currentPeriod: WEEK4, nowIso: "2031-09-30T04:16:00Z" }), [], "past the lifecycle owner's duration: out");
  assert.equal(carriedThroughRollover(W3_SUN, "2031-09-30T00:50:00Z", new Set()), false, "Sunday's week-3 games do not come back");
});

test("4 · Week N+1 future games remain published normally, beside the carried live game", () => {
  const week4 = ["901", "902", "903"].map((id) => ({ providerEventId: id, week: 4 }));
  const live = { generatedAt: "G", forecasts: week4 };
  const frozen = { generatedAt: "G", forecasts: selectFrozenReceipts({ receipts: [W3_MNF, W3_SUN], currentPeriod: WEEK4, nowIso: "2031-09-30T00:50:00Z", liveIds: new Set(week4.map((f) => f.providerEventId)), terminalIds: new Set() }) };
  const merged = unionFrozenForecasts(live, frozen).forecasts.map((f) => f.providerEventId);
  assert.deepEqual(merged, ["901", "902", "903", "801"]);
});

test("🔴 5 · no duplicate event ids across the merged publication set", () => {
  // A receipt whose event is ALSO in the live set (a postponed game republished) is never carried twice,
  // and several revisions of one event collapse to one.
  const revs = [W3_MNF, receipt("801", 3, MNF, "2031-09-29T19:00:00Z"), receipt("801", 3, MNF, "2031-09-29T20:00:00Z")];
  const frozenIds = selectFrozenReceipts({ receipts: [...revs, W3_SUN], currentPeriod: WEEK3, nowIso: "2031-09-30T00:50:00Z", liveIds: new Set(), terminalIds: new Set() }).map((r) => r.providerEventId);
  assert.equal(new Set(frozenIds).size, frozenIds.length);
  const both = selectFrozenReceipts({ receipts: revs, currentPeriod: WEEK4, nowIso: "2031-09-30T00:50:00Z", liveIds: new Set(["801"]), terminalIds: new Set() });
  assert.deepEqual(both, [], "an event already published live is not carried as frozen too");
  const merged = unionFrozenForecasts({ generatedAt: "G", forecasts: [{ providerEventId: "801" }, { providerEventId: "901" }] },
    { generatedAt: "G", forecasts: [{ providerEventId: "801" }, { providerEventId: "790" }] }).forecasts.map((f) => f.providerEventId);
  assert.equal(new Set(merged).size, merged.length, `merged ids unique: ${merged}`);
});

test("unchanged: the current week's started games are carried exactly as before (P295)", () => {
  assert.deepEqual(pick({ receipts: [W3_SUN, W3_MNF], currentPeriod: WEEK3, nowIso: "2031-09-30T00:50:00Z" }), ["790", "801"],
    "a current-week game is carried whatever its lifecycle — only the rollover protection is bounded");
});

test("the builder uses this rule and reads terminal state from the existing owners", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/nfl/build-nfl-public-forecasts.mjs"), "utf8");
  assert.match(src, /selectFrozenReceipts\(\{ receipts, currentPeriod, nowIso: NOW, liveIds, terminalIds \}\)/);
  assert.match(src, /public\/data\/nfl\/results\/latest\.json/);
  assert.match(src, /data\/internal\/nfl\/experimental-settlement/);
  const carry = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/frozen-carry.mjs"), "utf8");
  assert.match(carry, /NFL_DURATION_HOURS/, "the clock bound is the lifecycle owner's, not a new constant");
});

test("/nfl names a carried earlier-week game above the week — facts only, live state sent to /live", () => {
  const hub = fs.readFileSync(path.join(process.cwd(), "src/app/nfl/page.tsx"), "utf8");
  assert.match(hub, /const carriedStarted = indexEvents\.filter\(\(e\) => e\.lifecycle === "STARTED" && !weekIds\.has\(e\.providerEventId\)\);/);
  assert.match(hub, /carriedStarted\.length \? \(/);
  assert.match(hub, /href="\/live\/"/);
  assert.match(hub, /href=\{`\/nfl\/game\/\$\{e\.providerEventId\}\/`\}/);
  const block = hub.slice(hub.indexOf("carriedStarted.length ? ("), hub.indexOf(") : null}", hub.indexOf("carriedStarted.length ? (")));
  assert.doesNotMatch(block, /Live now|in progress|still on/i, "a static page never claims the game is still being played");
});
