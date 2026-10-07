/**
 * HN-1 (founder Q1-RULE, 2026-10-07 03:21Z) — the Homer Nukes picks OF RECORD, per settled day.
 *
 * A Homer Nukes list counts only as it stood before the day's first pitch (Stage 3 Q1: the last valid version before
 * the start). The settled files grade whatever the day file held when the settler ran, and on four days that was not
 * a pregame list (Product Engine's replay, departments/product-engine/HOMER_NUKES_FREEZE_AUDIT_2026-10-07.txt):
 *   - Aug 27, Sep 3, Sep 7: no list was ever built before first pitch. EXCLUDED and disclosed (Q5), never a miss.
 *   - Sep 10: a rebuild after first pitch swapped a member and re-priced one. Graded on the last pre-first-pitch list.
 * The settled files are never rewritten (raw history); the append-only correction log
 * (data/internal/mlb/homer-nukes-corrections/) restates what counts, with provenance. Nothing is reconstructed: a
 * corrected day uses a list that existed before first pitch and the official result of each of its members.
 *
 * Every reader of the Homer Nukes record (settler record.json, /homer-nukes, the Forecast Ledger) reads days through
 * here, so they cannot disagree. Pure.
 */

export const HN_CORRECTION_SCHEMA = "homer-nukes-correction@1";
export const HN_CORRECTIONS_DIR = "data/internal/mlb/homer-nukes-corrections";
export const HN_EXCLUSION = Object.freeze({ NO_PREGAME_LIST: "NO_PREGAME_LIST", POST_START_ADDITION: "POST_START_ADDITION" });
export const HN_OF_RECORD_RULE = "a Homer Nukes pick counts as it stood on the last list built before the day's first pitch; a day with no such list is excluded and disclosed, never graded";

const ids = (picks) => (picks ?? []).map((p) => String(p.playerId)).sort().join(",");
const decided = (p) => p.result === "hit" || p.result === "miss";

/**
 * Index committed correction logs by date. Two logs restating one date differently throw.
 * @param {Array<object>} logs
 */
export function indexHomerNukesCorrections(logs) {
  const byDate = new Map();
  for (const log of logs ?? []) {
    if (log?.schema !== HN_CORRECTION_SCHEMA) throw new Error(`homer-nukes corrections: unknown schema ${log?.schema}`);
    for (const e of log.entries ?? []) {
      const prev = byDate.get(e.date);
      if (prev && JSON.stringify(prev.entry) !== JSON.stringify(e)) throw new Error(`homer-nukes corrections: ${e.date} is restated twice, differently`);
      byDate.set(e.date, { entry: e, logId: log.id, decision: log.decision?.ref ?? null });
    }
  }
  return byDate;
}

/**
 * One settled day → its picks of record.
 * @param {object} settled   settled-<date>.json
 * @param {Map} corrections  indexHomerNukesCorrections(...)
 * @returns {{ date, picks: object[], excluded: null | { reason, picks: object[], logId }, corrected: null | { logId, replaced: object[] } }}
 */
export function homerNukesDayOfRecord(settled, corrections = new Map()) {
  const date = settled?.date;
  const c = corrections.get(date);
  const picks = settled?.picks ?? [];
  if (!c) return { date, picks, excluded: null, corrected: null };
  const e = c.entry;
  // The log names the graded list it corrects; if the settled file no longer holds that list, the log is stale.
  if (ids(e.gradedAsPublished?.picks) !== ids(picks)) {
    throw new Error(`homer-nukes corrections: ${date} log ${c.logId} corrects a graded list the settled file does not hold`);
  }
  if (e.action === "EXCLUDE_DAY") {
    return { date, picks: [], excluded: { reason: e.reason, picks, logId: c.logId }, corrected: null };
  }
  if (e.action === "GRADE_ON_LIST_OF_RECORD") {
    const ofRecord = (e.ofRecord ?? []).map((p) => ({
      playerId: p.playerId, player: p.player, gamePk: p.gamePk, probability: p.probability,
      result: p.result, homeRuns: p.homeRuns ?? null, source: "homer-nukes-correction", correction: c.logId,
      ...(p.probabilityAsGraded != null ? { probabilityAsGraded: p.probabilityAsGraded } : {}),
    }));
    const keep = new Set(ofRecord.map((p) => String(p.playerId)));
    const replaced = picks.filter((p) => !keep.has(String(p.playerId)));
    return { date, picks: ofRecord, excluded: replaced.length ? { reason: HN_EXCLUSION.POST_START_ADDITION, picks: replaced, logId: c.logId } : null, corrected: { logId: c.logId, replaced } };
  }
  throw new Error(`homer-nukes corrections: ${date} has unknown action ${e.action}`);
}

const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));

/**
 * The cumulative record over days of record: graded picks, predicted vs actual homers, Brier, and what was excluded.
 * @param {Array<ReturnType<typeof homerNukesDayOfRecord>>} days
 */
export function homerNukesRecord(days) {
  const all = days.flatMap((d) => d.picks.filter(decided));
  const hits = all.filter((p) => p.result === "hit").length;
  const exDays = days.filter((d) => d.excluded && d.picks.length === 0);
  const exPicks = days.flatMap((d) => (d.excluded ? d.excluded.picks.filter(decided) : []));
  return {
    gradedPicks: all.length,
    predicted: round(all.reduce((n, p) => n + p.probability, 0)),
    actual: hits,
    brier: all.length ? round(all.reduce((n, p) => n + Math.pow(p.probability - (p.result === "hit" ? 1 : 0), 2), 0) / all.length) : null,
    excluded: exPicks.length || exDays.length ? {
      rule: HN_OF_RECORD_RULE,
      days: exDays.map((d) => ({ date: d.date, reason: d.excluded.reason })),
      picks: exPicks.length,
      correctedDays: days.filter((d) => d.corrected).map((d) => d.date),
    } : null,
  };
}
