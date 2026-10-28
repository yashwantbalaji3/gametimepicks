/**
 * EXPIRED NBA GAME SIMULATION LINKS (independent audit 2026-10-23 F07 / task A-T31; release-owner retention decision;
 * overnight W7 2026-10-28: settled pages).
 *
 * A Game Simulation (/nba/simulation/<id>/) is built only for the current ET slate, and its replay is not kept
 * (release owner, 2026-10-23: no growing archive of past replays, no re-publishing a past scenario). A link shared on
 * game day used to 404 once the date rolled over. Now the SAME URL stays alive as a SETTLED page for every game in the
 * newest EXPIRED_SIMULATION_MAX_DATES committed dated lanes before the build's ET date: the frozen Official Forecast
 * from that date's lane file, the official final and the official record's verdict (lib/results/nba-forecast-vs-actual.mjs,
 * the /results/nba record), and links to that day's board and NBA results. It says the simulation is archived and shows
 * no simulation. Links older than that window (or a flag-OFF build) still reach the 404 tombstone below.
 *
 * Pure helpers only (no fs, no React): the not-found page builds the map on the server and a tiny client component
 * applies it to window.location; the route's generateStaticParams and the settled page read the same helpers.
 */

/** Cap on how many past slates the 404 page carries (bytes stay small; older links get the generic notice). */
export const EXPIRED_SIMULATION_MAX_DATES = 30;

/** NBA results: the official record (Official Forecast side vs. official final, game by game). */
export const NBA_RESULTS_LINK = "/results/nba/";

/** One sentence for the settled page and the 404 tombstone alike: what was not kept, and what was. */
/* Audit 2026-10-28 (Theater inventory): "their replays are not kept" was not true — the stored runs are committed; what the
   retention decision means is that the site does not SHOW a replay after game day. */
export const SIMULATION_ARCHIVED_NOTE =
  "Game Simulations are shown on game day only. The Official Forecast stays available, frozen exactly as it was published before tip-off.";

/** A Game Simulation link the 404 map does not know: it may be a game whose slate has not published yet (never "no longer
 *  available" — the audit found tonight's games answered that way before their slate's build was live). */
export const SIMULATION_UNKNOWN_HEADING = "Game Simulation not available at this link";
export const SIMULATION_UNKNOWN_NOTE =
  "If this game is on today's or an upcoming slate, its Game Simulation appears here once the slate's Official Forecast is frozen and published, before tip-off. A finished game keeps its Official Forecast and result on NBA results.";

/**
 * The official record's state for a game (lib/results/nba-forecast-vs-actual.mjs) in reader words — the same states,
 * never recomputed here. `fav` is the favoured team's name.
 * @param {string} state
 * @param {string|null} fav
 */
export function settledVerdictText(state, fav) {
  switch (state) {
    case "MATCHED": return `The Official Forecast favoured ${fav} — the side won.`;
    case "MISSED": return `The Official Forecast favoured ${fav} — the side lost.`;
    case "PENDING": return "No official final is recorded yet. A pending game is never counted as a miss.";
    case "HELD": return "The final is under review, so this game is held and not counted yet.";
    case "NO_SIDE": return "No favoured side was published for this game.";
    case "NOT_BEFORE_TIP": return "Not compared: there is no record that this forecast was published before tip-off.";
    default: return "This game is not in the official record.";
  }
}

/**
 * Event ids that get a settled page: every game in the committed dated lanes dated BEFORE `today` (the build's ET date),
 * newest `max` dates (the 404 map's own window), minus `exclude` (ids a current Game Simulation page builds). Sorted.
 * @param {{ date: string, games: { providerEventId: string|number }[] }[]} lanes
 * @param {{ today: string, exclude?: Iterable<string>, max?: number }} opts
 * @returns {string[]}
 */
export function settledSimulationIds(lanes, { today, exclude = [], max = EXPIRED_SIMULATION_MAX_DATES }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today ?? ""))) return [];
  const skip = new Set([...exclude].map(String));
  const past = (lanes ?? []).filter((l) => l && /^\d{4}-\d{2}-\d{2}$/.test(l.date) && l.date < today);
  return Object.keys(expiredSimulationMap(past, max)).filter((id) => /^\d{6,12}$/.test(id) && !skip.has(id)).sort();
}

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
