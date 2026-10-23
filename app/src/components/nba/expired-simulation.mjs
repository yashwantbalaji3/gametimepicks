/**
 * EXPIRED NBA GAME SIMULATION LINKS (independent audit 2026-10-23 F07 / task A-T31; release-owner retention decision).
 *
 * A Game Simulation page (/nba/simulation/<id>/) is built only for the current ET slate, so a link shared on game day
 * 404s once the date rolls over. Retention decision (release owner, 2026-10-23): no growing archive of past replays and
 * no re-publishing a past scenario. Instead the 404 page explains the expiry and links the evidence that IS kept:
 * that day's frozen Official Forecast board (/nba/projections/<date>/) and NBA results.
 *
 * Pure helpers only (no fs, no React), so the not-found page builds the map on the server and a tiny client component
 * applies it to window.location.
 */

/** Cap on how many past slates the 404 page carries (bytes stay small; older links get the generic notice). */
export const EXPIRED_SIMULATION_MAX_DATES = 30;

export const NBA_RESULTS_LINK = "/nba/#nba-results";

const SIM_PATH = /^\/nba\/simulation\/(\d{6,12})\/?$/;

/**
 * { [providerEventId]: [etDate, "AWY @ HOM"] } from dated lane snapshots, newest dates kept when over the cap.
 * @param {{ date: string, games: { providerEventId: string|number, away: { abbr?: string|null }|string, home: { abbr?: string|null }|string }[] }[]} lanes
 * @param {number} [max]
 * @returns {Record<string, [string, string]>}
 */
export function expiredSimulationMap(lanes, max = EXPIRED_SIMULATION_MAX_DATES) {
  const kept = [...lanes].filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, max);
  const abbr = (t) => (typeof t === "string" ? t : t?.abbr ?? "?");
  /** @type {Record<string, [string, string]>} */
  const out = {};
  for (const lane of kept) for (const g of lane.games ?? []) {
    const id = String(g.providerEventId);
    if (!out[id]) out[id] = [lane.date, `${abbr(g.away)} @ ${abbr(g.home)}`];
  }
  return out;
}

/**
 * What the 404 page says for a path: null for any path that is not a Game Simulation URL.
 * @returns {null | { kind: "KNOWN", id: string, date: string, matchup: string, boardHref: string, resultsHref: string } | { kind: "UNKNOWN", id: string, resultsHref: string }}
 */
export function expiredSimulationFor(pathname, map) {
  const m = SIM_PATH.exec(String(pathname ?? ""));
  if (!m) return null;
  const hit = map?.[m[1]];
  if (!hit) return { kind: "UNKNOWN", id: m[1], resultsHref: NBA_RESULTS_LINK };
  return { kind: "KNOWN", id: m[1], date: hit[0], matchup: hit[1], boardHref: `/nba/projections/${hit[0]}/`, resultsHref: NBA_RESULTS_LINK };
}
