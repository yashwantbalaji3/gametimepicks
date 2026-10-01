/**
 * SESSION 4 — NFL roster identity, availability and the one-passer rule on the public player board.
 *
 * Fixtures A–F follow the session brief (§33–§38). The LIVE test at the bottom runs the REAL board
 * producer against the committed inputs (the shape the bot will write next), so a guard here cannot
 * pass on a fixture while the producer still publishes the defect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { applyQbStarterRule, auditBoard, buildCoverage, currentSeasonUsageIndex, COVERAGE, isUnavailableState, receivingFamilyGaps } from "./board-roster-integrity.mjs";
import { deriveNewArrivals } from "./new-arrivals.mjs";
import { indexDepthCharts } from "./depth-chart.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");

/* ── shared fixture world: OLD → NEW ─────────────────────────────────────────────────────────── */
const ID = { A: "nfl-athlete-101", B: "nfl-athlete-102", C: "nfl-athlete-103", D: "nfl-athlete-104", E: "nfl-athlete-105", F: "nfl-athlete-106" };
const corpus2025 = {
  games: [1, 2, 3, 4, 5, 6, 7].map((w) => ({
    dateUtc: `2025-10-0${w}T17:00Z`,
    players: [
      { playerId: ID.A, teamAbbr: "OLD", targets: 7, rec: 5, recYds: 60, rushAtt: 0, rushYds: 0, passAtt: 0, passYds: 0 },
      { playerId: ID.B, teamAbbr: "OLD", targets: 0, rec: 0, recYds: 0, rushAtt: 14, rushYds: 60, passAtt: 0, passYds: 0 },
      { playerId: ID.C, teamAbbr: "NEW", targets: 9, rec: 6, recYds: 80, rushAtt: 0, rushYds: 0, passAtt: 0, passYds: 0 },
    ],
  })),
};
const roleEvidence = (overrides = {}) => ({
  events: [{
    providerEventId: "9",
    teams: {
      NEW: { players: [
        { playerId: ID.A, name: "Player A", position: "WR", state: "ACTIVE_UNCERTAIN" },
        { playerId: ID.B, name: "Player B", position: "RB", state: "ACTIVE_UNCERTAIN" },
        { playerId: ID.C, name: "Player C", position: "WR", state: "ACTIVE_UNCERTAIN" },
        ...(overrides.NEW ?? []),
      ].map((p) => ({ ...p, ...(overrides[p.playerId] ?? {}) })) },
    },
  }],
});
const emptyShares = { teams: {} };

/* The weekly forecast columns the producer reads. Player A has three 2026 games at NEW. */
const forecast = {
  columns: ["gameId", "team", "opponent", "playerId", "name", "position", "market", "share", "mean", "lastSeason", "espnId"],
  rows: [
    ["2026_04_OPP_NEW", "NEW", "OPP", "00-1", "Player A", "WR", "player_receptions", 0.2, 4.1, 2026, "101"],
    ["2026_04_OPP_NEW", "NEW", "OPP", "00-2", "Player B", "RB", "player_rush_yds", 0.5, 60, 2025, "102"],
    ["2026_04_LA_WAS", "LA", "WAS", "00-7", "Ram", "WR", "player_receptions", 0.2, 4, 2026, "107"],
  ],
};

test("§33 TRANSFER · current-season usage at the NEW club keeps him out of the 'unobserved mover' list", () => {
  const usage = currentSeasonUsageIndex({ forecast, season: 2026 });
  assert.ok(usage.has(`NEW:${ID.A}`), "Player A's 2026 usage is current-team evidence at NEW");
  assert.ok(!usage.has(`NEW:${ID.B}`), "a 2025 row is not current-season evidence");
  assert.ok(usage.has("LAR:nfl-athlete-107"), "nflverse LA is the board's LAR — one rule for the spelling");
  const arrivals = deriveNewArrivals({ corpusSeasons: [corpus2025], roleEvidence: roleEvidence(), shares: emptyShares, currentUsage: usage }).get("9") ?? {};
  const names = (arrivals.NEW ?? []).map((a) => a.name);
  assert.ok(!names.includes("Player A"), "observed at NEW this season ⇒ modelled at NEW, never a recent signing");
  // identity survives the move: one id, current team NEW
  const board = { matchup: "OPP @ NEW", players: [{ playerId: ID.A, name: "Player A", team: "NEW", markets: { player_receptions: { median: 4 } } }], newArrivals: arrivals };
  assert.deepEqual(auditBoard({ board, rosterByTeam: new Map([["NEW", new Set([ID.A])]]), unavailable: new Map(), usage }), []);
  const asOld = { ...board, players: [{ ...board.players[0], team: "OLD" }] };
  assert.ok(auditBoard({ board: asOld, rosterByTeam: new Map(), unavailable: new Map() }).some((v) => v.code === "THIRD_TEAM" && v.playerId === ID.A),
    "a row carrying the former club is a third team in this matchup");
});

test("§34 NEW SIGNING, no current sample · ROLE UNCERTAIN, old volume never copied", () => {
  const usage = currentSeasonUsageIndex({ forecast, season: 2026 });
  const arrivals = deriveNewArrivals({ corpusSeasons: [corpus2025], roleEvidence: roleEvidence(), shares: emptyShares, currentUsage: usage }).get("9");
  const b = arrivals.NEW.find((a) => a.playerId === ID.B);
  assert.ok(b, "a mover with no game for NEW yet stays visible as role-uncertain, never silently absent");
  assert.match(b.note, /no game for NEW yet this season/);
  assert.match(b.note, /historical prior/);
  const coverage = buildCoverage({ teams: ["NEW"], players: [], excluded: [], arrivals, qbRules: [] });
  const row = coverage.NEW.players.find((r) => r.playerId === ID.B);
  assert.equal(row.state, COVERAGE.WITHHELD_ROLE_UNCERTAIN);
  assert.equal(row.families, undefined, "no projected family — his OLD-club 14 carries/g are not copied to NEW");
});

test("§35 INJURED · an OUT player is never an arrival, never projected, never a TD scorer", () => {
  const re = roleEvidence({ [ID.B]: { state: "OUT" } });
  const arrivals = deriveNewArrivals({ corpusSeasons: [corpus2025], roleEvidence: re, shares: emptyShares, currentUsage: new Set() }).get("9") ?? {};
  assert.ok(!(arrivals.NEW ?? []).some((a) => a.playerId === ID.B), "the Rico Dowdle case: OUT ⇒ not in the strip (the old skip only knew 'INACTIVE')");
  const board = { matchup: "OPP @ NEW", players: [{ playerId: ID.C, name: "Player C", team: "NEW", participation: "INACTIVE", markets: { anytime_td: { probability: 0.4 } } }] };
  const v = auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map() });
  assert.ok(v.some((x) => x.code === "UNAVAILABLE_PROJECTED" && x.families.includes("anytime_td")), "a TD row for an unavailable player is a violation");
  const v2 = auditBoard({ board: { ...board, players: [{ ...board.players[0], participation: "AVAILABLE_ROLE_UNCERTAIN" }] }, rosterByTeam: new Map(), unavailable: new Map([[ID.C, "Injured Reserve"]]) });
  assert.ok(v2.some((x) => x.code === "UNAVAILABLE_PROJECTED"), "the injuries designation counts even when the row's own state does not say so");
  const cov = buildCoverage({ teams: ["NEW"], players: [], excluded: [{ playerId: ID.C, name: "Player C", team: "NEW", reason: "designation: Out" }], arrivals: {}, qbRules: [] });
  assert.equal(cov.NEW.players[0].state, COVERAGE.EXCLUDED_UNAVAILABLE);
  for (const s of ["OUT", "INACTIVE", "NOT_ON_ROSTER"]) assert.ok(isUnavailableState(s), s);
  for (const s of ["QUESTIONABLE", "ACTIVE_UNCERTAIN", "AVAILABLE_ROLE_UNCERTAIN", undefined]) assert.ok(!isUnavailableState(s), String(s));
});

test("§36 QUESTIONABLE · stays projected with its state; no probability of playing is invented", () => {
  const row = { playerId: ID.D, name: "Player D", team: "NEW", participation: "QUESTIONABLE", markets: { player_rush_yds: { median: 40 } } };
  const board = { matchup: "OPP @ NEW", players: [row] };
  assert.deepEqual(auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map() }), []);
  const cov = buildCoverage({ teams: ["NEW"], players: [row], excluded: [], arrivals: {}, qbRules: [] });
  assert.equal(cov.NEW.players[0].participation, "QUESTIONABLE", "the uncertainty is carried, truthfully labelled");
  assert.ok(!JSON.stringify(cov).match(/probab/i), "no participation probability appears anywhere in the receipt");
});

test("§37 RELEASED · off the current roster ⇒ cannot remain projected", () => {
  const board = { matchup: "OPP @ NEW", players: [{ playerId: ID.E, name: "Player E", team: "NEW", markets: { player_receptions: { median: 6 } } }] };
  const v = auditBoard({ board, rosterByTeam: new Map([["NEW", new Set([ID.A])]]), unavailable: new Map() });
  assert.ok(v.some((x) => x.code === "OFF_ROSTER" && x.playerId === ID.E));
});

test("§38 DUPLICATED IDENTITY · the same person on both sides is refused", () => {
  const board = { matchup: "OLD @ NEW", players: [
    { playerId: ID.F, name: "Player F", team: "OLD", markets: { player_receptions: {} } },
    { playerId: ID.F, name: "Player F", team: "NEW", markets: { player_receptions: {} } },
  ] };
  assert.ok(auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map() }).some((x) => x.code === "DUPLICATE_IDENTITY"));
});

test("§30 MATERIAL OMISSION · a current-season player of this game must end in SOME coverage state", () => {
  const board = {
    matchup: "OPP @ NEW",
    players: [{ playerId: ID.A, name: "Player A", team: "NEW", markets: { player_receptions: {} } }],
    coverage: { NEW: { counts: {}, players: [{ playerId: ID.C, name: "Player C", state: COVERAGE.EXCLUDED_UNAVAILABLE }] } },
  };
  const expected = new Set([`NEW:${ID.A}`, `NEW:${ID.C}`, `NEW:${ID.D}`, `ZZZ:${ID.E}`]);
  const v = auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map(), expected });
  assert.deepEqual(v.map((x) => `${x.code}:${x.playerId}`), [`MATERIAL_OMISSION:${ID.D}`],
    "projected and excluded players are accounted for; the silent one is not; another game's team is not this board's");
});

test("§21 · a current-season receiver the receiving family cannot see is NAMED, never silent", () => {
  const fc = {
    columns: ["gameId", "team", "market", "share", "lastSeason", "espnId"],
    rows: [
      ["G", "CLE", "player_receptions", 0.247, 2026, "1"],   // rookie, top target share — the KC Concepcion case
      ["G", "CLE", "player_receptions", 0.04, 2026, "2"],    // under the v1 pool's own 0.05 inclusion rule
      ["G", "CLE", "player_receptions", 0.3, 2025, "3"],     // last season only — not current-season evidence
      ["H", "CLE", "player_receptions", 0.3, 2026, "4"],     // another game
      ["G", "LA", "player_receptions", 0.2, 2026, "5"],
    ],
  };
  const gaps = receivingFamilyGaps({ forecast: fc, gameId: "G", season: 2026, toBoardTeam: (t) => (t === "LA" ? "LAR" : t), published: new Set(["player_receptions"]) });
  assert.deepEqual(gaps.map((g) => `${g.team}:${g.playerId}`), ["CLE:nfl-athlete-1", "LAR:nfl-athlete-5"]);
  assert.deepEqual(receivingFamilyGaps({ forecast: fc, gameId: "G", season: 2026, toBoardTeam: (t) => t, published: new Set() }), [], "an unpublished family owes no disclosure");
  const row = { playerId: "nfl-athlete-1", name: "Rookie", team: "CLE", markets: { anytime_td: { probability: 0.29 } } };
  const has = { playerId: "nfl-athlete-5", name: "Covered", team: "LAR", markets: { player_receptions: { median: 4 } } };
  const cov = buildCoverage({ teams: ["CLE", "LAR"], players: [row, has], excluded: [], arrivals: {}, qbRules: [], familyGaps: gaps });
  assert.equal(cov.CLE.players[0].notModeled[0].family, "player_receptions");
  assert.match(cov.CLE.players[0].notModeled[0].reason, /usage pool does not include his 2026 role/);
  assert.equal(cov.LAR.players[0].notModeled, undefined, "a player the family DOES project owes no disclosure");
});

/* ── the one-passer rule ─────────────────────────────────────────────────────────────────────── */
const chart = (team, ts, qbs) => indexDepthCharts({ snapshots: [{ team, timestamp: ts, quarterbacks: qbs.map(([id, name], i) => ({ playerId: id, name, rank: i + 1 })) }] });
const qbRows = () => [
  { playerId: "nfl-athlete-1", name: "Starter", team: "CLE", markets: { player_pass_yds: { median: 203 }, anytime_td: { probability: 0.1 } } },
  { playerId: "nfl-athlete-2", name: "Backup", team: "CLE", markets: { player_pass_yds: { median: 95 }, player_rush_yds: { median: 1 } } },
  { playerId: "nfl-athlete-3", name: "Third", team: "CLE", markets: { player_pass_yds: { median: 84 } } },
];

test("§19 · only the depth chart's QB1 keeps a passing projection; the survivor is not rescaled", () => {
  const players = qbRows();
  const r = applyQbStarterRule({ players, team: "CLE", index: chart("CLE", "2026-09-30T13:00:00Z", [["1", "Starter"], ["2", "Backup"], ["3", "Third"]]), asOf: "2026-10-01T20:00:00Z" });
  assert.equal(r.state, "APPLIED");
  assert.deepEqual(players.filter((p) => p.markets.player_pass_yds).map((p) => p.name), ["Starter"]);
  assert.equal(players[0].markets.player_pass_yds.median, 203, "removal, never renormalisation (§20)");
  assert.ok(players[1].markets.player_rush_yds, "only the pass-attempt pool is touched");
  assert.deepEqual(auditBoard({ board: { matchup: "PIT @ CLE", players, integrity: { qbStarter: [r] } }, rosterByTeam: new Map(), unavailable: new Map() }), []);
});

test("§19 · fail-closed: a stale chart, or a QB1 the board never projected, leaves the pool untouched", () => {
  const stale = qbRows();
  const r1 = applyQbStarterRule({ players: stale, team: "CLE", index: chart("CLE", "2026-09-20T13:00:00Z", [["1", "Starter"]]), asOf: "2026-10-01T20:00:00Z" });
  assert.equal(r1.state, "UNRESOLVED");
  assert.equal(stale.filter((p) => p.markets.player_pass_yds).length, 3);
  const absent = qbRows();
  const r2 = applyQbStarterRule({ players: absent, team: "CLE", index: chart("CLE", "2026-09-30T13:00:00Z", [["9", "Someone Else"]]), asOf: "2026-10-01T20:00:00Z" });
  assert.equal(r2.state, "UNRESOLVED");
  assert.match(r2.reason, /not in the board's passing pool/);
  assert.equal(absent.filter((p) => p.markets.player_pass_yds).length, 3);
  const noIndex = applyQbStarterRule({ players: qbRows(), team: "CLE", index: null, asOf: "2026-10-01T20:00:00Z" });
  assert.equal(noIndex.state, "UNRESOLVED");
});

test("§19 · the audit flags several passers unless the rule reported why it could not run", () => {
  const players = qbRows();
  const v = auditBoard({ board: { matchup: "PIT @ CLE", players, integrity: { qbStarter: [{ team: "CLE", state: "APPLIED" }] } }, rosterByTeam: new Map(), unavailable: new Map() });
  assert.ok(v.some((x) => x.code === "PASS_POOL_MULTI" && x.team === "CLE"));
  const ok = auditBoard({ board: { matchup: "PIT @ CLE", players, integrity: { qbStarter: [{ team: "CLE", state: "UNRESOLVED" }] } }, rosterByTeam: new Map(), unavailable: new Map() });
  assert.ok(!ok.some((x) => x.code === "PASS_POOL_MULTI"), "an explained, fail-closed pool is reported, not hidden — and not a violation");
});

test("the audit catches an arrival that contradicts the board", () => {
  const board = {
    matchup: "OPP @ NEW",
    players: [{ playerId: ID.A, name: "Player A", team: "NEW", markets: { player_receptions: {} } }],
    newArrivals: { NEW: [
      { playerId: ID.A, name: "Player A", team: "NEW", participation: "ACTIVE_UNCERTAIN" },
      { playerId: ID.C, name: "Player C", team: "NEW", participation: "OUT" },
      { playerId: ID.D, name: "Player D", team: "NEW", participation: "ACTIVE_UNCERTAIN" },
    ], XXX: [{ playerId: ID.E, name: "Player E", team: "XXX", participation: "ACTIVE_UNCERTAIN" }] },
  };
  const codes = auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map(), usage: new Set([`NEW:${ID.D}`]) }).map((v) => `${v.code}:${v.name}`);
  assert.ok(codes.includes("ARRIVAL_PROJECTED:Player A"));
  assert.ok(codes.includes("ARRIVAL_UNAVAILABLE:Player C"));
  assert.ok(codes.includes("ARRIVAL_HAS_CURRENT_USAGE:Player D"));
  assert.ok(codes.includes("THIRD_TEAM:Player E"));
});

/* ── LIVE: the real producer on the committed inputs ─────────────────────────────────────────── */
test("LIVE · the board producer, run on today's committed inputs, publishes zero integrity violations", () => {
  const cur = path.join(ROOT, "data/internal/nfl/current");
  const days = fs.existsSync(cur) ? fs.readdirSync(cur).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
  if (!days.length) { console.log("no current-event artifacts — nothing to run"); return; }
  let newest = null;
  for (const f of fs.readdirSync(path.join(cur, days.at(-1))).filter((x) => x.endsWith(".json"))) {
    const g = JSON.parse(fs.readFileSync(path.join(cur, days.at(-1), f), "utf8")).generatedAt;
    if (!newest || g > newest) newest = g;
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-board-"));
  try {
    execFileSync(process.execPath, ["scripts/nfl/build-nfl-player-board.mjs", "--now", newest, "--out-dir", out], { cwd: APP, stdio: "pipe" });
    const boards = fs.readdirSync(out).filter((f) => /^\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(out, f), "utf8")));
    console.log(`session-4 live audit: ${boards.length} board(s) built as of ${newest}`);
    for (const b of boards) {
      assert.ok(b.coverage && b.integrity, `${b.matchup}: the coverage receipt and integrity block must be published`);
      assert.equal(b.integrity.violations, 0, `${b.matchup}: integrity violations ${b.integrity.violations}`);
      for (const p of b.players) assert.ok(!isUnavailableState(p.participation), `${b.matchup}: ${p.name} is unavailable and still projected`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
