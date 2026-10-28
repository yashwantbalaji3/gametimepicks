import { ELO_WIN_PROBABILITY } from "../sports/nba/elo-win-probability.mjs";
/**
 * THE NBA OFFICIAL FORECAST RECORD — its one public name, and where its first game comes from (P0 trust fix, 10-28).
 *
 * WHY THIS EXISTS. The founder-approved NBA composition (Elo favoured side + v0.1 player medians official; team scores
 * withheld; v1 supporting) publishes daily, and its official side is graded game by game on /results/nba. Two pages
 * named that record differently and both wrongly: /results/forecasts listed it as "SHADOW / private research — never
 * public forecast history", and /results/nba carried it under an "archive" title and tab. And /sports printed a
 * "first game" that was really the first row of a ROLLING schedule capture (the next game, Oct 27), contradicting a
 * record that already had 52 graded games from Oct 20.
 *
 * So the name lives here once, and every surface that labels the record reads it (results-sport-tabs, /results/nba,
 * the Forecast Record's declared gap via lib/forecast-ledger/compose.mjs). "First game" is read from the record
 * itself — the earliest game whose official side was graded against an official final — or it is not shown.
 *
 * Pure; its one import is the import-free Elo display switch (audit 2026-10-28 F03). compose.mjs (run by plain node in
 * nightly-settle) and client-reachable components import it.
 * Whether NBA joins the cross-sport aggregate totals is a PENDING founder decision; nothing here adds it to any total.
 */

/** The record's name, as every surface prints it after the sport ("NBA · Official Forecast record"). */
export const NBA_OFFICIAL_RECORD_LABEL = "Official Forecast record";
/** The record's full public name. */
export const NBA_OFFICIAL_RECORD_TITLE = `NBA · ${NBA_OFFICIAL_RECORD_LABEL}`;
/** Where the record is graded, game by game. */
export const NBA_OFFICIAL_RECORD_HREF = "/results/nba/";

/**
 * The Forecast Record's declared gap for NBA: the official record is PUBLISHED, graded on its own page, and not yet
 * ledger rows — so it is not in the cross-sport totals, and the reason says that the inclusion is pending rather than
 * implying the forecasts are private. (Its reason also says the team scores are withheld, which they are.)
 */
export const NBA_OFFICIAL_RECORD_GAP = Object.freeze({
  sport: "NBA",
  family: NBA_OFFICIAL_RECORD_LABEL,
  reason:
    "The official NBA forecast (the Elo favoured side and the player medians) publishes before every slate, and the " +
    `official side is graded game by game against the official final on ${NBA_OFFICIAL_RECORD_HREF}. Those games are ` +
    "not rows in this ledger yet, so they are not in the totals above; whether NBA joins them is a pending decision. " +
    // Audit 2026-10-28 F03: since the 2026-10-23 switch the boards show an Elo-derived estimate — say what is withheld now.
    (ELO_WIN_PROBABILITY.enabled
      ? "NBA team scores, margins, totals and ranges are withheld; the Elo-derived game-winner estimate on the boards is not a validated probability and is not graded here."
      : "NBA team scores and win chances are withheld and never published."),
});

/**
 * The ET date of the first game whose official side was graded (MATCHED or MISSED) — read from a
 * lib/results/nba-forecast-vs-actual.mjs view. Pending, held and unpublished games never count. Null when nothing is
 * graded yet, and then no "first game" is shown anywhere.
 * @param {{ games?: Array<{ date?: string|null, state?: string }> } | null | undefined} view
 * @returns {string | null}
 */
export function firstGradedGameDate(view) {
  const dates = (view?.games ?? [])
    .filter((g) => (g.state === "MATCHED" || g.state === "MISSED") && /^\d{4}-\d{2}-\d{2}$/.test(String(g.date ?? "")))
    .map((g) => String(g.date))
    .sort();
  return dates[0] ?? null;
}
