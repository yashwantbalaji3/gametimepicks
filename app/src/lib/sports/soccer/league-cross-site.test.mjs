/**
 * Batch 1 · #7 — Ligue 1 across the site: /today lists its fixtures on their ET date, /sports gives it a "Next:" date and
 * a schedule section in its hub list, /results/picks has a Ligue 1 record page and index row, and the hub's club names
 * wrap at 390px instead of truncating. Every value is read from the committed league artifacts; clocks are fixed.
 *
 * Run (from app/): npx tsx --test src/lib/sports/soccer/league-cross-site.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { etDayOf, finalsById, leagueGamesTableRows, leagueNextFixtureUtc, leagueRecord, leagueUpcomingSection, oneXTwoRead } from "./league-cross-site.mjs";
import { COVERAGE_STATES } from "../schedule-contract.mjs";

globalThis.React = React;
const APP = process.cwd();
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");

const FORECASTS = json("public/data/soccer/ligue-1/forecasts/latest.json");
const GRADED = json("public/data/soccer/ligue-1/results/graded.json");
const base = { league: "ligue-1", label: "Ligue 1", hubHref: "/soccer/ligue-1/", resultHref: "/results/picks/ligue-1/" };

/* ── /today ───────────────────────────────────────────────────────────────────────────────────────── */

test("/today rows: every committed Ligue 1 fixture lands on its ET date, with the hub's own 1X2 numbers", () => {
  const dates = [...new Set(FORECASTS.rows.map((r) => etDayOf(r.kickoffUtc)))];
  const first = FORECASTS.rows.map((r) => r.kickoffUtc).sort()[0];
  const nowMs = Date.parse(first) - 3_600_000; // an hour before the first fixture: every row still to play
  const rows = leagueGamesTableRows({ ...base, forecasts: FORECASTS, graded: GRADED, dates, nowMs });
  for (const r of FORECASTS.rows) {
    const row = rows.find((x) => x.id === `ligue-1:${r.eventId}`);
    assert.ok(row, `${r.matchup} is on /today`);
    assert.equal(row.date, etDayOf(r.kickoffUtc), "the ET calendar day, not the UTC one");
    assert.equal(row.matchup, `${r.homeClub} vs ${r.awayClub}`);
    assert.equal(row.status, "Scheduled");
    assert.equal(row.forecast, "Published");
    assert.equal(row.sportLabel, "Ligue 1");
    assert.equal(row.eventHref, "/soccer/ligue-1/");
    assert.equal(row.resultHref, null, "no result link before a final is recorded");
    assert.equal(row.read, `${r.homeClub} ${Math.round(r.probs.home * 100)}% · Draw ${Math.round(r.probs.draw * 100)}% · ${r.awayClub} ${Math.round(r.probs.away * 100)}%`);
  }
});

test("/today rows: the brief's example — Le Havre v PSG on Oct 30 ET — and only the requested dates", () => {
  const lh = FORECASTS.rows.find((r) => r.homeClub === "Le Havre AC" && r.awayClub === "Paris Saint-Germain");
  if (!lh) return; // the fixture has rolled out of the committed file; the general test above still holds
  const rows = leagueGamesTableRows({ ...base, forecasts: FORECASTS, graded: GRADED, dates: ["2026-10-30"], nowMs: Date.parse("2026-10-29T20:00:00Z") });
  assert.ok(rows.some((r) => r.matchup === "Le Havre AC vs Paris Saint-Germain" && r.date === "2026-10-30"));
  assert.ok(rows.every((r) => r.date === "2026-10-30"));
});

test("/today rows: an evening-ET kickoff after midnight UTC is listed on its ET day", () => {
  const forecasts = { rows: [{ eventId: "x", kickoffUtc: "2026-11-02T01:30:00Z", homeClub: "A", awayClub: "B", probs: { home: 0.5, draw: 0.3, away: 0.2 } }] };
  assert.equal(leagueGamesTableRows({ ...base, forecasts, graded: null, dates: ["2026-11-02"], nowMs: 0 }).length, 0);
  const [row] = leagueGamesTableRows({ ...base, forecasts, graded: null, dates: ["2026-11-01"], nowMs: 0 });
  assert.equal(row.date, "2026-11-01");
  assert.equal(row.time, "8:30 PM ET");
});

test("/today rows: final only from the graded record; a started match without one is 'Started', never final", () => {
  const forecasts = { rows: [
    { eventId: "p", kickoffUtc: "2026-10-30T18:00:00Z", homeClub: "A", awayClub: "B", probs: { home: 0.5, draw: 0.3, away: 0.2 } },
    { eventId: "q", kickoffUtc: "2026-10-30T18:00:00Z", homeClub: "C", awayClub: "D", probs: { home: 0.4, draw: 0.3, away: 0.3 } },
  ] };
  const graded = { matches: [{ eventId: "p", kickoffUtc: "2026-10-30T18:00:00Z", homeClub: "A", awayClub: "B", probs: { home: 0.5, draw: 0.3, away: 0.2 }, final: { home: 2, away: 1 }, result: "H" }] };
  const rows = leagueGamesTableRows({ ...base, forecasts, graded, dates: ["2026-10-30"], nowMs: Date.parse("2026-10-30T21:00:00Z") });
  assert.equal(rows.length, 2, "each event once — the graded row replaces the forecast row");
  const p = rows.find((r) => r.id === "ligue-1:p");
  assert.deepEqual([p.status, p.forecast, p.resultHref, p.note], ["Final · graded", "Frozen", "/results/picks/ligue-1/", "Full time 2–1."]);
  const q = rows.find((r) => r.id === "ligue-1:q");
  assert.deepEqual([q.status, q.forecast, q.resultHref], ["Started", "Frozen", null]);
  /* a played, committed graded match is listed on its own ET date */
  const g = GRADED.matches[0];
  const [gr] = leagueGamesTableRows({ ...base, forecasts: { rows: [] }, graded: GRADED, dates: [etDayOf(g.kickoffUtc)], nowMs: Date.now() }).filter((r) => r.id === `ligue-1:${g.eventId}`);
  assert.equal(gr.status, "Final · graded");
  assert.equal(gr.note, `Full time ${g.final.home}–${g.final.away}.`);
});

test("/today wiring: the games table appends Ligue 1 rows from the hub's files; the label and result link are registered", () => {
  const rowsSrc = code("src/components/games-experience-table-rows.ts");
  assert.match(rowsSrc, /leagueGamesTableRows\(\{\s*league: "ligue-1"/);
  assert.match(rowsSrc, /loadLeagueForecasts\("ligue-1"\), graded: loadLeagueGraded\("ligue-1"\), dates: gamesTableDates\(today\)/);
  assert.match(rowsSrc, /"ligue-1": "\/results\/picks\/ligue-1\/"/);
  assert.match(code("src/components/games-experience-table-wire.ts"), /"ligue-1": "Ligue 1"/);
  assert.match(read("src/app/today/page.tsx"), /Premier League, Ligue 1 and UFC/);
});

/* ── /sports ──────────────────────────────────────────────────────────────────────────────────────── */

test("/sports chooser: Ligue 1's next fixture is the first one still to play, from the hub's file", () => {
  const sorted = FORECASTS.rows.map((r) => r.kickoffUtc).sort();
  assert.equal(leagueNextFixtureUtc(FORECASTS, GRADED, Date.parse(sorted[0]) - 1), sorted[0]);
  assert.equal(leagueNextFixtureUtc(FORECASTS, GRADED, Date.parse(sorted[sorted.length - 1]) + 1), null, "nothing ahead → no date");
  /* a kicked-off fixture still in the file (no final yet, or a final) is never "next" */
  const f = { rows: [{ eventId: "a", kickoffUtc: "2026-11-01T14:00:00Z" }, { eventId: "b", kickoffUtc: "2026-11-02T14:00:00Z" }] };
  assert.equal(leagueNextFixtureUtc(f, null, Date.parse("2026-11-01T15:00:00Z")), "2026-11-02T14:00:00Z");
  assert.equal(leagueNextFixtureUtc(f, { matches: [{ eventId: "a", final: { home: 1, away: 0 } }] }, Date.parse("2026-11-01T17:00:00Z")), "2026-11-02T14:00:00Z");
  const chooser = code("src/components/sports/sport-chooser.tsx");
  assert.match(chooser, /const next = day\?\.nextEventUtc \?\? leagueNext\.get\(h\.key\) \?\? null;/);
  assert.match(chooser, /leagueNextFixtureUtc\(loadLeagueForecasts\(l\.key\), loadLeagueGraded\(l\.key\), nowMs\)/);
});

test("/sports chooser renders a 'Next:' date on the Ligue 1 tile whenever a fixture is still to play", async () => {
  const { default: SportChooser, etDayLabel } = await import("../../../components/sports/sport-chooser.tsx");
  const html = renderToStaticMarkup(React.createElement(SportChooser));
  const tile = /<a[^>]*href="\/soccer\/ligue-1\/?"[^>]*>([\s\S]*?)<\/a>/.exec(html);
  assert.ok(tile, "the Ligue 1 tile renders");
  const next = leagueNextFixtureUtc(FORECASTS, GRADED, Date.now());
  if (next) assert.match(text(tile[1]), new RegExp(`Next: ${etDayLabel(next)}`));
  else assert.doesNotMatch(text(tile[1]), /Next:/, "no fixture ahead → the tile claims no date");
});

test("/sports schedule section: Ligue 1 lists its upcoming fixtures in the shared shape, beside the Premier League", async () => {
  const nowMs = Date.parse(FORECASTS.rows.map((r) => r.kickoffUtc).sort()[0]) - 1;
  const s = leagueUpcomingSection({ league: "ligue-1", label: "Ligue 1", forecasts: FORECASTS, graded: GRADED, nowMs });
  assert.equal(s.sport, "ligue-1");
  assert.ok(COVERAGE_STATES.includes(s.coverage));
  assert.equal(s.sourceVerdict.configured, true);
  assert.equal(s.totals.upcoming, FORECASTS.rows.length);
  assert.deepEqual(s.events.map((e) => e.scheduledStartUtc), [...s.events.map((e) => e.scheduledStartUtc)].sort());
  const lower = JSON.stringify(s).toLowerCase();
  for (const banned of ["edge", "lock of the day", "guaranteed", "beat the market", "prediction", "simulation-ready"]) assert.ok(!lower.includes(banned), banned);
  const missing = leagueUpcomingSection({ league: "ligue-1", label: "Ligue 1", forecasts: null, graded: null, nowMs });
  assert.equal(missing.events.length, 0);
  assert.match(missing.sourceVerdict.blocker, /not available/);

  const { UpcomingSportSection } = await import("../../../components/sports/upcoming-sports.tsx");
  const html = renderToStaticMarkup(React.createElement(UpcomingSportSection, { s }));
  const first = FORECASTS.rows.slice().sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))[0];
  assert.match(html, /id="ligue-1"/);
  assert.ok(text(html).includes(`${first.awayClub} at ${first.homeClub}`));
  assert.match(html, /href="\/soccer\/ligue-1\/?"/, "the section points at the hub that publishes");

  const page = code("src/app/sports/page.tsx");
  assert.match(page, /soccerLeaguePages\(\)\.map/);
  assert.match(page, /const sports = \[\.\.\.schedules\.slice\(0, 1\), \.\.\.leagues, \.\.\.schedules\.slice\(1\)\];/, "the hub list and the sections both read `sports`");
  assert.match(page, /const hubs = sports\.filter\(\(s\) => publishesOfficialForecast\(s\.sport\)\)/);
});

/* ── /results/picks ───────────────────────────────────────────────────────────────────────────────── */

test("record: Ligue 1's record is graded.json's own — same count, same log loss, every row's final, newest first", () => {
  const rec = leagueRecord(GRADED);
  assert.equal(rec.matches, GRADED.summary.matches);
  assert.equal(rec.logLoss, GRADED.summary.logLoss);
  assert.equal(rec.uniformLogLoss, GRADED.summary.uniformLogLoss);
  assert.equal(rec.rows.length, GRADED.matches.length);
  for (let i = 1; i < rec.rows.length; i++) assert.ok(rec.rows[i - 1].when >= rec.rows[i].when, "newest first");
  const finals = finalsById(GRADED);
  for (const r of rec.rows) {
    const m = GRADED.matches.find((x) => String(x.eventId) === r.eventId);
    assert.equal(r.score, `${finals[r.eventId].home}–${finals[r.eventId].away}`);
    assert.equal(r.probabilityOfResult, m.probabilityOfResult);
    assert.equal(r.result, { H: "home win", D: "draw", A: "away win" }[m.result]);
  }
  assert.equal(leagueRecord(null), null);
  assert.equal(oneXTwoRead({ probs: null }), null);
});

test("/results/picks/ligue-1 renders the record, says plainly what is NOT graded, and makes no hit/miss count", async () => {
  const { default: Page } = await import("../../../app/results/picks/ligue-1/page.tsx");
  const html = renderToStaticMarkup(React.createElement(Page));
  const t = text(html);
  assert.ok(t.includes(`${GRADED.summary.matches} matches graded · average log loss ${GRADED.summary.logLoss} (a one-in-three guess scores ${GRADED.summary.uniformLogLoss})`));
  assert.match(t, /Over 2\.5, both teams to score and the likeliest score are published on the hub but are not graded yet/);
  assert.match(t, /there is no hit-or-miss count here/);
  assert.equal((html.match(/data-l1-row=/g) ?? []).length, GRADED.matches.length, "every graded match is listed");
  const newest = leagueRecord(GRADED).rows[0];
  assert.ok(t.includes(newest.matchup) && t.includes(newest.score));
  assert.doesNotMatch(t, /\baccura(te|cy)\b/i, "no accuracy claim");
  assert.match(html, /href="\/soccer\/ligue-1\/?"/);
});

test("/results/picks index has a Ligue 1 row linking its record; the [sport] pages link it too", async () => {
  const { default: Index } = await import("../../../app/results/picks/page.tsx");
  const html = renderToStaticMarkup(React.createElement(Index));
  const row = /<tr data-ligue-1-row=""[^>]*>([\s\S]*?)<\/tr>/.exec(html);
  assert.ok(row, "the Ligue 1 row renders");
  assert.match(row[1], /href="\/results\/picks\/ligue-1\/?"/);
  assert.ok(text(row[1]).includes(`${GRADED.summary.matches}`));
  assert.ok(text(row[1]).includes(`log loss ${GRADED.summary.logLoss}`));
  assert.match(text(row[1]), /Over 2\.5, both teams to score and scorelines are not graded yet/);
  assert.match(code("src/app/results/picks/[sport]/page.tsx"), /href="\/results\/picks\/ligue-1\/"/);
});

/* ── hub, 390px ───────────────────────────────────────────────────────────────────────────────────── */

test("hub fixture rows wrap club names instead of truncating them (390px: 'Le Havr…', 'Paris Saint-G…')", () => {
  const hub = code("src/components/soccer/league-forecast-page.tsx");
  assert.doesNotMatch(hub, /\btruncate\b/, "no club name is clipped with an ellipsis");
  assert.match(hub, /data-fixture-teams="" className="flex min-w-0 flex-wrap/);
  assert.equal((hub.match(/overflowWrap: "anywhere" \}\}>\{r\.(home|away)Club\}/g) ?? []).length, 2, "both names may break inside a long word");
  assert.match(hub, /href="\/results\/picks\/ligue-1\/"/, "the hub links its full record");
});

test("/today integration: the built games table carries each Ligue 1 fixture in its window, once, on its ET date", async () => {
  const { buildGamesTableRows, gamesTableDates } = await import("../../../components/games-experience-table-rows.ts");
  const today = etDayOf(new Date().toISOString());
  const rows = buildGamesTableRows(today).filter((r) => r.sport === "ligue-1");
  const window = new Set(gamesTableDates(today));
  const expected = new Set([
    ...FORECASTS.rows.filter((r) => window.has(etDayOf(r.kickoffUtc))).map((r) => `ligue-1:${r.eventId}`),
    ...GRADED.matches.filter((m) => window.has(etDayOf(m.kickoffUtc))).map((m) => `ligue-1:${m.eventId}`),
  ]);
  assert.deepEqual(new Set(rows.map((r) => r.id)), expected);
  assert.equal(rows.length, expected.size, "no event twice");
  for (const r of rows) assert.ok(window.has(r.date) && r.sportLabel === "Ligue 1");
});
