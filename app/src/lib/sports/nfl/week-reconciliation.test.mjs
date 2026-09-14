import { test } from "node:test";
import assert from "node:assert/strict";

import { officialFromEspnSummary, gradeGame, summariseWeek, RECONCILIATION_RULES } from "./week-reconciliation.mjs";

/* An ESPN-shaped summary: KC 27, DEN 20. The QB throws two TDs, the RB runs one in. */
const espn = (overrides = {}) => ({
  header: { competitions: [{
    status: { type: { name: "STATUS_FINAL", completed: true } },
    competitors: [
      { homeAway: "home", score: "27", team: { abbreviation: "KC" } },
      { homeAway: "away", score: "20", team: { abbreviation: "DEN" } },
    ],
    ...overrides.comp,
  }] },
  boxscore: { players: [{ team: { abbreviation: "KC" }, statistics: [
    { name: "passing", labels: ["C/ATT", "YDS", "AVG", "TD", "INT"], athletes: [{ athlete: { id: "1", displayName: "QB One" }, stats: ["20/30", "250", "8.3", "2", "0"] }] },
    { name: "rushing", labels: ["CAR", "YDS", "AVG", "TD", "LONG"], athletes: [
      { athlete: { id: "2", displayName: "RB Two" }, stats: ["15", "61", "4.1", "1", "12"] },
      { athlete: { id: "1", displayName: "QB One" }, stats: ["2", "5", "2.5", "0", "4"] },
    ] },
    { name: "receiving", labels: ["REC", "YDS", "AVG", "TD", "LONG", "TGTS"], athletes: [{ athlete: { id: "3", displayName: "WR Three" }, stats: ["6", "88", "14.7", "0", "30", "9"] }] },
  ] }] },
});

const forecast = {
  providerEventId: "900", matchup: "DEN @ KC", kickoffUtc: "2026-09-15T00:15Z", generatedAt: "2026-09-14T14:30:00Z",
  home: { abbr: "KC", name: "Kansas City Chiefs" }, away: { abbr: "DEN", name: "Denver Broncos" },
  forecastSummary: {
    projectedScore: { home: 26, away: 21 },
    winProbability: { home: 0.6, away: 0.37, tieMass: 0.03 },
    total: { median: 47, p10: 33, p90: 61 },
    margin: { median: 4, p10: -10, p90: 18 },
  },
  marketComparison: { marketTotal: 44.5 },
};

const board = {
  generatedAt: "2026-09-14T14:30:00Z",
  families: { player_rush_yds: { state: "ESTIMATE" }, player_receptions: { state: "PUBLISHED" }, player_reception_yds: { state: "PUBLISHED" }, player_pass_yds: { state: "ESTIMATE" }, player_pass_int: { state: "WITHHELD" }, anytime_td: { state: "PUBLISHED" } },
  players: [
    /* p10 61.4 is PRINTED as 61, and he ran for exactly 61: a hit as the reader saw it, a miss on the raw float. */
    { playerId: "nfl-athlete-2", name: "RB Two", team: "KC", markets: { player_rush_yds: { p10: 61.4, median: 70.2, p90: 110 }, anytime_td: { probability: 0.45 } } },
    { playerId: "nfl-athlete-3", name: "WR Three", team: "KC", markets: { player_receptions: { p10: 1, median: 4, p90: 6 }, player_reception_yds: { p10: 10, median: 45, p90: 80 }, anytime_td: { probability: 0.3 } } },
    { playerId: "nfl-athlete-1", name: "QB One", team: "KC", markets: { player_pass_yds: { p10: 180, median: 240, p90: 300 }, player_pass_int: { p10: 0, p90: 2 }, anytime_td: { probability: 0.1 } } },
    { playerId: "nfl-athlete-4", name: "TE Four", team: "KC", markets: { player_receptions: { p10: 1, median: 3, p90: 5 }, anytime_td: { probability: 0.2 } } },
  ],
};

test("official lines: final score, player stats, and who is credited with a touchdown", () => {
  const o = officialFromEspnSummary(espn());
  assert.equal(o.state, "FINAL");
  assert.deepEqual(o.finalScore, { home: 27, away: 20 });
  assert.equal(o.players["2"].rushYds, 61);
  assert.equal(o.players["3"].receptions, 6);
  assert.equal(o.players["1"].passYds, 250);
  assert.equal(o.players["1"].rushYds, 5, "one athlete across two categories is one player");
  assert.deepEqual(o.scorers, [{ playerId: "1", creditType: "PASS" }, { playerId: "2", creditType: "RUSH" }]);
  assert.equal(officialFromEspnSummary(espn({ comp: { status: { type: { name: "STATUS_IN_PROGRESS", completed: false } } } })).state, "PENDING");
  assert.equal(officialFromEspnSummary(null).state, "PENDING");
});

test("a graded game: every rule as published, as the reader saw it", () => {
  const g = gradeGame({ forecast, board, official: officialFromEspnSummary(espn()) });
  assert.equal(g.state, "FINAL");
  const team = Object.fromEntries(g.team.map((t) => [t.prop, t.outcome]));
  assert.deepEqual(team, { winner: "HIT", total_range: "HIT", margin_range: "HIT", closer_than_sportsbook: "HIT" });

  const row = (name, prop) => g.players.find((r) => r.name === name && r.prop === prop);
  assert.equal(row("RB Two", "player_rush_yds").outcome, "HIT", "graded against the printed bound 61, not the float 61.4");
  assert.equal(row("RB Two", "player_rush_yds").low, 61);
  assert.equal(row("WR Three", "player_receptions").outcome, "HIT", "a range's upper bound is inside it");
  assert.equal(row("WR Three", "player_reception_yds").outcome, "MISS");
  assert.equal(row("QB One", "player_pass_yds").outcome, "HIT");
  assert.equal(row("QB One", "player_pass_yds").status, "ESTIMATE", "estimates are graded and labelled");
  assert.equal(row("TE Four", "player_receptions").outcome, "VOID", "no line in the box score is void, never a miss");
  assert.ok(!g.players.some((r) => r.prop === "player_pass_int"), "a WITHHELD family was never shown, so it is never graded");

  const td = Object.fromEntries(g.touchdowns.map((t) => [t.name, t.outcome]));
  assert.deepEqual(td, { "RB Two": "SCORED", "WR Three": "DID_NOT_SCORE", "QB One": "DID_NOT_SCORE", "TE Four": "VOID" });
  assert.equal(g.touchdowns.find((t) => t.likeliest).name, "RB Two");
});

test("the week summary: per prop and overall, voids excluded, sportsbook comparison kept out of the rates", () => {
  const graded = gradeGame({ forecast, board, official: officialFromEspnSummary(espn()) });
  const pending = gradeGame({ forecast: { ...forecast, providerEventId: "901" }, board, official: { state: "PENDING" } });
  const s = summariseWeek([graded, pending]);
  assert.equal(s.gamesFinal, 1);
  assert.equal(s.gamesPending, 1);
  const p = Object.fromEntries(s.props.map((x) => [x.id, x]));
  assert.deepEqual([p.winner.hits, p.winner.checks], [1, 1]);
  assert.deepEqual([p.player_receptions.hits, p.player_receptions.checks, p.player_receptions.voids], [1, 1, 1]);
  assert.deepEqual([p.player_reception_yds.hits, p.player_reception_yds.checks], [0, 1]);
  assert.equal(p.likeliest_scorer.rate, 1);
  assert.equal(p.player_rush_yds.status, "ESTIMATE");
  assert.deepEqual(s.overall, { checks: 8, hits: 7, rate: 7 / 8 });
  assert.deepEqual(s.context.closerThanSportsbook, { oursCloser: 1, booksCloser: 0, even: 0, noLine: 0 });
  assert.deepEqual(s.context.touchdowns, { playersGraded: 3, expectedScorers: 0.9, actualScorers: 1 });
});

test("a tie voids the winner check; a missing board is named, not silent", () => {
  const tie = espn({ comp: { competitors: [{ homeAway: "home", score: "20", team: { abbreviation: "KC" } }, { homeAway: "away", score: "20", team: { abbreviation: "DEN" } }] } });
  const g = gradeGame({ forecast, board: null, boardRefused: "the player board on file was generated at or after kickoff", official: officialFromEspnSummary(tie) });
  assert.equal(g.team.find((t) => t.prop === "winner").outcome, "VOID");
  assert.deepEqual(g.players, []);
  assert.match(g.boardNote, /after kickoff/);
});

test("the rules a reader is shown say what a hit means, and never grade the model as a bettor", () => {
  const text = Object.values(RECONCILIATION_RULES).join(" ").toLowerCase();
  assert.match(text, /8 in 10/);
  assert.match(text, /void/);
  for (const word of ["edge", "lock", "beat the", "profit"]) assert.ok(!text.includes(word), `rules mention "${word}"`);
});
