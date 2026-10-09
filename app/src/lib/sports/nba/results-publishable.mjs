/**
 * WHAT IN AN NBA RESULTS CAPTURE IS WORTH A PRODUCTION BUILD (COST-001 Stage A, 2026-10-09).
 *
 * `public/data/nba/results/latest.json` is a rolling 9-day scoreboard window, captured hourly and every 15 minutes
 * through the post-game hours. Every reader of it uses only FINAL rows (current-results.mjs, the finals record,
 * the experimental-forecast grader, the daily product receipts) plus the window's state; the /nba hub classifies
 * started games by the schedule and the clock. Yet in-progress transitions (SCHEDULED → IN_PROGRESS → HALFTIME →
 * END_PERIOD) each committed the file, and every commit is a full Vercel build — 25 builds in the week to 2026-10-09,
 * for scores no page shows.
 *
 * This is the projection of a capture that a reader can see. Two captures with the same key need no commit:
 *   - every row's identity and schedule (id, date, teams, season type, neutral site) — a new or moved game publishes;
 *   - a FINAL row's status and both scores — a final, or a corrected final, publishes;
 *   - a POSTPONED / CANCELED status publishes;
 *   - anything else (in-progress status, live scores, capture stamps) is NOT_FINAL and does not.
 * The window's own `state` (OFF_SEASON / NO_RESULTS_YET / RESULTS) publishes.
 */
const FINAL = /^STATUS_FINAL/;
const OFF = /POSTPONED|CANCELED|CANCELLED/;

export function publishableKey(capture) {
  const rows = (capture?.rows ?? []).map((r) => {
    const raw = String(r.statusRaw ?? "");
    const shown = FINAL.test(raw) || OFF.test(raw);
    return {
      providerEventId: r.providerEventId ?? null, dateUtc: r.dateUtc ?? null, seasonType: r.seasonType ?? null,
      neutralSite: r.neutralSite ?? null, home: r.home ?? null, away: r.away ?? null, shortName: r.shortName ?? null,
      statusRaw: shown ? raw : "NOT_FINAL",
      ftHome: FINAL.test(raw) ? r.ftHome ?? null : null,
      ftAway: FINAL.test(raw) ? r.ftAway ?? null : null,
    };
  }).sort((a, b) => String(a.providerEventId).localeCompare(String(b.providerEventId)));
  return JSON.stringify({ state: capture?.state ?? null, windowDays: capture?.windowDays ?? null, rows });
}

/** True when the new capture changes nothing a reader can see — keep the committed file, commit nothing for it. */
export function samePublishable(committed, fresh) {
  return committed != null && fresh != null && publishableKey(committed) === publishableKey(fresh);
}
