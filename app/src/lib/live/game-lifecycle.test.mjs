/**
 * GAME LIFECYCLE TESTS (v1.1.1 · §16 lifecycle).
 *
 * Every input is a literal or a committed artifact; no clock of its own, no network. The rule under
 * test is the one that is easiest to get quietly wrong and impossible to notice from the UI:
 * A PROVIDER "FINAL" IS NOT A SETTLEMENT.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  LIFECYCLE_STATES, LIFECYCLE_LABEL, derivePresentationState, hubGroupFor,
  postgameRunComparison, slateStillMoving,
} from "./lifecycle.mjs";

const env = (state) => ({ state, competitors: { home: {}, away: {} } });
const GRADED = { actual: { homeRuns: 2, awayRuns: 4, winner: "away" }, gradedAt: "2026-09-16T09:58:42Z" };
const FORECAST = { runs: { home: { median: 4, rangeLow: 1, rangeHigh: 8 }, away: { median: 4, rangeLow: 1, rangeHigh: 9 } } };

/* ───────────────────── the transition chain ───────────────────── */

test("LIFE 1 · PRE → LIVE → provider FINAL → SETTLED, in order, from the same inputs", () => {
  const pre = derivePresentationState({ envelope: env("PRE"), settlement: null });
  assert.equal(pre.state, "PRE");
  assert.equal(pre.pollingAllowed, true);

  const live = derivePresentationState({ envelope: env("LIVE"), settlement: null });
  assert.equal(live.state, "LIVE");
  assert.equal(live.pollingAllowed, true);

  // The gap: the feed says it is over, the settlement owner has not spoken.
  const pending = derivePresentationState({ envelope: env("FINAL"), settlement: null });
  assert.equal(pending.state, "FINAL_PENDING_SETTLEMENT");
  assert.equal(pending.label, "Final · grading pending");
  assert.equal(pending.pollingAllowed, false, "a terminal game must stop polling even while ungraded");
  assert.equal(pending.isCanonicallyGraded, false);
  assert.equal(pending.showsPostgameReview, false);

  const settled = derivePresentationState({ envelope: env("FINAL"), settlement: GRADED });
  assert.equal(settled.state, "SETTLED");
  assert.equal(settled.isCanonicallyGraded, true);
  assert.equal(settled.showsPostgameReview, true);
  assert.equal(settled.pollingAllowed, false);
});

test("LIFE 2 · ⚠ a provider FINAL can NEVER produce a graded state on its own", () => {
  // The whole point. Every provider state, with no settlement, must report isCanonicallyGraded false.
  for (const s of ["PRE", "LIVE", "DELAYED", "FINAL", "POSTPONED", "CANCELLED", "UNKNOWN"]) {
    const d = derivePresentationState({ envelope: env(s), settlement: null });
    assert.equal(d.isCanonicallyGraded, false, `${s} must not read as graded`);
    assert.equal(d.showsPostgameReview, false, `${s} must not show a postgame review`);
  }
  // And with no envelope at all.
  assert.equal(derivePresentationState({}).isCanonicallyGraded, false);
});

test("LIFE 3 · settlement outranks the provider — but never for a game that produced no result", () => {
  // A late-arriving grade with a stale PRE envelope still reads settled…
  assert.equal(derivePresentationState({ envelope: env("PRE"), settlement: GRADED }).state, "SETTLED");
  assert.equal(derivePresentationState({ envelope: null, settlement: GRADED }).state, "SETTLED");
  // …but a postponed or cancelled game must not, whatever a stray row says. Fail closed: the
  // postponed-as-0-0-final trap has been paid for once in this repository already.
  for (const s of ["POSTPONED", "CANCELLED"]) {
    const d = derivePresentationState({ envelope: env(s), settlement: GRADED });
    assert.equal(d.state, s, `${s} must survive a stray settlement row`);
    assert.equal(d.isCanonicallyGraded, false);
  }
});

test("LIFE 4 · the frozen forecast is shown in EVERY state — it never disappears", () => {
  for (const s of [...LIFECYCLE_STATES]) assert.ok(LIFECYCLE_LABEL[s], `${s} has a rendered label`);
  for (const s of ["PRE", "LIVE", "DELAYED", "FINAL", "POSTPONED", "CANCELLED", "UNKNOWN", null]) {
    const d = derivePresentationState({ envelope: s ? env(s) : null, settlement: null });
    assert.equal(d.showsFrozenForecast, true, `${s}: the forecast must remain visible`);
  }
});

test("LIFE 5 · exceptional states never settle and never poll", () => {
  for (const s of ["POSTPONED", "CANCELLED"]) {
    const d = derivePresentationState({ envelope: env(s), settlement: null });
    assert.equal(d.pollingAllowed, false);
    assert.equal(d.isCanonicallyGraded, false);
  }
  // UNKNOWN keeps looking, because not knowing is a reason to ask again rather than to give up.
  assert.equal(derivePresentationState({ envelope: env("UNKNOWN"), settlement: null }).pollingAllowed, true);
});

test("LIFE 6 · with Live off entirely the page is still a forecast page, and polls nothing", () => {
  const d = derivePresentationState({ envelope: null, settlement: null });
  assert.equal(d.state, "PRE");
  assert.equal(d.reason, "NO_LIVE_STATE");
  assert.equal(d.pollingAllowed, false, "no envelope means nothing to poll for");
  assert.equal(d.showsFrozenForecast, true);
});

/* ───────────────────── the frozen forecast is not mutated ───────────────────── */

test("LIFE 7 · deriving every state leaves the forecast byte-identical", () => {
  const forecast = structuredClone(FORECAST);
  const before = JSON.stringify(forecast);
  for (const s of ["PRE", "LIVE", "FINAL", "POSTPONED", null]) {
    derivePresentationState({ envelope: s ? env(s) : null, settlement: GRADED });
    postgameRunComparison({ settlement: GRADED, forecast });
  }
  assert.equal(JSON.stringify(forecast), before, "the frozen forecast survives every transition unchanged");
});

/* ───────────────────── the postgame review ───────────────────── */

test("LIFE 8 · the review is DESCRIPTIVE — position against the published band, nothing more", () => {
  const c = postgameRunComparison({ settlement: GRADED, forecast: FORECAST });
  assert.equal(c.away.actual, 4);
  assert.equal(c.away.position, "INSIDE");
  assert.equal(c.home.position, "INSIDE");
  assert.equal(c.gradedAt, "2026-09-16T09:58:42Z");
  /*
   * No accuracy score, grade, probability or edge is EXPRESSIBLE in the returned shape — asserted
   * structurally, by pinning the exact key set at both levels, rather than by substring. The first
   * version of this check scanned the serialized object for "grade" and failed on `gradedAt`, the
   * settlement TIMESTAMP — a probe defect, not a product one, and precisely the class §17 warns
   * about. The key sets below cannot pass if a judgment field is ever added.
   */
  assert.deepEqual(Object.keys(c).sort(), ["away", "gradedAt", "home"]);
  for (const side of ["away", "home"]) {
    assert.deepEqual(Object.keys(c[side]).sort(), ["actual", "position", "rangeHigh", "rangeLow"],
      `${side} carries only the described facts`);
  }
  assert.ok(["BELOW", "INSIDE", "ABOVE"].includes(c.away.position), "position is a direction, not a score");
});

test("LIFE 9 · BELOW / ABOVE are reported honestly", () => {
  const low = postgameRunComparison({ settlement: { actual: { homeRuns: 0, awayRuns: 0 } }, forecast: FORECAST });
  assert.equal(low.home.position, "BELOW");
  const high = postgameRunComparison({ settlement: { actual: { homeRuns: 12, awayRuns: 15 } }, forecast: FORECAST });
  assert.equal(high.away.position, "ABOVE");
  // Band edges are inclusive, matching the player-row rule.
  const edge = postgameRunComparison({ settlement: { actual: { homeRuns: 8, awayRuns: 1 } }, forecast: FORECAST });
  assert.equal(edge.home.position, "INSIDE");
  assert.equal(edge.away.position, "INSIDE");
});

test("LIFE 10 · no forecast, no settlement, or a partial result ⇒ NO review rather than a half one", () => {
  assert.equal(postgameRunComparison({ settlement: GRADED, forecast: null }), null);
  assert.equal(postgameRunComparison({ settlement: null, forecast: FORECAST }), null);
  assert.equal(postgameRunComparison({ settlement: { actual: { homeRuns: 2 } }, forecast: FORECAST }), null);
  assert.equal(postgameRunComparison({ settlement: { actual: {} }, forecast: FORECAST }), null);
  // A game whose family was never publishable has no bands, so it cannot be retroactively reviewed.
  assert.equal(postgameRunComparison({ settlement: GRADED, forecast: { runs: { home: {}, away: {} } } }), null);
});

/* ───────────────────── hub grouping + slate cadence ───────────────────── */

test("LIFE 11 · every lifecycle state lands in exactly one hub group", () => {
  const seen = {};
  for (const s of LIFECYCLE_STATES) {
    const g = hubGroupFor(s);
    assert.ok(["LIVE_NOW", "UPCOMING", "FINAL_TODAY"].includes(g), `${s} → ${g}`);
    seen[g] = true;
  }
  assert.deepEqual(Object.keys(seen).sort(), ["FINAL_TODAY", "LIVE_NOW", "UPCOMING"]);
  assert.equal(hubGroupFor("LIVE"), "LIVE_NOW");
  assert.equal(hubGroupFor("DELAYED"), "LIVE_NOW", "a delayed game is still today's live story");
  assert.equal(hubGroupFor("PRE"), "UPCOMING");
  assert.equal(hubGroupFor("FINAL_PENDING_SETTLEMENT"), "FINAL_TODAY");
  assert.equal(hubGroupFor("SETTLED"), "FINAL_TODAY");
  assert.equal(hubGroupFor("POSTPONED"), "FINAL_TODAY", "an exceptional state surfaces, never hides");
});

test("LIFE 12 · an all-terminal slate stops the hub loop; one live game keeps it", () => {
  assert.equal(slateStillMoving(["FINAL", "FINAL", "FINAL"]), false);
  assert.equal(slateStillMoving(["POSTPONED", "CANCELLED"]), false);
  assert.equal(slateStillMoving(["FINAL", "LIVE"]), true);
  assert.equal(slateStillMoving(["FINAL", "PRE"]), true, "an upcoming game must still be watched for first pitch");
  assert.equal(slateStillMoving(["UNKNOWN"]), true);
  assert.equal(slateStillMoving([]), false, "an empty slate polls nothing");
});

/* ───────────────────── against the real committed artifacts ───────────────────── */

test("LIFE 13 · the settlement owner's real rows drive a real SETTLED transition", () => {
  const app = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const jsonl = path.join(app, "public/data/mlb/results/game-predictions-graded.jsonl");
  const rows = fs.readFileSync(jsonl, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const graded = rows.filter((r) => r?.actual && typeof r.actual.homeRuns === "number");
  assert.ok(graded.length > 100, "the settlement artifact was read — otherwise this proves nothing");

  const row = graded[graded.length - 1];
  const settlement = { actual: row.actual, gradedAt: row.gradedAt ?? null };
  assert.equal(derivePresentationState({ envelope: env("FINAL"), settlement }).state, "SETTLED");
  assert.equal(derivePresentationState({ envelope: env("FINAL"), settlement: null }).state, "FINAL_PENDING_SETTLEMENT");
  // Real rows carry a grading stamp and a named result source — the marks of a canonical result.
  assert.ok(row.gradedAt, "a graded row carries gradedAt");
  assert.equal(row.resultSource, "statsapi-linescore");
});
