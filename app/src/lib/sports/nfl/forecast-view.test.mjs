/**
 * NFL forecast view guards (founder directive 2026-10-08 — one NFL forecast experience):
 *   - every board row IS the game page's row (same object values, same simulation id, same rounding)
 *   - each family has exactly one source; no family is computed twice or mixed silently
 *   - Out / Questionable / Doubtful never rank; started games drop off; fewer than ten rather than fill
 *   - unsupported families (passing TDs, first TD) carry a reason and never a number
 *   - the game outcome is the forecast of record, shown as itself; the simulation keeps its own counted win share
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { topBoards, gameView, gameTabs, boardTabs, formatValue, PLAYER_FAMILIES, CLEARED, SOURCES } from "./forecast-view.mjs";
import { loadForecastViews } from "./forecast-view-load.mjs";
import { PUBLIC_BOARD_CLEARED } from "./board-ranking.mjs";

const APP = process.cwd();
const views = loadForecastViews(path.join(APP, "public"));
const before = views.length ? new Date(Date.parse(views[0].kickoffUtc) - 60_000).toISOString() : new Date().toISOString();

test("every published game has a view; the game outcome is the forecast of record, shown as itself", () => {
  const forecasts = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/forecasts/latest.json"), "utf8")).forecasts;
  for (const f of forecasts) {
    const v = views.find((x) => x.providerEventId === f.providerEventId);
    assert.ok(v, `${f.matchup} has a view`);
    assert.deepEqual(v.record.projectedScore, f.forecastSummary.projectedScore);
    assert.equal(v.record.winProbability.home, f.forecastSummary.winProbability.home, "win chance is the forecast of record, never the simulated share");
    assert.equal(v.record.source.key, "record");
    if (v.simulation) {
      assert.equal(v.simulation.source.key, "worldModel");
      const w = v.simulation.winProbability;
      assert.ok(Math.abs(w.home + w.away + w.tie - 1) < 2e-4, "the simulated share is its own count");
    }
  }
});

test("each family has exactly one source, and unsupported families carry a reason instead of a number", () => {
  const keys = PLAYER_FAMILIES.map((f) => f.key);
  assert.deepEqual(keys, ["passingYards", "rushingYards", "receivingYards", "receptions", "anytimeTd", "passingTd", "firstTd"]);
  for (const f of PLAYER_FAMILIES) {
    if (f.source) assert.ok(SOURCES[f.source], `${f.key} names a known source`);
    else assert.ok(f.withheld && f.withheld.length > 40, `${f.key} explains why it is not published`);
  }
  for (const v of views) for (const p of v.players) {
    for (const [k, e] of Object.entries(p.families)) {
      const fam = PLAYER_FAMILIES.find((f) => f.key === k);
      assert.ok(fam?.source, `${p.name} carries ${k}, which has no source`);
      // the one permitted exception is the labelled player-board fallback, and only for a game with no simulation
      if (e.source === "playerBoard") assert.equal(v.simulation, null, `${p.name} ${k}: fallback used although the game has a simulation`);
      else assert.equal(e.source, fam.source, `${p.name} ${k} comes from ${e.source}, not its source of record ${fam.source}`);
    }
    assert.ok(!("passingTd" in p.families) && !("firstTd" in p.families), "no number for an unsupported family");
  }
});

test("board rows ARE the game-page rows — same values, same run, same rounding", () => {
  const { boards } = topBoards(views, { now: before });
  let checked = 0;
  for (const fam of PLAYER_FAMILIES) {
    const b = boards[fam.key];
    if (!fam.source) { assert.equal(b.rows.length, 0); assert.ok(b.withheld); continue; }
    assert.ok(b.rows.length <= 10, "a board is at most ten rows");
    b.rows.forEach((r, i) => {
      assert.equal(r.rank, i + 1);
      if (i) assert.ok(b.rows[i - 1].entry.value >= r.entry.value, "ranked by the projected value shown");
      const v = views.find((x) => x.providerEventId === r.providerEventId);
      const onPage = gameTabs(v).lists[fam.key].find((x) => x.player.playerId === r.playerId);
      assert.ok(onPage, `${r.name} is on his game page's ${fam.key} list`);
      assert.deepEqual(boardTabs(boards).lists[fam.key][i].entry, onPage.entry, `${r.name} ${fam.key}: board number = game-page number`);
      assert.equal(formatValue(fam.kind, r.entry.value), formatValue(fam.kind, onPage.entry.value), "same rounding");
      if (r.entry.simulationId) assert.equal(r.entry.simulationId, v.simulation.simulationId, "same simulation run");
      checked += 1;
    });
  }
  assert.ok(checked >= 20, `parity checked on ${checked} rows`);
});

test("only cleared players rank: Out, Inactive, Questionable and Doubtful never appear on a board", () => {
  assert.deepEqual(CLEARED, [...PUBLIC_BOARD_CLEARED, "ACTIVE"], "the shared allowlist, extended only by World Model V2's ACTIVE");
  const { boards } = topBoards(views, { now: before });
  for (const b of Object.values(boards)) for (const r of b.rows) {
    assert.equal(r.cleared, true);
    for (const a of r.availability) assert.ok(CLEARED.includes(a.state), `${r.name} ranked while ${a.state} (${a.source})`);
    assert.equal(r.availabilityLabel, null);
  }
  // probe: a questionable player in either source is not cleared
  const probe = gameView({
    forecast: { providerEventId: "x", matchup: "A @ B", kickoffUtc: "2099-01-01T00:00Z", home: { abbr: "B", name: "B" }, away: { abbr: "A", name: "A" }, forecastSummary: { winProbability: { home: 0.5, away: 0.5 }, projectedScore: { home: 20, away: 20 }, margin: { median: 0, p10: -10, p90: 10 }, total: { median: 40, p10: 30, p90: 50 } }, model: { id: "m" } },
    board: { generatedAt: "2099-01-01T00:00Z", families: { anytime_td: { state: "PUBLISHED" } }, players: [{ playerId: "nfl-athlete-1", name: "Q", team: "A", participation: "QUESTIONABLE", markets: { anytime_td: { probability: 0.5 } } }] },
  });
  assert.equal(probe.players[0].cleared, false);
  assert.equal(topBoards([probe], { now: "2098-01-01T00:00Z" }).boards.anytimeTd.rows.length, 0, "fewer than ten rather than fill — here none");
});

test("a game that has kicked off drops off every board", () => {
  if (!views.length) return;
  const first = views[0];
  const { boards } = topBoards(views, { now: new Date(Date.parse(first.kickoffUtc) + 1000).toISOString() });
  for (const b of Object.values(boards)) assert.ok(!b.rows.some((r) => r.providerEventId === first.providerEventId));
});

test("anytime touchdown comes only from the published touchdown model, never from the simulated games", () => {
  for (const v of views) for (const p of v.players) {
    if (p.families.anytimeTd) assert.equal(p.families.anytimeTd.source, "opportunityTd");
  }
  const src = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/forecast-view.mjs"), "utf8");
  assert.ok(!/anytimeTd_NOT_VALIDATED|recTd|rushTd/.test(src.slice(src.indexOf("export function playerRows"), src.indexOf("function availabilityLabel"))), "no world touchdown marginal is read");
});

test("one rounding rule: yards whole, receptions one decimal, probabilities one decimal percent", () => {
  assert.equal(formatValue("yards", 84.6), "85");
  assert.equal(formatValue("count", 7.43), "7.4");
  assert.equal(formatValue("probability", 0.7251), "72.5%");
  assert.equal(formatValue("yards", null), "—");
});

test("the view is deterministic: the same documents give the same view", () => {
  const again = loadForecastViews(path.join(APP, "public"));
  assert.deepEqual(JSON.parse(JSON.stringify(again)), JSON.parse(JSON.stringify(views)));
});

test("a game without a simulation falls back to the player board's families, labelled — never silently", () => {
  const f = { providerEventId: "y", matchup: "A @ B", kickoffUtc: "2099-01-01T00:00Z", home: { abbr: "B", name: "B" }, away: { abbr: "A", name: "A" }, forecastSummary: { winProbability: { home: 0.5, away: 0.5 }, projectedScore: { home: 20, away: 20 }, margin: { median: 0, p10: -10, p90: 10 }, total: { median: 40, p10: 30, p90: 50 } }, model: { id: "m" } };
  const board = { generatedAt: "2099-01-01T00:00Z", families: { player_rush_yds: { state: "PUBLISHED" }, player_pass_yds: { state: "WITHHELD" }, anytime_td: { state: "PUBLISHED" } }, players: [{ playerId: "nfl-athlete-9", name: "R", team: "A", participation: "AVAILABLE_ROLE_UNCERTAIN", markets: { player_rush_yds: { mean: 60, median: 55, p10: 20, p90: 100 }, player_pass_yds: { mean: 200, median: 210, p10: 100, p90: 300 }, anytime_td: { probability: 0.4 } } }] };
  const v = gameView({ forecast: f, world: null, board });
  assert.equal(v.simulation, null);
  assert.equal(v.players[0].families.rushingYards.source, "playerBoard");
  assert.ok(!v.players[0].families.passingYards, "a withheld board family stays withheld");
  const tabs = gameTabs(v);
  assert.match(tabs.families.find((x) => x.key === "rushingYards").sourceLabel, /Player board model/, "the list names its fallback source");
});

test("RESULTS INTEGRITY · every surface that shows World Model V2 player numbers says the existing results do not grade them", () => {
  const note = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/results-coverage.mjs"), "utf8");
  assert.match(note, /not graded in these results, so none of these results describe them/);
  assert.doesNotMatch(note, /were on each page/, "from Week 5 the board's ranges are not what the game pages show");
  for (const rel of ["src/app/results/nfl/page.tsx", "src/components/nfl/forecast/methodology.tsx", "src/components/nfl/forecast/model-status.tsx"]) {
    assert.match(fs.readFileSync(path.join(APP, rel), "utf8"), /\{NFL_RESULTS_COVERAGE_NOTE\}/, `${rel} renders the shared results-coverage note`);
  }
  // and the historical grades are untouched: the results page still grades the player board's own published ranges
  assert.match(fs.readFileSync(path.join(APP, "src/app/results/nfl/page.tsx"), "utf8"), /each graded exactly as we published it before kickoff/);
});
