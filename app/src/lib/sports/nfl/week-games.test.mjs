/**
 * NFL WEEK PAGES KEEP EVERY GAME AFTER ROLLOVER (P0 · 2026-10-28).
 *
 * /nfl/week/2-07/ listed only DAL @ PHI once week 8 became the live union: the page read `latest ∪ frozen-latest`
 * alone, which carries the current week. These tests prove, on COMMITTED data, that every settled regular-season week
 * page lists every game the schedule and the graded record hold for it, and, on fixtures, both read paths (live union
 * and archived revision) and the rollover itself.
 *
 * Run: npx tsx --test src/lib/sports/nfl/week-games.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { weekGames } from "./week-games.ts";
import { archivedEventIds, reconciledGames } from "./archived-forecast.ts";
import { availableWeekKeys } from "./week-keys.ts";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const DATA = path.join(APP, "public", "data");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const weekKeyOf = (t, w) => `${t}-${String(w).padStart(2, "0")}`;

/** Every scheduled game per week, each game placed by its NEWEST schedule capture (a moved game counts once). */
function scheduledByWeek() {
  const dir = path.join(DATA, "nfl", "schedule");
  const newest = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^capture-.*\.json$/.test(x))) {
    for (const r of readJson(path.join(dir, f)).rows ?? []) {
      const prev = newest.get(r.providerEventId);
      if (!prev || String(r.capturedAt) > String(prev.capturedAt)) newest.set(r.providerEventId, r);
    }
  }
  const out = new Map();
  for (const r of newest.values()) {
    const k = weekKeyOf(r.seasonType, r.week);
    if (!out.has(k)) out.set(k, new Set());
    out.get(k).add(String(r.providerEventId));
  }
  return out;
}

test("committed data: every settled 2026 regular-season week page lists every game the schedule and the graded record hold", () => {
  const settledWeeks = (readJson(path.join(DATA, "nfl", "reconciliation", "index.json")).weeks ?? []).map((w) => w.key).filter((k) => k.startsWith("2-"));
  assert.ok(settledWeeks.length >= 7, `only ${settledWeeks.length} settled regular-season weeks found`);
  const pages = new Set(availableWeekKeys());
  const scheduled = scheduledByWeek();
  const gamePages = new Set(archivedEventIds(DATA));
  const reconciled = reconciledGames(DATA);
  let checked = 0;
  for (const key of settledWeeks) {
    if (!pages.has(key)) continue; // no week page exported for this key — nothing to list on
    const { games, unavailable } = weekGames(DATA, key);
    const listed = new Set(games.map((g) => String(g.providerEventId)));
    const graded = reconciled.filter((x) => x.weekKey === key).map((x) => String(x.game.providerEventId));
    const sched = [...(scheduled.get(key) ?? [])];
    assert.ok(sched.length >= 13, `${key}: the schedule has ${sched.length} games`);
    assert.deepEqual(unavailable.map((g) => g.providerEventId), [], `${key}: every graded game's frozen revision is committed`);
    for (const id of sched) assert.ok(listed.has(id), `${key}: scheduled game ${id} missing from the week page`);
    for (const id of graded) assert.ok(listed.has(id), `${key}: graded game ${id} missing from the week page`);
    assert.equal(games.length, new Set([...sched, ...graded]).size, `${key}: no game listed twice and none from another week`);
    for (const g of games) {
      if (g.source === "archive") assert.ok(gamePages.has(String(g.providerEventId)), `${key}: ${g.providerEventId} links to a game page that is exported`);
      assert.ok(Number.isFinite(g.forecastSummary?.winProbability?.home), `${key}: ${g.providerEventId} carries its frozen forecast`);
    }
    checked += 1;
  }
  assert.ok(checked >= 7, `checked ${checked} week pages`);
});

test("committed data: week 7 (the reported page) lists all 14 games, DAL @ PHI among them", () => {
  const { games } = weekGames(DATA, "2-07");
  assert.equal(games.length, 14);
  assert.ok(games.some((g) => g.providerEventId === "401873009"), "DAL @ PHI");
  assert.ok(games.some((g) => g.providerEventId === "401873011"), "PIT @ NO");
});

test("the week page reads its games through weekGames, not the live union alone", () => {
  const page = fs.readFileSync(path.join(APP, "src/app/nfl/week/[key]/page.tsx"), "utf8");
  assert.match(page, /weekGames\(path\.join\(process\.cwd\(\), "public", "data"\), params\.key\)/);
  assert.doesNotMatch(page, /unionFrozenForecasts\(/, "the union alone carries only the current week");
});

/* ── fixtures: both read paths and the rollover ───────────────────────────────────────────────────────────────── */
const fc = (id, wk, generatedAt, kickoffUtc) => ({
  providerEventId: id, matchup: `A${id} @ H${id}`, kickoffUtc, seasonType: 2, week: wk, generatedAt,
  home: { abbr: `H${id}`, name: `Home ${id}` }, away: { abbr: `A${id}`, name: `Away ${id}` },
  model: { id: "nfl-regular-season-public-v1", version: 2, simulations: 10000 },
  forecastSummary: { projectedScore: { home: 24, away: 20 }, winProbability: { home: 0.6, away: 0.37 }, total: { median: 44, p10: 30, p90: 58 } },
});
function fixture({ liveWeek7 }) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-week-games-"));
  const w = (rel, doc) => { fs.mkdirSync(path.dirname(path.join(r, rel)), { recursive: true }); fs.writeFileSync(path.join(r, rel), JSON.stringify(doc)); };
  const sun = fc("1", 7, "2026-10-25T12:00:00Z", "2026-10-25T17:00Z");
  const mnf = fc("2", 7, "2026-10-26T23:00:00Z", "2026-10-27T00:15Z");
  const next = fc("3", 8, "2026-10-28T00:16:05Z", "2026-11-01T17:00Z");
  w("nfl/forecasts/2026-10-25.json", { generatedAt: sun.generatedAt, forecasts: [sun] });
  w("nfl/forecasts/2026-10-26.json", { generatedAt: mnf.generatedAt, forecasts: [mnf] });
  w("nfl/reconciliation/index.json", { weeks: [{ key: "2-07", label: "Week 7" }] });
  w("nfl/reconciliation/2-07.json", { games: [sun, mnf].map((f) => ({ providerEventId: f.providerEventId, matchup: f.matchup, kickoffUtc: f.kickoffUtc, state: "FINAL", published: { generatedAt: f.generatedAt }, final: { away: 10, home: 20, total: 30, margin: 10 } })) });
  /* the rollover run: week 8 is live; the MNF game is still carried by frozen-latest (the state that showed 1 game) */
  w("nfl/forecasts/latest.json", { generatedAt: "2026-10-28T00:16:05Z", forecasts: [next] });
  w("nfl/forecasts/frozen-latest.json", { generatedAt: "2026-10-28T00:16:05Z", forecasts: liveWeek7 ? [mnf] : [] });
  return r;
}
const noReceipts = { receiptsRoot: path.join(os.tmpdir(), "gtp-week-games-no-receipts"), resolve: (f) => f };

test("rollover, union still carrying one game: the page lists both week-7 games — the carried one from the union, the other from its archived revision", () => {
  const { games, unavailable } = weekGames(fixture({ liveWeek7: true }), "2-07", noReceipts);
  assert.deepEqual(games.map((g) => [g.providerEventId, g.source]), [["1", "archive"], ["2", "live"]]);
  assert.deepEqual(unavailable, []);
});

test("rollover complete, union empty for the week: every game comes from its archived revision", () => {
  const { games } = weekGames(fixture({ liveWeek7: false }), "2-07", noReceipts);
  assert.deepEqual(games.map((g) => [g.providerEventId, g.source]), [["1", "archive"], ["2", "archive"]]);
});

test("the current week still reads the live union, and a graded game with no committed revision is named, not dropped", () => {
  const r = fixture({ liveWeek7: false });
  assert.deepEqual(weekGames(r, "2-08", noReceipts).games.map((g) => [g.providerEventId, g.source]), [["3", "live"]]);
  fs.rmSync(path.join(r, "nfl/forecasts/2026-10-25.json"));
  const { games, unavailable } = weekGames(r, "2-07", noReceipts);
  assert.deepEqual(games.map((g) => g.providerEventId), ["2"]);
  assert.deepEqual(unavailable.map((g) => g.providerEventId), ["1"], "the missing revision is reported for the page to name");
});
