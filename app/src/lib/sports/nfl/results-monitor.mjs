/**
 * NFL results monitor — corrections and first-join discovery (Program 163 · Release E; core-
 * consolidated in Release J when the third sport arrived, exactly as the original header
 * promised). The public API, class vocabulary, and review semantics are UNCHANGED — behavioral
 * identity is held by the original tests passing untouched.
 *
 * Sport-specific outcome comparator: score pairs. A graded final whose score changes is
 * SCORE_CORRECTION (review; append-only receipt per docs/NFL_CORRECTIONS_RUNBOOK.md); season
 * metadata drift is review-gated because preseason must never blend into regular season.
 */
import { diffResultCaptures, countByClass } from "../results-monitor-core.mjs";

export const NFL_RESULTS_MONITOR_VERSION = 2;

export const MONITOR_CLASSES = Object.freeze([
  "NEW_EVENT", "LEFT_WINDOW", "DISAPPEARED_UNEXPECTED", "BECAME_FINAL", "STATUS_REGRESSION",
  "SCORE_CORRECTION", "METADATA_CHANGE", "RESCHEDULED", "UNCHANGED",
]);

export function monitorNflResults(prev, next) {
  const out = diffResultCaptures(prev, next, {
    idOf: (r) => r.providerEventId,
    labelOf: (r) => r.shortName ?? r.providerEventId,
    isFinal: (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? ""),
    newClass: "NEW_EVENT",
    compareOutcome: (p, n) => {
      const row = [];
      if (p.ftHome !== n.ftHome || p.ftAway !== n.ftAway) {
        row.push({ class: "SCORE_CORRECTION", review: true, before: `${p.ftHome}-${p.ftAway}`, after: `${n.ftHome}-${n.ftAway}`, evidence: "a graded score changed — append-only correction receipt required; nothing regrades silently" });
      }
      return row;
    },
  });

  // Season metadata drift applies to every shared row, final or not — checked outside the core's
  // final-vs-final comparator so a scheduled row's seasonType flip is caught too.
  const prevBy = new Map((prev?.rows ?? []).map((r) => [r.providerEventId, r]));
  const changes = out.changes.flatMap((c) => {
    const results = [c];
    return results;
  });
  for (const n of next?.rows ?? []) {
    const p = prevBy.get(n.providerEventId);
    if (!p) continue;
    if ((p.seasonType ?? null) !== (n.seasonType ?? null) || (p.week ?? null) !== (n.week ?? null)) {
      changes.push({ id: n.providerEventId, class: "METADATA_CHANGE", review: true, evidence: `seasonType/week moved (${p.seasonType}/${p.week} → ${n.seasonType}/${n.week}) — season separation must be re-verified` });
      // A row that was UNCHANGED but has metadata drift is no longer unchanged.
      const idx = changes.findIndex((c) => c.class === "UNCHANGED" && c.id === n.providerEventId);
      if (idx !== -1) changes.splice(idx, 1);
    }
  }

  const named = changes.map(({ id, ...rest }) => ({ providerEventId: id, ...rest }));
  return {
    version: NFL_RESULTS_MONITOR_VERSION,
    changes: named,
    counts: countByClass(changes, MONITOR_CLASSES),
    reviewRequired: named.filter((c) => c.review === true),
    reconciliation: out.reconciliation,
  };
}

/**
 * Discover upcoming first-join candidates FROM ARTIFACTS: scheduled events whose kickoff falls
 * inside [now, now + horizonDays] and which have no joined final yet. The Aug 13+ watch, derived.
 */
export function firstJoinCandidates({ scheduleRows, resultsArtifact, nowIso, horizonDays = 3 }) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("firstJoinCandidates: nowIso required");
  const horizon = now + horizonDays * 86400_000;
  const finalIds = new Set((resultsArtifact?.rows ?? []).filter((r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "")).map((r) => r.providerEventId));
  return (scheduleRows ?? [])
    .filter((s) => {
      const t = Date.parse(s.dateUtc ?? "");
      return Number.isFinite(t) && t >= now && t <= horizon && !finalIds.has(s.providerEventId);
    })
    .sort((a, b) => (a.dateUtc ?? "").localeCompare(b.dateUtc ?? ""))
    .map((s) => ({
      providerEventId: s.providerEventId,
      shortName: s.shortName ?? null,
      kickoffUtc: s.dateUtc,
      seasonType: s.seasonType ?? null,
      acceptance: "the final joins (not quarantines) on the first cadence run after the game, with population-exact reconciliation and lineage from this committed schedule row",
    }));
}
