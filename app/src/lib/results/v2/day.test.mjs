/**
 * Results V2 · B-3 — one day, game by game. The day view is a second consumer of the SAME owner rows as the
 * overview, so the two must agree to the row; every tracker day must open a real page; a range is coverage,
 * never a W–L; and the date page no longer leads with a combined percentage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const { resultsDay, resultsDayDates } = await import("./day.ts");
const { resultsV2Populations } = await import("./overview.ts");
const { default: ResultsDay } = await import("../../../components/results/results-day.tsx");

const src = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const tally = (rows) => {
  const c = { won: 0, lost: 0, push: 0, void: 0 };
  for (const r of rows) { if (r.outcome === "WIN") c.won++; else if (r.outcome === "LOSS") c.lost++; else if (r.outcome === "PUSH") c.push++; else if (r.outcome === "VOID") c.void++; }
  return c;
};

test("🔴 parity: for every graded day, the day view's counts equal the overview's daily series, per population", () => {
  const pops = resultsV2Populations("2099-01-01");
  const pick = { "mlb-games": (d) => d.mlb.flatMap((e) => e.calls), "nfl-games": (d) => d.nfl.flatMap((e) => e.calls),
    "epl-matches": (d) => d.epl.flatMap((e) => e.calls), "ufc-fights": (d) => d.ufc.flatMap((e) => e.calls),
    "mlb-props": (d) => d.mlb.flatMap((e) => e.props) };
  let checked = 0;
  for (const p of pops) {
    const rows = pick[p.id];
    assert.ok(rows, `population ${p.id} has a day-view mapping`);
    for (const day of p.days) {
      const { won, lost, push, void: v } = tally(rows(resultsDay(day.date)));
      assert.deepEqual({ won, lost, push, void: v }, { won: day.won, lost: day.lost, push: day.push, void: day.void }, `${p.id} ${day.date}`);
      checked++;
    }
  }
  if (!checked) console.log("# no graded day on disk — parity announced vacuous");
});

test("🔴 every day the overview tracker can link to is a statically generated day page", async () => {
  const dates = new Set(resultsDayDates());
  for (const p of resultsV2Populations("2099-01-01")) for (const d of p.days) assert.ok(dates.has(d.date), `${p.id}: ${d.date} has no page`);
  const page = src("src/app/results/date/[date]/page.tsx");
  assert.match(page, /\.\.\.resultsDayDates\(\), \.\.\.topBoardDates\(\)\]\)\)\.sort\(\)/, "generateStaticParams enumerates the V2 days and every frozen-board day");
  assert.match(page, /dayDates\.has\(date\)/, "the 404 gate accepts a V2 day");
  assert.match(src("src/components/results/results-overview.tsx"), /href=\{surfaceHref\("results", \{ date \}\)/, "via the ONE dated-url owner");
  const { surfaceHref } = await import("../../nav/date-sport-route.ts");
  assert.equal(surfaceHref("results", { date: "2031-07-14" }), "/results/date/2031-07-14/", "the owner builds the day-page path");
});

test("🔴 the date page leads with the day, not a combined percentage across sports and research rows", () => {
  const page = src("src/app/results/date/[date]/page.tsx");
  assert.doesNotMatch(page, /totalHit|totalDecisive|AtAGlanceCard/, "the combined NBA+MLB lean scoreboard is gone");
  assert.ok(page.indexOf("<ResultsDay") > -1 && page.indexOf("<ResultsDay") < page.indexOf("<SportScoreCard"), "game by game leads; research follows");
  assert.match(page, /Model research · player-prop leans, not public picks/);
  assert.match(page, /id=\{`leans-mlb-\$\{gpk\}`\}/, "each game's leans have the anchor the day view links to");
});

const ev = (o) => ({ id: "x", sport: "mlb", title: "AAA @ BBB", final: null, calls: [], props: [], ranges: [], ...o });
const html = renderToStaticMarkup(React.createElement(ResultsDay, { day: {
  mlb: [ev({ id: "mlb-77", final: "AAA 3 – 2 BBB", calls: [{ market: "Winner", pick: "AAA (away)", line: null, outcome: "WIN" }, { market: "Total runs", pick: "Over", line: "8.5", outcome: null }, { market: "Run line", pick: "AAA -1.5", line: "-1.5", outcome: "PUSH" }],
    props: [{ player: "P", team: "AAA", market: "Hits", pick: "Over 0.5", actual: "1", outcome: "WIN" }, { player: "Q", team: "BBB", market: "Hits", pick: "Over 0.5", actual: "0", outcome: "VOID" }] })],
  nfl: [ev({ id: "nfl-1", sport: "nfl", title: "CCC @ DDD", calls: [{ market: "Winner", pick: "DDD (home)", line: null, outcome: "LOSS" }],
    ranges: [{ player: "R", team: "CCC", family: "Receptions", status: "PUBLISHED", range: "2–6", actual: "7", inside: false }, { player: "S", team: "DDD", family: "Receptions", status: "PUBLISHED", range: "1–4", actual: "3", inside: true }, { player: "T", team: "DDD", family: "Receptions", status: "PUBLISHED", range: "0–3", actual: null, inside: null }] })],
  epl: [], ufc: [],
} }));

test("🔴 each sport keeps its own record; an ungraded call is 'Not graded', never a loss; no percentage anywhere", () => {
  assert.match(html, /MLB <strong>1–0–1<\/strong>/);
  assert.match(html, /<td>Over 8\.5<\/td>/, "a separate line is appended");
  assert.match(html, /<td>AAA -1\.5<\/td>/, "a line the owner already wrote into the pick is not printed twice");
  assert.match(html, /NFL <strong>0–1<\/strong>/);
  assert.match(html, /Not graded/);
  assert.doesNotMatch(html, /\d%/, "a day view prints no hit rate");
  assert.doesNotMatch(html, /Premier League|UFC ·/, "a sport with nothing graded that day renders nothing, not a 0–0");
  assert.match(html, /Final · AAA 3 – 2 BBB/);
  assert.match(html, /Final score not on file/, "a missing final is said, never invented");
});

test("🔴 NFL ranges are coverage (inside / outside of GRADED), never wins and losses; props link to research", () => {
  assert.match(html, /1 of 2 finals landed inside the printed range/, "the ungraded range is out of the denominator");
  assert.match(html, /A coverage record, not wins and losses/);
  assert.match(html, /href="#leans-mlb-77"[^>]*>Player-prop leans · model research, market context · 1–0 · 1 void →/);
  const s = src("src/lib/results/v2/day.ts");
  assert.match(s, /inside: p\.outcome === "HIT" \? true : p\.outcome === "MISS" \? false : null/, "inside is the owner's word, not a recomputed threshold");
});

test("empty day renders the honest empty state", () => {
  const e = renderToStaticMarkup(React.createElement(ResultsDay, { day: { mlb: [], nfl: [], epl: [], ufc: [] } }));
  assert.match(e, /No public forecast was graded on this day/);
});
