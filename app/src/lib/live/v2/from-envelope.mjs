/**
 * LIVE HUB V2 — FROM THE EXISTING LIVE CONTRACT TO THE V2 VIEW. PURE.
 *
 * The adapters (lib/live/adapters/*) already normalise each provider into the live contract
 * (lib/live/contract.mjs): `period { number, label, clock, phase }`, `situation`, `competitors`. This maps that
 * contract — and the existing hub rosters — into `LiveV2Event`s, so the V2 board can be fed by the SAME data the
 * current /live hubs read, with no new source. Lifecycle is still decided by `derivePresentationState`.
 *
 * Only fields an adapter actually filled travel on; a null stays null.
 */
import { derivePresentationState } from "../lifecycle.mjs";
import { statusFromLifecycle } from "./event-view.mjs";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const HALF = Object.freeze({ Top: "top", Bottom: "bottom", Middle: "middle", End: "end" });

/** Contract envelope → the V2 progress fields for one sport. Unknown sports and missing envelopes → null. */
export function progressFromEnvelope(sport, envelope) {
  const p = envelope?.period;
  if (!p) return null;
  switch (sport) {
    case "nfl":
    case "nba":
      return { quarter: num(p.number), clock: typeof p.clock === "string" ? p.clock : null, label: typeof p.label === "string" ? p.label : null };
    case "mlb":
      return { inning: num(p.number), half: HALF[p.phase] ?? null, outs: num(envelope?.situation?.outs) };
    case "ufc":
      return { round: num(p.number) };
    default:
      return null;
  }
}

const score = (envelope, side) => num(envelope?.competitors?.[side]?.score);

/** One /live MLB roster game (lib/live/hub-data.ts) + its envelope → a V2 event. */
export function eventFromMlbRoster(game, envelope, { feedState = "NOT_ASKED" } = {}) {
  const life = derivePresentationState({ envelope, settlement: game.settlement ?? null, feedState });
  return {
    id: `mlb:${game.gamePk}`,
    sport: "mlb",
    status: statusFromLifecycle(life.state),
    startUtc: game.firstPitch ?? null,
    away: { abbr: game.awayAbbr, name: game.awayName, score: score(envelope, "away") },
    home: { abbr: game.homeAbbr, name: game.homeName, score: score(envelope, "home") },
    progress: progressFromEnvelope("mlb", envelope),
    reportHref: game.href,
    forecastLocked: game.forecast ? "Forecast locked pregame" : null,
    forecasts: [],
  };
}

/** One /live NFL roster game (lib/live/nfl-hub-data.ts) + its envelope → a V2 event (forecast rows stay with the
 *  existing NFL tracker until the board is wired; they are not re-derived here). */
export function eventFromNflRoster(game, envelope, { feedState = "NOT_ASKED" } = {}) {
  const life = derivePresentationState({ envelope, settlement: game.settlement ?? null, feedState });
  return {
    id: `nfl:${game.providerEventId}`,
    sport: "nfl",
    status: statusFromLifecycle(life.state),
    startUtc: game.kickoffUtc ?? null,
    away: { abbr: game.awayAbbr, name: game.awayTeam, score: score(envelope, "away") },
    home: { abbr: game.homeAbbr, name: game.homeTeam, score: score(envelope, "home") },
    progress: progressFromEnvelope("nfl", envelope),
    reportHref: `/nfl/game/${game.providerEventId}/`,
    forecastLocked: null,
    forecasts: [],
  };
}
