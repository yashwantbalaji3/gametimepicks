/**
 * /simulate/d/<past date> keeps its NBA games (overnight W7 2026-10-28; audit B NEW-1: /simulate/d/2026-10-26 went from
 * 10 NBA games to 0 the day after, because the schedule capture holds today onward only). A past date's rows come from
 * the committed lane file + finals record, and each row states the OFFICIAL RECORD's own verdict (the /results/nba
 * record), never a recomputed one. Today and later dates are unchanged.
 *
 * Run (from app/): npx tsx --test src/lib/simulate/day-view-nba-past.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { buildSimulateDay, availableSimulateDates } = await import("./day-view.ts");
const { nbaForecastVsActualView } = await import("../results/nba-level-a-readers.ts");

const TODAY = "2026-10-28";
const lane = (d) => JSON.parse(fs.readFileSync(`public/data/nba/experimental-public/${d}.json`, "utf8"));
const finalsOn = (d) => JSON.parse(fs.readFileSync("public/data/nba/results/finals-2026-27.json", "utf8")).finals.filter((f) => f.dateEt === d);

test("a committed past date lists every game it played — the lane's games and every recorded final — never 0", () => {
  for (const d of ["2026-10-26", "2026-10-23", "2026-10-20"]) {
    const nba = buildSimulateDay(d, { today: TODAY }).sections.find((s) => s.sport === "nba");
    const ids = new Set(nba.events.map((e) => e.id.replace(/^nba:/, "")));
    for (const g of lane(d).games) assert.ok(ids.has(String(g.providerEventId)), `${d}: lane game ${g.providerEventId} listed`);
    for (const f of finalsOn(d)) assert.ok(ids.has(String(f.providerEventId)), `${d}: final ${f.providerEventId} listed`);
    assert.ok(nba.events.length > 0 && nba.emptyState === null, `${d}: not "No NBA games"`);
    assert.doesNotMatch(nba.note, /No NBA games/);
  }
  assert.ok(availableSimulateDates({ today: TODAY }).includes("2026-10-26"), "a played date stays selectable after the capture drops it");
});

test("each past row says what the official record says: settled with its final and verdict, held as held, no final as started", () => {
  const record = new Map(nbaForecastVsActualView().games.map((g) => [g.providerEventId, g]));
  const nba = buildSimulateDay("2026-10-26", { today: TODAY }).sections.find((s) => s.sport === "nba");
  const wsh = nba.events.find((e) => e.id === "nba:401909868");
  assert.equal(wsh.state, "SETTLED");
  assert.equal(wsh.stateReason, "Final: WSH 103 – 110 CHA. The Official Forecast favoured Charlotte Hornets — the side won.");
  for (const e of nba.events) {
    const r = record.get(e.id.replace(/^nba:/, ""));
    if (!r) { assert.equal(e.state, "SCHEDULE_ONLY"); assert.match(e.stateReason, /No Official Forecast was published/); continue; }
    const expected = r.state === "HELD" ? "AWAITING_SETTLEMENT" : r.final ? "SETTLED" : "STARTED";
    assert.equal(e.state, expected, `${e.id}: ${r.state}`);
    if (r.state === "MATCHED") assert.match(e.stateReason, /the side won\.$/);
    if (r.state === "MISSED") assert.match(e.stateReason, /the side lost\.$/);
    if (r.final) assert.ok(e.stateReason.startsWith(`Final: ${r.away} ${r.final.away} – ${r.final.home} ${r.home}.`), e.stateReason);
    assert.match(e.href, /^\/nba\/(simulation\/\d+|projections\/2026-10-26)\/$/, "opens the settled page or that day's frozen board");
  }
});

test("a game that never had a forecast keeps its final and says no forecast was published (never a side)", () => {
  const nba = buildSimulateDay("2026-10-16", { today: TODAY }).sections.find((s) => s.sport === "nba");
  assert.ok(nba.events.length > 0, "preseason finals are listed");
  for (const e of nba.events) {
    assert.equal(e.state, "SCHEDULE_ONLY");
    assert.match(e.stateReason, /No Official Forecast was published for this game\.$/);
    assert.doesNotMatch(e.stateReason, /favoured/);
  }
});

test("today and future dates keep the schedule path (unchanged)", () => {
  const nba = buildSimulateDay("2026-10-28", { today: "2026-10-28" }).sections.find((s) => s.sport === "nba");
  for (const e of nba.events) assert.ok(!["SETTLED", "STARTED", "AWAITING_SETTLEMENT"].includes(e.state), `${e.id}: today's rows are not re-labelled`);
});
