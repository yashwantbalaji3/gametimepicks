/**
 * ARCHIVED NFL FORECAST (P320) — a played game's story comes from the frozen revision the graded record names,
 * and the final score can never leak into it. Fixtures live in a temp root so the daily rollover cannot rot them.
 * Run: npx tsx --test src/lib/sports/nfl/archived-forecast.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { archivedEventFrom, archivedEventIds, archivedForecastFor } from "./archived-forecast.ts";
import { buildNflPresentation } from "../../simulate/presentation/nfl.ts";

const forecast = (id, generatedAt, over = {}) => ({
  providerEventId: id, matchup: "DEN @ KC", kickoffUtc: "2026-09-15T00:15Z", venue: "Arrowhead", generatedAt,
  home: { abbr: "KC", name: "Kansas City Chiefs" }, away: { abbr: "DEN", name: "Denver Broncos" },
  model: { id: "nfl-regular-season-public-v1", version: 2, simulations: 10000 }, teamSignal: { state: "APPLIED" },
  forecastSummary: { projectedScore: { home: 20, away: 21 }, winProbability: { home: 0.4007, away: 0.5993 }, total: { median: 41, p10: 24, p90: 58 } },
  ...over,
});
function root(withRevision = true, final = { away: 10, home: 31, total: 41, margin: 21 }) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-archived-"));
  fs.mkdirSync(path.join(r, "nfl", "reconciliation"), { recursive: true });
  fs.mkdirSync(path.join(r, "nfl", "forecasts"), { recursive: true });
  fs.writeFileSync(path.join(r, "nfl", "reconciliation", "index.json"), JSON.stringify({ weeks: [{ key: "2-01", label: "Week 1" }] }));
  fs.writeFileSync(path.join(r, "nfl", "reconciliation", "2-01.json"), JSON.stringify({ games: [{ providerEventId: "401", matchup: "DEN @ KC", kickoffUtc: "2026-09-15T00:15Z", state: "FINAL", published: { generatedAt: "2026-09-14T23:42:04Z" }, final }] }));
  /* an EARLIER revision of the same game with different numbers — must never be picked over the named one */
  fs.writeFileSync(path.join(r, "nfl", "forecasts", "2026-09-13.json"), JSON.stringify({ generatedAt: "2026-09-13T22:54:38Z", forecasts: [forecast("401", "2026-09-13T22:54:38Z", { forecastSummary: { projectedScore: { home: 24, away: 17 }, winProbability: { home: 0.7, away: 0.3 }, total: { median: 44, p10: 27, p90: 61 } } })] }));
  if (withRevision) fs.writeFileSync(path.join(r, "nfl", "forecasts", "2026-09-14.json"), JSON.stringify({ generatedAt: "2026-09-14T23:42:04Z", forecasts: [forecast("401", "2026-09-14T23:42:04Z")] }));
  /* this week's live file no longer carries the game */
  fs.writeFileSync(path.join(r, "nfl", "forecasts", "2026-09-15.json"), JSON.stringify({ generatedAt: "2026-09-15T14:19:41Z", forecasts: [forecast("402", "2026-09-15T14:19:41Z", { matchup: "DET @ BUF" })] }));
  return r;
}
const chapterText = (m) => JSON.stringify(m.chapters ?? m);

test("final with archive: the exact named revision is returned, not an earlier one, and the page id list keeps the game", () => {
  const r = root();
  const a = archivedForecastFor(r, "401");
  assert.ok(a, "archived forecast found");
  assert.equal(a.sourceFile, "nfl/forecasts/2026-09-14.json");
  assert.equal(a.forecast.generatedAt, "2026-09-14T23:42:04Z");
  assert.equal(a.forecast.forecastSummary.winProbability.away, 0.5993, "the named revision's numbers, not the earlier file's");
  assert.deepEqual(archivedEventIds(r), ["401"]);
  assert.equal(archivedForecastFor(r, "402"), null, "a live-week game is not archived");
});

test("final without archive: a game whose named revision is not committed is refused, never approximated", () => {
  const r = root(false);
  assert.equal(archivedForecastFor(r, "401"), null, "the 09-13 revision is on disk but is NOT the one the record names");
  assert.deepEqual(archivedEventIds(r), []);
  const m = buildNflPresentation(null, { nowIso: "2026-09-16T00:00:00Z" });
  assert.equal(m.unavailable, true);
});

test("the archived story is told in the past tense from the frozen numbers, and the final never enters it", () => {
  const before = archivedForecastFor(root(true, { away: 10, home: 31, total: 41, margin: 21 }), "401");
  const after = archivedForecastFor(root(true, { away: 45, home: 3, total: 48, margin: -42 }), "401");
  const ev = archivedEventFrom(before);
  assert.equal(ev.lifecycle, "STARTED");
  assert.equal(ev.locked, true);
  assert.equal(ev.readiness, "SIMULATION_READY");
  const mA = buildNflPresentation(ev, { runCount: 10000, modelVersion: "nfl-regular-season-public-v1", nowIso: "2026-09-16T00:00:00Z" });
  const mB = buildNflPresentation(archivedEventFrom(after), { runCount: 10000, modelVersion: "nfl-regular-season-public-v1", nowIso: "2026-09-16T00:00:00Z" });
  assert.equal(mA.unavailable, undefined);
  assert.deepEqual(mA, mB, "a different final score changes nothing in the archived pregame story");
  const text = chapterText(mA);
  assert.match(text, /frozen BEFORE kickoff|played/i, "the story says it is the frozen pre-kickoff read");
  assert.doesNotMatch(text, /\b31\b.*\b10\b|10 – 31|31-10/, "no final score inside a pregame chapter");
  assert.match(text, /60%|59\.9|0\.5993|21/, "the frozen numbers are the ones shown");
});

test("live and started events come from the eligibility owner untouched; the archive is only the fallback", () => {
  const live = { providerEventId: "402", canonicalEventId: "nfl-402", matchup: "DET @ BUF", kickoffUtc: "2026-09-18T00:15Z", home: { abbr: "BUF", name: "Buffalo Bills" }, away: { abbr: "DET", name: "Detroit Lions" }, lifecycle: "UPCOMING", locked: false, state: "PUBLIC_EXPERIMENTAL", projectedScore: { home: 27, away: 24 }, winProbability: { home: 0.62, away: 0.38 }, total: { median: 51, p10: 34, p90: 68 }, hasMarket: true, venue: null, playerCandidates: 0, reportHref: "/nfl/game/402", readiness: "SIMULATION_READY", simulationReady: true, readinessReason: "" };
  const upcoming = buildNflPresentation(live, { nowIso: "2026-09-16T00:00:00Z" });
  assert.equal(upcoming.unavailable, undefined);
  assert.doesNotMatch(chapterText(upcoming), /frozen BEFORE kickoff/, "an upcoming game is not framed as archived");
  const started = buildNflPresentation({ ...live, lifecycle: "STARTED" }, { nowIso: "2026-09-18T01:00:00Z" });
  assert.match(chapterText(started), /frozen BEFORE kickoff|played/i, "a started game is told in the past tense");
});

test("a revision overwritten in the dated file survives as its per-revision receipt, and only that exact revision is used", () => {
  const r = root(false); // the 09-14 dated file is absent (a later run the same day overwrote it)
  const receipts = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-receipts-"));
  fs.mkdirSync(path.join(receipts, "2026-09-14"), { recursive: true });
  /* an EARLIER receipt with other numbers, and the NAMED one */
  fs.writeFileSync(path.join(receipts, "2026-09-14", "401-rev-1348Z.json"), JSON.stringify(forecast("401", "2026-09-14T13:48:01Z", { forecastSummary: { projectedScore: { home: 23, away: 20 }, winProbability: { home: 0.55, away: 0.45 }, total: { median: 43, p10: 26, p90: 60 } } })));
  fs.writeFileSync(path.join(receipts, "2026-09-14", "401-rev-2342Z.json"), JSON.stringify(forecast("401", "2026-09-14T23:42:04Z")));
  const a = archivedForecastFor(r, "401", { receiptsRoot: receipts });
  assert.ok(a, "resolved through the receipt");
  assert.equal(a.sourceFile, "data/internal/nfl/forecast-receipts/2026-09-14/401-rev-2342Z.json");
  assert.equal(a.forecast.forecastSummary.winProbability.away, 0.5993);
  assert.deepEqual(archivedEventIds(r, { receiptsRoot: receipts }), ["401"]);
  assert.equal(archivedForecastFor(r, "401", { receiptsRoot: path.join(receipts, "nope") }), null, "no receipt, no archive");
});
