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

import { applyQbStarterRule, auditBoard, QB_STARTER_WITHHELD, QB_TIER, buildCoverage, currentSeasonUsageIndex, COVERAGE, isUnavailableState, receivingFamilyGaps } from "./board-roster-integrity.mjs";
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

/* ── founder decision 2026-11-11: starter identification apart from projection; one passer; evidence tiers ── */
const W10 = "2026-11-11T07:02:21Z";
const AS_OF = "2026-11-11T17:00:00Z";
const tierB = (career = 400) => (playerId, name) => (career >= 25
  ? { careerAttempts: career, market: { mean: 210, p10: 110, p25: 160, median: 205, p75: 255, p90: 320, pricingState: "NOT_PROBED" }, basis: `tier (b): ${career} verified NFL pass attempts` }
  : { careerAttempts: career, limitation: `${name}: ${career} NFL pass attempts in committed data (the projection needs 25 verified attempts; no tested rookie fallback exists)` });
const newRow = (team) => (s) => ({ playerId: s.playerId, name: s.name, team, participation: "AVAILABLE_ROLE_UNCERTAIN", markets: {} });

test("fail-closed: a stale chart with several passers, or no chart and no passer, withholds — never two passers", () => {
  const stale = qbRows();
  const r1 = applyQbStarterRule({ players: stale, team: "CLE", index: chart("CLE", "2026-09-20T13:00:00Z", [["1", "Starter"]]), asOf: "2026-10-01T20:00:00Z" });
  assert.equal(r1.state, QB_STARTER_WITHHELD);
  assert.equal(r1.tier, QB_TIER.D);
  assert.match(r1.reason, /starting QB not confirmed — depth chart STALE/);
  assert.equal(stale.filter((p) => p.markets.player_pass_yds).length, 0);
  assert.ok(stale[1].markets.player_rush_yds, "only the pass-attempt pool is touched");
  const single = [qbRows()[0]];
  const r2 = applyQbStarterRule({ players: single, team: "CLE", index: null, asOf: "2026-10-01T20:00:00Z" });
  assert.equal(r2.state, "APPLIED", "control: without a chart a single board passer stands");
  assert.equal(single[0].markets.player_pass_yds.median, 203);
});

test("scenario · traded QB (BAL Brissett): QB1 has no club row → tier (b) from all-club history, the backup's line removed", () => {
  const players = [
    { playerId: "nfl-athlete-4429582", name: "Joe Fagnano", team: "BAL", markets: { player_pass_yds: { median: 127 }, player_rush_yds: { median: 3 } } },
    { playerId: "nfl-athlete-1", name: "Derrick Henry", team: "BAL", markets: { player_rush_yds: { median: 80 } } },
  ];
  const r = applyQbStarterRule({ players, team: "BAL", index: chart("BAL", W10, [["9001", "Jacoby Brissett"], ["4429582", "Joe Fagnano"]]), asOf: AS_OF, tierBFor: tierB(2400), rowFor: newRow("BAL"), shareOf: (id) => (id === "nfl-athlete-4429582" ? 0.36 : undefined) });
  assert.equal(r.state, "APPLIED");
  assert.equal(r.tier, QB_TIER.B);
  assert.deepEqual(players.filter((p) => p.markets.player_pass_yds).map((p) => p.name), ["Jacoby Brissett"]);
  assert.equal(players.find((p) => p.name === "Jacoby Brissett").markets.player_pass_yds.tier, QB_TIER.B);
  assert.equal(players[0].markets.player_rush_yds.median, 3, "the backup keeps his other families");
  assert.match(r.removed[0].reason, /not BAL's starting quarterback \(Jacoby Brissett, depth chart QB1\)/);
});

test("scenario · backup now starter (NYG McCarthy): club share below the floor no longer withholds — tier (b) replaces it", () => {
  const players = [{ playerId: "nfl-athlete-4433970", name: "J.J. McCarthy", team: "NYG", markets: { player_pass_yds: { median: 140 } } }];
  const r = applyQbStarterRule({ players, team: "NYG", index: chart("NYG", W10, [["4433970", "J.J. McCarthy"], ["2969939", "Jameis Winston"]]), asOf: AS_OF, shareOf: () => 0.59, tierBFor: tierB(700) });
  assert.equal(r.tier, QB_TIER.B);
  assert.equal(players[0].markets.player_pass_yds.median, 205, "the relief-share line is replaced, never rescaled");
  /* control: with a starter's club share the existing model stands (tier a) */
  const a = [{ playerId: "nfl-athlete-4433970", name: "J.J. McCarthy", team: "NYG", markets: { player_pass_yds: { median: 240 } } }];
  const ra = applyQbStarterRule({ players: a, team: "NYG", index: chart("NYG", W10, [["4433970", "J.J. McCarthy"]]), asOf: AS_OF, shareOf: () => 0.93, tierBFor: tierB(700) });
  assert.equal(ra.tier, QB_TIER.A);
  assert.equal(a[0].markets.player_pass_yds.median, 240);
});

test("scenario · rookie (MIA McCord, 0 attempts): starts, but is withheld with the exact limitation — nothing invented", () => {
  const players = [{ playerId: "nfl-athlete-5", name: "De'Von Achane", team: "MIA", markets: { player_rush_yds: { median: 60 } } }];
  const r = applyQbStarterRule({ players, team: "MIA", index: chart("MIA", W10, [["7001", "Kyle McCord"], ["4242512", "Malik Willis"]]), asOf: AS_OF, availabilityOf: (id) => (id === "nfl-athlete-4242512" ? { state: "INELIGIBLE", status: "Injured Reserve" } : { state: "ELIGIBLE" }), tierBFor: tierB(0), rowFor: newRow("MIA") });
  assert.equal(r.state, QB_STARTER_WITHHELD);
  assert.equal(r.tier, QB_TIER.D);
  assert.equal(r.starter.name, "Kyle McCord");
  assert.match(r.reason, /Kyle McCord: 0 NFL pass attempts in committed data/);
  assert.ok(!players.some((p) => p.markets.player_pass_yds));
  assert.equal(players.length, 1, "no row is created for a withheld starter");
});

test("scenario · injured QB1 (SEA Darnold Out): the next healthy QB on the chart starts; UNKNOWN availability is never guessed past", () => {
  const players = [{ playerId: "nfl-athlete-3924327", name: "Drew Lock", team: "SEA", markets: { player_pass_yds: { median: 181 } } }];
  const avail = (id) => (id === "nfl-athlete-3912547" ? { state: "INELIGIBLE", status: "Out" } : { state: "ELIGIBLE" });
  const r = applyQbStarterRule({ players, team: "SEA", index: chart("SEA", W10, [["3912547", "Sam Darnold"], ["3924327", "Drew Lock"]]), asOf: AS_OF, availabilityOf: avail, shareOf: () => 0.9 });
  assert.equal(r.starter.name, "Drew Lock");
  assert.deepEqual(r.skipped.map((x) => x.name), ["Sam Darnold"]);
  assert.match(r.source, /past Sam Darnold \(unavailable\)/);
  const u = applyQbStarterRule({ players: [{ ...players[0], markets: { player_pass_yds: { median: 181 } } }], team: "SEA", index: chart("SEA", W10, [["3912547", "Sam Darnold"], ["3924327", "Drew Lock"]]), asOf: AS_OF, availabilityOf: () => ({ state: "UNKNOWN" }) });
  assert.equal(u.state, QB_STARTER_WITHHELD);
  assert.match(u.reason, /availability UNKNOWN/);
});

test("scenario · several QBs with history (MIN): only the chart's starter carries passing; share never picks him", () => {
  const players = [
    { playerId: "nfl-athlete-3917315", name: "Kyler Murray", team: "MIN", markets: { player_pass_yds: { median: 175 } } },
    { playerId: "nfl-athlete-2573079", name: "Carson Wentz", team: "MIN", markets: { player_pass_yds: { median: 152 } } },
  ];
  const r = applyQbStarterRule({ players, team: "MIN", index: chart("MIN", W10, [["8001", "Kirk Cousins"], ["3917315", "Kyler Murray"]]), asOf: AS_OF, shareOf: (id) => ({ "nfl-athlete-3917315": 0.44, "nfl-athlete-2573079": 0.41 })[id], tierBFor: tierB(6000), rowFor: newRow("MIN") });
  assert.equal(r.starter.name, "Kirk Cousins");
  assert.deepEqual(players.filter((p) => p.markets.player_pass_yds).map((p) => p.name), ["Kirk Cousins"]);
  assert.deepEqual(r.removed.map((x) => x.name).sort(), ["Carson Wentz", "Kyler Murray"]);
  assert.deepEqual(auditBoard({ board: { matchup: "MIN @ GB", players, integrity: { qbStarter: [r] } }, rosterByTeam: new Map(), unavailable: new Map() }), []);
  const cov = buildCoverage({ teams: ["MIN"], players, excluded: [], arrivals: {}, qbRules: [r] });
  assert.match(cov.MIN.players.find((x) => x.name === "Kyler Murray").notModeled[0].reason, /not MIN's starting quarterback/);
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

/* ── Session 5 · rushing-family publication despite a failing allocation gate ────────────────────── */
test("Session 5 · the audit flags a share-level family published on an over-allocated pool, recomputed from the forecast", () => {
  const board = {
    matchup: "ARI @ NYG",
    families: { player_rush_yds: { state: "PUBLISHED", model: "nfl-player-share-level-v1" }, player_receptions: { state: "PUBLISHED" } },
    players: [
      { playerId: "nfl-athlete-1", team: "ARI", name: "Love", markets: { player_rush_yds: { median: 50 } }, participation: "AVAILABLE_ROLE_UNCERTAIN" },
      { playerId: "nfl-athlete-2", team: "ARI", name: "Conner", markets: { player_rush_yds: { median: 40 }, player_receptions: { median: 2 } }, participation: "AVAILABLE_ROLE_UNCERTAIN" },
      { playerId: "nfl-athlete-3", team: "ARI", name: "WR", markets: { player_receptions: { median: 5 } }, participation: "AVAILABLE_ROLE_UNCERTAIN" },
    ],
    coverage: {},
  };
  const shares = { "1|ARI|player_rush_yds": 0.57, "2|ARI|player_rush_yds": 0.44, "2|ARI|player_receptions": 0.6, "3|ARI|player_receptions": 0.6 };
  const shareOf = (id, team, m) => shares[`${id}|${team}|${m}`];
  const v = auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map(), shareOf });
  const hits = v.filter((x) => x.code === "POOL_OVER_ALLOCATED_PUBLISHED");
  assert.equal(hits.length, 1, "receptions come from the allocating v1 engine (no share-level model) and are not this check's business");
  assert.equal(hits[0].pool, "carries");
  assert.deepEqual(auditBoard({ board, rosterByTeam: new Map(), unavailable: new Map() }).filter((x) => x.code === "POOL_OVER_ALLOCATED_PUBLISHED"), [], "no share table ⇒ the check cannot run, and says nothing");
});

test("Session 5 · a withheld pool is accounted for in the receipt, including a rush-only row that emptied", () => {
  const cov = buildCoverage({
    teams: ["ARI"],
    players: [{ playerId: "nfl-athlete-1", name: "Love", team: "ARI", markets: { anytime_td: { probability: 0.4 } } }],
    excluded: [], arrivals: {}, qbRules: [],
    poolWithheld: [{ team: "ARI", pool: "carries", markets: ["player_rush_yds"], sum: 1.31, players: [{ playerId: "nfl-athlete-1", name: "Love", share: 0.57 }, { playerId: "nfl-athlete-9", name: "Brissett", share: 0.13 }] }],
  });
  const love = cov.ARI.players.find((r) => r.name === "Love");
  assert.equal(love.state, "PROJECTED");
  assert.equal(love.notModeled[0].state, "WITHHELD_POOL_OVER_ALLOCATED");
  const qb = cov.ARI.players.find((r) => r.name === "Brissett");
  assert.ok(qb, "a player whose only family was the withheld one is never dropped in silence");
  assert.equal(qb.notModeled[0].family, "player_rush_yds");
});
