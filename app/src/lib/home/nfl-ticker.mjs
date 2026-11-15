/**
 * NFL GAME-DAY TICKER — pure selection (founder directive 2026-11-15, P7). The homepage strip of the NFL games around
 * the build: teams, kickoff, the OFFICIAL model's favourite and win chance (the same union of forecasts the game page
 * reads, so the two can never disagree), and a link to the game. No live score here: the homepage's LiveNow strip is
 * the one live poller, and a second one would double the gateway cost.
 *
 * A forecast the model has flagged as blind to a starting-QB absence shows no percentage — the game page explains it.
 */
import { nflWinPct } from "../sports/nfl/win-chance-text.mjs";

export const TICKER_AHEAD_HOURS = 36;
export const TICKER_BEHIND_HOURS = 5;

const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };

/** @param {any[]} forecasts the public union (unionFrozenForecasts) @param {string} nowIso build instant */
export function nflTickerItems(forecasts, nowIso, { aheadHours = TICKER_AHEAD_HOURS, behindHours = TICKER_BEHIND_HOURS } = {}) {
  const now = ms(nowIso);
  if (now == null) return [];
  const items = [];
  for (const f of forecasts ?? []) {
    const k = ms(f?.kickoffUtc);
    if (k == null || k > now + aheadHours * 3600e3 || k < now - behindHours * 3600e3) continue;
    const wp = f.forecastSummary?.winProbability;
    const qbBlind = f.teamInputs?.state === "BLIND_TO_STARTING_QB_ABSENCE";
    let favorite = null;
    if (!qbBlind && wp && Number.isFinite(wp.home) && Number.isFinite(wp.away)) {
      const homeFav = wp.home >= wp.away;
      /* the game page's own formatter (win-chance-text.mjs), so the ticker prints exactly the game page's figure */
      favorite = { abbr: homeFav ? f.home?.abbr : f.away?.abbr, pct: nflWinPct(homeFav ? wp.home : wp.away) };
    }
    items.push({
      eventId: String(f.providerEventId), away: f.away?.abbr ?? "?", home: f.home?.abbr ?? "?", kickoffUtc: f.kickoffUtc,
      startedAtBuild: k <= now, favorite, note: qbBlind ? "QB change" : favorite ? null : "Forecast pending",
      href: `/nfl/game/${f.providerEventId}/`,
    });
  }
  return items.sort((a, b) => ms(a.kickoffUtc) - ms(b.kickoffUtc) || a.eventId.localeCompare(b.eventId));
}
