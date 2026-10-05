/**
 * Ask audit 2026-10-05 · Forecast-history wording and fail-closed behaviour.
 *
 *   1. A history RANGE is written "X to Y". A dashed range ("50.8–196.1") contains "8–196", which the verifier's record
 *      check reads as a W–L; a realistic writer draft naming the opponent was refused as a record given to the wrong
 *      owner and every such answer shipped as the deterministic fallback. Probed against the UNCHANGED verifier, with a
 *      control proving the dashed phrasing is what failed.
 *   2. A team / club / fighter / game with no rows FAILS CLOSED. It used to return OK with "GameTime published 0
 *      forecasts", from which a writer said "GameTime has not published any match forecasts for Arsenal" — and the
 *      verifier passed it (no number, no pick, no record). Missing is not zero.
 *   3. A directional record says what it grades (the Results page's basis words), never "a pick was published".
 *   4. A per-team median score is never called a projected (final) score.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { ASK_FORECAST_KINDS, ASK_FORECAST_ROW, ASK_STATUS, askAssetPath } from "./contract.mjs";
import { buildEvidence } from "./evidence.mjs";
import { verifyAnswer } from "./verifier.mjs";
import { getForecastFamilyPerformance, getForecastHistory } from "./tools/forecast-record.mjs";

const INDEX = {
  schemaVersion: 1, artifact: "ask-forecast-record", available: true, asOf: "2026-10-05T12:19:41Z",
  kpis: { forecasts: 6, measured: 5 },
  families: [
    { sport: "NFL", family: "player_reception_yds", label: "Receiving yards", kind: "CONTINUOUS_PROJECTION", counts: { published: 2, withdrawn: 0, measured: 2, pending: 0, void: 0, unmeasured: 0 }, n: 2, mae: 39.2, medianAbsError: 39.2, rmse: 43, bias: -39.2, coverage: { n: 2, inside: 1, target: 0.8 }, pickRecord: { win: 1, loss: 0, push: 0, basis: ["IMPLIED_SIDE_OF_FROZEN_LINE"] }, latestEvent: "2026-09-27T20:05Z", href: "/results/forecasts/nfl/player-reception-yds/" },
    { sport: "NFL", family: "nfl_team_score", label: "Team score", kind: "CONTINUOUS_PROJECTION", counts: { published: 1, withdrawn: 0, measured: 1, pending: 0, void: 0, unmeasured: 0 }, n: 1, mae: 4, medianAbsError: 4, rmse: 4, bias: 4, coverage: null, pickRecord: null, latestEvent: "2026-09-27T20:05Z", href: "/results/forecasts/nfl/nfl-team-score/" },
    { sport: "NFL", family: "nfl_game_winner", label: "Game winner", kind: "BINARY_PROBABILITY", counts: { published: 1, withdrawn: 0, measured: 1, pending: 0, void: 0, unmeasured: 0 }, n: 1, brier: 0.16, logLoss: 0.51, meanForecast: 0.6, observedRate: 1, ece: 0.4, pickRecord: { win: 1, loss: 0, push: 0, basis: ["HIGHER_WIN_PROBABILITY_SIDE"] }, latestEvent: "2026-09-27T20:05Z", href: "/results/forecasts/nfl/nfl-game-winner/" },
  ],
  gaps: [],
  shards: { nfl: 4 },
};
const K = (k) => ASK_FORECAST_KINDS.indexOf(k);
const row = (o) => ASK_FORECAST_ROW.map((c) => o[c] ?? null);
const SHARD = {
  schemaVersion: 1, artifact: "ask-forecast-rows", sport: "nfl", columns: [...ASK_FORECAST_ROW], kinds: [...ASK_FORECAST_KINDS],
  dict: {
    families: [["NFL", "player_reception_yds"], ["NFL", "nfl_team_score"], ["NFL", "nfl_game_winner"]],
    subjects: [["nfl-athlete-4430878", "Jaxon Smith-Njigba", "SEA"], ["nfl-team-26", "Seattle Seahawks", "nfl-team-26"], ["nfl-401872900", "SEA @ WSH", null]],
    matchups: ["SEA @ WSH", "SEA @ ARI"],
  },
  rows: [
    row({ family: 0, date: "2026-09-27", subject: 0, matchup: 0, kind: K("CONTINUOUS_PROJECTION"), projection: 107.5, rangeLow: 50.8, rangeHigh: 196.1, state: "SETTLED", finalValue: 128, absoluteError: 20.5, directional: "WIN" }),
    row({ family: 0, date: "2026-09-20", subject: 0, matchup: 1, kind: K("CONTINUOUS_PROJECTION"), projection: 97.1, rangeLow: 45.3, rangeHigh: 178.7, state: "SETTLED", finalValue: 155, absoluteError: 57.9 }),
    row({ family: 1, date: "2026-09-27", subject: 1, matchup: 0, kind: K("CONTINUOUS_PROJECTION"), projection: 24, rangeLow: 14, rangeHigh: 34, state: "SETTLED", finalValue: 20, absoluteError: 4 }),
    row({ family: 2, date: "2026-09-27", subject: 2, matchup: 0, kind: K("BINARY_PROBABILITY"), probability: 0.6, state: "SETTLED", finalValue: 1, observed: 1, brier: 0.16, directional: "WIN" }),
  ],
};
const ctx = (index = INDEX, shard = SHARD) => ({
  turn: { load: async (p) => (p === askAssetPath.forecastRecord() ? { ok: true, json: index } : p === askAssetPath.forecastRows("nfl") ? { ok: true, json: shard } : { ok: false }) },
});
const evidenceOf = (env, tool) => buildEvidence([{ tool, status: env.status, error: env.error, detail: env.detail, links: env.links, data: env }]);
const textOf = (env, tool) => evidenceOf(env, tool).facts.map((f) => f.text).join(" | ");

/* The answer a real writer produced for "how did JSN do the times we projected him over 80" — it names the opponent. */
const NATURAL_DRAFT =
  "GameTime has projected Jaxon Smith-Njigba over 80 receiving yards twice:\n\n" +
  "1. **Sept. 27 at Washington** — projected 107.5 (range 50.8 to 196.1). He had 128, a miss of 20.5.\n" +
  "2. **Sept. 20 at Arizona** — projected 97.1 (range 45.3 to 178.7). He had 155, a miss of 57.9.\n\n" +
  "This list is not a record.";

test("1 · history ranges read 'X to Y', and a natural draft naming the opponent now verifies (verifier unchanged)", async () => {
  const env = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430878", family: "player_reception_yds", minProjection: 80, limit: 3 }, ctx());
  const ev = evidenceOf(env, "getForecastHistory");
  const t = ev.facts.map((f) => f.text).join(" | ");
  assert.match(t, /\(range 50\.8 to 196\.1\)/);
  assert.doesNotMatch(t, /\d–\d/, "no dashed numeric span left in history evidence");
  const v = verifyAnswer(NATURAL_DRAFT, ev, { userNumbers: [80] });
  assert.equal(v.ok, true, JSON.stringify(v.violations));
});

test("1 · control: the old dashed phrasing is exactly what the record check refused", async () => {
  const env = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430878", family: "player_reception_yds", minProjection: 80, limit: 3 }, ctx());
  const ev = evidenceOf(env, "getForecastHistory");
  const dashed = { ...ev, facts: ev.facts.map((f) => ({ ...f, text: f.text.replace(/range ([\d.]+) to ([\d.]+)/, "range $1–$2") })) };
  const v = verifyAnswer(NATURAL_DRAFT.replace(/range ([\d.]+) to ([\d.]+)/g, "range $1–$2"), dashed, { userNumbers: [80] });
  assert.equal(v.ok, false, "probe: the dashed range is read as a W–L attached to Washington");
  assert.ok(v.violations.some((x) => x.rule === "UNSUPPORTED_RECORD"), JSON.stringify(v.violations));
});

test("1 · the record check still catches a real invented record (the verifier was not loosened)", async () => {
  const env = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430878", family: "player_reception_yds", limit: 3 }, ctx());
  const v = verifyAnswer("GameTime went 2-0 on Jaxon Smith-Njigba's receiving yards.", evidenceOf(env, "getForecastHistory"));
  assert.equal(v.ok, false);
});

test("2 · a club / team with no rows fails closed: never 'published 0', never 'has not published'", async () => {
  const env = await getForecastHistory({ sport: "NFL", teamId: "nfl-team-99" }, ctx());
  assert.equal(env.status, ASK_STATUS.UNSUPPORTED);
  const t = textOf(env, "getForecastHistory");
  assert.match(t, /not available through Ask yet/);
  assert.match(t, /Forecast Record pages/);
  assert.doesNotMatch(t, /published 0|\b0 [A-Z]* ?forecasts|has not published/i);
  assert.ok(env.links.some((l) => l.href === "/results/forecasts/"), "the Forecast Record is linked");
});

test("2 · a fighter or game with no rows fails closed too; control: a game that has rows still answers", async () => {
  const fighter = await getForecastHistory({ sport: "NFL", playerId: "ufc-athlete-1" }, ctx());
  assert.equal(fighter.status, ASK_STATUS.UNSUPPORTED);
  const game = await getForecastHistory({ sport: "NFL", gameId: "nfl-401872999" }, ctx());
  assert.equal(game.status, ASK_STATUS.UNSUPPORTED);
  const control = await getForecastHistory({ sport: "NFL", gameId: "nfl-401872900" }, ctx());
  assert.equal(control.status, ASK_STATUS.OK);
  assert.equal(control.matched, 1);
});

test("2 · a team's rows are scoped to team score; a team filtered to nothing fails closed", async () => {
  const env = await getForecastHistory({ sport: "NFL", teamId: "nfl-team-26" }, ctx());
  assert.equal(env.status, ASK_STATUS.OK);
  assert.match(textOf(env, "getForecastHistory"), /team-score projections only; game-level forecasts involving this team/);
  const winner = await getForecastHistory({ sport: "NFL", teamId: "nfl-team-26", family: "nfl_game_winner" }, ctx());
  assert.equal(winner.status, ASK_STATUS.UNSUPPORTED, "the team's winner rows live on the game, so this is unreachable, not empty");
});

test("2 · a player whose rows all miss the filter says 'none of N match', never 'published 0'", async () => {
  const env = await getForecastHistory({ sport: "NFL", playerId: "nfl-athlete-4430878", minProjection: 150 }, ctx());
  assert.equal(env.status, ASK_STATUS.OK);
  const t = textOf(env, "getForecastHistory");
  assert.match(t, /none of the 2 NFL forecasts on record for Jaxon Smith-Njigba match this request's filters/);
  assert.doesNotMatch(t, /published 0/);
});

test("3 · a directional record and row say what they grade, in the Results page's words", async () => {
  const perf = textOf(await getForecastFamilyPerformance({ sport: "NFL" }, ctx()), "getForecastFamilyPerformance");
  assert.match(perf, /graded on the side of the sportsbook line our projection pointed to, the NFL Receiving yards record is 1–0/);
  assert.match(perf, /graded on the team we gave the better win chance, the NFL Game winner record is 1–0/);
  assert.doesNotMatch(perf, /pick was published|published pick/);
  const hist = textOf(await getForecastHistory({ sport: "NFL", gameId: "nfl-401872900" }, ctx()), "getForecastHistory");
  assert.match(hist, /graded on the team we gave the better win chance, that side was a WIN/);
  assert.doesNotMatch(hist, /published pick/);
});

test("4 · a median score pair is never a 'projected score' (a tie beside a win chance read as a predicted 22–22)", () => {
  const forecast = {
    sport: "NFL", matchup: "ATL @ NO", away: "ATL", home: "NO", date: "2026-10-05", experimental: true,
    probabilities: { away: 0.4581, home: 0.5117, tie: 0.0302 }, projectedScore: { away: 22, home: 22 }, markets: [], links: [],
  };
  const t = buildEvidence([{ tool: "getPublishedForecasts", status: ASK_STATUS.OK, links: [], data: { forecasts: [forecast] } }]).facts.map((f) => f.text).join(" | ");
  assert.match(t, /median simulated points — the middle of our simulated outcomes for each team, not a predicted final score: ATL 22, NO 22/);
  assert.doesNotMatch(t, /projected score/i);
});
