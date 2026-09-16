/**
 * /live HUB TESTS (v1.1.1 · §16 hub).
 *
 * The hub's two load-bearing properties are cheap to break and invisible when broken:
 *   1. it can only ever ask for MLB, and
 *   2. it asks ONCE for the whole slate, not once per card.
 *
 * Both are asserted against the real owners rather than against a description of them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { planRequest, publicSports, upstreamUrls } from "../../../api/_live-core.mjs";
import { derivePresentationState, hubGroupFor } from "./lifecycle.mjs";
import { codeOnly, jsxElement, renderedStrings } from "./testing/source-scan.mjs";

const APP = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");

/* ───────────── 1 · the hub cannot reach NFL ───────────── */

test("HUB 1 · ⚠ nothing the hub can ask for produces an NFL upstream call", () => {
  const allowed = publicSports({}); // production default
  assert.deepEqual(allowed, ["mlb"]);

  // The only request the hub makes, under the production allowlist.
  const plan = planRequest({ sport: "mlb" }, allowed);
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, "scoreboard");
  const urls = upstreamUrls(plan);
  assert.match(urls.scoreboard, /^https:\/\/statsapi\.mlb\.com\//);
  assert.equal(urls.summary, null, "the hub never triggers the heavy per-event summary call");
  assert.equal(JSON.stringify(urls).includes("espn"), false);

  // And the hub's own code cannot name another sport.
  const hook = codeOnly(read("src/components/live/use-live-slate.ts"));
  const hub = codeOnly(read("src/components/live/live-hub.tsx"));
  assert.equal(/["'`]nfl["'`]/i.test(hook + hub), false, "no hub source may name another sport");
  const el = jsxElement(read("src/app/live/page.tsx"), "LiveHub");
  assert.ok(el, "the hub is mounted — otherwise this guard is vacuous");
  assert.equal(/sport=/.test(el), false, "the page passes no sport; the hook is typed to mlb");
});

test("HUB 2 · the hub asks in BATCH mode — one request for the slate, never one per card", () => {
  const hook = codeOnly(read("src/components/live/use-live-slate.ts"));
  // liveUrl is called with sport only — no `event`, which is what would make it per-card.
  assert.match(hook, /liveUrl\(\{\s*sport\s*\}\)/, "the slate hook requests the batch scoreboard");
  assert.equal(/liveUrl\([^)]*event/.test(hook), false, "an event parameter would defeat batching and the CDN");

  // The card component performs no fetching at all.
  const hub = codeOnly(read("src/components/live/live-hub.tsx"));
  assert.equal(/\bfetch\s*\(/.test(hub), false, "a card must not fetch");
  assert.equal(/useLiveEvent/.test(hub), false, "the per-event hook must not be used by the hub");
  // Exactly one polling hook is used on the hub.
  assert.equal((hub.match(/useLiveSlate\(/g) || []).length, 1);
});

/* ───────────── 2 · grouping ───────────── */

const env = (state) => ({ state, competitors: { home: {}, away: {} } });
const groupOf = (providerState, settlement = null) =>
  hubGroupFor(derivePresentationState({ envelope: env(providerState), settlement }).state);

test("HUB 3 · each provider state lands in the intended hub group", () => {
  assert.equal(groupOf("LIVE"), "LIVE_NOW");
  assert.equal(groupOf("DELAYED"), "LIVE_NOW");
  assert.equal(groupOf("PRE"), "UPCOMING");
  assert.equal(groupOf("UNKNOWN"), "UPCOMING");
  assert.equal(groupOf("FINAL"), "FINAL_TODAY");
  assert.equal(groupOf("FINAL", { actual: { homeRuns: 1, awayRuns: 2 } }), "FINAL_TODAY");
  assert.equal(groupOf("POSTPONED"), "FINAL_TODAY");
  assert.equal(groupOf("CANCELLED"), "FINAL_TODAY");
});

test("HUB 4 · ⚠ a postponed or cancelled game never becomes a fake score or a fake final", () => {
  for (const s of ["POSTPONED", "CANCELLED"]) {
    const d = derivePresentationState({ envelope: env(s), settlement: null });
    assert.equal(d.state, s, "it keeps its own state rather than collapsing into FINAL");
    assert.equal(d.isCanonicallyGraded, false);
  }
  // The card renders an em dash for an absent score — never 0.
  const hub = read("src/components/live/live-hub.tsx");
  assert.match(hub, /score === null \? "—"/, "an absent score renders as an em dash");
});

/* ───────────── 3 · what the hub must not show ───────────── */

test("HUB 5 · ⚠ no combined MLB total and no player projection row reaches the hub", () => {
  /*
   * Scanned over CODE + RENDERED COPY, never comments. The first version read the raw files and
   * failed on `hub-data.ts`'s own comment explaining that `projectMlbForecast` OMITS totalRuns —
   * the documentation of the rule reported as a violation of it. Same trap as the Stage 2 banned-
   * phrase guard; the shared scanner exists precisely for it.
   */
  const hubSrc = read("src/components/live/live-hub.tsx");
  const hub = codeOnly(hubSrc) + "\n" + renderedStrings(hubSrc);
  for (const forbidden of ["totalRuns", "over/under", "Total runs", "o/u"]) {
    assert.equal(hub.toLowerCase().includes(forbidden.toLowerCase()), false, `the hub must not carry ${forbidden}`);
  }
  const rosterSrc = read("src/lib/live/hub-data.ts");
  const roster = codeOnly(rosterSrc) + "\n" + renderedStrings(rosterSrc);
  assert.match(rosterSrc, /projectMlbForecast/, "the roster projects through the totals-omitting owner");
  assert.equal(/totalRuns/.test(roster), false, "the paused market's field never reaches the roster's code");
  // No player-level anything on the hub.
  assert.equal(/playerStats|playerBoard|joinNflPlayerBoard/.test(hub), false, "the hub shows no player rows");
});

test("HUB 6 · no forbidden prediction vocabulary in rendered hub copy", () => {
  const strings = renderedStrings(read("src/components/live/live-hub.tsx")) + "\n" +
                  renderedStrings(read("src/app/live/page.tsx"));
  assert.ok(strings.length > 500, "rendered copy was extracted — otherwise this guard is vacuous");
  for (const rx of [/\bon pace\b/i, /\bon track\b/i, /\blive win probability\b/i, /\bchance to hit\b/i, /\blive edge\b/i, /\bcash\b/i, /\block\b(?!ed|s\b)/i]) {
    assert.equal(rx.test(strings), false, `hub copy matches forbidden ${rx}`);
  }
  // Mutation probe: the scan must still catch a real violation.
  assert.equal([/\bon pace\b/i].some((rx) => rx.test(renderedStrings('const a = "he is on pace";'))), true);
});

/* ───────────── 4 · roster owner ───────────── */

test("HUB 7 · the roster carries NO present-tense claim", () => {
  const roster = read("src/lib/live/hub-data.ts");
  // A static artifact must not assert whether a game has started — that ages into a lie (Phase 6).
  assert.equal(/\bisLive\b|\bhasStarted\b|\bisFinal\b|\bstarted:/.test(roster), false,
    "the roster must carry no field asserting the present");
  assert.match(roster, /firstPitch/, "it carries the SCHEDULE fact instead");
});

test("HUB 8 · the roster links only to canonical game URLs, resolved by id not by slug parsing", () => {
  const roster = read("src/lib/live/hub-data.ts");
  assert.match(roster, /gameHrefByMatchId\("mlb", gamePk\)/,
    "resolved through the route owner's own id lookup — slug parsing silently produced an empty hub");
  const hub = read("src/components/live/live-hub.tsx");
  assert.match(hub, /href=\{game\.href\}/, "cards link to the roster's canonical href");
  assert.equal(/href="\/games\//.test(hub), false, "no hand-built game URL");
});

test("HUB 9 · the real roster resolves today's slate to real canonical hrefs", async () => {
  const { buildHubRoster } = await import("./hub-data.ts");
  const r = buildHubRoster();
  assert.equal(typeof r.etDate, "string");
  if (!r.slateArtifactPresent) return; // an overnight tree legitimately has no slate
  for (const g of r.games) {
    assert.match(g.href, /^\/games\/mlb\/[a-z0-9-]+$/, `${g.gamePk} has a canonical href`);
    assert.match(g.gamePk, /^\d+$/);
    assert.equal(typeof g.matchup, "string");
    // Absent is null, never zero or a placeholder.
    if (g.forecast === null) assert.equal(g.forecast, null);
    if (g.settlement === null) assert.equal(g.settlement, null);
  }
});

/* ───────────── 5 · empty + failure states ───────────── */

test("HUB 10 · every empty/failure state has intentional copy", () => {
  const hub = read("src/components/live/live-hub.tsx");
  for (const phrase of [
    "Live tracking is currently turned off",      // feature disabled
    "Live data is unavailable right now",          // provider refusal
    "No MLB slate has been published",             // artifact missing
    "No MLB games are scheduled",                  // genuinely no games
    "Checking the live feed",                      // first load
    "Live feed delayed",                           // stale
  ]) {
    assert.ok(hub.includes(phrase), `missing intentional state copy: "${phrase}"`);
  }
  // A refusal must not blank the hub — the roster still renders.
  assert.match(hub, /Scheduled games and frozen forecasts below are unaffected/);
});

test("HUB 11 · the feature-disabled path issues no request and does not retry", () => {
  const hook = codeOnly(read("src/components/live/use-live-slate.ts"));
  assert.match(hook, /if \(!liveReadyFor\(sport\)\)/, "the flag is checked before the first fetch");
  // The guard returns before scheduling anything, so a disabled feature cannot spin.
  const idx = hook.indexOf("liveReadyFor(sport)");
  const pollIdx = hook.indexOf("void poll()");
  assert.ok(idx > 0 && pollIdx > idx, "the flag check precedes the first poll");
});

test("HUB 12 · the hub does not announce itself on a timer", () => {
  // §11: a scoreboard re-announcing every 30s is hostile. State lives in each card's name instead.
  // Code only: the module comment DOCUMENTS the absence of aria-live, and a raw scan read that
  // documentation as the violation it forbids.
  const hub = codeOnly(read("src/components/live/live-hub.tsx"));
  assert.equal(/aria-live/.test(hub), false, "no aria-live region on a polling scoreboard");
  assert.match(hub, /aria-label=\{label\}/, "state is carried in the card's accessible name");
});

test("HUB 13 · ⚠ a frozen-at stamp never appears for a forecast that does not exist", () => {
  /*
   * Caught in QA on a real PRE game with no publishable simulation: the panel rendered "No GameTime
   * pregame forecast for this game" and then "Forecast frozen at 9:33 AM ET" beneath it — a
   * timestamp for a thing the line above correctly denies. A stamp is a claim about a forecast, so
   * it is gated on one existing.
   */
  const panel = read("src/components/live/live-panel.tsx");
  assert.match(panel, /const hasForecast =/, "the panel decides whether a forecast exists");
  assert.match(panel, /!hasForecast\s*\n?\s*\?\s*undefined/, "no forecast ⇒ no note at all");
  // And the denial copy still exists, so the empty case says something.
  assert.match(panel, /No GameTime pregame forecast for this game/);
});
