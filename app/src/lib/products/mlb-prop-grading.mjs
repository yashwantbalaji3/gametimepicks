/**
 * ONE OWNER for grading an MLB player-prop leg against an official box score.
 *
 * The rules lived inside `scripts/settle-mlb-player-props.mjs`, which grades the daily portfolio.
 * A second settler now grades the Bank Builder ladder and the Moonshot lane, and two copies of
 * "what counts as a total base" is exactly how two surfaces come to disagree about the same game.
 * The arithmetic is here; both settlers call it.
 *
 * Pure by construction: it takes a box-score stat line and returns a number, or takes a number and
 * a line and returns an outcome. Nothing here fetches, reads a file, or looks at a clock.
 */
import { LEG } from "./lifecycle.mjs";

/** Pull the actual stat a market settles on out of one player's box-score line. */
export function actualFor(market, stats) {
  const b = stats?.batting ?? {};
  const p = stats?.pitching ?? {};
  switch (market) {
    case "pitcher_strikeouts": return p.strikeOuts ?? null;
    case "batter_hits": return b.hits ?? null;
    case "batter_total_bases": {
      if (b.hits == null) return null;
      const singles = (b.hits ?? 0) - (b.doubles ?? 0) - (b.triples ?? 0) - (b.homeRuns ?? 0);
      return singles + 2 * (b.doubles ?? 0) + 3 * (b.triples ?? 0) + 4 * (b.homeRuns ?? 0);
    }
    case "batter_hits_runs_rbis":
      if (b.hits == null) return null;
      return (b.hits ?? 0) + (b.runs ?? 0) + (b.rbi ?? 0);
    default: return null;
  }
}

/** Markets this grader can settle. A leg on anything else is unfalsifiable and must be refused at
 *  SELECTION rather than published and left to rot — a card nobody can grade is not a prediction. */
export const SETTLEABLE_MARKETS = Object.freeze([
  "pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis",
]);
export const isSettleableMarket = (m) => SETTLEABLE_MARKETS.includes(String(m));

/** Box-score names carry accents and punctuation the artifacts do not. Compare on letters alone. */
export const normName = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Grade one leg.
 *
 * Every non-final path returns PENDING or UNAVAILABLE, never a loss. A game still in progress, a
 * player who never appeared, a market with no line in the box score — none of those is evidence the
 * bet lost, and a settler that guesses in the house's favour is worse than one that waits.
 *
 * @returns {{result: string, actual: number|null, note: string}}
 */
export function gradeLeg({ market, side, line, stats, gameIsFinal }) {
  if (!gameIsFinal) return { result: LEG.PENDING, actual: null, note: "game not final" };
  if (!stats) return { result: LEG.UNAVAILABLE, actual: null, note: "player absent from the official box score (possible scratch) — never graded as a loss" };
  const actual = actualFor(market, stats);
  if (actual == null) return { result: LEG.UNAVAILABLE, actual: null, note: `no ${market} line in the box score` };
  const l = Number(line);
  if (!Number.isFinite(l)) return { result: LEG.UNAVAILABLE, actual, note: `leg carries no numeric line (${line})` };
  if (actual === l) return { result: LEG.PUSH, actual, note: "landed exactly on the line" };
  const over = String(side).toLowerCase() === "over";
  return { result: (actual > l) === over ? LEG.WON : LEG.LOST, actual, note: "" };
}

/** gamePk out of either artifact shape: an explicit eventId, or the third field of a legId
 *  (`MLB:824320:batter_hits:Kyle_Tucker:under`, `moonshot:mlb:824725:batter_total_bases:...`). */
export function gamePkOf(leg) {
  if (leg?.eventId) return String(leg.eventId);
  const parts = String(leg?.legId ?? "").split(":");
  const numeric = parts.find((p) => /^\d{4,}$/.test(p));
  return numeric ? String(numeric) : "";
}

/** The player a leg names, across both artifact shapes. Moonshot writes "Name Over 1.5 Total Bases"
 *  into `participant`; the ladder writes a clean `participantName`. */
export function playerOf(leg) {
  if (leg?.participantName) return String(leg.participantName);
  const p = String(leg?.participant ?? "");
  return p.replace(/\s+(Over|Under)\s.*$/i, "").trim();
}
