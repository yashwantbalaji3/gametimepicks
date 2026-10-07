/**
 * Stage 3E — the ONE NFL settlement-of-record selection, on the forecast-of-record contract (forecast-of-record.mjs).
 *
 * WHY. The settler grades per receipt-date folder, so a game kicking off just after 00:00Z sits in two dated files,
 * once graded against a superseded receipt (#999: 64–43 published, 61–43 true). Four readers each picked the copy of
 * record their own way (inventory R4, R5): graded-pick owners and the ledger adapter ("latest forecastGeneratedAt"),
 * the settler's lifetime summary ("later date FILE wins"), and the NFL index (unsorted readdir, last write wins). They
 * agree today only by luck. They now all ask this function.
 *
 * MAPPING (settler event → CanonicalForecast). Question: NFL | game key | GAME | game key | nfl_game_winner, where the
 * game key is the event's canonicalEventId, else `nfl-<providerEventId>` (the producer's own canonical form). Copy
 * time: lineage.forecastGeneratedAt (the receipt it graded). Cut-off: the event's kickoff. No side or line is passed:
 * copies of one game are one claim, so the latest pre-kickoff receipt's grade is of record and an identical re-grade
 * is a duplicate. An event with no game key is UNKEYED (founder Q5): kept in the raw files, left out of every record,
 * counted, never a loss.
 *
 * Pure.
 */
import { selectForecastOfRecord } from "./forecast-of-record.mjs";

/** The game key of a settler event, or null (never inferred from the matchup text). */
export function nflGameKey(e) {
  if (typeof e?.canonicalEventId === "string" && e.canonicalEventId) return e.canonicalEventId;
  if (e?.providerEventId != null && String(e.providerEventId) !== "") return `nfl-${e.providerEventId}`;
  return null;
}

/**
 * @param {object[]} events  settler events from every dated file, any order
 * @returns {{ record: object[], superseded: object[], late: object[], conflicts: object[], unkeyed: object[],
 *             supersededBy: Map<object, object> }}
 *          record: events of record (one per game); supersededBy: superseded event → the event of record for its game
 */
export function nflSettlementSelection(events) {
  const forecasts = (events ?? []).map((e) => {
    const key = nflGameKey(e);
    return {
      sport: "NFL", eventId: key, subjectType: "GAME", subjectId: key, family: "nfl_game_winner",
      line: null, frozenSide: null, sideProbabilities: null,
      publishedAt: e?.lineage?.forecastGeneratedAt ?? null,
      canonicalStart: e?.kickoffUtc ?? null,
      raw: e,
    };
  });
  const sel = selectForecastOfRecord(forecasts);
  const raw = (fs) => fs.map((f) => f.raw);
  const record = raw(sel.record);
  const byKey = new Map(record.map((e) => [nflGameKey(e), e]));
  const supersededBy = new Map();
  for (const e of raw(sel.superseded)) supersededBy.set(e, byKey.get(nflGameKey(e)) ?? null);
  return {
    record,
    superseded: raw(sel.superseded),
    late: raw(sel.late),
    conflicts: sel.conflicts.map((c) => ({ key: c.key, reason: c.reason, rows: raw(c.rows) })),
    unkeyed: raw(sel.unkeyed),
    supersededBy,
  };
}
