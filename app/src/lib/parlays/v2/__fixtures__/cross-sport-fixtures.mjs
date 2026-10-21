/**
 * TEST / DEV FIXTURES ONLY — cross-sport candidates for lib/parlays/v2/candidate.mjs.
 *
 * FIXTURE — not real picks, not real prices. Every event, player, team, price and capture time below is invented;
 * every candidate is built with provenance FIXTURE, and every pool or combination containing one carries
 * FIXTURE_LABEL. Deterministic: the clock is v2-fixtures NOW (2026-10-19T18:00:00Z) and nothing reads the wall clock.
 *
 * Scenarios
 *   QUALIFIED_POOL       one clean selection each from MLB, NFL and EPL, distinct events, verified books, fresh.
 *                        Qualifies cross-sport ONLY with an injected league gate (FIXTURE_LEAGUE_GATE): under the real
 *                        registry only MLB is FULL_MODEL today, and the test pins that too.
 *   ZERO_POOL            every selection fails a candidate gate.
 *   REJECTIONS           one candidate per refusal: stale, suspended, questionable, out, locked, offshore book, NBA.
 *   COMBINATIONS         contradictory sides, duplicate player + market, same-event pair (D5).
 */
import { NOW, iso, MIN, HOUR, COVERAGE } from "./v2-fixtures.mjs";
import { toCandidate, PROVENANCE } from "../candidate.mjs";

export { NOW, COVERAGE };

/** The injected league gate the cross-sport scenario needs (the real registry admits MLB only). NBA stays out. */
export const FIXTURE_LEAGUE_GATE = (league) => ["mlb", "nfl", "epl"].includes(String(league));

let seq = 0;
/** A V2-shaped leg (./candidates.mjs) that passes every gate under the injected allowlist, as a FIXTURE candidate. */
export function fx(over = {}) {
  seq += 1;
  const leg = {
    sport: "mlb", eventId: `fx-ev-${seq}`, eventLabel: `Fixture Away ${seq} @ Fixture Home ${seq}`, startUtc: iso(3 * HOUR),
    market: "pitcher_outs", marketLabel: "Outs recorded", selection: `Fixture Pitcher ${seq} — Outs recorded Over`, side: "Over", line: 15.5,
    participant: `Fixture Pitcher ${seq}`, team: `FX${seq}`, book: "DraftKings", price: -115, capturedAt: iso(-5 * MIN),
    participantStatus: null, marketStatus: null, forecastClass: "MARKET_IMPLIED_NO_FORECAST", modelId: null, modelProbability: null,
    receipts: ["fixture:cross-sport"],
    ...over,
  };
  return toCandidate(leg, { provenance: PROVENANCE.FIXTURE });
}

const mlb = (over = {}) => fx(over);
const nfl = (over = {}) => fx({
  sport: "nfl", eventId: `nfl-fx-${seq + 1}`, market: "moneyline", marketLabel: "Moneyline", side: "home", line: null,
  participant: null, team: "Fixture Home NFL", selection: "Fixture Home NFL — Moneyline home", book: "FanDuel", price: 135, ...over,
});
const epl = (over = {}) => fx({
  sport: "epl", eventId: `soccer:epl:fixture-${seq + 1}`, market: "match_result", marketLabel: "Match result", side: "home", line: null,
  participant: null, team: "Fixture United", selection: "Fixture United — Match result home", book: "BetMGM", price: 110, ...over,
});

export const QUALIFIED_POOL = Object.freeze([mlb(), nfl(), epl()]);

export const REJECTIONS = Object.freeze({
  stale: mlb({ capturedAt: iso(-13 * HOUR) }),
  suspended: nfl({ marketStatus: "suspended" }),
  questionable: mlb({ participantStatus: "Questionable" }),
  out: mlb({ participantStatus: "Out" }),
  locked: mlb({ startUtc: iso(20 * MIN) }),
  started: mlb({ startUtc: iso(-10 * MIN), capturedAt: iso(-30 * MIN) }),
  offshoreBook: epl({ book: "Bovada" }),
  noBook: nfl({ book: null }),
  nba: fx({ sport: "nba", eventId: "nba-fx-1", market: "player_points", marketLabel: "Points", participant: "Fixture Guard", line: 22.5, selection: "Fixture Guard — Points Over" }),
});

export const ZERO_POOL = Object.freeze([REJECTIONS.stale, REJECTIONS.locked, REJECTIONS.offshoreBook, REJECTIONS.out]);

/** Pairs/sets for checkCombination. Each leg on its own is eligible; the COMBINATION is what fails. */
export function combinations() {
  const ev = "fx-shared-game";
  const over = mlb({ eventId: ev, participant: "Fixture Ace", selection: "Fixture Ace — Outs recorded Over", side: "Over", line: 17.5 });
  const under = mlb({ eventId: ev, participant: "Fixture Ace", selection: "Fixture Ace — Outs recorded Under", side: "Under", line: 17.5 });
  const dupA = mlb({ participant: "Fixture Slugger", market: "pitcher_outs", line: 15.5 });
  const dupB = mlb({ participant: "Fixture Slugger", market: "pitcher_outs", line: 16.5 });
  const sameGameA = mlb({ eventId: ev, participant: "Fixture Starter A" });
  const sameGameB = mlb({ eventId: ev, participant: "Fixture Starter B", team: "FX-other" });
  const fighterA = fx({ sport: "nfl", eventId: "nfl-fx-winner", market: "moneyline", side: "home", line: null, participant: null, team: "FX Home", selection: "FX Home — Moneyline home", price: 120 });
  const fighterB = fx({ sport: "nfl", eventId: "nfl-fx-winner", market: "moneyline", side: "away", line: null, participant: null, team: "FX Away", selection: "FX Away — Moneyline away", price: -140 });
  const fourMlb = [mlb(), mlb(), mlb(), mlb()];
  return { contradictory: [over, under], twoWinners: [fighterA, fighterB], duplicate: [dupA, dupB], sameGame: [sameGameA, sameGameB], fourMlb };
}
