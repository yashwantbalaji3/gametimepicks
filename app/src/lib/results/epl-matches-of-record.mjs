/**
 * Stage 3E · optional Soccer slice (gated on the founder's answer to Soccer S2) — EPL match result (1X2) forecasts of
 * record, on Soccer's canonical match identity.
 *
 * WHY. EPL forecast ids embed the kickoff minute, so a moved kickoff mints a new id: on committed data 68 published
 * ids are only 60 matches (8 matches under two ids). Keyed on the id, 3A would see 68 questions and 8 of them would sit
 * PENDING forever. Keyed on Soccer's (competition, season, home, away) key (lib/sports/soccer/canonical-match.mjs,
 * reused as written), they are 60, with 0 id conflicts.
 *
 * WHICH COPY IS OF RECORD. For a GRADED match, the grader's own log (graded-forecasts.jsonl, `forecastGeneratedAt`)
 * is the forecast of record: the dated forecast files are overwritten, and in 15 of 46 graded matches the graded
 * version no longer exists in them. A log row generated at/after kickoff is LATE (excluded, disclosed). Two log rows
 * for one match are a CONFLICT (excluded, never one picked). For an UNGRADED match, the 3A contract picks the last
 * pre-start copy across every id of that match, cut off at the canonical start from the fixture captures.
 * Anything Soccer's helper refuses (not single-table, a side missing) is UNKEYED under Q5: excluded and counted.
 * NOT FORECAST (Soccer 13F): a copy that published no probability (no price and no model-only numbers) is WITHHELD.
 * It is never of record. A match whose every copy was withheld was never forecast: excluded and disclosed as
 * `notForecast`, never pending and never a loss (Q5).
 *
 * Pure: callers read the files.
 */
import { providerIdIndex, canonicalStarts, canonicalMatchKey } from "../sports/soccer/canonical-match.mjs";
import { selectForecastOfRecord } from "./forecast-of-record.mjs";
import { publishedModel, withheldReason } from "../sports/epl/published-forecast.mjs";

/**
 * Did this copy PUBLISH a probability? Soccer's one rule (lib/sports/epl/published-forecast.mjs, reused as written).
 * The public dated files flatten the published block to `probs` (and `modelOnly` is a flag); it is handed back under the field the rule reads for
 * that state (CURRENT_PRE_EVENT → model, READY_EXCEPT_ODDS → modelOnly). A research-shaped row passes through as is.
 */
export function eplPublishedCopy(c) {
  // Research rows nest the numbers (model.probs / modelOnly.probs); public rows carry `probs` and a boolean `modelOnly`.
  if (c?.model?.probs || c?.modelOnly?.probs) return publishedModel(c);
  const block = c?.probs ? { probs: c.probs } : null;
  return publishedModel({ state: c?.state, model: c?.state === "CURRENT_PRE_EVENT" ? block : null, modelOnly: c?.state === "READY_EXCEPT_ODDS" ? block : null });
}

const sidesOf = (r) => {
  if (r.homeClub && r.awayClub) return [r.homeClub, r.awayClub];
  const [h, a] = String(r.matchup ?? "").split(" v ");
  return [h?.trim() || null, a?.trim() || null];
};

/** A grader-log row or a forecast copy → the identity fields canonical-match.mjs reads. */
export function eplIdentityRow(r, league = "epl") {
  const [homeClub, awayClub] = sidesOf(r);
  return { eventId: r.eventId ?? null, league, homeClub, awayClub, kickoffUtc: r.kickoffUtc ?? null };
}

/**
 * @param {{ copies: Array<{ eventId, homeClub?, awayClub?, matchup?, kickoffUtc, publishedAt, probs? }>,
 *           graded: Array<object>,   graded-forecasts.jsonl rows
 *           captures: Array<object> }} input   fixture captures ({capturedAt|generatedAt, league, season, rows})
 */
export function eplMatchesOfRecord({ copies = [], graded = [], captures = [] }) {
  const idx = providerIdIndex([...copies, ...graded].map((r) => eplIdentityRow(r)));
  const starts = canonicalStarts(captures.map((c) => ({ league: "epl", ...c })));
  const keyOf = (r) => {
    if (r.eventId && idx.byId.has(r.eventId)) return idx.byId.get(r.eventId);
    const k = canonicalMatchKey(eplIdentityRow(r));
    return k.ok ? k.key : null;
  };

  /* Graded matches: the grader log is the record. */
  const gradedByKey = new Map();
  const unkeyed = [], late = [];
  for (const g of graded) {
    const key = keyOf(g);
    if (!key || (g.eventId && idx.conflicts.some((c) => c.eventId === g.eventId))) { unkeyed.push(g); continue; }
    if (!(Date.parse(g.forecastGeneratedAt ?? "") < Date.parse(g.kickoffUtc ?? ""))) { late.push(g); continue; }
    if (!gradedByKey.has(key)) gradedByKey.set(key, []);
    gradedByKey.get(key).push(g);
  }
  const gradedRecord = [], conflicts = [];
  for (const [key, rows] of gradedByKey) {
    if (rows.length === 1) gradedRecord.push({ key, row: rows[0] });
    else conflicts.push({ key, rows, reason: "two graded rows for one match" });
  }

  /* Ungraded matches: the 3A contract across every id of the match. */
  const settledKeys = new Set([...gradedByKey.keys()]);
  const canonical = [], supersededByGrader = [], withheld = [];
  const withheldKeys = new Set(), publishedKeys = new Set();
  for (const c of copies) {
    const key = keyOf(c);
    if (!key) { unkeyed.push(c); continue; }
    if (settledKeys.has(key)) { supersededByGrader.push(c); continue; }
    if (!eplPublishedCopy(c)) { withheld.push(c); withheldKeys.add(key); continue; }
    publishedKeys.add(key);
    canonical.push({ sport: "EPL", eventId: key, subjectType: "GAME", subjectId: key, family: "epl_1x2", publishedAt: c.publishedAt ?? null,
      eventStart: c.kickoffUtc ?? null, classProbabilities: c.probs ?? null, settlement: { state: "PENDING" }, providerEventId: c.eventId });
  }
  const cs = {};
  for (const [k, v] of starts) if (v) cs[`EPL|${k}`] = v;
  const sel = selectForecastOfRecord(canonical, { canonicalStarts: cs });

  const notForecast = [...withheldKeys].filter((k) => !publishedKeys.has(k)).sort().map((key) => {
    const rows = withheld.filter((c) => keyOf(c) === key);
    const last = rows.reduce((a, b) => (String(b.publishedAt ?? "") > String(a.publishedAt ?? "") ? b : a));
    return { key, kickoffUtc: last.kickoffUtc ?? null, reason: withheldReason(last) };
  });

  return {
    graded: gradedRecord,
    pending: sel.record,
    matches: gradedRecord.length + sel.record.length,
    notForecast,
    withheldCopies: withheld.length,
    providerIds: idx.byId.size,
    matchesWithSeveralIds: [...idx.aliases.values()].filter((ids) => ids.length > 1).length,
    idConflicts: idx.conflicts,
    conflicts: [...conflicts, ...sel.conflicts],
    late: [...late, ...sel.late],
    superseded: sel.superseded.length,
    supersededByGrader: supersededByGrader.length,
    ambiguous: sel.ambiguous.length,
    unkeyed: [...unkeyed, ...sel.unkeyed],
  };
}
