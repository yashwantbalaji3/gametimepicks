/**
 * Provider-event → canonical-schedule identity join (Program 167 · Release C).
 *
 * An odds row is evidence about ONE scheduled event, and the join to that event is where odds
 * lanes go wrong silently: display-name matching mints identity, swapped corners grade the wrong
 * side, and a doubleheader or rematch collides two events into one. This module does the join
 * with the same discipline as settlement joins:
 *
 *   - BOTH participants must resolve (via the sport's own alias normalizer) against ONE schedule
 *     row, with start times inside a bounded tolerance.
 *   - Zero candidates → UNMATCHED (quarantine). Two-plus candidates → AMBIGUOUS (quarantine) —
 *     ambiguity is never resolved by picking the closest.
 *   - Reversed home/away is matched but REPORTED (`orientation: "SWAPPED"`) so a corner-sensitive
 *     consumer can refuse; the join itself never silently flips outcomes.
 *   - providerEventId lineage: once a provider event joins a canonical event, that pairing is
 *     recorded; the same provider id joining a DIFFERENT canonical event later is a lineage
 *     violation the caller must quarantine (rematch safety).
 */

export const EVENT_JOIN_VERSION = 1;

const defaultNormalize = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Join one provider event to canonical schedule rows.
 *
 * @param {{ providerEventId: string, home: string, away: string, scheduledStartUtc: string }} oddsEvent
 * @param {Array<{ canonicalEventId: string, home: string, away: string, startTimeUtc: string }>} scheduleRows
 * @param {{ normalizeName?: (n: string) => string, startToleranceMinutes?: number, lineage?: Record<string,string> }} [opts]
 *   `lineage` maps providerEventId → canonicalEventId from prior joins (rematch safety).
 */
export function joinOddsEventToSchedule(oddsEvent, scheduleRows, { normalizeName = defaultNormalize, startToleranceMinutes = 45, lineage = {} } = {}) {
  const started = Date.parse(oddsEvent?.scheduledStartUtc ?? "");
  if (!oddsEvent?.providerEventId || !oddsEvent?.home || !oddsEvent?.away || !Number.isFinite(started)) {
    return { state: "UNMATCHED", reason: "provider event missing id/participants/start — unjoinable" };
  }
  const oh = normalizeName(oddsEvent.home);
  const oa = normalizeName(oddsEvent.away);
  if (!oh || !oa || oh === oa) return { state: "UNMATCHED", reason: "participant names empty or identical after normalization" };

  const tolMs = startToleranceMinutes * 60_000;
  const candidates = [];
  for (const row of scheduleRows ?? []) {
    const rs = Date.parse(row?.startTimeUtc ?? "");
    if (!Number.isFinite(rs) || Math.abs(rs - started) > tolMs) continue;
    const rh = normalizeName(row.home);
    const ra = normalizeName(row.away);
    if (rh === oh && ra === oa) candidates.push({ row, orientation: "ALIGNED" });
    else if (rh === oa && ra === oh) candidates.push({ row, orientation: "SWAPPED" });
  }

  if (candidates.length === 0) {
    return { state: "UNMATCHED", reason: `no schedule row matches ${oddsEvent.away} @ ${oddsEvent.home} within ±${startToleranceMinutes}m of ${oddsEvent.scheduledStartUtc}` };
  }
  if (candidates.length > 1) {
    return {
      state: "AMBIGUOUS",
      reason: `${candidates.length} schedule rows match within tolerance — ambiguity quarantines, never picks the closest`,
      candidateIds: candidates.map((c) => c.row.canonicalEventId),
    };
  }

  const { row, orientation } = candidates[0];
  const prior = lineage[oddsEvent.providerEventId];
  if (prior && prior !== row.canonicalEventId) {
    return {
      state: "LINEAGE_VIOLATION",
      reason: `providerEventId ${oddsEvent.providerEventId} previously joined ${prior}, now matches ${row.canonicalEventId} — rematch/reschedule collision, quarantined`,
      previousCanonicalEventId: prior,
      candidateIds: [row.canonicalEventId],
    };
  }

  return {
    state: "JOINED",
    canonicalEventId: row.canonicalEventId,
    providerEventId: oddsEvent.providerEventId,
    orientation, // SWAPPED joins are valid identity but corner-sensitive consumers must decide
    startDeltaMinutes: Number(((Date.parse(row.startTimeUtc) - started) / 60_000).toFixed(1)),
  };
}

/**
 * Join a batch and produce population-exact accounting (rows in = joined + quarantined).
 * Lineage grows within the batch so an id colliding across two canonical events inside one
 * capture is caught immediately.
 */
export function joinOddsBatch(oddsEvents, scheduleRows, opts = {}) {
  const lineage = { ...(opts.lineage ?? {}) };
  const joined = [];
  const quarantined = [];
  for (const ev of oddsEvents ?? []) {
    const res = joinOddsEventToSchedule(ev, scheduleRows, { ...opts, lineage });
    if (res.state === "JOINED") {
      lineage[ev.providerEventId] = res.canonicalEventId;
      joined.push(res);
    } else {
      quarantined.push({ providerEventId: ev?.providerEventId ?? null, ...res });
    }
  }
  return {
    version: EVENT_JOIN_VERSION,
    joined,
    quarantined,
    lineage,
    accounting: { input: (oddsEvents ?? []).length, joined: joined.length, quarantined: quarantined.length },
  };
}
