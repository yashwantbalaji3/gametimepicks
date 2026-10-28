/**
 * W9 · MIL@TB Oct 27 (first pitch 2026-10-28T00:00Z): the game page showed "Final 3–4 · grading pending" while
 * /simulate/d/2026-10-27 said "no final is recorded yet", and the homepage still featured it ("MIL wins 65% …")
 * the morning after. The homepage now features only games that have not started; the day view's STARTED
 * sentence claims only what it knows.
 *
 * Run: cd app && npx tsx --test src/lib/home/featured-pregame-only.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { featuredSimulations, featuredStartUtc } from "../simulate-lobby-featured.ts";
import { POST_START_PHRASE } from "../simulate/lifecycle-state.mjs";

const APP = process.cwd();
const code = (p) => fs.readFileSync(path.join(APP, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const mlb = (slug, date, firstPitch) => ({
  sport: "mlb", slug, date, gameCenter: firstPitch === undefined ? undefined : { firstPitch },
  gameLabSimulation: { status: "ready", teams: { home: "Tampa Bay Rays", away: "Milwaukee Brewers" }, runCount: 10000, allowsRunCountClaim: true, generatedPicks: [{ edgePct: 3 }], simulationSummary: null },
});
const MIL_TB = mlb("mil-vs-tb-2026-10-27", "2026-10-27", "2026-10-28T00:00:00Z");

test("the start comes from the detail's own data (game center, else the full-game simulation)", () => {
  assert.equal(featuredStartUtc(MIL_TB), "2026-10-28T00:00:00Z");
  assert.equal(featuredStartUtc({ fullGameSim: { firstPitch: "2026-08-14T23:00Z" } }), "2026-08-14T23:00Z");
  assert.equal(featuredStartUtc({}), null);
});

test("🔴 after first pitch the homepage features nothing — no archive card, empty state", () => {
  const r = featuredSimulations([MIL_TB], "2026-10-28", { pregameAt: "2026-10-28T04:20:00Z" });
  assert.deepEqual(r.featured, []);
  assert.equal(r.readyCount, 0);
  /* Without the option the shared selector keeps its archive fallback (the lobby's behaviour is unchanged). */
  assert.equal(featuredSimulations([MIL_TB], "2026-10-28").featured.length, 1);
});

test("before first pitch it is featured, with its start for the reader-clock gate; an unknown start is not", () => {
  const r = featuredSimulations([MIL_TB, mlb("x-vs-y-2026-10-27", "2026-10-27", undefined)], "2026-10-27", { pregameAt: "2026-10-27T22:00:00Z" });
  assert.deepEqual(r.featured.map((f) => f.slug), ["mil-vs-tb-2026-10-27"]);
  assert.equal(r.featured[0].startUtc, "2026-10-28T00:00:00Z");
  assert.equal(r.allCurrent, true);
  /* At first pitch exactly, it is started. */
  assert.equal(featuredSimulations([MIL_TB], "2026-10-27", { pregameAt: "2026-10-28T00:00:00Z" }).featured.length, 0);
});

test("the homepage uses the pregame option, and each card re-checks on the reader's clock", () => {
  assert.match(code("src/app/page.tsx"), /featuredSimulations\(details, currentEtDate\(\), \{ pregameAt: buildAsOfIso\(\) \}\)/);
  const section = code("src/components/home/featured-simulations.tsx");
  assert.match(section, /<HideOnceStarted key=\{s\.slug\} startUtc=\{s\.startUtc\}>/);
  assert.match(section, /<WhenAllStarted starts=\{featured\.map\(\(s\) => s\.startUtc\)\}>\{emptyState\}<\/WhenAllStarted>/);
  const gate = code("src/components/home/featured-start-gate.tsx");
  assert.match(gate, /legHasStarted\(startUtc, now\)/);
});

test("the day view's STARTED sentence never claims the absence of a final it does not read", () => {
  assert.doesNotMatch(POST_START_PHRASE.STARTED, /no final/i);
  assert.match(POST_START_PHRASE.STARTED, /^Started — not graded yet\./);
  assert.match(POST_START_PHRASE.AWAITING_SETTLEMENT, /grading against the official result is pending/);
});
