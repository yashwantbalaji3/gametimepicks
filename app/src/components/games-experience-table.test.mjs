/**
 * Gap 3 (2026-10-23) · the /today games table never shows a probability its sport did not publish for that event.
 *
 * Every `read` is traced back to its public owner: NFL rows to nfl/index.json winProbability (the favoured side, as the
 * game page prints it), EPL rows to the published forecast row, NBA rows to the frozen Official Forecast snapshot's
 * winner side (no probability). MLB and UFC rows carry no number. Pending / Unavailable rows carry no number.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildGamesTableRows, gamesTableDates } from "./games-experience-table-rows.ts";
import { loadEplForecasts, reportableRows } from "../lib/sports/epl/forecast-view.ts";

const APP = process.cwd();
const nflIdx = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "nfl", "index.json"), "utf8"));
const etToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const rows = buildGamesTableRows(etToday);

test("rows exist across the window and only within it", () => {
  assert.ok(rows.length > 0, "a vacuous table proves nothing");
  const dates = new Set(gamesTableDates(etToday));
  for (const r of rows) assert.ok(dates.has(r.date), `${r.matchup} on ${r.date} is outside the window`);
  for (const r of rows) assert.ok(r.eventHref.startsWith("/"), `${r.matchup}: event link`);
});

test("a probability appears only where the sport publishes one for that exact event", () => {
  const epl = new Map(reportableRows(loadEplForecasts()).map((r) => [r.eventId, r]));
  for (const r of rows) {
    if (r.forecast === "Pending" || r.forecast === "Unavailable") { assert.equal(r.read, null, `${r.matchup}: no number without a published forecast`); continue; }
    if (r.read == null) continue;
    if (r.sport === "nfl") {
      const e = nflIdx.events.find((x) => `nfl:${x.providerEventId}` === r.id);
      const wp = e.winProbability;
      const fav = wp.home >= wp.away ? `${e.home.abbr} ${(wp.home * 100).toFixed(1)}%` : `${e.away.abbr} ${(wp.away * 100).toFixed(1)}%`;
      assert.equal(r.read, `${fav} to win`, r.matchup);
    } else if (r.sport === "epl") {
      const f = epl.get(r.id.replace(/^epl:/, ""));
      assert.ok(f?.probs, `${r.matchup}: EPL number without a published row`);
      assert.match(r.read, new RegExp(`${Math.round(f.probs.home * 100)}% · Draw ${Math.round(f.probs.draw * 100)}% · `), r.matchup);
    } else if (r.sport === "nba") {
      assert.match(r.read, /favoured · no probability published$/, r.matchup);
      assert.doesNotMatch(r.read, /\d%/, `${r.matchup}: NBA publishes no probability`);
    } else {
      assert.fail(`${r.sport} ${r.matchup}: this sport publishes no per-row number here`);
    }
  }
});
