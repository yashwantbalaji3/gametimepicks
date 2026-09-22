/**
 * NBA expected-minutes guards (N2): null-not-zero, DNP exclusion, OUT via injuries, population
 * separation, trailing-10 vs season basis, rates null under 3 games, leakage cutoff.
 * NBA PRESEASON — EXPERIMENTAL · PRIVATE_RESEARCH.
 *
 * Run: npx tsx --test src/lib/sports/nba/minutes-model.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { expectedMinutes, availabilityFromInjuries, teamGames, MIN_GAMES_FOR_RATES } from "./minutes-model.mjs";

const TEAM = "28";
const player = (id, name, over = {}) => ({ providerAthleteId: id, name, providerTeamId: TEAM, starter: false, didNotPlay: false, dnpReason: null, minutes: 30, pts: 15, reb: 6, ast: 3, threePm: 2, threePa: 5, ...over });
const dnp = (id, name) => player(id, name, { didNotPlay: true, dnpReason: "COACH'S DECISION", minutes: null, pts: null, reb: null, ast: null, threePm: null });
const doc = (id, dateUtc, players, over = {}) => ({ schemaVersion: 1, providerEventId: id, season: 2026, phase: 2, dateUtc, boxscoreAvailable: true, teams: [{ providerTeamId: TEAM, abbr: "TOR", homeAway: "home" }, { providerTeamId: "14", abbr: "MIA", homeAway: "away" }], players, ...over });

// 12 regular-season games; A plays all (starter), B plays the first 8 only, C is DNP always, D has null minutes.
const REG = Array.from({ length: 12 }, (_, i) => doc(`r${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00Z`, [
  player("A", "Starter A", { starter: true, minutes: 34 + (i % 2), pts: 20 + i }),
  ...(i < 8 ? [player("B", "Bench B", { minutes: 12 })] : [dnp("B", "Bench B")]),
  dnp("C", "Never C"),
  player("D", "Null D", { minutes: null, pts: 0 }),
]));
const PRE = [doc("p0", "2025-10-05T00:00Z", [player("A", "Starter A", { starter: true, minutes: 18 }), player("E", "Camp E", { minutes: 20 })], { phase: 1 })];
const NOW = "2026-09-22T12:00:00Z";

test("null-not-zero: DNP and null-minute rows are excluded from means and counted separately", () => {
  const out = expectedMinutes({ boxscores: REG, teamProviderId: TEAM, asOfDateUtc: NOW });
  const byId = Object.fromEntries(out.rows.map((r) => [r.providerAthleteId, r]));
  assert.equal(byId.C.expectedMinutes, null, "all-DNP player is null, never 0");
  assert.equal(byId.C.dnpCount, 12);
  assert.equal(byId.C.gamesUsed, 0);
  assert.equal(byId.C.basis, "insufficient");
  assert.equal(byId.D.expectedMinutes, null, "null minutes never become 0");
  assert.equal(byId.D.nullMinutesCount, 12);
  assert.equal(byId.D.rates, null);
  // B's 4 DNPs inside the trailing-10 window do not drag the mean: 12 minutes stays 12.
  assert.equal(byId.B.dnpCount, 4);
  assert.equal(byId.B.expectedMinutes, 12);
});

test("basis: trailing10 when ≥3 appearances in the last 10 team games; season fallback; rates null under 3 games", () => {
  const out = expectedMinutes({ boxscores: REG, teamProviderId: TEAM, asOfDateUtc: NOW });
  const byId = Object.fromEntries(out.rows.map((r) => [r.providerAthleteId, r]));
  assert.equal(out.teamGamesInSeason, 12);
  assert.equal(out.teamGamesInWindow, 10);
  assert.equal(out.windowToDateUtc, "2026-01-12T00:00Z");
  assert.equal(byId.A.basis, "trailing10");
  assert.equal(byId.A.gamesUsed, 10);
  assert.equal(byId.A.starterRate, 1);
  assert.ok(Math.abs(byId.A.expectedMinutes - 34.5) < 1e-9);
  assert.ok(Math.abs(byId.A.rates.pts - (Array.from({ length: 10 }, (_, k) => 22 + k).reduce((s, x) => s + x, 0) / 345)) < 1e-3, "rate is minutes-weighted over the window");
  // B appears in games r2..r7 of the window (6 appearances) → trailing10.
  assert.equal(byId.B.basis, "trailing10");
  assert.equal(byId.B.gamesUsed, 6);
  // A player with 2 appearances early in the season (outside the window) → basis season? no: <3 → insufficient, rates null.
  const two = [...REG.slice(0, 2).map((d, i) => ({ ...d, players: [...d.players, player("F", "Two F", { minutes: 5 })], providerEventId: `f${i}` })), ...REG.slice(2)];
  const f = expectedMinutes({ boxscores: two, teamProviderId: TEAM, asOfDateUtc: NOW }).rows.find((r) => r.providerAthleteId === "F");
  assert.equal(f.basis, "insufficient");
  assert.equal(f.gamesUsed, 2);
  assert.equal(f.expectedMinutes, 5, "a 2-game mean is reported, flagged insufficient — never zero-filled");
  assert.equal(f.rates, null, `rates null under ${MIN_GAMES_FOR_RATES} games`);
  // 3 appearances all outside the trailing window → season basis.
  const three = REG.map((d, i) => (i < 3 ? { ...d, players: [...d.players, player("G", "Early G", { minutes: 9 })] } : d));
  const gRow = expectedMinutes({ boxscores: three, teamProviderId: TEAM, asOfDateUtc: NOW }).rows.find((r) => r.providerAthleteId === "G");
  assert.equal(gRow.basis, "season");
  assert.equal(gRow.gamesUsed, 3);
  assert.ok(gRow.rates && Number.isFinite(gRow.rates.pts));
});

test("OUT via injuries: status containing 'Out' → availability out + expectedMinutes null; Day-To-Day stays active; no feed → unknown", () => {
  const injuries = [
    { providerTeamId: TEAM, athleteId: "A", athleteName: "Starter A", status: "Out" },
    { providerTeamId: TEAM, athleteId: "B", athleteName: "Bench B", status: "Day-To-Day" },
    { providerTeamId: TEAM, athleteId: "ROOKIE", athleteName: "No History", status: "Out For Season" },
    { providerTeamId: "14", athleteId: "A", athleteName: "Other team's A", status: "Out" },
  ];
  const out = expectedMinutes({ boxscores: REG, teamProviderId: TEAM, asOfDateUtc: NOW, injuries });
  const byId = Object.fromEntries(out.rows.map((r) => [r.providerAthleteId, r]));
  assert.equal(byId.A.availability, "out");
  assert.equal(byId.A.expectedMinutes, null);
  assert.equal(byId.A.injuryStatus, "Out");
  assert.equal(byId.A.gamesUsed, 10, "history is kept; only the forecast minutes are nulled");
  assert.equal(byId.B.availability, "active");
  assert.equal(byId.B.injuryStatus, "Day-To-Day");
  assert.equal(byId.C.availability, "active");
  assert.deepEqual(out.unmatchedInjuries, [{ athleteId: "ROOKIE", athleteName: "No History", status: "Out For Season" }]);
  assert.equal(out.injuriesProvided, true);
  const none = expectedMinutes({ boxscores: REG, teamProviderId: TEAM, asOfDateUtc: NOW });
  assert.ok(none.rows.every((r) => r.availability === "unknown"), "no feed is unknown, not active");
  assert.equal(none.injuriesProvided, false);
  assert.equal(availabilityFromInjuries([{ athleteId: "x", status: "out for season" }], TEAM, "x").availability, "out", "case-insensitive");
});

test("populations are separate: preseason minutes come only from phase-1 games; leakage cutoff strictly earlier", () => {
  const all = [...PRE, ...REG];
  const pre = expectedMinutes({ boxscores: all, teamProviderId: TEAM, asOfDateUtc: NOW, population: "preseason" });
  assert.equal(pre.teamGamesInSeason, 1);
  assert.equal(pre.seasonUsed, 2026);
  const a = pre.rows.find((r) => r.providerAthleteId === "A");
  assert.equal(a.expectedMinutes, 18, "preseason A ≠ regular A (34.5)");
  assert.equal(a.basis, "insufficient");
  assert.ok(pre.rows.some((r) => r.providerAthleteId === "E"));
  const reg = expectedMinutes({ boxscores: all, teamProviderId: TEAM, asOfDateUtc: NOW, population: "regular" });
  assert.ok(!reg.rows.some((r) => r.providerAthleteId === "E"), "camp-only player never leaks into the regular population");
  assert.equal(teamGames(all, TEAM, "2026-01-05T00:00Z").length, 4, "games at/after asOf are excluded");
  assert.throws(() => expectedMinutes({ boxscores: all, teamProviderId: TEAM, asOfDateUtc: NOW, population: "both" }), /population/);
});

test("a team with no history yields an empty, honest result (no rows, no season)", () => {
  const out = expectedMinutes({ boxscores: REG, teamProviderId: "999", asOfDateUtc: NOW, injuries: [] });
  assert.equal(out.rows.length, 0);
  assert.equal(out.seasonUsed, null);
  assert.equal(out.teamGamesInSeason, 0);
});
