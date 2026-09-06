import test from "node:test";
import assert from "node:assert/strict";
import { orderRows, hubCounts, HUB_SECTIONS, DEFAULT_LABELS } from "./contract.ts";

const row = (o) => ({
  id: o.id, startUtc: o.startUtc ?? null, startLabel: o.startLabel ?? "", matchup: o.matchup ?? o.id,
  status: o.status ?? "scheduled", started: o.started ?? false, read: o.read ?? null,
  reportState: o.reportState ?? "READY", reportHref: o.reportHref ?? "/x/", reportNote: o.reportNote,
});

test("the mandated section order is fixed and complete", () => {
  assert.deepEqual([...HUB_SECTIONS], ["games", "products", "simulations", "picks", "results"]);
  for (const s of HUB_SECTIONS) assert.ok(DEFAULT_LABELS[s], `${s} has no label`);
});

test("upcoming rows sort by start time; started rows come after, most recent first", () => {
  const rows = [
    row({ id: "late", startUtc: "2026-09-06T23:00:00Z" }),
    row({ id: "done-old", startUtc: "2026-09-01T18:00:00Z", started: true }),
    row({ id: "early", startUtc: "2026-09-06T17:00:00Z" }),
    row({ id: "done-new", startUtc: "2026-09-05T18:00:00Z", started: true }),
  ];
  assert.deepEqual(orderRows(rows).map((r) => r.id), ["early", "late", "done-new", "done-old"]);
});

test("a started row is never sorted in among pre-event rows", () => {
  // Mixing them is how a settled outcome ends up presented beside a forecast.
  const rows = [row({ id: "played", startUtc: "2026-09-06T10:00:00Z", started: true }),
                row({ id: "upcoming", startUtc: "2026-09-06T23:00:00Z" })];
  const ordered = orderRows(rows);
  assert.equal(ordered[0].id, "upcoming");
  assert.equal(ordered[1].id, "played");
});

test("a row with no start time sorts last rather than to 1970", () => {
  const rows = [row({ id: "tbd", startUtc: null }), row({ id: "known", startUtc: "2026-09-06T17:00:00Z" })];
  assert.deepEqual(orderRows(rows).map((r) => r.id), ["known", "tbd"]);
});

test("scheduled, reportable and read-bearing are counted SEPARATELY", () => {
  // One number standing for all three is how a page comes to claim every game is simulated.
  const rows = [
    row({ id: "a", read: { label: "x", kind: "MODEL_FORECAST" } }),
    row({ id: "b", reportState: "NONE", reportHref: null }),
    row({ id: "c", started: true }),
  ];
  assert.deepEqual(hubCounts(rows), { scheduled: 3, withReport: 2, withRead: 1, started: 1 });
});

test("an empty slate counts to zero without throwing", () => {
  assert.deepEqual(hubCounts([]), { scheduled: 0, withReport: 0, withRead: 0, started: 0 });
  assert.deepEqual(orderRows([]), []);
});
