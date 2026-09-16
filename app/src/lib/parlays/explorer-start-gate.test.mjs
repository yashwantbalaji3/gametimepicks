/**
 * THE START GATE — a leg for a game already under way must never be offerable (Phase 6).
 *
 * WHAT HAPPENED. `/build/custom` states an eligible-leg count and the explorer loads
 * `data/build/explorer-slate.json`. Both were resolved when the STATIC page was built, and neither
 * surface re-checked afterwards. Measured on production 2026-09-16: the artifact generated 00:06:36Z
 * listed 40 legs whose games began at 00:10:00Z, and at 00:23Z the explorer still rendered them as
 * actionable rows. Separately, the page and the artifact each called `new Date()` in different
 * `next build` workers, so CI saw the page state 137 legs over a file carrying 177 — two evaluations
 * of one question, at two instants, presented as one number.
 *
 * THE CONTRACT THIS PINS.
 *   1. ONE rule — `legHasStarted`, fail-closed on an unknown start — used by the generator
 *      (`eligible-leg.ts`) and re-applied by every reader-facing surface.
 *   2. ONE `asOf` — `buildAsOfIso()` — so the page's pool and the artifact's pool are the same
 *      evaluation by construction, not by luck of worker scheduling.
 *   3. The stated count is the OFFERABLE set, never a larger historical one.
 *
 * DETERMINISTIC BY CONSTRUCTION: every case below injects a frozen instant. Nothing here reads the
 * wall clock, so a partially-started slate is tested at 3am as faithfully as at first pitch.
 *
 * Run: npx tsx --test src/lib/parlays/explorer-start-gate.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { legHasStarted, pregameOnly, isDetailOmitted } from "./explorer-legs.ts";
import { saveEligibility } from "../saved/saved-schema.mjs";

/* A frozen evening: two games at 23:05Z, two at 01:10Z the next day. */
const NOW_ALL_UPCOMING = "2026-09-15T22:00:00Z";
const NOW_PARTIAL = "2026-09-15T23:30:00Z"; // the 23:05 games are under way; the 01:10 games are not
const NOW_OVERNIGHT = "2026-09-16T04:00:00Z"; // everything has started

const leg = (legId, startTime, extra = {}) => ({ legId, sport: "MLB", startTime, participant: legId, market: "Hits", odds: -110, ...extra });
const omitted = (legId, startTime) => ({ legId, sport: "MLB", detailOmitted: true, startTime });

const SLATE = [
  leg("early-1", "2026-09-15T23:05:00Z"),
  leg("late-1", "2026-09-16T01:10:00Z"),
  omitted("early-2", "2026-09-15T23:05:00Z"),
  omitted("late-2", "2026-09-16T01:10:00Z"),
];

test("the rule is fail-closed: an unknown or unparseable start counts as STARTED", () => {
  assert.equal(legHasStarted(null, NOW_PARTIAL), true, "null start cannot be proven pre-event");
  assert.equal(legHasStarted(undefined, NOW_PARTIAL), true);
  assert.equal(legHasStarted("", NOW_PARTIAL), true);
  assert.equal(legHasStarted("not-a-date", NOW_PARTIAL), true);
  assert.equal(legHasStarted("2026-09-16T01:10:00Z", "also-not-a-date"), true, "an unreadable clock refuses too");
  // A leg exactly at its first pitch has started — the boundary belongs to the game, not the builder.
  assert.equal(legHasStarted("2026-09-15T23:30:00Z", NOW_PARTIAL), true);
  assert.equal(legHasStarted("2026-09-15T23:30:01Z", NOW_PARTIAL), false);
});

test("PARTIALLY STARTED slate · pregame legs appear, started legs do not, and the count is the offerable set", () => {
  const live = pregameOnly(SLATE, NOW_PARTIAL);
  assert.deepEqual(live.map((l) => l.legId), ["late-1", "late-2"], "only the not-yet-started legs survive, in order");
  assert.equal(live.length, 2, "the count the page states is this set's length");
  for (const l of live) assert.equal(legHasStarted(l.startTime, NOW_PARTIAL), false, `${l.legId} must be pre-event`);
  assert.ok(!live.some((l) => l.legId.startsWith("early")), "a game already under way is never offerable");
  // The identity-only rows are gated by the same rule, so a started leg cannot survive as a COUNT.
  assert.equal(live.filter(isDetailOmitted).length, 1, "an omitted row that is still pregame keeps counting");
});

test("ENTIRELY UPCOMING slate · nothing is withheld", () => {
  const live = pregameOnly(SLATE, NOW_ALL_UPCOMING);
  assert.equal(live.length, SLATE.length);
  assert.deepEqual(live.map((l) => l.legId), ["early-1", "late-1", "early-2", "late-2"], "order preserved");
});

test("OVERNIGHT · every game has started, so the pool is honestly empty rather than stale", () => {
  const live = pregameOnly(SLATE, NOW_OVERNIGHT);
  assert.deepEqual(live, [], "an aged artifact offers nothing at all");
  assert.equal(live.length, 0, "and the stated count is 0, not the artifact's historical total");
});

test("an omitted row without a start time fails closed — it can never pad the count", () => {
  const withNullStart = [...SLATE, omitted("unknown-start", null)];
  const live = pregameOnly(withNullStart, NOW_PARTIAL);
  assert.ok(!live.some((l) => l.legId === "unknown-start"), "unprovable rows are excluded, not assumed pregame");
});

/* ── THE WIRING: one rule, one asOf, and the surfaces that must use them ────────────────────────── */

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
/* Strip comments first: this fix is DOCUMENTED in the files it touches, and a scan that cannot tell an
   explanation from code fails on the sentence describing the bug it prevents. Sixth time in this repo. */
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

test("THE RULE HAS ONE HOME — the generator imports it rather than defining its own", () => {
  const gen = code("src/lib/parlays/eligible-leg.ts");
  assert.match(gen, /import \{ legHasStarted \} from "\.\/explorer-legs"/, "the generator uses the shared rule");
  assert.ok(!/function eventStarted\s*\(/.test(gen), "no private copy of the start rule may return here");
  assert.match(gen, /legHasStarted\(startTime, ctx\.nowIso\)/, "eligibility is still resolved at generation time");
});

test("BOTH the page and the artifact resolve their pool at the SAME build instant", () => {
  const page = code("src/app/build/custom/page.tsx");
  const route = code("src/app/data/build/explorer-slate.json/route.ts");
  for (const [name, s] of [["page", page], ["route", route]]) {
    assert.match(s, /buildAsOfIso\(\)/, `${name} must resolve the build's one asOf`);
    assert.match(s, /loadTodaySlate\(undefined, asOf\)/, `${name} must load the slate at that asOf`);
    assert.ok(!/loadTodaySlate\(\)/.test(s), `${name} must not load the slate at an unpinned "now"`);
  }
  assert.match(route, /asOf,/, "the artifact publishes the instant its gate was resolved");
});

test("EVERY reader-facing surface re-applies the gate on the reader's clock", () => {
  const explorer = code("src/components/parlays/parlays-explorer.tsx");
  assert.match(explorer, /pregameOnly\(slate\.eligibleLegs, nowIso\)/, "the explorer filters the artifact's legs");
  assert.ok(!/slate\.eligibleLegs\.filter\(\(l\) => l\.sport === sport\)/.test(explorer), "sport lists read the LIVE set");
  assert.ok(!/s\.eligibleCount/.test(explorer), "no tab or empty state may quote the artifact's build-time count");

  const builder = code("src/components/build-experience.tsx");
  assert.match(builder, /pregameOnly\(hydrateBuildLegs\(poolAtoms\), nowIso\)/, "the builder pool is re-gated too");

  const lazy = code("src/components/parlays/lazy-parlays-explorer.tsx");
  assert.match(lazy, /pregameOnly\(body\.slate\.eligibleLegs/, "the stated count is recomputed once the artifact arrives");
  assert.match(lazy, /\{statedCount\}/, "and the summary prints that count, not the build-time one");
});

test("the start time TRAVELS — on rendered rows and on identity-only rows alike", () => {
  const loader = code("src/lib/parlays/ui-loader.ts");
  assert.match(loader, /detailOmitted: true as const, startTime: l\.startTime \?\? null/, "omitted rows carry their start");
  const atoms = code("src/lib/build-legs.ts");
  assert.match(atoms, /a\.startTime = l\.startTime/, "builder atoms carry their start");
});

test("NO EXISTING GUARD WAS WEAKENED — the save gate still refuses a started event", () => {
  const card = { id: "x", sport: "mlb", signal: { kind: "PROBABILITY" }, away: { name: "A" }, home: { name: "H" },
    forecast: { label: "Winner", value: "H 60%" }, startUtc: "2026-09-15T23:05:00Z", lifecycle: "PREGAME" };
  assert.equal(saveEligibility(card, NOW_ALL_UPCOMING).ok, true, "a pregame card is still saveable");
  assert.equal(saveEligibility(card, NOW_PARTIAL).reason, "STARTED", "a started card is still refused");
  assert.equal(saveEligibility({ ...card, signal: { kind: "NONE" } }, NOW_ALL_UPCOMING).reason, "NO_CALL");
});
