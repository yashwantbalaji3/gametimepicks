/**
 * Session 5 · A6 — current-season player-event capture keeps up with the finals. Fixed clocks and fixtures;
 * one LIVE check on the committed pair at the results owner's OWN capture instant (never the suite's calendar).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { checkUsageCapture, USAGE_FRESHNESS as U } from "./usage-freshness.mjs";

const final = (id, dateUtc, extra = {}) => ({ providerEventId: id, shortName: `G${id}`, dateUtc, statusRaw: "STATUS_FINAL", seasonType: 2, ...extra });
const results = (rows, generatedAt = "2026-10-01T16:00:00Z") => ({ generatedAt, rows });
const events = (ids, quarantined = []) => ({ games: ids.map((providerEventId) => ({ providerEventId })), quarantinedGames: quarantined });
const NOW = "2026-10-01T18:00:00Z";

test("A6 · every final older than the 36h results bound is captured ⇒ CURRENT", () => {
  const r = checkUsageCapture({ results: results([final("1", "2026-09-28T00:15Z"), final("2", "2026-09-29T00:15Z")]), events: events(["1", "2"]), season: 2026, nowIso: NOW });
  assert.equal(r.state, U.CURRENT);
  assert.equal(r.owed, 2);
});

test("A6 · a final older than 36h missing from the capture ⇒ LAGGING, named", () => {
  const r = checkUsageCapture({ results: results([final("1", "2026-09-28T00:15Z"), final("2", "2026-09-29T00:15Z")]), events: events(["1"]), season: 2026, nowIso: NOW });
  assert.equal(r.state, U.LAGGING);
  assert.deepEqual(r.missing.map((m) => m.providerEventId), ["2"]);
});

test("A6 · inside the bound, quarantined, preseason, not final, or another season are not owed", () => {
  const rows = [
    final("3", "2026-10-01T00:15Z"),                         // 17h45m old — inside 36h
    final("4", "2026-09-27T17:00Z"),                         // quarantined by reconciliation
    final("5", "2026-08-20T00:00Z", { seasonType: 1 }),      // preseason
    final("6", "2026-09-27T17:00Z", { statusRaw: "STATUS_POSTPONED" }),
    final("7", "2026-01-10T21:00Z"),                         // 2025 season (January)
  ];
  const r = checkUsageCapture({ results: results(rows), events: events([], ["4"]), season: 2026, nowIso: NOW });
  assert.equal(r.state, U.CURRENT, JSON.stringify(r.missing));
});

test("A6 · a stale results owner is REPORTED, never a vacuous pass", () => {
  const r = checkUsageCapture({ results: results([final("1", "2026-09-20T00:15Z")], "2026-09-25T00:00:00Z"), events: events([]), season: 2026, nowIso: NOW });
  assert.equal(r.state, U.RESULTS_STALE);
  assert.equal(checkUsageCapture({ results: results([]), events: null, season: 2026, nowIso: NOW }).state, U.NO_CAPTURE);
});

test("A6 · LIVE: the committed capture keeps up with the committed finals (judged at the results capture instant)", () => {
  const ROOT = path.resolve(process.cwd(), "..");
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, "app/public/data/nfl/results/latest.json"), "utf8"));
  const season = 2026;
  const p = path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`);
  if (!fs.existsSync(p)) return console.log("no current-season capture committed yet");
  const out = checkUsageCapture({ results: r, events: JSON.parse(fs.readFileSync(p, "utf8")), season, nowIso: r.generatedAt });
  console.log(`A6 live: ${out.state} — ${out.reason}`);
  assert.notEqual(out.state, U.LAGGING, out.reason + " " + JSON.stringify(out.missing));
});
