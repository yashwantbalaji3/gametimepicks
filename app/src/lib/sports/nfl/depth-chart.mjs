/**
 * THE POINT-IN-TIME DEPTH-CHART CONSUMER (§12.1) — who was the starter, as of an instant.
 *
 * SHADOW ONLY. Nothing here is wired to a producer, a board or a route. §12 is explicit that
 * publishing a starter changes rows a reader sees and is a founder decision, and §12.1 is equally
 * explicit that the consumer, the resolution and the measurement are to be built and tested first.
 * This is that, and the measurement it enables is the reason it exists.
 *
 * ── WHAT THE SOURCE ACTUALLY IS, MEASURED RATHER THAN ASSUMED ──────────────────────────────────
 *
 * `data/internal/research/nfl/depth-charts/2026-*.json`, from nflverse, free and keyless:
 *
 *   5,493 snapshots · 32 teams · 2026-03-22 → 2026-09-08 · `acquiredAt` 2026-09-09
 *
 * Three things follow, and each one bounds what may be claimed from it:
 *
 *   ⚠ QUARTERBACKS ONLY. The snapshot field is literally `quarterbacks`. There is no running back,
 *     receiver or tight end in this artifact, so it can resolve ONE pool. That happens to be the
 *     right pool — the largest conservation violation on the published board is three Cleveland
 *     quarterbacks holding 243% of Cleveland's pass attempts — but "publish one starter per pool"
 *     is not what this source can support. One pool is.
 *
 *   🔴 IT IS EIGHTEEN DAYS STALE AND NOTHING REFRESHES IT. `acquire-depth-chart-research.mjs`
 *     appears in NO workflow, and the artifact has exactly ONE commit in the repository's history
 *     (2026-09-08). Resolving a Week-4 starter from a snapshot that predates three games is a
 *     current-role claim made from evidence about a different present — the defect class this
 *     product exists to refuse.
 *
 *   ⚠ SO STALENESS FAILS CLOSED, and the bound is a required argument. There is no default, because
 *     a default is where an 18-day-old answer gets returned by a caller who never thought about it.
 *
 * ── POINT-IN-TIME, WHICH IS THE WHOLE CLAIM §12 MAKES FOR THIS SOURCE ──────────────────────────
 *
 * §12 notes that the historical QB study stays REJECTED and that capturing a depth chart FORWARD is
 * a different claim — point-in-time by construction, for correctness rather than calibration. That
 * property is only real if the reader enforces it, so `depthChartAsOf` considers ONLY snapshots at
 * or before the instant asked about. A snapshot from after it cannot be reached through any
 * argument, which is the leakage guard the calibration work needed and did not have.
 */

export const DEPTH_STATE = Object.freeze({
  RESOLVED: "RESOLVED",           // a snapshot at or before the instant, inside the freshness bound
  STALE: "STALE",                 // a snapshot exists and is older than the caller's bound
  NO_SNAPSHOT: "NO_SNAPSHOT",     // nothing at or before the instant for this team
  NO_ORDER: "NO_ORDER",           // a snapshot with no usable ranking
});

const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };

/**
 * Index the artifact's snapshots by team, ascending by time, once.
 * Rows without a team or a parseable timestamp are dropped and counted, never silently kept.
 */
export function indexDepthCharts(artifact) {
  const byTeam = new Map();
  let dropped = 0;
  for (const s of artifact?.snapshots ?? []) {
    const t = ms(s?.timestamp);
    if (!s?.team || t === null) { dropped += 1; continue; }
    if (!byTeam.has(s.team)) byTeam.set(s.team, []);
    byTeam.get(s.team).push({ ...s, _ms: t });
  }
  for (const list of byTeam.values()) list.sort((a, b) => a._ms - b._ms);
  return {
    byTeam, dropped,
    teams: [...byTeam.keys()].sort(),
    newestMs: Math.max(...[...byTeam.values()].flatMap((l) => l.map((s) => s._ms)), -Infinity),
  };
}

/**
 * The quarterback order for one team as of an instant.
 *
 * @param {object} index      from `indexDepthCharts`
 * @param {string} team       nflverse team abbreviation
 * @param {string} asOfIso    the instant to answer as of — a board's `generatedAt`, never a clock
 * @param {number} maxAgeMs   REQUIRED. How old a snapshot may be and still answer.
 */
export function depthChartAsOf(index, team, asOfIso, maxAgeMs) {
  if (!Number.isFinite(maxAgeMs)) {
    /* Not a thrown error by accident: a caller that forgot the bound must not get an answer. */
    throw new Error("depthChartAsOf: maxAgeMs is required — a staleness bound has no safe default");
  }
  const asOf = ms(asOfIso);
  const list = index?.byTeam?.get(team) ?? [];
  const empty = { state: DEPTH_STATE.NO_SNAPSHOT, team, starter: null, backups: [], snapshotAt: null, ageMs: null };
  if (asOf === null || !list.length) return empty;

  /* ⚠ AT OR BEFORE, AND NOTHING ELSE. A later snapshot is not reachable through any argument. */
  let found = null;
  for (const s of list) { if (s._ms <= asOf) found = s; else break; }
  if (!found) return empty;

  const ageMs = asOf - found._ms;
  const ranked = (found.quarterbacks ?? [])
    .filter((q) => q?.playerId && Number.isFinite(Number(q.rank)))
    .sort((a, b) => Number(a.rank) - Number(b.rank));

  const base = { team, snapshotAt: found.timestamp, ageMs, order: ranked };
  if (!ranked.length) return { ...base, state: DEPTH_STATE.NO_ORDER, starter: null, backups: [] };
  if (ageMs > maxAgeMs) {
    /* ⚠ THE ORDER IS STILL RETURNED, and the state says it may not be used as a current role. Losing
       the evidence would make the staleness unmeasurable, which is how it went unnoticed for
       eighteen days. */
    return { ...base, state: DEPTH_STATE.STALE, starter: null, backups: [] };
  }
  return {
    ...base,
    state: DEPTH_STATE.RESOLVED,
    starter: ranked[0],
    backups: ranked.slice(1),
  };
}

/**
 * The shadow measurement §12.1 asks for: across a set of (team, asOf) questions, how many could be
 * answered at all — and how many only because the bound was generous.
 *
 * Returns counts by state and the age distribution, so a founder gate is decided on the spread
 * rather than on whether one example happened to resolve.
 */
export function depthChartCoverage(index, questions, maxAgeMs) {
  const counts = {}; const ages = [];
  const rows = [];
  for (const q of questions) {
    const r = depthChartAsOf(index, q.team, q.asOf, maxAgeMs);
    counts[r.state] = (counts[r.state] ?? 0) + 1;
    if (r.ageMs !== null) ages.push(r.ageMs);
    rows.push({ ...q, ...r });
  }
  ages.sort((a, b) => a - b);
  return {
    counts, rows,
    ageDays: ages.length
      ? { min: +(ages[0] / 86400000).toFixed(1),
          median: +(ages[Math.floor(ages.length / 2)] / 86400000).toFixed(1),
          max: +(ages[ages.length - 1] / 86400000).toFixed(1) }
      : null,
  };
}
