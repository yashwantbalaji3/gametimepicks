/**
 * FEATURED CARD BUILDERS (P319) — the report pages save the SAME card the homepage would feature: one id, one
 * settlement key, one wording, and a lifecycle read from the clock, not hardcoded.
 * Run: npx tsx --test src/lib/command-center/featured.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cardFromEplRow, cardFromMlbPrediction, cardFromNflEvent, cardFromUfcBout } from "./featured.ts";
import { saveEligibility } from "../saved/saved-schema.mjs";
import { resolveResult } from "../saved/results.mjs";

const status = { id: "x", family: "Model", state: "HOLDING", headline: "h", detail: "d", n: 10, source: "s" };
const freshness = { state: "FRESH", updatedAt: "2026-09-15T12:00:00Z", label: "Updated", ageHours: 1 };
const ctx = { status, freshness, nowIso: "2026-09-15T15:00:00Z" };

test("MLB: an active winner call carries a settleable key; a paused call carries no call and is not saveable", () => {
  const live = { gamePk: 1, slug: "a-b-2026-09-15", status: "ready", awayTeam: "AAA", homeTeam: "BBB", awayTeamName: "A", homeTeamName: "B", predictedWinner: { side: "home", team: "BBB" }, projectedScore: { away: 3, home: 4, label: "" }, moneyline: { side: "home", team: "BBB", simulationProbability: 0.58, strengthLabel: "LEAN" }, total: null, runLine: null };
  const c = cardFromMlbPrediction(live, "2026-09-15T23:10:00Z", ctx);
  assert.equal(c.id, "mlb-1");
  assert.deepEqual(c.settlement, { kind: "mlb-game", gamePk: 1, family: "Winner" });
  assert.equal(c.lifecycle, "PREGAME");
  assert.equal(saveEligibility(c, ctx.nowIso).ok, true);
  const paused = cardFromMlbPrediction({ ...live, moneyline: null, pausedReasons: { moneyline: "paused" } }, "2026-09-15T23:10:00Z", ctx);
  assert.equal(paused.signal.kind, "NONE");
  assert.equal(paused.settlement.family, "Winner call paused");
  assert.deepEqual(saveEligibility(paused, ctx.nowIso), { ok: false, reason: "NO_CALL" });
  /* and even if such a snapshot existed, settlement joins nothing — never the first row of some other market */
  const ledgers = { mlbGames: [{ gamePk: 1, market: "total", outcome: "WIN", actual: { awayRuns: 3, homeRuns: 5 } }] };
  assert.equal(resolveResult({ startUtc: "2026-09-15T23:10:00Z", settlement: paused.settlement }, ledgers, "2026-09-16T03:00:00Z").state, "PENDING");
  assert.equal(resolveResult({ startUtc: "2026-09-15T23:10:00Z", settlement: c.settlement }, ledgers, "2026-09-16T03:00:00Z").state, "PENDING", "a winner save does not settle on a total row");
});

test("lifecycle follows the clock: a started event reads STARTED and refuses a save", () => {
  const e = { providerEventId: "401", matchup: "A @ B", kickoffUtc: "2026-09-15T14:00:00Z", lifecycle: "UPCOMING", state: "PUBLIC_EXPERIMENTAL", home: { abbr: "B", name: "Bees" }, away: { abbr: "A", name: "Ants" }, winProbability: { home: 0.6, away: 0.4 }, projectedScore: { home: 24, away: 20 } };
  const started = cardFromNflEvent(e, ctx);
  assert.equal(started.lifecycle, "STARTED");
  assert.deepEqual(saveEligibility(started, ctx.nowIso), { ok: false, reason: "STARTED" });
  const pre = cardFromNflEvent({ ...e, kickoffUtc: "2026-09-16T00:15:00Z" }, ctx);
  assert.equal(pre.lifecycle, "PREGAME");
  assert.deepEqual(pre.settlement, { kind: "nfl-event", providerEventId: "401", family: "Winner" });
  assert.equal(saveEligibility(pre, ctx.nowIso).ok, true);
  /* the same card, checked later on the client clock, refuses */
  assert.deepEqual(saveEligibility(pre, "2026-09-16T01:00:00Z"), { ok: false, reason: "STARTED" });
});

test("EPL and UFC builders carry the settlement identity results.mjs joins on", () => {
  const r = { eventId: "ev-9", slug: "arsenal-v-chelsea-2026-09-20", matchup: "Arsenal v Chelsea", kickoffUtc: "2026-09-20T14:00:00Z", homeClub: "Arsenal", awayClub: "Chelsea", probs: { home: 0.5, draw: 0.25, away: 0.25 }, state: "CURRENT_PRE_EVENT", matchweek: 5, expectedGoals: 2.7 };
  const epl = cardFromEplRow(r, ctx);
  assert.equal(epl.id, "epl-ev-9");
  assert.deepEqual(epl.settlement, { kind: "epl-event", eventId: "ev-9", family: "Match result" });
  assert.match(epl.forecast.sub, /Draw 25%/);
  const bout = { boutId: "b1", titleFight: true, startUtc: "2026-09-19T02:00:00Z", red: { name: "Red Fighter" }, blue: { name: "Blue Fighter" }, prediction: { winner: { name: "Blue Fighter", probability: 0.61 }, method: { most: "DEC" }, rounds: { endsIn: "3+" } } };
  const ufc = cardFromUfcBout(bout, { event: { name: "UFC Test Night", startUtc: "2026-09-19T02:00:00Z" } }, ctx);
  assert.equal(ufc.id, "ufc-b1");
  assert.deepEqual(ufc.settlement, { kind: "ufc-bout", date: "2026-09-19", red: "Red Fighter", blue: "Blue Fighter" });
  assert.equal(ufc.home.favoured, true);
  const ledgers = { ufc: [{ market: "Fight winner", eventId: "2026-09-19:red fighter|blue fighter", hit: true, actual: "Blue Fighter by decision" }] };
  assert.equal(resolveResult({ startUtc: ufc.startUtc, settlement: ufc.settlement }, ledgers, "2026-09-20T00:00:00Z").outcome, "HIT");
});
