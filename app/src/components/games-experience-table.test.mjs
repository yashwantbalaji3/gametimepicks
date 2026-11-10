/**
 * Gap 3 (2026-10-23) · the /today games table never shows a probability its sport did not publish for that event.
 *
 * Every `read` is traced back to its public owner: NFL rows to nfl/index.json winProbability (the favoured side, as the
 * game page prints it), EPL rows to the published forecast row, NBA rows to the shared Elo win-probability accessor
 * (WEB-03, 2026-11-09), else the frozen snapshot's winner side with no probability. MLB and UFC rows carry no number. Pending / Unavailable rows carry no number.
 * Batch 1 · #7: Ligue 1 rows trace to the league hub's own files — the forecast row (forecasts/latest.json) or, once
 * played, the graded row (results/graded.json) — by event id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildGamesTableRows, gamesTableDates, nbaTodayRead } from "./games-experience-table-rows.ts";
import { eloWinProbabilityOf, eloWinProbabilityText } from "../lib/sports/nba/elo-win-probability.mjs";
import { loadEplForecasts, reportableRows } from "../lib/sports/epl/forecast-view.ts";

const APP = process.cwd();
const nflIdx = JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "nfl", "index.json"), "utf8"));
const l1Json = (f) => JSON.parse(fs.readFileSync(path.join(APP, "public", "data", "soccer", "ligue-1", ...f.split("/")), "utf8"));
const ligue1 = new Map([...l1Json("forecasts/latest.json").rows, ...l1Json("results/graded.json").matches].map((r) => [`ligue-1:${r.eventId}`, r]));
const etToday = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const rows = buildGamesTableRows(etToday);
/* The NBA lane snapshot game a row came from (the dated lane file for the row's date, by provider event id). */
const NBA_LANE = path.join(APP, "public", "data", "nba", "experimental-public");
const laneDoc = (date) => { try { return JSON.parse(fs.readFileSync(path.join(NBA_LANE, `${date}.json`), "utf8")); } catch { return null; } };
const nbaLaneGameFor = (r) => laneDoc(r.date)?.games?.find((g) => `nba:${g.providerEventId}` === r.id || String(r.id).endsWith(`:${g.providerEventId}`)) ?? null;

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
    } else if (r.sport === "ligue-1") {
      const f = ligue1.get(r.id);
      assert.ok(f?.probs, `${r.matchup}: Ligue 1 number without a published forecast or graded row`);
      assert.equal(r.read, `${f.homeClub} ${Math.round(f.probs.home * 100)}% · Draw ${Math.round(f.probs.draw * 100)}% · ${f.awayClub} ${Math.round(f.probs.away * 100)}%`, r.matchup);
    } else if (r.sport === "nba") {
      /* WEB-03: the shared accessor's text when it publishes a value (as /nba and the game pages print it), else the disclosure. */
      const g = nbaLaneGameFor(r);
      const view = g ? eloWinProbabilityOf(g) : null;
      if (view) assert.equal(r.read, eloWinProbabilityText(view), r.matchup);
      else assert.match(r.read, /favoured · no win chance published$/, r.matchup); // founder mandate 2026-10-24: reader words, same disclosure
      if (!view) assert.doesNotMatch(r.read, /\d%/, `${r.matchup}: no number unless the accessor publishes one`);
    } else {
      assert.fail(`${r.sport} ${r.matchup}: this sport publishes no per-row number here`);
    }
  }
});

test("the packed wire form is lossless for everything the table shows, and stores each repeated string once", async () => {
  const { packGamesTable, unpackGamesTable } = await import("./games-experience-table-wire.ts");
  const packed = packGamesTable(rows);
  const back = unpackGamesTable(packed);
  assert.deepEqual(back, rows.map(({ id, ...shown }) => shown));
  assert.equal(new Set(packed.strings).size, packed.strings.length, "no string is stored twice");
  assert.ok(JSON.stringify(packed).length < JSON.stringify(rows).length * 0.6, "the wire form is materially smaller than the row objects");
});

test("WEB-03: an NBA row reads the shared Elo accessor's text — the same win chance /nba and the game page print — or the disclosure when none is published", () => {
  /* Every committed lane game with a published Elo win probability (dated files never change once written). */
  const games = fs.readdirSync(NBA_LANE).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).flatMap((n) => laneDoc(n.slice(0, 10))?.games ?? []);
  const published = games.filter((g) => eloWinProbabilityOf(g));
  assert.ok(published.length > 0, "a committed lane game publishes an Elo win probability (otherwise this proves nothing)");
  for (const g of published) {
    const read = nbaTodayRead(g);
    assert.equal(read, eloWinProbabilityText(eloWinProbabilityOf(g)), String(g.providerEventId));
    assert.doesNotMatch(read, /no win chance published/, "never the disclosure when a value is published");
  }
  /* No published value (here: the provenance does not match this game) → the favoured side and the disclosure. */
  const g = published[0];
  const unproven = { ...g, elo: { ...g.elo, winProbability: { ...g.elo.winProbability, provenance: { ...g.elo.winProbability.provenance, frozenAt: "1999-01-01T00:00:00Z" } } } };
  assert.equal(nbaTodayRead(unproven), `${g.elo.favoured} favoured · no win chance published`);
});
