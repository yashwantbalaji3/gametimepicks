/**
 * Injuries feed contract — NFL + NBA (Program 162 · Release G).
 *
 * Implements the two ACCEPT conditions from docs/INJURY_SOURCE_EVALUATION.md, verbatim:
 *   1. IDENTITY — the feed carries no top-level athlete id; the id is extracted from the
 *      playercard link (the same ESPN athlete-id space the identity components use). An entry
 *      whose id cannot be extracted REFUSES (quarantines) — never a name-based fallback.
 *   2. ABSENCE — a player or team missing from the feed is UNKNOWN availability, never healthy.
 *      The feed's own explicit "Active" status proves absence is not health. A stale feed widens
 *      uncertainty the same way: everything reads UNKNOWN until a fresh capture exists.
 *
 * Closed-set discipline: the status taxonomies below are what the evaluation OBSERVED; an
 * unlisted status quarantines as UNKNOWN_STATUS instead of being guessed into a bucket.
 * Editorial prose (short/long comments) is never parsed for availability signals.
 *
 * PURE module: no fetch, no filesystem writes, clock as a parameter. The capture script and
 * cadence wiring are a separate release; LIVE_INPUT_MATRIX stays MISSING until a real capture
 * lands through this contract.
 */

export const INJURY_CONTRACT_VERSION = 1;

/** Observed taxonomies (docs/INJURY_SOURCE_EVALUATION.md, probes of 2026-08-11). */
export const INJURY_STATUSES = Object.freeze({
  nfl: Object.freeze(["Active", "Out", "Questionable", "Injured Reserve", "Suspension"]),
  nba: Object.freeze(["Day-To-Day", "Out"]),
});

/** Extract the athlete id from a playercard href; null when the shape does not match. */
export function athleteIdFromLinks(links) {
  const pc = (links ?? []).find((l) => (l?.rel ?? []).includes("playercard"));
  const m = pc?.href?.match(/\/player\/_\/id\/(\d+)(?:\/|$)/);
  return m ? m[1] : null;
}

/**
 * Normalize one raw feed payload into contract entries. Total: one malformed entry quarantines
 * itself, never the batch. Reconciliation covers the whole population.
 */
export function normalizeInjuryFeed(feed, { sport, nowIso, freshWindowHours = 24 } = {}) {
  const statuses = INJURY_STATUSES[sport];
  if (!statuses) throw new Error(`normalizeInjuryFeed: unknown sport ${sport}`);
  if (!nowIso || !Number.isFinite(Date.parse(nowIso))) throw new Error("normalizeInjuryFeed: nowIso required");

  const feedAt = feed?.timestamp ?? null;
  const ageHours = feedAt ? (Date.parse(nowIso) - Date.parse(feedAt)) / 3_600_000 : null;
  const stale = ageHours == null || !Number.isFinite(ageHours) || ageHours < 0 || ageHours > freshWindowHours;

  const entries = [];
  const quarantined = [];
  let sourceRows = 0;
  for (const team of feed?.injuries ?? []) {
    const providerTeamId = team?.id != null ? String(team.id) : null;
    for (const raw of team?.injuries ?? []) {
      sourceRows += 1;
      const athleteId = athleteIdFromLinks(raw?.athlete?.links);
      if (!providerTeamId) { quarantined.push({ reason: "team without a provider id — entries cannot link to schedule identity", athleteName: raw?.athlete?.displayName ?? null }); continue; }
      if (!athleteId) { quarantined.push({ reason: "athlete id not extractable from the playercard link — refuse, never name-match", providerTeamId, athleteName: raw?.athlete?.displayName ?? null }); continue; }
      if (!raw?.date || !Number.isFinite(Date.parse(raw.date))) { quarantined.push({ reason: "entry without a parseable timestamp — untimed availability cannot gate anything", providerTeamId, athleteId }); continue; }
      if (!statuses.includes(raw?.status)) { quarantined.push({ reason: `UNKNOWN_STATUS "${raw?.status}" — outside the observed closed set, never guessed into a bucket`, providerTeamId, athleteId }); continue; }
      entries.push({
        sport,
        providerTeamId,
        athleteId,
        athleteName: raw.athlete?.displayName ?? null, // display only — identity is the id
        status: raw.status,
        statedAt: raw.date,
      });
    }
  }
  return {
    contractVersion: INJURY_CONTRACT_VERSION,
    sport,
    feedTimestamp: feedAt,
    ageHours: ageHours != null && Number.isFinite(ageHours) ? Number(ageHours.toFixed(1)) : null,
    stale,
    entries,
    quarantined,
    reconciliation: { sourceRows, kept: entries.length, quarantined: quarantined.length, exact: sourceRows === entries.length + quarantined.length },
  };
}

/**
 * Availability lookup under the ABSENCE and STALENESS rules. Returns the explicit entry only
 * when the feed is fresh and the athlete is present; everything else is UNKNOWN with its reason.
 */
export function availabilityFor(normalized, { athleteId }) {
  if (normalized.stale) return { status: "UNKNOWN", reason: "feed is stale — a stale feed widens uncertainty, it never narrows it" };
  const entry = normalized.entries.find((e) => e.athleteId === String(athleteId));
  if (!entry) return { status: "UNKNOWN", reason: "absent from the feed — absence is not health" };
  return { status: entry.status, statedAt: entry.statedAt, providerTeamId: entry.providerTeamId };
}
