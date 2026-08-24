/**
 * NFL EXPERIMENTAL RECORD — cohort separation by season type (Program 196 · Release E).
 *
 * Every settled row today is PRESEASON, and the regular season starts in two weeks. Without this
 * file, the first September grade would flow into the same lifetime aggregate as August's rotation
 * football and the record would silently answer a blended question — the exact move the August 13
 * diagnostic warned against ("separate preseason and regular season") and the one every rejected
 * preseason model makes tempting: preseason accuracy is a claim about coaching rotations, not
 * about the model's regular-season worth, in either direction.
 *
 * THE RULE: metrics aggregate WITHIN one season-type cohort, never across. The summary's headline
 * block is exactly one cohort — the cohort of the most recent kickoff — with its scope named; all
 * cohorts ride beside it. A row whose season type cannot be resolved goes to UNKNOWN, which is
 * reported and never folded into either real cohort: an unlabelled row is a fact about our
 * records, not about football.
 *
 * Pure — the caller resolves season types (settled rows carry them going forward; older rows
 * resolve through their own receipt file's seasonType, which has been on every receipt since P173).
 */

export const SEASON_TYPE_LABEL = Object.freeze({ 1: "preseason", 2: "regular-season", 3: "postseason" });

const round = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(4)));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** One cohort's record, from its own rows only. Shape matches the historical lifetime block. */
export function cohortRecord(events) {
  const dec = events.filter((e) => e?.grade?.winner?.correct !== null && e?.grade?.winner?.correct !== undefined);
  return {
    settledForecasts: events.length,
    decisive: dec.length,
    winnerAccuracy: round(dec.length ? dec.filter((e) => e.grade.winner.correct).length / dec.length : null),
    marginMAE: round(mean(events.map((e) => e.grade?.margin?.absError).filter((v) => v != null))),
    totalMAE: round(mean(events.map((e) => e.grade?.total?.absError).filter((v) => v != null))),
    marginInterval80Coverage: round(mean(events.map((e) => (e.grade?.margin?.insideInterval80 ? 1 : 0)))),
    totalInterval80Coverage: round(mean(events.map((e) => (e.grade?.total?.insideInterval80 ? 1 : 0)))),
  };
}

/**
 * @param {Array<object>} events            deduped settled events (newest grade per event)
 * @param {(e: object) => number|null} resolveSeasonType
 * @returns {{ cohorts: Record<string, object>, current: object, seasonTypeScope: string, unknownCount: number }}
 */
export function summariseByCohort(events, resolveSeasonType) {
  const buckets = new Map();
  for (const e of events ?? []) {
    const t = resolveSeasonType(e);
    const key = SEASON_TYPE_LABEL[t] ?? "UNKNOWN";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  }

  const cohorts = {};
  for (const [key, evs] of buckets) cohorts[key] = { label: key, ...cohortRecord(evs) };

  /*
   * The headline is the cohort of the LATEST kickoff among rows with a KNOWN season type — the
   * question a reader is currently living in. When the first regular-season game settles, the
   * headline flips to the regular cohort at its honest small n, and preseason keeps its own block
   * unchanged instead of padding the new one.
   */
  const known = (events ?? []).filter((e) => SEASON_TYPE_LABEL[resolveSeasonType(e)]);
  const latest = known.sort((a, b) => String(a.kickoffUtc ?? "").localeCompare(String(b.kickoffUtc ?? ""))).at(-1);
  const scope = latest ? SEASON_TYPE_LABEL[resolveSeasonType(latest)] : "NONE";
  const current = cohorts[scope] ?? cohortRecord([]);

  return {
    cohorts,
    current,
    seasonTypeScope: scope,
    unknownCount: buckets.get("UNKNOWN")?.length ?? 0,
  };
}
