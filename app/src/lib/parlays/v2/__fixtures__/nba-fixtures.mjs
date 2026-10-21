/**
 * TEST FIXTURE — NOT REAL PICKS, NOT REAL PRICES, NOT A REAL REGISTRY STATE.
 *
 * A synthetic NBA slate (six games, two players each) plus three NFL games, for the Parlay Lab V2 NBA candidate
 * source tests (../nba-source.test.mjs). Every event id, player, distribution, price and capture time is invented.
 * The NBA snapshots are built by the REAL official-snapshot code from synthetic v0.1-shaped artifacts (receipts
 * stamped by the real stamper), then re-sealed PUBLIC / product-eligible — a world that does not exist today. Every
 * NBA leg is produced by the REAL adapter (products/nba/nba-leg.mjs) under the TEST FIXTURE registry, so every one is
 * stamped provenance TEST_FIXTURE. Nothing here is committed under app/public/data or data/, and nothing outside a
 * test may import this file.
 *
 * Clock: NOW 2026-11-01T13:00:00Z; prices captured 12:30Z; tips 23:00Z..02:00Z (all the ET evening of 2026-11-01).
 */
import { evaluateMarket } from "../../../consistency/market-evaluator.mjs";
import { PUBLICATION, nbaOfficialSnapshot, sealSnapshot } from "../../../consistency/official-snapshot.mjs";
import { stampReceipt } from "../../../sports/nba/forecast-receipt.mjs";
import { nbaLegFromEvaluation } from "../../../products/nba/nba-leg.mjs";
import { PERMISSIVE_REGISTRY } from "../../../products/nba/__fixtures__/permissive.mjs";
import { makeOperatorPredicate } from "../operators.mjs";

export const TEST_FIXTURE = "TEST FIXTURE — not real picks, not real prices";
export { PERMISSIVE_REGISTRY };
export const NOW = "2026-11-01T13:00:00.000Z";
export const CAPTURED_AT = "2026-11-01T12:30:00.000Z";
const GENERATED_AT = "2026-11-01T12:00:00Z";
export const COVERAGE = Object.freeze({ markets: [] });
/** TEST FIXTURE operator allowlist (the PR 1130 keys the leg fixtures use). */
export const FIXTURE_OPERATORS = makeOperatorPredicate(["draftkings", "fanduel", "DraftKings", "FanDuel"]);
/** TEST FIXTURE sport gate for the card adapter: NBA and NFL admitted (the real registry admits neither). */
export const FIXTURE_SPORT_GATE = (s) => ["nba", "nfl"].includes(String(s).toLowerCase());
/** TEST FIXTURE settlement path: pretends NBA player props have a grader (the real contract grades team markets only). */
export const FIXTURE_NBA_SETTLES = () => true;

const q = (p50, sd) => ({ mean: p50, sd, p10: Math.max(0, +(p50 - 1.2816 * sd).toFixed(2)), p50, p90: +(p50 + 1.2816 * sd).toFixed(2) });

/**
 * Six games. Each player names a family, the distribution, the line and the TEST FIXTURE two-way price, chosen so
 * the evaluator leans OVER: short prices on lines far below the median (Low-tier material), near-even prices on
 * lines a little below it (Medium / High), plus-money prices on lines at the median (Longshot material).
 */
export const NBA_GAMES = Object.freeze([
  { eventId: "999200001", tip: "2026-11-01T23:00:00Z", home: "HMA", away: "AWA", players: [
    { id: "101", side: "home", family: "pts", dist: q(26, 5), line: 18.5, over: -260, under: 210 },
    { id: "102", side: "away", family: "reb", dist: q(10, 3), line: 7.5, over: -110, under: -110 },
  ] },
  { eventId: "999200002", tip: "2026-11-01T23:30:00Z", home: "HMB", away: "AWB", players: [
    { id: "201", side: "home", family: "ast", dist: q(9, 2.5), line: 5.5, over: -260, under: 210 },
    { id: "202", side: "away", family: "pts", dist: q(22, 6), line: 19.5, over: -110, under: -110 },
  ] },
  { eventId: "999200003", tip: "2026-11-02T00:00:00Z", home: "HMC", away: "AWC", players: [
    { id: "301", side: "home", family: "reb", dist: q(12, 3), line: 9.5, over: -110, under: -110 },
    { id: "302", side: "away", family: "ast", dist: q(7, 2.5), line: 6.5, over: 115, under: -135 },
  ] },
  { eventId: "999200004", tip: "2026-11-02T00:30:00Z", home: "HMD", away: "AWD", players: [
    { id: "401", side: "home", family: "pts", dist: q(28, 6), line: 27.5, over: 115, under: -135 },
    { id: "402", side: "away", family: "reb", dist: q(9, 3), line: 8.5, over: 115, under: -135 },
  ] },
  { eventId: "999200005", tip: "2026-11-02T01:00:00Z", home: "HME", away: "AWE", players: [
    { id: "501", side: "home", family: "ast", dist: q(8, 2.5), line: 7.5, over: 115, under: -135 },
    { id: "502", side: "away", family: "pts", dist: q(24, 6), line: 23.5, over: 115, under: -135 },
  ] },
  { eventId: "999200006", tip: "2026-11-02T02:00:00Z", home: "HMF", away: "AWF", players: [
    { id: "601", side: "home", family: "reb", dist: q(11, 3), line: 10.5, over: 115, under: -135 },
    { id: "602", side: "away", family: "threePm", dist: q(3.4, 1.3), line: 2.5, over: -110, under: -110 },
  ] },
]);

/** One synthetic v0.1-shaped day file for one game (the official family), receipt stamped by the real stamper. */
export function nbaGameDoc(g, { participation = {}, injuryStatus = {} } = {}) {
  const roster = { home: [], away: [] };
  for (const p of g.players) {
    roster[p.side].push({
      providerAthleteId: p.id, name: `Fixture Player ${p.id}`, availability: participation[p.id] ?? "active", injuryStatus: injuryStatus[p.id] ?? null,
      expectedMinutes: 32, minutes: q(32, 2.5), [p.family]: p.dist,
    });
  }
  const game = {
    providerEventId: g.eventId, dateUtc: g.tip,
    home: { name: `Fixture ${g.home}`, abbr: g.home }, away: { name: `Fixture ${g.away}`, abbr: g.away },
    forecast: {
      modelVersion: "nba-preseason-experimental-v0", inputAsOf: GENERATED_AT,
      elo: { pHome: 0.58, pAway: 0.42 },
      publishedSide: "HOME", sideRule: { id: "nba-winner-side@1", head: "elo" },
      players: roster,
    },
  };
  const stamped = stampReceipt(game, { family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1", now: GENERATED_AT, inputs: {} });
  return { schemaVersion: 1, dataClass: "PRIVATE_RESEARCH", family: "v0.1", modelVersion: "nba-preseason-experimental-v0.1", simEngineVersion: "nba-preseason-experimental-v0", games: [stamped] };
}

/** The real (private, product-closed) snapshot for one fixture game. */
export function realShape(g, opts) {
  return nbaOfficialSnapshot(g.eventId, { official: { doc: nbaGameDoc(g, opts), path: `TEST-FIXTURE/nba/${g.eventId}.json` } });
}

/** TEST FIXTURE: the same snapshot re-sealed PUBLIC, product-eligible, every family PUBLISHED. */
export function permissive(g, opts) {
  const s = realShape(g, opts);
  const { snapshotId: _drop, ...rest } = s;
  return sealSnapshot({
    ...rest,
    publication: PUBLICATION.PUBLIC,
    capability: { ...s.capability, state: "FULL_MODEL (TEST FIXTURE)", canShowLiveProjections: true, canEnterPredictionProducts: true },
    players: s.players.map((p) => ({ ...p, families: Object.fromEntries(Object.entries(p.families).map(([k, f]) => [k, { ...f, state: "PUBLISHED" }])) })),
  });
}

/** TEST FIXTURE verification object in the shape nba-leg.mjs consumes (operator allowlist + NBA authorization receipt). */
export function verificationFor(e, p, over = {}) {
  const id = e.identity;
  return {
    label: TEST_FIXTURE, sport: "nba", eventId: id.eventId, providerAthleteId: id.subjectId, family: id.family, line: id.line,
    book: "draftkings", operatorName: "DraftKings", capturedAt: id.capturedAt, overAmerican: p.over, underAmerican: p.under,
    operatorVerified: true, verifier: "eligible-operators@1 (TEST FIXTURE)",
    authorizationReceiptRef: "TEST-FIXTURE-nba-odds-authorization", priceReceiptRef: `TEST-FIXTURE-nba-price-${id.eventId}-${id.subjectId}`,
    ...over,
  };
}

/**
 * Evaluate every fixture market and run the REAL adapter on it.
 * @returns {{ snapshots: object[], evaluations: object[], results: object[] }}
 */
export function nbaSlate({ registry = PERMISSIVE_REGISTRY, snapshotFor = permissive, games = NBA_GAMES, now = NOW, capturedAt = CAPTURED_AT, opts = {}, verify = verificationFor } = {}) {
  const snapshots = [], evaluations = [], results = [];
  for (const g of games) {
    const s = snapshotFor(g, opts);
    snapshots.push(s);
    for (const p of g.players) {
      const e = evaluateMarket({ snapshot: s, playerId: p.id, family: p.family, line: p.line, book: "draftkings", overAmerican: p.over, underAmerican: p.under, capturedAt, now });
      evaluations.push(e);
      results.push(nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verify(e, p), registry }));
    }
  }
  return { snapshots, evaluations, results };
}

/** TEST FIXTURE UFC bouts (fight-winner, lineless) for NBA + UFC cards. */
export const UFC_BOUTS = Object.freeze([
  { eventId: "ufc-fx-801", start: "2026-11-02T03:00:00Z", fighter: "Fixture Fighter A", price: -150, other: 130 },
  { eventId: "ufc-fx-802", start: "2026-11-02T03:30:00Z", fighter: "Fixture Fighter B", price: 120, other: -140 },
]);

export function ufcInputs({ capturedAt = CAPTURED_AT } = {}) {
  return UFC_BOUTS.map((b) => ({
    sport: "ufc", eventId: b.eventId, eventLabel: `${b.fighter} vs Fixture Opponent`, startUtc: b.start, participant: b.fighter, team: null,
    market: "fight_winner", marketLabel: "Fight winner", side: "fighter", line: null, selection: `${b.fighter} — Fight winner`,
    book: "DraftKings", price: b.price, capturedAt, modelId: "ufc-fixture-model@TEST-FIXTURE", modelProbability: null, uncertainty: null,
    forecastClass: "TEST_FIXTURE", participantStatus: null, marketStatus: null, priceMismatch: false, receipts: [`TEST-FIXTURE-ufc-${b.eventId}`],
    evidence: { snapshotId: `TEST-FIXTURE-ufc-snapshot-${b.eventId}`, modelVersion: "ufc-fixture-model@TEST-FIXTURE", capturedAt, authorizationReceiptRef: "TEST-FIXTURE-ufc-odds", evaluatorKey: null },
    twoWay: { verified: true, sideAmerican: b.price, otherAmerican: b.other },
  }));
}

/** TEST FIXTURE NFL candidate inputs (the ./candidate.mjs input shape) with a verified two-way price and provenance. */
export const NFL_GAMES = Object.freeze([
  { eventId: "nfl-fx-901", kickoff: "2026-11-01T17:00:00Z", team: "FXA", market: "moneyline", side: "home", line: null, price: -300, other: 250 },
  { eventId: "nfl-fx-902", kickoff: "2026-11-01T17:00:00Z", team: "FXB", market: "spreads", side: "home", line: -3.5, price: -110, other: -110 },
  { eventId: "nfl-fx-903", kickoff: "2026-11-01T20:25:00Z", team: "FXC", market: "moneyline", side: "home", line: null, price: 130, other: -150 },
]);

export function nflInputs({ capturedAt = CAPTURED_AT } = {}) {
  return NFL_GAMES.map((g) => ({
    sport: "nfl", eventId: g.eventId, eventLabel: `Fixture Away @ Fixture ${g.team}`, startUtc: g.kickoff, participant: null, team: g.team,
    market: g.market, marketLabel: g.market === "moneyline" ? "Moneyline" : "Spread", side: g.side, line: g.line,
    selection: `Fixture ${g.team} — ${g.market === "moneyline" ? "Moneyline" : "Spread"}`, book: "FanDuel", price: g.price, capturedAt,
    modelId: "nfl-fixture-model@TEST-FIXTURE", modelProbability: null, uncertainty: null, forecastClass: "TEST_FIXTURE",
    participantStatus: null, marketStatus: null, priceMismatch: false, receipts: [`TEST-FIXTURE-nfl-${g.eventId}`],
    evidence: { snapshotId: `TEST-FIXTURE-nfl-snapshot-${g.eventId}`, modelVersion: "nfl-fixture-model@TEST-FIXTURE", capturedAt, authorizationReceiptRef: "TEST-FIXTURE-nfl-odds", evaluatorKey: null },
    twoWay: { verified: true, sideAmerican: g.price, otherAmerican: g.other },
  }));
}
