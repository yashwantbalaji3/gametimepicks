/**
 * TEST FIXTURES ONLY for Parlay Lab V2. The operator lists below are copied from PR #1130 (head 3f778eac45,
 * app/src/lib/sports/odds/eligible-operators.mjs) so the eligible path can be exercised by injection. They are NOT
 * a policy source — production reads ./operators.mjs, which fails closed until #1130 merges.
 */
import { makeOperatorPredicate } from "../operators.mjs";

export const PR1130_ELIGIBLE_OPERATOR_KEYS = Object.freeze(["draftkings", "fanduel", "betmgm", "williamhill_us", "caesars", "betrivers", "fanatics", "espnbet", "betparx"]);
export const PR1130_ELIGIBLE_TITLES = Object.freeze(["DraftKings", "FanDuel", "BetMGM", "Caesars", "BetRivers", "Fanatics", "ESPN BET", "betPARX"]);
export const PR1130_KNOWN_OFFSHORE_KEYS = Object.freeze(["bovada", "betonlineag", "mybookieag", "betus", "lowvig", "betanysports"]);
/** Display titles the providers use for those offshore keys (the MLB props board stores titles). */
export const OFFSHORE_TITLES = Object.freeze(["Bovada", "BetOnline.ag", "MyBookie.ag", "BetUS", "LowVig.ag", "BetAnySports"]);

export const injectedEligible = makeOperatorPredicate([...PR1130_ELIGIBLE_OPERATOR_KEYS, ...PR1130_ELIGIBLE_TITLES]);

export const NOW = "2026-10-19T18:00:00.000Z";
const NOW_MS = Date.parse(NOW);
export const iso = (msFromNow) => new Date(NOW_MS + msFromNow).toISOString();
export const MIN = 60_000;
export const HOUR = 60 * MIN;

export const COVERAGE = Object.freeze({ markets: [{ sport: "mlb", demotedFamilies: ["batter_hits", "batter_total_bases", "batter_hits_runs_rbis", "pitcher_strikeouts"] }] });

let seq = 0;
/** A leg that passes every leg gate under the injected allowlist. */
export function leg(over = {}) {
  seq += 1;
  return {
    sport: "mlb", eventId: `ev${seq}`, eventLabel: `Away ${seq} @ Home ${seq}`, startUtc: iso(3 * HOUR),
    market: "pitcher_outs", marketLabel: "Outs recorded", selection: `Pitcher ${seq} — Outs recorded Over`, side: "Over", line: 15.5,
    participant: `Pitcher ${seq}`, team: `T${seq}`, book: "DraftKings", price: -110, capturedAt: iso(-5 * MIN),
    participantStatus: null, forecastClass: "MARKET_IMPLIED_NO_FORECAST", receipts: ["fixture.json"],
    ...over,
  };
}

/** A two-leg card from distinct events and distinct markets. -110 × +120 → +320 (High). */
export function card(over = {}, legs = null) {
  return {
    cardId: over.cardId ?? `card-${++seq}`,
    tier: over.tier ?? "high",
    sport: "mlb",
    source: { artifact: "fixture.json", generatedAt: iso(-10 * MIN) },
    legs: legs ?? [leg(), leg({ market: "h2h", marketLabel: "Moneyline", side: "home", line: null, price: 120, book: "FanDuel" })],
  };
}
