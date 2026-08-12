/**
 * NFL results monitor — corrections and first-join discovery (Program 163 · Release E).
 *
 * PURE comparator over two consecutive results captures, keyed by provider event id. Its job is
 * to make every change reality can supply a NAMED class with review semantics — because the one
 * thing a settlement pipeline must never do is silently absorb a rewritten past:
 *   - a final whose score CHANGES afterward is SCORE_CORRECTION → review, never silent regrade;
 *   - a final that becomes non-final is STATUS_REGRESSION → review (the StatsAPI "Final" lie);
 *   - an event that vanishes while still inside the window is DISAPPEARED_UNEXPECTED → review;
 *     one that slides out of the trailing window is LEFT_WINDOW — expected mechanics, not drama.
 *
 * firstJoinCandidates() discovers the Aug 13+ first-join watch FROM ARTIFACTS (committed schedule
 * union × current results window) instead of a human remembering a matchup. No network, no
 * filesystem, no clock — callers supply artifacts.
 */

export const NFL_RESULTS_MONITOR_VERSION = 1;

export const MONITOR_CLASSES = Object.freeze([
  "NEW_EVENT", "LEFT_WINDOW", "DISAPPEARED_UNEXPECTED", "BECAME_FINAL", "STATUS_REGRESSION",
  "SCORE_CORRECTION", "METADATA_CHANGE", "RESCHEDULED", "UNCHANGED",
]);

const isFinal = (r) => /^STATUS_FINAL/.test(r?.statusRaw ?? "");

/** Compare consecutive captures. Returns named changes + review flags + exact reconciliation. */
export function monitorNflResults(prev, next) {
  const prevBy = new Map((prev?.rows ?? []).map((r) => [r.providerEventId, r]));
  const nextBy = new Map((next?.rows ?? []).map((r) => [r.providerEventId, r]));
  const changes = [];

  const windowStart = next?.windowDays && next?.generatedAt
    ? new Date(Date.parse(next.generatedAt) - next.windowDays * 86400_000).toISOString()
    : null;

  for (const [id, r] of nextBy) if (!prevBy.has(id)) changes.push({ class: "NEW_EVENT", providerEventId: id, evidence: `${r.shortName ?? id} entered the window` });
  for (const [id, r] of prevBy) {
    if (nextBy.has(id)) continue;
    const insideWindow = windowStart && r.dateUtc && Date.parse(r.dateUtc) >= Date.parse(windowStart);
    changes.push(insideWindow
      ? { class: "DISAPPEARED_UNEXPECTED", providerEventId: id, review: true, evidence: `${r.shortName ?? id} vanished while still inside the trailing window — both source records must be preserved` }
      : { class: "LEFT_WINDOW", providerEventId: id, evidence: `${r.shortName ?? id} slid out of the trailing window — expected mechanics` });
  }

  for (const [id, n] of nextBy) {
    const p = prevBy.get(id);
    if (!p) continue;
    const row = [];
    if (!isFinal(p) && isFinal(n)) row.push({ class: "BECAME_FINAL", evidence: `${p.statusRaw} → ${n.statusRaw} (${n.ftHome}-${n.ftAway})` });
    if (isFinal(p) && !isFinal(n)) row.push({ class: "STATUS_REGRESSION", review: true, evidence: `${p.statusRaw} → ${n.statusRaw} — a final that un-finals requires review, never silent acceptance` });
    if (isFinal(p) && isFinal(n) && (p.ftHome !== n.ftHome || p.ftAway !== n.ftAway)) {
      row.push({ class: "SCORE_CORRECTION", review: true, before: `${p.ftHome}-${p.ftAway}`, after: `${n.ftHome}-${n.ftAway}`, evidence: "a graded score changed — append-only correction receipt required; nothing regrades silently" });
    }
    if ((p.seasonType ?? null) !== (n.seasonType ?? null) || (p.week ?? null) !== (n.week ?? null)) row.push({ class: "METADATA_CHANGE", review: true, evidence: `seasonType/week moved (${p.seasonType}/${p.week} → ${n.seasonType}/${n.week}) — season separation must be re-verified` });
    if ((p.dateUtc ?? null) !== (n.dateUtc ?? null)) row.push({ class: "RESCHEDULED", evidence: `${p.dateUtc} → ${n.dateUtc}` });
    if (row.length === 0) changes.push({ class: "UNCHANGED", providerEventId: id });
    else for (const c of row) changes.push({ providerEventId: id, ...c });
  }

  const counts = {};
  for (const cls of MONITOR_CLASSES) counts[cls] = changes.filter((c) => c.class === cls).length;
  return {
    version: NFL_RESULTS_MONITOR_VERSION,
    changes,
    counts,
    reviewRequired: changes.filter((c) => c.review === true),
    reconciliation: { prevRows: prevBy.size, nextRows: nextBy.size, exact: counts.NEW_EVENT + [...nextBy.keys()].filter((id) => prevBy.has(id)).length === nextBy.size },
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
  const finalIds = new Set((resultsArtifact?.rows ?? []).filter(isFinal).map((r) => r.providerEventId));
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
