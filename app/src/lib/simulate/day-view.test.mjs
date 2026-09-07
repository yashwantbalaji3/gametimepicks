/**
 * SIMULATION DAY-VIEW guards (P209 · Release A).
 *
 * The invariants the charter names, asserted over the REAL current data (no fixtures pinned to a
 * date — memory: tests pinning today's data fail when the product succeeds):
 *   · counts reconcile mechanically: totals are sums over the rendered rows, ready is a per-row
 *     state match — never events.length;
 *   · prev/next walk the availableDates list exactly;
 *   · every event carries a state from the matrix and the matrix's own action vocabulary;
 *   · settled days never offer a generate-shaped action;
 *   · the ET day helper is date-only (immune to the Intl hour-24 trap).
 * Built-export checks no-op when out/ is absent (CI unit lane).
 *
 * Run: npx tsx --test src/lib/simulate/day-view.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSimulateDay, availableSimulateDates, etDayOf, STATE_ACTION, READY_STATES } from "./day-view.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hasBuild = fs.existsSync(path.join(APP, "out", "simulate", "index.html"));

test("counts reconcile: totals are sums over the same rows the sections render", () => {
  const v = buildSimulateDay();
  const all = v.sections.flatMap((s) => s.events);
  assert.equal(v.totals.events, all.length);
  assert.equal(v.totals.ready, all.filter((e) => READY_STATES.includes(e.state)).length);
  assert.equal(v.totals.settled, all.filter((e) => e.state === "SETTLED").length);
  assert.ok(v.totals.ready <= v.totals.events, "ready can never exceed events");
});

test("prev/next walk availableDates exactly, and today is always available", () => {
  const dates = availableSimulateDates();
  assert.ok(dates.length >= 1, "never empty (today is always included)");
  assert.deepEqual([...dates].sort(), dates, "sorted ascending");
  const v = buildSimulateDay();
  assert.ok(dates.includes(v.today), "today in the list");
  const i = dates.indexOf(v.date);
  assert.equal(v.prevDate, i > 0 ? dates[i - 1] : null);
  assert.equal(v.nextDate, i < dates.length - 1 ? dates[i + 1] : null);
});

test("every event speaks the state matrix and its action vocabulary; non-ready states explain themselves", () => {
  const dates = availableSimulateDates();
  for (const d of [dates[0], buildSimulateDay().today, dates[dates.length - 1]]) {
    const v = buildSimulateDay(d);
    for (const e of v.sections.flatMap((s) => s.events)) {
      assert.ok(e.state in STATE_ACTION, `${e.id}: known state ${e.state}`);
      assert.ok(e.actionLabel && e.actionLabel !== "Open" && e.actionLabel !== "View" && e.actionLabel !== "Enter", `${e.id}: action names its destination`);
      assert.ok(e.href.startsWith("/"), `${e.id}: internal href`);
      if (!READY_STATES.includes(e.state) && e.state !== "SIMULATION_READY") {
        assert.ok(e.stateReason || e.state === "SIMULATION_READY", `${e.id}: a non-ready state is never silent (${e.state})`);
      }
    }
  }
});

test("a settled day offers results, never generation", () => {
  const v = buildSimulateDay();
  if (!v.prevDate) return; // window opens on today — nothing settled to assert
  const y = buildSimulateDay(v.prevDate);
  for (const e of y.sections.flatMap((s) => s.events)) {
    if (e.state !== "SETTLED") continue;
    assert.doesNotMatch(e.actionLabel, /generate/i, `${e.id}: settled events never say Generate`);
  }
});

test("etDayOf is date-only ET (hour-24 immune) and null-safe", () => {
  assert.equal(etDayOf("2026-08-26T03:59:00Z"), "2026-08-25"); // 23:59 ET the previous day
  assert.equal(etDayOf("2026-08-26T04:01:00Z"), "2026-08-26"); // 00:01 ET
  assert.equal(etDayOf(null), null);
  assert.equal(etDayOf("garbage"), null);
});

test("empty sport sections are typed, never blank", () => {
  const v = buildSimulateDay();
  for (const s of v.sections) {
    if (s.events.length === 0) {
      assert.ok(s.emptyState != null, `${s.sport}: empty section has a typed state`);
      assert.ok(s.note, `${s.sport}: and a plain-language note`);
    }
  }
});

test("the built export carries the date pages the selector enumerates", () => {
  if (!hasBuild) return; // no build in this run (CI unit lane)
  const dates = availableSimulateDates();
  for (const d of dates) {
    if (d === buildSimulateDay().today) continue; // today lives at /simulate
    assert.ok(
      fs.existsSync(path.join(APP, "out", "simulate", "d", d, "index.html")),
      `/simulate/d/${d} built`,
    );
  }
  const html = fs.readFileSync(path.join(APP, "out", "simulate", "index.html"), "utf8");
  assert.match(html, /aria-label="Simulation date"/, "date bar renders");
  assert.match(html, /aria-label="Sport filter"/, "sport chips render");
});

test("a future day with only a committed StatsAPI population renders SCHEDULE_ONLY, never 'no games'", () => {
  /*
   * P240 — the board and every model artifact are day-of, so before the population fallback a
   * future date with a committed 15-game slate rendered "No MLB games on this date". The claim
   * pinned here is shape, not a date: for EVERY future date whose statsapi-schedule file is
   * committed, the MLB section must carry exactly that population, each row SCHEDULE_ONLY with
   * no market families (the capture proves SCHEDULED and nothing more), unless a real board
   * already upgraded the day. Dateless by design — the capture window rolls forward daily.
   */
  const dir = path.join(APP, "public", "data", "mlb", "statsapi-schedule");
  const today = buildSimulateDay().today;
  const futureDates = fs.readdirSync(dir).map((f) => f.replace(/\.json$/, "")).filter((d) => d > today);
  assert.ok(futureDates.length >= 1, "the widened capture commits future populations — none found");
  for (const d of futureDates) {
    const pop = JSON.parse(fs.readFileSync(path.join(dir, `${d}.json`), "utf8"));
    const mlb = buildSimulateDay(d, { today }).sections.find((s) => s.sport === "mlb");
    assert.ok(mlb.events.length >= pop.games.length, `${d}: population ${pop.games.length}, rendered ${mlb.events.length}`);
    for (const e of mlb.events.filter((ev) => ev.state === "SCHEDULE_ONLY")) {
      assert.deepEqual(e.markets, [], `${d}: a schedule-only row may not claim a market family`);
      assert.ok(e.stateReason, `${d}: a schedule-only row explains itself`);
    }
  }
});

test("the population fallback never reaches into the past — a past day with no board stays a results question", () => {
  // 2026-09-03's board exists (settled day) but the guard is general: for the OLDEST in-window past
  // day, no MLB row may be SCHEDULE_ONLY — the fallback is gated date > today.
  const dates = availableSimulateDates();
  const today = buildSimulateDay().today;
  const past = dates.filter((d) => d < today);
  for (const d of past) {
    const mlb = buildSimulateDay(d, { today }).sections.find((s) => s.sport === "mlb");
    for (const e of mlb?.events ?? []) {
      assert.notEqual(e.state, "SCHEDULE_ONLY", `${d}: past MLB day rendered a schedule-only row`);
    }
  }
});
