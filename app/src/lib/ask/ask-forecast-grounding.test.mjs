/**
 * Phase E · E-1 — getPublishedForecasts answers the question that was asked: "tonight" means today's product
 * date, a resolved team id finds that team's forecast, and the NFL / EPL game forecast itself (not just its
 * player ranges) reaches the evidence — dated, labelled experimental, and checkable by the verifier.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { buildEvidence } from "./evidence.mjs";
import { verifyAnswer } from "./verifier.mjs";
import { ASK_ERROR } from "./contract.mjs";

const NOW = () => new Date("2031-10-03T16:00:00Z"); // ET 2031-10-03
const forecasts = {
  schemaVersion: 1, eligibleSports: ["MLB", "NFL", "EPL"],
  forecasts: [
    { forecastId: "mlb-1", sport: "MLB", gameId: "mlb-1", matchup: "NYM @ WSH", away: "NYM", home: "WSH", startUtc: "2031-10-03T23:05:00Z",
      markets: [{ market: "moneyline", label: "Moneyline", status: "PUBLISHED", pick: "NYM", modelProbability: 0.56, marketImpliedProbability: 0.53, confidence: "lean" }], links: [] },
    { forecastId: "epl-9", sport: "EPL", gameId: "soccer:epl:arsenal-v-leeds-united:20311004t1400", matchup: "Arsenal v Leeds United", home: "Arsenal", away: "Leeds United",
      startUtc: "2031-10-04T14:00:00Z", experimental: true, probabilities: { home: 0.7368, draw: 0.174, away: 0.0892 }, expectedGoals: 2.9, over25: 0.53, markets: [], links: [] },
    { forecastId: "nfl-5", sport: "NFL", gameId: "405", matchup: "CLE @ PIT", away: "CLE", home: "PIT", awayName: "Cleveland Browns", homeName: "Pittsburgh Steelers",
      startUtc: "2031-10-05T17:00:00Z", experimental: true, probabilities: { home: 0.5443, away: 0.4258, tie: 0.0299 }, projectedScore: { home: 20, away: 19 }, markets: [], links: [] },
  ],
};
const entities = { schemaVersion: 1, entries: [
  { id: "epl-team-359", kind: "team", sport: "EPL", label: "Arsenal", hint: "ARS", slug: "arsenal" },
  { id: "nfl-team-23", kind: "team", sport: "NFL", label: "Pittsburgh Steelers", hint: "PIT", slug: "pittsburgh-steelers" },
  { id: "mlb-team-121", kind: "team", sport: "MLB", label: "New York Mets", hint: "NYM", slug: "new-york-mets" },
] };
const executor = () => makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/forecasts.json": forecasts, "/data/ask/v1/entities.json": entities })).beginTurn(), now: NOW });
const run = (args) => executor().run({ name: "getPublishedForecasts", arguments: args });

test("🔴 an omitted date is TODAY's product date — tonight never returns next week's games", async () => {
  const r = await run({});
  assert.equal(r.status, "OK");
  assert.equal(r.data.dateApplied, "2031-10-03");
  assert.deepEqual(r.data.forecasts.map((f) => f.forecastId), ["mlb-1"]);
});

test("🔴 nothing today for a sport → an honest NOT_PUBLISHED naming the next published date, never a future game dressed as tonight", async () => {
  const r = await run({ sport: "NFL" });
  assert.equal(r.error, ASK_ERROR.NOT_PUBLISHED);
  assert.match(r.detail, /no GameTime forecast for NFL is published for 2031-10-03; the next published forecasts for NFL are for 2031-10-05/);
});

test("🔴 Session 2 · a TEAM filter that empties the rows names the team, never 'nothing is published for <date>'", async () => {
  /* The planner resolved "PIT" to the MLB Pirates on an NFL question: the TEAM filter emptied the rows on a date
     that DID carry published forecasts. The refusal must scope itself to the filter, not deny the whole slate. */
  const mets = await run({ teamId: "mlb-team-121", date: "2031-10-05" });
  assert.equal(mets.error, ASK_ERROR.NOT_PUBLISHED);
  assert.match(mets.detail, /^no GameTime forecast involving New York Mets \(MLB\) is published for 2031-10-05/);
  assert.doesNotMatch(mets.detail, /no GameTime forecast is published for 2031-10-05/, "CLE @ PIT IS published for that date");
  // The unfiltered refusal is unchanged: nothing at all on the date says exactly that.
  const none = await run({ date: "2031-10-09" });
  assert.match(none.detail, /^no GameTime forecast is published for 2031-10-09/);
});

test("🔴 a resolved team id finds that team's forecast (by its own abbreviation or name, same sport), whatever its date", async () => {
  assert.deepEqual((await run({ teamId: "epl-team-359" })).data.forecasts.map((f) => f.forecastId), ["epl-9"], "the id the resolver hands out now matches");
  assert.deepEqual((await run({ teamId: "nfl-team-23" })).data.forecasts.map((f) => f.forecastId), ["nfl-5"]);
  assert.equal((await run({ teamId: "epl-team-000" })).error, ASK_ERROR.NOT_PUBLISHED, "an unknown team finds nothing, never a near spelling");
});

test("🔴 the NFL and EPL game forecast reaches the evidence, dated and labelled EXPERIMENTAL", async () => {
  const ex = executor();
  await ex.run({ name: "getPublishedForecasts", arguments: { teamId: "epl-team-359" } });
  await ex.run({ name: "getPublishedForecasts", arguments: { teamId: "nfl-team-23" } });
  const text = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(text, /Arsenal v Leeds United \(EPL\) on 2031-10-04/);
  assert.match(text, /EXPERIMENTAL model probabilities: Arsenal win 73\.7%, draw 17\.4%, Leeds United win 8\.9%/);
  assert.match(text, /EXPERIMENTAL expected goals: 2\.9; chance of over 2\.5 goals 53%/);
  assert.match(text, /CLE @ PIT \(NFL\) on 2031-10-05/);
  assert.match(text, /EXPERIMENTAL model win probability: CLE 42\.6%, PIT 54\.4%, tie 3%/);
  assert.match(text, /EXPERIMENTAL median simulated points — the middle of our simulated outcomes for each team, not a predicted final score: CLE 19, PIT 20/);
});

test("the verifier can now check a game-forecast answer: the owner's number passes, an invented one does not", async () => {
  const ex = executor();
  await ex.run({ name: "getPublishedForecasts", arguments: { teamId: "epl-team-359" } });
  const ev = buildEvidence(ex.evidence);
  assert.equal(verifyAnswer("GameTime's experimental forecast gives Arsenal a 73.7% chance to beat Leeds United on 2031-10-04.", ev).ok, true);
  assert.equal(verifyAnswer("GameTime's experimental forecast gives Arsenal a 90% chance to beat Leeds United on 2031-10-04.", ev).ok, false);
});
