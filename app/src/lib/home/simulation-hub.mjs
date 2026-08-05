/**
 * Simulation Hub eligibility — event-driven, not inventory-driven (Program 139).
 *
 * THE DEFECT THIS FIXES. The hub listed UFC beside MLB every day, because a settled UFC card exists
 * in the archive. A visitor reading "Simulation Hub" reasonably concludes both sports are running;
 * in fact the UFC card settled on 2026-06-15 and there is no fight model at all. Presence of history
 * is not evidence of activity, and the hub was built from the former.
 *
 * A sport appears in the PRIMARY hub only when the current product date has real activity. Everything
 * else is still reachable — it moves to a clearly secondary "coverage" list with an accurate state —
 * so nothing is hidden, it is just no longer claimed as live.
 */

/**
 * The states a sport can be in. Each is a claim we can defend from an artifact; there is deliberately
 * no state meaning "we have something old, call it active".
 */
export const SPORT_STATES = {
  /** A slate exists for the current product date and carries at least one model lean. */
  LIVE_TODAY: "LIVE_TODAY",
  /** In season, current date, but nothing qualified — an honest no-play, still primary. */
  IN_SEASON_NO_SLATE: "IN_SEASON_NO_SLATE",
  /** A covered event falls inside the look-ahead window but is not today. */
  EVENT_THIS_WEEK: "EVENT_THIS_WEEK",
  /** Settled history only. Never primary — this is what UFC actually is. */
  HISTORICAL_ONLY: "HISTORICAL_ONLY",
  /** Referenced in code/data but with no public product yet. */
  NOT_SUPPORTED: "NOT_SUPPORTED",
};

/** Only these states may occupy the primary hub. */
const PRIMARY = new Set([SPORT_STATES.LIVE_TODAY, SPORT_STATES.IN_SEASON_NO_SLATE, SPORT_STATES.EVENT_THIS_WEEK]);

/**
 * Derive a sport's state from artifacts, never from a hardcoded label.
 *
 * @param {object} o
 * @param {string}  o.slateDate      the current product date (ET)
 * @param {string?} [o.artifactDate]  the date of the sport's newest board/card artifact
 * @param {number}  [o.leans]        model leans on that artifact
 * @param {boolean} [o.inSeason]     whether the competition is currently in season
 * @param {string?} [o.nextEventDate] next covered event date, if known
 * @param {number}  [o.lookAheadDays] how far ahead "this week" reaches
 */
export function deriveSportState({ slateDate, artifactDate, leans = 0, inSeason = false, nextEventDate = null, lookAheadDays = 7 }) {
  const current = artifactDate != null && artifactDate === slateDate;
  if (current && leans > 0) return SPORT_STATES.LIVE_TODAY;

  if (nextEventDate && slateDate) {
    const days = Math.round((Date.parse(`${nextEventDate}T00:00:00Z`) - Date.parse(`${slateDate}T00:00:00Z`)) / 86_400_000);
    if (days > 0 && days <= lookAheadDays) return SPORT_STATES.EVENT_THIS_WEEK;
  }

  // In season with today's date but nothing qualified is a real product state, and a legitimate
  // no-play must stay visible — hiding it would make a quiet day look like an outage.
  if (inSeason && current) return SPORT_STATES.IN_SEASON_NO_SLATE;
  if (inSeason) return SPORT_STATES.IN_SEASON_NO_SLATE;

  // Anything whose only evidence is an older artifact is history, whatever that artifact contains.
  if (artifactDate) return SPORT_STATES.HISTORICAL_ONLY;
  return SPORT_STATES.NOT_SUPPORTED;
}

export const isPrimary = (state) => PRIMARY.has(state);

/** Human-readable, never a bare colour or an ambiguous word like "active". */
export function stateLabel(state, { artifactDate } = {}) {
  switch (state) {
    case SPORT_STATES.LIVE_TODAY: return "Live today";
    case SPORT_STATES.IN_SEASON_NO_SLATE: return "In season · no qualified slate";
    case SPORT_STATES.EVENT_THIS_WEEK: return "Event this week";
    case SPORT_STATES.HISTORICAL_ONLY: return artifactDate ? `Historical coverage · settled ${artifactDate}` : "Historical coverage";
    default: return "Not supported yet";
  }
}

/**
 * Split sports into the primary hub and the secondary coverage list. Generic so callers keep
 * whatever payload they attached (the homepage carries a `card`); a concrete element type here
 * silently erased it.
 * @template {{state: string}} T
 * @param {T[]} sports
 * @returns {{primary: T[], secondary: T[]}}
 */
export function partitionSports(sports) {
  return {
    primary: sports.filter((s) => isPrimary(s.state)),
    secondary: sports.filter((s) => !isPrimary(s.state)),
  };
}
