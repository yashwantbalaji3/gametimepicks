/**
 * nba-minutes-current-season@1 — the current-season minutes challenger. SYNTHETIC box scores and forecasts only.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/minutes-current-season.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { MINUTES_CHALLENGER_ID, Z80, interval80, eligibleBoxscores, playerEstimate, distributeTo240, minutesChallengerSide } from "./minutes-current-season.mjs";
import { TEAM_MINUTES, MAX_PLAYER_MINUTES, DEFAULT_MINUTES_SD_RATIO } from "./game-sim.mjs";
import { TRAILING_N, MIN_GAMES_FOR_RATES } from "./minutes-model.mjs";

const TEAM = "1", OPP = "2";
/** SYNTHETIC box score: one game of team 1 with the given { id: minutes | "DNP" } rows. */
function box(i, mins, { phase = 2, dateUtc = null, teamOf = {} } = {}) {
  return {
    providerEventId: `syn-${phase}-${i}`, phase, status: "STATUS_FINAL", boxscoreAvailable: true,
    dateUtc: dateUtc ?? new Date(Date.UTC(2032, 9, 22 + i, 0, 30)).toISOString().replace(/:\d\d\.\d{3}Z$/, "Z"),
    teams: [{ providerTeamId: TEAM }, { providerTeamId: OPP }],
    players: Object.entries(mins).map(([id, m]) => ({ providerAthleteId: id, providerTeamId: teamOf[id] ?? TEAM, didNotPlay: m === "DNP", minutes: m === "DNP" ? null : m })),
  };
}
/** SYNTHETIC frozen v0.1 forecast game for team 1 at home. */
function game({ dateUtc = "2032-11-20T00:30Z", inputAsOf = "2032-11-19T11:00:00Z", players, noHistory = [], rescale = 1.2 } = {}) {
  return {
    providerEventId: "target", dateUtc,
    home: { providerTeamId: TEAM, pool: { insufficientHistory: noHistory.map((id) => ({ providerAthleteId: id, name: id })) } },
    away: { providerTeamId: OPP, pool: { insufficientHistory: [] } },
    forecast: {
      inputAsOf,
      assumptions: { minutes: { home: { rescaleFactor: rescale }, away: { rescaleFactor: 1 } } },
      players: { home: players.map(([id, m, sd]) => ({ providerAthleteId: id, name: id, expectedMinutes: m, minutesSd: sd, availability: "active" })), away: [] },
    },
  };
}

test("constants come from the existing models; z(0.9) is the normal quantile", () => {
  assert.equal(TRAILING_N, 10);
  assert.equal(MIN_GAMES_FOR_RATES, 3);
  assert.equal(TEAM_MINUTES, 240);
  assert.equal(MAX_PLAYER_MINUTES, 48);
  assert.ok(Math.abs(Z80 - 1.2815515655446004) < 1e-8);
  assert.deepEqual(interval80(40, 10), [27.1845, 48]);
});

test("leakage: no box score on or after the game's ET date, or after inputAsOf; only this season's regular season", () => {
  const docs = [
    box(1, { a: 30 }), box(2, { a: 30 }),
    box(3, { a: 30 }, { dateUtc: "2032-11-19T06:00Z" }), // the game's ET date (Nov 19 ET for a 00:30Z Nov 20 tip)… before inputAsOf
    box(4, { a: 30 }, { dateUtc: "2032-11-20T00:30Z" }),
    box(5, { a: 30 }, { phase: 1 }), box(6, { a: 30 }, { phase: 3 }),
    box(7, { a: 30 }, { dateUtc: "2032-04-10T23:00Z" }), // the PRIOR season's regular season (2031-32)
  ];
  const ids = eligibleBoxscores(docs, { cutoffUtc: "2032-11-19T11:00:00Z", gameEt: "2032-11-19" }).map((b) => b.providerEventId);
  assert.deepEqual(ids, ["syn-2-2", "syn-2-1"]);
  // and changing any excluded game changes nothing in the challenger
  const g = game({ players: [["a", 30, 3]] });
  const base = minutesChallengerSide(g, "home", docs);
  const changed = minutesChallengerSide(g, "home", docs.map((b, i) => (i >= 2 ? { ...b, players: b.players.map((p) => ({ ...p, minutes: 47 })) } : b)));
  assert.deepEqual(changed, base);
  assert.equal(base.boxscoresUsed, 2);
});

test("basis: trailing window ≥ 3 of the team's last 10, else the season ≥ 3, else the frozen v0.1 value before its rescale", () => {
  const docs = Array.from({ length: 12 }, (_, i) => box(i, { t: 20 + i, s: i < 2 ? 25 : "DNP", f: i === 0 ? 10 : "DNP" }));
  const elig = eligibleBoxscores(docs, { cutoffUtc: "2033-01-01T00:00:00Z", gameEt: "2033-01-01" });
  const t = playerEstimate(elig, TEAM, "t");
  assert.equal(t.basis, "trailing");
  assert.equal(t.basisGames, 10);
  assert.equal(t.estimate, (22 + 23 + 24 + 25 + 26 + 27 + 28 + 29 + 30 + 31) / 10, "the last 10 team games, newest first");
  // "s" played two games, both outside the last 10 → not trailing, not season (2 < 3) → fallback
  const s = playerEstimate(elig, TEAM, "s", { frozen: { expectedMinutes: 36, minutesSd: 6 }, rescaleFactor: 1.2 });
  assert.equal(s.basis, "fallback-v0.1");
  assert.equal(s.estimate, 30);
  assert.equal(s.sd, 5);
  assert.equal(s.ceiling, 30, "observed max 25 is below the prior-season estimate, so the estimate is the ceiling (never raised)");
  // a capped frozen value is flagged
  assert.equal(playerEstimate(elig, TEAM, "s", { frozen: { expectedMinutes: 48, minutesSd: 6 }, rescaleFactor: 1.2 }).basis, "fallback-v0.1-capped");
  // traded player: season basis counts appearances for any team
  const traded = [box(1, { x: 30 }, { teamOf: { x: "9" } }), box(2, { x: 32 }, { teamOf: { x: "9" } }), box(3, { x: 34 }, { teamOf: { x: "9" } })];
  const tr = playerEstimate(eligibleBoxscores(traded, { cutoffUtc: "2033-01-01T00:00:00Z", gameEt: "2033-01-01" }), TEAM, "x");
  assert.equal(tr.basis, "season");
  assert.equal(tr.estimate, 32);
  // nothing at all → none
  assert.equal(playerEstimate(elig, TEAM, "nobody").basis, "none");
  // DNPs never count as zero
  assert.equal(playerEstimate(elig, TEAM, "f").currentGames, 1);
});

test("240: a pool above 240 scales down proportionally; below 240 it fills to exactly 240 when the ceilings allow", () => {
  const down = distributeTo240([{ estimate: 40, ceiling: 44 }, { estimate: 80, ceiling: 80 }, { estimate: 180, ceiling: 180 }]);
  assert.ok(Math.abs(down.sum - TEAM_MINUTES) < 1e-9);
  assert.ok(Math.abs(down.finals[0] - 32) < 1e-9);
  const up = distributeTo240([{ estimate: 36, ceiling: 40 }, { estimate: 30, ceiling: 44 }, { estimate: 20, ceiling: 40 }, { estimate: 15, ceiling: 40 }, { estimate: 15, ceiling: 40 }, { estimate: 15, ceiling: 40 }, { estimate: 15, ceiling: 40 }, { estimate: 10, ceiling: 40 }, { estimate: 10, ceiling: 40 }]);
  assert.ok(Math.abs(up.sum - TEAM_MINUTES) < 1e-6, `sum ${up.sum}`);
  assert.equal(up.shortfall, 0);
});

test("ceiling: no player is ever pushed above his own observed maximum; a short pool keeps its shortfall", () => {
  const rows = [{ estimate: 37.8, ceiling: 39 }, { estimate: 37.2, ceiling: 38 }, { estimate: 20, ceiling: 34 }, { estimate: 15, ceiling: 30 }, { estimate: 12, ceiling: 28 }, { estimate: 10, ceiling: 26 }];
  const d = distributeTo240(rows);
  d.finals.forEach((f, i) => assert.ok(f <= Math.max(rows[i].estimate, rows[i].ceiling) + 1e-9, `player ${i}: ${f}`));
  assert.ok(Math.abs(d.sum - 195) < 1e-9);
  assert.ok(Math.abs(d.shortfall - 45) < 1e-9);
  assert.equal(d.allAtCeiling, true);
  // a ceiling never exceeds 48, even if an overtime game showed more
  assert.equal(distributeTo240([{ estimate: 40, ceiling: 53 }]).finals[0], MAX_PLAYER_MINUTES);
});

test("the side: official pool membership, rookies with current games join, 240 respected, sd scales, determinism", () => {
  const mins = { a: 38, b: 36, c: 30, d: 28, e: 24, f: 20, g: 16, h: 14, r: 18 };
  // each player alternates ±3 around his mean, so his observed maximum is mean + 3 (room to fill the 6-minute gap)
  const docs = Array.from({ length: 8 }, (_, i) => box(i, Object.fromEntries(Object.entries(mins).map(([k, m]) => [k, m + (i % 2 ? 3 : -3)]))));
  const g = game({ players: [["a", 45, 4], ["b", 43, 4], ["c", 36, 4], ["d", 33, 4], ["e", 29, 4], ["f", 24, 4], ["g", 19, 4], ["h", 17, 4], ["z", 12, 3]], noHistory: ["r"] });
  const s = minutesChallengerSide(g, "home", docs);
  assert.equal(s.challenger, MINUTES_CHALLENGER_ID);
  assert.ok(Math.abs(s.sum - 240) < 1e-3);
  const by = Object.fromEntries(s.players.map((p) => [p.providerAthleteId, p]));
  assert.equal(by.r.inOfficialPool, false, "a roster rookie the official could not project now has current-season minutes");
  assert.equal(by.r.basis, "trailing");
  assert.equal(by.z.basis, "fallback-v0.1", "no current game → the frozen v0.1 value / rescale");
  assert.ok(Math.abs(by.z.estimate - 10) < 1e-9);
  for (const p of s.players) assert.ok(p.expectedMinutes <= Math.max(p.estimate, p.ceiling) + 1e-6);
  assert.ok(by.a.expectedMinutes <= 41 + 1e-9, "the star stays within his own maximum (41), never the 45+ the proportional rescale gave");
  assert.equal(s.shortfall, 0);
  assert.deepEqual(minutesChallengerSide(g, "home", [...docs].reverse()), s);
  assert.equal(minutesChallengerSide({ ...g, forecast: { ...g.forecast, inputAsOf: "2032-11-20T01:00:00Z" } }, "home", docs).reason, "FORECAST_NOT_BEFORE_TIP");
  const sdRatio = playerEstimate(eligibleBoxscores([box(1, { q: 30 })], { cutoffUtc: "2033-01-01T00:00:00Z", gameEt: "2033-01-01" }), TEAM, "q", { frozen: { expectedMinutes: 24, minutesSd: null }, rescaleFactor: 1 });
  assert.equal(sdRatio.sd, 24 * DEFAULT_MINUTES_SD_RATIO);
});

test("the challenger feeds no public surface: its only importers are the private shadow module and the research script", () => {
  const roots = ["src/app", "src/components", "src/lib", "scripts"].map((d) => path.join(process.cwd(), d));
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!/\.(mjs|js|ts|tsx)$/.test(e.name) || /minutes-current-season(\.test)?\.mjs$/.test(e.name)) continue;
      if (/from\s+["'][^"']*minutes-current-season\.mjs["']/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(process.cwd(), p));
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  assert.deepEqual(hits.sort(), ["scripts/nba/research/report-nba-minutes-challenger.mjs", "src/lib/sports/nba/minutes-shadow.mjs"]);
});
