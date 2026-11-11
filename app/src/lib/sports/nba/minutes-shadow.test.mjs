/**
 * NBA minutes shadow projections (the official v0 engine, unchanged). SYNTHETIC box scores and forecasts only.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/minutes-shadow.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { minutesShadowDoc, MINUTES_SHADOW_SCHEMA } from "./minutes-shadow.mjs";
import { LABELS } from "./experimental-forecast.mjs";

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const MEAN = [36, 34, 30, 28, 26, 22, 18, 14, 12];
const rates = { pts: 0.5, reb: 0.2, ast: 0.1, threePm: 0.05 };
/** SYNTHETIC current-season box scores for teams 1 (home) and 2 (away); minutes alternate ±3 around each mean. */
const boxes = Array.from({ length: 8 }, (_, i) => ({
  providerEventId: `b${i}`, phase: 2, status: "STATUS_FINAL", boxscoreAvailable: true,
  dateUtc: new Date(Date.UTC(2032, 9, 22 + i, 0, 30)).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z"),
  teams: [{ providerTeamId: "1" }, { providerTeamId: "2" }],
  players: ["1", "2"].flatMap((t) => IDS.map((id, j) => ({ providerAthleteId: `${t}${id}`, providerTeamId: t, didNotPlay: false, minutes: MEAN[j] + (i % 2 ? 3 : -3) }))),
}));
/** SYNTHETIC frozen official game: proportional rescale pushed the top players high (the v0.1 symptom). */
const frozen = (t) => IDS.map((id, j) => ({ providerAthleteId: `${t}${id}`, name: `${t}${id}`, expectedMinutes: MEAN[j] * 1.1, minutesSd: 3, starterRate: j < 5 ? 1 : 0, availability: "active", injuryStatus: null, ratesBasis: "player-window", rates }));
const game = (tip = "2032-11-20T00:30Z") => ({
  providerEventId: "target", label: LABELS[2], dateUtc: tip, neutralSite: false,
  home: { providerTeamId: "1", pool: { insufficientHistory: [] } }, away: { providerTeamId: "2", pool: { insufficientHistory: [] } },
  forecast: { inputAsOf: "2032-11-19T11:00:00Z", simulations: 500, assumptions: { minutes: { home: { rescaleFactor: 1.1 }, away: { rescaleFactor: 1.1 } } }, players: { home: frozen("1"), away: frozen("2") } },
});
const inputs = { date: "2032-11-19", slateGames: [game()], boxscores: boxes, simulations: 500 };

test("shadow: challenger minutes (240, each within his own maximum) drive the official engine with the official rates and seed", () => {
  const { doc, added } = minutesShadowDoc({ ...inputs, now: "2032-11-19T15:00:00Z" });
  assert.equal(doc.schema, MINUTES_SHADOW_SCHEMA);
  assert.equal(doc.publicSurface, false);
  assert.equal(added, 1);
  const e = doc.games[0];
  assert.equal(e.frozenAt, "2032-11-19T15:00:00Z");
  for (const side of [e.home, e.away]) {
    assert.ok(Math.abs(side.sum - 240) < 1e-3);
    assert.ok(Math.abs(side.engineRescaleFactor - 1) < 1e-4, "the unchanged engine's own rescale is ≈ 1");
    for (const p of side.players) {
      assert.ok(p.challengerMinutes <= p.ceiling + 1e-6, `${p.providerAthleteId} ${p.challengerMinutes} ≤ ${p.ceiling}`);
      assert.ok(Math.abs(p.expectedMinutes - p.challengerMinutes) < 1e-2, "the engine simulates the challenger minutes");
      assert.equal(p.minutesBasis, "trailing");
      assert.equal(p.ratesBasis, "player-window", "the official rates are used");
      assert.ok(p.pts && Number.isFinite(p.pts.p50));
    }
  }
  assert.ok(e.home.players[0].challengerMinutes <= 39 + 1e-6, "the top player stays within his own maximum (39), not the official 39.6");
  assert.equal(JSON.stringify(e).includes('"margin"'), false, "team scores are not carried");
  assert.equal(JSON.stringify(minutesShadowDoc({ ...inputs, now: "2032-11-19T15:00:00Z" }).doc), JSON.stringify(doc), "deterministic");
});

test("shadow: write-once per game; never added at or after tip", () => {
  const first = minutesShadowDoc({ ...inputs, now: "2032-11-19T15:00:00Z" }).doc;
  const later = minutesShadowDoc({ ...inputs, boxscores: boxes.slice(0, 4), now: "2032-11-19T20:00:00Z", existing: first });
  assert.equal(later.added, 0);
  assert.deepEqual(later.doc, first);
  const late = minutesShadowDoc({ ...inputs, now: "2032-11-20T00:30:00Z" });
  assert.deepEqual(late.doc.games, []);
  assert.deepEqual(late.refused, [{ providerEventId: "target", reason: "AT_OR_AFTER_TIP" }]);
});

test("shadow: a side the ceilings leave short of 240 is refused (the engine would scale past the maxima), never altered", () => {
  const thin = boxes.map((b) => ({ ...b, players: b.players.filter((p) => !/[fghi]$/.test(p.providerAthleteId)) }));
  const g = game();
  for (const t of ["home", "away"]) g.forecast.players[t] = g.forecast.players[t].filter((p) => !/[fghi]$/.test(p.providerAthleteId));
  const r = minutesShadowDoc({ ...inputs, slateGames: [g], boxscores: thin, now: "2032-11-19T15:00:00Z" });
  assert.deepEqual(r.doc.games, []);
  assert.deepEqual(r.refused, [{ providerEventId: "target", reason: "SHORT_POOL" }]);
});

test("the minutes shadow feeds no public surface: nothing under src/app or src/components imports it", () => {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (/\.(mjs|js|ts|tsx)$/.test(e.name) && /from\s+["'][^"']*(minutes-shadow|minutes-current-season)\.mjs["']/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
    }
  };
  for (const d of ["src/app", "src/components"]) walk(path.join(process.cwd(), d));
  assert.deepEqual(hits, []);
});
