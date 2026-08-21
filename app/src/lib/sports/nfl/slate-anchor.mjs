/**
 * WHICH DAY IS "THE SLATE"? — one owner, because the hub and its guard both need the answer.
 *
 * /nfl derives its slate day from the canonical index's `nextKickoffUtc` rather than a pinned date.
 * That is right, and it broke anyway: on 2026-08-21 nfl-event-window failed three consecutive runs,
 * so the index froze a day behind while sport-schedules kept refreshing the schedule. The anchor
 * came to name an ET day whose games had all kicked off, the day filter matched nothing, and the hub
 * rendered an empty slate — while the very index it was reading still held published simulations for
 * that night's two games and the next day's seven.
 *
 * The guard did not catch it, because the guard computed the slate day THE SAME WAY the page did,
 * in its own copy of the expression. Two copies of a rule are two chances to be wrong together, so
 * the rule lives here and both sides call it.
 *
 * THE RULE. A stale anchor cannot be told from a fresh one by looking at it, but it can be told by
 * its consequence: an anchor that no scheduled game shares a day with cannot be the next slate. So
 * the index is trusted while the schedule corroborates it, and otherwise the earliest genuinely
 * scheduled game takes over.
 *
 * WHAT THIS DOES NOT DO. It never invents a game and never changes whether a simulation exists. A
 * game the index did not simulate still renders as unsimulated. It chooses which REAL games are
 * listed — nothing more — and it takes no view of the current time, because the page is statically
 * exported and a build-time clock would rot exactly like the anchor it is replacing.
 */

/** ET calendar day for an instant. The slate is a US evening, so ET is the day that means anything. */
export function etDay(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

/**
 * @param {{nextKickoffUtc?: string|null}|null} index   the canonical NFL index
 * @param {Array<{dateUtc: string}>} scheduled          STATUS_SCHEDULED rows, ascending by kickoff
 * @returns {{anchorUtc: string|null, slateDay: string|null, source: "INDEX"|"SCHEDULE"|"INDEX_UNCORROBORATED"|"NONE"}}
 *
 * `source` is returned so a caller can report WHY it is showing what it is showing. INDEX means the
 * index anchored the day and the schedule agreed. SCHEDULE means the index was stale or absent and
 * the earliest scheduled game took over. INDEX_UNCORROBORATED means the index named a day, the
 * schedule had nothing at all to corroborate it with, and there was no alternative to fall back to.
 */
export function deriveSlateAnchor(index, scheduled) {
  const rows = Array.isArray(scheduled) ? scheduled : [];
  const indexAnchor = index?.nextKickoffUtc ?? null;
  const indexDay = indexAnchor ? etDay(indexAnchor) : null;

  if (indexDay != null && rows.some((r) => etDay(r.dateUtc) === indexDay)) {
    return { anchorUtc: indexAnchor, slateDay: indexDay, source: "INDEX" };
  }
  const earliest = rows[0]?.dateUtc ?? null;
  if (earliest) return { anchorUtc: earliest, slateDay: etDay(earliest), source: "SCHEDULE" };
  if (indexAnchor) return { anchorUtc: indexAnchor, slateDay: indexDay, source: "INDEX_UNCORROBORATED" };
  return { anchorUtc: null, slateDay: null, source: "NONE" };
}
