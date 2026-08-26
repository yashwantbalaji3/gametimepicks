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
