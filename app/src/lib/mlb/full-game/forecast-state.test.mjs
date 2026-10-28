/**
 * MLB FORECAST STATE (overnight 2026-10-28) — one reader for the official snapshot's public state, read by /today, the
 * MLB game page and the simulation lobby (/simulate).
 *
 * Run: npx tsx --test src/lib/mlb/full-game/forecast-state.test.mjs
 *
 * The defect (Production 10-28 00:30Z): /games/mlb/mil-vs-tb-2026-10-27/ headlined "MIL 65%" from a DEGRADED official
 * snapshot (9 of 9 TB batters unprojected, no MIL probable starter), /today listed the same game as "Published", and the
 * page showed two competing times. Fixtures: the verbatim 10-26 degraded/ready cases (__fixtures__/degraded-note-games.json)
 * and the real unavailable shape of 2026-10-03 (started before generation), inlined below.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FORECAST_STATE_LABEL, NON_READY_FORBIDDEN, forecastEventBadge, forecastTableCell, mlbForecastState, mlbForecastStateForGame } from "./forecast-state.mjs";
import { deriveGameAvailability } from "../../today/availability.ts";
import { buildTodayPredictionRows } from "../prediction/slate.ts";

const APP = process.cwd();
const FIX = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/mlb/full-game/__fixtures__/degraded-note-games.json"), "utf8"));
/* Verbatim from public/data/mlb/predictions/2026-10-03.json (NYY @ TB, status "unavailable"). */
const UNAVAILABLE = {
  gamePk: 1, awayTeam: "NYY", homeTeam: "TB", status: "unavailable",
  completeness: { level: "unavailable", awayLineupSource: "confirmed", homeLineupSource: "confirmed", awayRatedCount: 8, homeRatedCount: 7, awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, startedBeforeGeneration: true },
  unavailableReasons: ["This game had already started when the slate was generated, so no pregame simulation exists for it."],
};
const LINEUP_UNAVAILABLE = { ...UNAVAILABLE, completeness: { ...UNAVAILABLE.completeness, startedBeforeGeneration: false, homeLineupSource: "padded" } };

const CASES = { ready: FIX.ready, degraded: FIX.degraded, unavailable: UNAVAILABLE };

test("ready / degraded / unavailable map to the three public states, from the snapshot's own fields", () => {
  const r = mlbForecastState(FIX.ready);
  assert.deepEqual([r.status, r.ready, r.label, r.tone, r.headline], ["ready", true, "Official Forecast", "ok", "Official Forecast"]);
  const d = mlbForecastState(FIX.degraded);
  assert.deepEqual([d.status, d.ready, d.label, d.tone], ["degraded", false, "Official Forecast · degraded inputs", "warn"]);
  assert.equal(d.causes, "2 of 9 TB batters have no projection", "the snapshot's own count, in a few words");
  assert.equal(d.headline, "Official Forecast · degraded inputs: 2 of 9 TB batters have no projection", "qualifier AND cause sit in the headline");
  assert.match(d.reason, /^2 of 9 TB batters have no projection \(no posted prop line, or too little data\)/);
  const u = mlbForecastState(UNAVAILABLE);
  assert.deepEqual([u.status, u.ready, u.label, u.tone], ["unavailable", false, "Forecast unavailable", "mute"]);
  assert.equal(u.reason, "The game had already started when the forecast was generated, so there is no pregame forecast.");
  assert.equal(mlbForecastState(LINEUP_UNAVAILABLE).reason, "Not enough pregame lineup data to simulate this game.");
  assert.equal(mlbForecastState(null), null, "no snapshot → no state is claimed");
  assert.equal(mlbForecastState({ status: "pending" }), null, "an unknown status is never mapped to a state");
});

test("the 10-27 World Series game: the committed snapshot reads as degraded, with both causes", () => {
  const doc = JSON.parse(fs.readFileSync(path.join(APP, "public/data/mlb/predictions/2026-10-27.json"), "utf8"));
  const f = mlbForecastStateForGame(doc, 849803);
  assert.equal(f.label, "Official Forecast · degraded inputs");
  assert.equal(f.causes, "9 of 9 TB batters have no projection, no MIL probable starter posted");
  assert.equal(mlbForecastStateForGame(doc, 1), null, "a game the snapshot does not carry has no state");
});

test("/today games table: a degraded snapshot is 'Degraded inputs' with its cause, unavailable is 'Unavailable'; ready falls through", () => {
  assert.equal(forecastTableCell(mlbForecastState(FIX.ready)), null, "ready keeps the table's own Published/Frozen rule");
  assert.deepEqual(forecastTableCell(mlbForecastState(FIX.degraded)), { forecast: "Degraded inputs", note: "Official Forecast · degraded inputs: 2 of 9 TB batters have no projection. Not included in model suggestions." });
  assert.deepEqual(forecastTableCell(mlbForecastState(UNAVAILABLE)), { forecast: "Unavailable", note: "Forecast unavailable: The game had already started when the forecast was generated, so there is no pregame forecast." });
});

test("/simulate event badge: before the start the badge IS the forecast state; after it, a non-ready state is a second line", () => {
  assert.deepEqual(forecastEventBadge(mlbForecastState(FIX.ready), false), { badge: "Official Forecast", tone: "ok", note: null });
  assert.deepEqual(forecastEventBadge(mlbForecastState(FIX.degraded), false), { badge: "Official Forecast · degraded inputs", tone: "warn", note: "2 of 9 TB batters have no projection. Not included in model suggestions." });
  assert.equal(forecastEventBadge(mlbForecastState(UNAVAILABLE), false).badge, "Forecast unavailable");
  assert.deepEqual(forecastEventBadge(mlbForecastState(FIX.degraded), true), { badge: null, tone: null, note: "Official Forecast · degraded inputs: 2 of 9 TB batters have no projection" });
  assert.deepEqual(forecastEventBadge(mlbForecastState(FIX.ready), true), { badge: null, tone: null, note: null });
  assert.deepEqual(forecastEventBadge(null, false), { badge: null, tone: null, note: null });
});

/* The /today slate board + /mlb availability strip (one contract): a ready simulation over a non-ready snapshot. */
const availabilityOf = (snap) => deriveGameAvailability({
  sport: "mlb", slug: "x-vs-y-2026-10-27", homeTeam: "TB", awayTeam: "MIL",
  gameLabSimulation: { status: "ready" }, gameCenter: { firstPitch: "2026-10-28T00:00:00Z" }, fullGameSim: snap,
}, { nowMs: Date.parse("2026-10-27T20:00:00Z") });

test("/today availability: 'Simulation ready' only over a ready snapshot; degraded/unavailable say their state", () => {
  assert.equal(availabilityOf(FIX.ready).label, "Simulation ready");
  assert.equal(availabilityOf(null).label, "Simulation ready", "no snapshot → unchanged");
  const d = availabilityOf(FIX.degraded);
  assert.equal(d.label, "Official Forecast · degraded inputs");
  assert.match(d.explanation, /^2 of 9 TB batters have no projection\. .*not included in model suggestions\.$/);
  assert.equal(d.level, "simulation", "the report tier is unchanged — only the words");
  assert.equal(availabilityOf(UNAVAILABLE).label, "Forecast unavailable");
});

test("/today game predictions: a degraded row carries its qualifier; a ready row carries none", () => {
  const game = (prediction) => ({ gamePk: prediction.gamePk, slug: "s", href: "/games/mlb/s/", homeTeam: prediction.homeTeam, awayTeam: prediction.awayTeam, homeTeamName: "H", awayTeamName: "A", homeLogo: null, awayLogo: null, firstPitchIso: null, prediction, playerPredictions: [] });
  const [deg] = buildTodayPredictionRows([game(FIX.predictionDegraded)]);
  assert.equal(deg.forecastQualifier, "Official Forecast · degraded inputs: 2 of 9 TB batters have no projection");
  const [rdy] = buildTodayPredictionRows([game(FIX.predictionReady)]);
  assert.equal(rdy.forecastQualifier, undefined);
});

test("MLB game page + lobby read the same reader (source wiring: hero, runner header, headline, explorer card, hub card)", () => {
  const src = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
  const page = src("src/components/game/game-detail-page.tsx");
  const hero = page.slice(page.indexOf("const mlbForecast = "), page.indexOf("const simIsReady"));
  assert.match(hero, /mlbForecastState\(detail\.fullGameSim/, "the hero reads the official snapshot");
  assert.match(hero, /if \(mlbForecast\) \{[\s\S]*\{mlbForecast\.label\}/, "and states it BEFORE the Simulation Ready fallback");
  assert.match(page, /forecastState=\{mlbForecast\}/, "the runner receives the same state");
  const runner = src("src/components/game/game-simulation-runner.tsx");
  assert.match(runner, /forecastState \? \([\s\S]{0,1000}\{forecastState\.label\}/, "the runner badge is the forecast state when one exists");
  assert.match(runner, /Forecast frozen<\/span> \{etStamp\(forecastFrozenAt\)\}/, "ONE time in the reading path: the forecast's own freeze");
  assert.match(runner, /<MoreDisclosure title="Technical details"[\s\S]{0,500}Player-prop simulation run<\/span> \{etStamp\(view\.generatedAt\)\}/, "the prop simulation's run time is relabelled and relocated");
  const report = src("src/components/game/mlb-full-game-report.tsx");
  assert.match(report, /headlineQualifier\(g\) \?\? `from/, "the head-to-head headline carries the qualifier for a non-ready snapshot");
  assert.match(report, /forecast && !forecast\.ready \? \([\s\S]{0,200}\{forecast\.headline\}/, "the prediction hero carries the qualifier");
  assert.match(src("src/components/entity/simulation-card.tsx"), /forecast && !forecast\.ready \? forecast\.label : "Prediction"/, "the lobby card");
  assert.match(src("src/lib/sport-hub/adapters.ts"), /detail: forecast\?\.headline \?\?/, "the /mlb hub card");
});

/*
 * THE GUARD — no MLB or /today view model labels a non-ready snapshot "Published" or "ready". Every committed
 * snapshot (all dates), through every surface view model this module feeds.
 */
test("GUARD: across every committed MLB snapshot, no surface labels a non-ready forecast Published/ready", () => {
  const dir = path.join(APP, "public/data/mlb/predictions");
  let nonReady = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).predictions ?? []) {
      const s = mlbForecastState(p);
      if (!s || s.ready) continue;
      nonReady += 1;
      const where = `${f} ${p.awayTeam}@${p.homeTeam}`;
      const cell = forecastTableCell(s);
      const shown = [
        s.label, s.headline, cell.forecast, cell.note,
        forecastEventBadge(s, false).badge, forecastEventBadge(s, false).note, forecastEventBadge(s, true).note,
        availabilityOf(p).label,
      ];
      for (const t of shown) assert.doesNotMatch(String(t), NON_READY_FORBIDDEN, `${where}: "${t}"`);
      assert.notEqual(cell.forecast, "Published");
      assert.notEqual(cell.forecast, "Frozen");
    }
  }
  assert.ok(nonReady > 100, `a vacuous sweep proves nothing (${nonReady} non-ready snapshots)`);
  for (const k of Object.keys(CASES)) assert.ok(FORECAST_STATE_LABEL[k]);
  assert.doesNotMatch(FORECAST_STATE_LABEL.degraded, NON_READY_FORBIDDEN);
  assert.doesNotMatch(FORECAST_STATE_LABEL.unavailable, NON_READY_FORBIDDEN);
});

test("GUARD (real surfaces): the /today games table and the /simulate day view never mark a non-ready MLB snapshot Published/ready", async () => {
  const { buildGamesTableRows } = await import("../../../components/games-experience-table-rows.ts");
  const { buildSimulateDay } = await import("../../simulate/day-view.ts");
  const snapFor = (date, pk) => {
    try { return mlbForecastStateForGame(JSON.parse(fs.readFileSync(path.join(APP, `public/data/mlb/predictions/${date}.json`), "utf8")), pk); } catch { return null; }
  };
  /* Pinned to the committed World Series window, so the check does not depend on the run date. */
  const rows = buildGamesTableRows("2026-10-28").filter((r) => r.sport === "mlb");
  const ws = rows.find((r) => r.date === "2026-10-27");
  assert.equal(ws?.forecast, "Degraded inputs", "MIL @ TB 10-27 is not 'Published'");
  assert.match(ws.note, /^Official Forecast · degraded inputs: 9 of 9 TB batters have no projection/);
  for (const r of rows) {
    const s = snapFor(r.date, r.id.replace(/^mlb:/, ""));
    if (s && !s.ready) assert.ok(!["Published", "Frozen"].includes(r.forecast), `${r.date} ${r.matchup}: ${r.forecast}`);
  }
  for (const date of ["2026-10-26", "2026-10-27"]) {
    for (const sec of buildSimulateDay(date, { today: "2026-10-27" }).sections) {
      if (sec.sport !== "mlb") continue;
      for (const e of sec.events) {
        const s = snapFor(date, e.id.replace(/^mlb:/, ""));
        if (!s || s.ready) continue;
        assert.ok(e.forecastBadge, `${date} ${e.matchup}: the event carries its forecast state`);
        for (const t of [e.forecastBadge.badge, e.forecastBadge.note]) assert.doesNotMatch(String(t ?? ""), NON_READY_FORBIDDEN, `${date} ${e.matchup}`);
        assert.match(String(e.forecastBadge.note ?? e.forecastBadge.badge), /degraded inputs|unavailable/i);
      }
    }
  }
});
