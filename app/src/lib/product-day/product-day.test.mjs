/**
 * Product-day authority guards (Program 201 · Release A).
 *
 * One owner answers "what does this sport have today?" for all four registered sports, with typed
 * states a consumer can never infer from an empty array, and counts that EQUAL the canonical
 * artifacts each sport already publishes (rendered-equivalence: adopting the owner cannot change
 * a number a surface shows).
 *
 * Run: npx tsx --test src/lib/product-day/product-day.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildProductDays, productDayFor, PRODUCT_DAY_SCHEMA_VERSION } from "./product-day.ts";
import { loadEplForecasts } from "../sports/epl/forecast-view.ts";

const app = process.cwd();
const dataRoot = path.join(app, "public", "data");
const readJson = (...seg) => JSON.parse(fs.readFileSync(path.join(dataRoot, ...seg), "utf8"));

const STATES = ["LIVE", "EVENT_UPCOMING", "NO_EVENTS", "OFF_SEASON", "SOURCE_STALE", "BLOCKED", "INCIDENT"];

test("four sports registered, every answer typed — no state is ever inferred from an empty array", () => {
  const days = buildProductDays(dataRoot);
  assert.deepEqual(days.map((d) => d.sport), ["mlb", "epl", "ufc", "nfl"], "registration order is activation order");
  for (const d of days) {
    assert.equal(d.schemaVersion, PRODUCT_DAY_SCHEMA_VERSION);
    assert.ok(STATES.includes(d.state), `${d.sport}: state ${d.state} is typed`);
    assert.ok(d.note.length > 0, `${d.sport}: a surface can render the answer in words`);
    if (["SOURCE_STALE", "BLOCKED", "INCIDENT"].includes(d.state)) {
      assert.ok(d.reason, `${d.sport}: a degraded state carries its typed reason`);
    }
    assert.ok(d.events >= d.eligible ? true : false, `${d.sport}: eligible never exceeds events`);
  }
});

test("EQUIVALENCE · epl day equals the lane loader's own current pre-event count", () => {
  const epl = productDayFor("epl", dataRoot);
  const rows = (loadEplForecasts()?.rows ?? []).filter((r) => r.state === "CURRENT_PRE_EVENT");
  assert.equal(epl.events, rows.length, "the owner counts exactly what the lane loader counts");
  if (rows.length > 0) {
    assert.equal(epl.nextEventUtc, rows.map((r) => r.kickoffUtc).filter(Boolean).sort()[0]);
    assert.ok(["LIVE", "EVENT_UPCOMING"].includes(epl.state));
  } else {
    assert.equal(epl.state, "NO_EVENTS");
  }
});

test("EQUIVALENCE · ufc day equals card-latest (bouts, predictions, card date)", () => {
  const ufc = productDayFor("ufc", dataRoot);
  const card = readJson("ufc", "card-latest.json");
  const bouts = card.bouts ?? [];
  const predicted = bouts.filter((b) => b.prediction).length;
  if (ufc.state === "LIVE" || ufc.state === "EVENT_UPCOMING") {
    assert.equal(ufc.events, bouts.length);
    assert.equal(ufc.eligible, predicted);
    assert.equal(ufc.productDate, card.event?.slateDate);
  } else {
    assert.ok(["NO_EVENTS", "INCIDENT"].includes(ufc.state), "a passed or missing card is typed, never a quiet zero");
  }
});

test("EQUIVALENCE · nfl day equals the index's own next window; a PAST kickoff is never upcoming", () => {
  const nfl = productDayFor("nfl", dataRoot);
  const sims = readJson("nfl", "game-simulations", "latest.json");
  const games = (sims.games ?? []).length;
  if (nfl.state === "LIVE" || nfl.state === "EVENT_UPCOMING") {
    assert.equal(nfl.events, games, "an active window counts the simulated slate");
    assert.ok(nfl.nextEventUtc, "an active window names its kickoff");
  } else {
    // P202 intentional difference: simulations for a played slate are history, not product —
    // the stale-index window renders NO_EVENTS with the passed date named, never a live day.
    assert.ok(["EVENT_UPCOMING", "NO_EVENTS", "INCIDENT"].includes(nfl.state));
    assert.equal(nfl.eligible, 0, "a passed window has nothing actionable");
  }
});

test("REGRESSION P224 · a NULL anchor beside a played slate is never 'upcoming'", () => {
  /*
   * P202 added "a PAST kickoff is not upcoming" but asked the question of the ANCHOR, so a null
   * anchor read as "not passed" and the guard went blind in the one case it was written for. On
   * 2026-09-01 the index published nextKickoffUtc: null (its next FORECAST, and none existed)
   * while the sims held CHI @ TEN, played and settled on 08-29 — and /today rendered
   * "1 games simulated · next kickoff unscheduled" for a finished game.
   *
   * Fixtures, not the live tree: the live artifacts are now correct, so only a fixture can hold
   * the shape that broke.
   */
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-productday-"));
  const write = (rel, doc) => {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, JSON.stringify(doc));
  };

  const sims = { date: "2026-08-29", generatedAt: "2026-08-29T18:16:23Z", games: [{ gameId: "nfl-401874394", slateDate: "2026-08-29" }] };

  // (a) the exact broken shape: a played slate and NO anchor at all.
  write("nfl/index.json", { generatedAt: "2026-09-01T00:00:00Z", nextKickoffUtc: null, counts: { scheduledUpcoming: 0 }, events: [] });
  write("nfl/game-simulations/latest.json", sims);
  const blind = productDayFor("nfl", root, { today: "2026-09-01" });
  assert.equal(blind.state, "NO_EVENTS", "a played slate with no anchor is history, not an upcoming window");
  assert.equal(blind.events, 0);
  assert.equal(blind.eligible, 0);
  assert.doesNotMatch(blind.note, /games simulated/, "a finished game must not be advertised as today's slate");

  // (b) the same played slate, with the schedule's real next game named: still not upcoming, but
  //     the quiet window says what is next rather than going blank.
  write("nfl/index.json", { generatedAt: "2026-09-01T00:00:00Z", nextKickoffUtc: "2026-09-10T00:20Z", counts: { scheduledUpcoming: 1 }, events: [] });
  const named = productDayFor("nfl", root, { today: "2026-09-01" });
  assert.equal(named.state, "NO_EVENTS");
  assert.equal(named.nextEventUtc, "2026-09-10T00:20Z", "a quiet window still names the next real event");
  assert.match(named.note, /has been played/);
  assert.doesNotMatch(named.note, /not scheduled yet/, "it IS scheduled — the old copy said otherwise off a stale anchor");

  // (c) and a genuinely current slate is still LIVE — the fix must not suppress real days.
  write("nfl/game-simulations/latest.json", { ...sims, date: "2026-09-01", games: [{ gameId: "x", slateDate: "2026-09-01" }] });
  write("nfl/index.json", { generatedAt: "2026-09-01T00:00:00Z", nextKickoffUtc: "2026-09-01T23:00:00Z", counts: { scheduledUpcoming: 1 }, events: [] });
  const liveDay = productDayFor("nfl", root, { today: "2026-09-01" });
  assert.equal(liveDay.state, "LIVE");
  assert.equal(liveDay.events, 1);

  fs.rmSync(root, { recursive: true, force: true });
});

test("mlb day frames on the board loader's presented slate — the same source /today renders", () => {
  const mlb = productDayFor("mlb", dataRoot);
  assert.ok(mlb.productDate.match(/^\d{4}-\d{2}-\d{2}$/));
  if (mlb.state === "LIVE" || mlb.state === "SOURCE_STALE") {
    assert.ok(mlb.events > 0, "a LIVE/STALE answer carries the slate it is answering about");
  }
});
