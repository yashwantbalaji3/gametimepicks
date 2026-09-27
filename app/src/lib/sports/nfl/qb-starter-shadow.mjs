/**
 * QB STARTER · SHADOW MEASUREMENT (§12.1, §19, §2.5) — what one rule would do, before anyone runs it.
 *
 * SHADOW ONLY, AND THAT IS A FOUNDER CONSTRAINT, NOT A PREFERENCE. §2.5 pre-authorises publishing
 * QB starter state AFTER Sunday's acceptance and forbids it before; §12 forbids mutating tomorrow's
 * frozen baseline to advance this work. So this module measures and reports. It has no writer, no
 * producer imports it, and it cannot change a published number.
 *
 * ── THE RULE BEING MEASURED, STATED NARROWLY ───────────────────────────────────────────────────
 *
 * "In a team's PASS-ATTEMPT pool, only the depth chart's QB1 holds a share."
 *
 * ⚠ ONE POOL, NOT "one starter per pool". The depth-chart source is QUARTERBACKS ONLY — the
 * snapshot field is literally `quarterbacks` — so it can resolve exactly this pool and no other.
 * §2.5 says so in as many words, and the handoff's phrasing ("one starter per pool") is broader
 * than the evidence supports. Running backs, receivers and tight ends need a different source and
 * are a separate lane.
 *
 * ⚠ AND IT IS DELIBERATELY NOT RENORMALISATION. Removing a backup's share is not the same as
 * rescaling the survivors to 1.0. §20 keeps full numerical renormalisation behind a model-promotion
 * gate, and bundling the two would make a correctness fix indistinguishable from a model change.
 * This reports the sum AFTER removal, whatever it is — including when it is still above 1.
 */
import { depthChartAsOf, DEPTH_STATE } from "./depth-chart.mjs";

/**
 * Choose the capture to read.
 *
 * ⚠ A CONTENT-ADDRESSED FILENAME CARRIES NO ORDER, and this cost a whole false finding. The names
 * are `<season>-<sha>.json`; the first version of this module took the lexically-last one, with a
 * comment claiming that picked the newest capture. It picked `2026-a2bc…` (acquired Sep 9, newest
 * snapshot Sep 8) over `2026-10d6…` (acquired Sep 26, newest snapshot Sep 26) purely because `a`
 * sorts after `1`. Every one of 26 pools then came back STALE at 18.5 days, and the report would
 * have reported the rule unmeasurable and blamed the data pipeline for freshness it actually had.
 *
 * So ordering comes from the artifact's OWN `acquiredAt`, which is a timestamp, and a doc without
 * one is not silently ranked last — it is refused, because a missing order is not an old order.
 */
export function pickNewestCapture(docs) {
  const dated = [];
  for (const d of docs ?? []) {
    const t = Date.parse(d?.doc?.acquiredAt ?? "");
    if (!Number.isFinite(t)) continue;
    dated.push({ ...d, _ms: t });
  }
  if (!dated.length) return null;
  dated.sort((a, b) => b._ms - a._ms);
  return dated[0];
}

/** nflverse and the board do not always spell a club the same way; the board's own mapping wins. */
const norm = (t) => String(t ?? "").toUpperCase().trim();

export const QB_POOL = "passAttempts";

/** Apply the rule to one team's pass-attempt pool. Returns a description; changes nothing. */
export const SKIP = Object.freeze({
  /* The chart could not be read at all — stale, missing, or unordered. */
  NO_CHART: "NO_CHART",
  /*
   * ⚠ THESE TWO WERE ONE LABEL, AND THE MERGER HID THE MORE SERIOUS DEFECT. "Starter not on board"
   * is ambiguous between "we never projected this player" and "we projected him, but not in this
   * pool", and the remedy differs: the first is a roster/identity gap, the second is a pool
   * assignment bug in the projection builder. The 2026-09-27 slate had exactly one of each, which
   * is why the merged label had to go:
   *   · WSH — Jayden Daniels appears nowhere on the board in any market  → ABSENT
   *   · MIN — Kyler Murray is on the board, but with no pass-attempt projection → NOT_IN_POOL,
   *     so MIN's published pass pool is Wentz + McCarthy + Brosmer (Σ2.274) and no starter.
   */
  STARTER_ABSENT_FROM_BOARD: "STARTER_ABSENT_FROM_BOARD",
  STARTER_NOT_IN_POOL: "STARTER_NOT_IN_POOL",
});

/**
 * @param row             a `conservationForBoard` row whose pool is `passAttempts`
 * @param index           from `indexDepthCharts`
 * @param asOf            the board's own `generatedAt` — never a clock
 * @param maxAgeMs        REQUIRED staleness bound; `depthChartAsOf` throws without one
 * @param boardPlayerIds  every ESPN id on the board in ANY market, so "absent" and "not in this
 *                        pool" stay separable. Omitting it collapses them back together, so it is
 *                        required rather than defaulted.
 */
export function qbShadowForPool({ row, index, asOf, maxAgeMs, boardPlayerIds, teamAlias = norm }) {
  if (!(boardPlayerIds instanceof Set)) {
    throw new Error("qbShadowForPool: boardPlayerIds (Set) is required — without it an absent starter is indistinguishable from an unprojected pool");
  }
  const chart = depthChartAsOf(index, teamAlias(row.team), asOf, maxAgeMs);

  /*
   * ⚠ NO CHART, NO RULE. A stale or absent depth chart must leave the pool exactly as it is — the
   * fail-closed direction. Dropping every QB but an arbitrary one because we could not read the
   * order would be worse than the over-allocation it was meant to fix.
   */
  if (chart.state !== DEPTH_STATE.RESOLVED) {
    return {
      team: row.team, pool: row.pool,
      /* `skip` is the coarse category; `detail` is WHY the chart was unreadable (STALE vs
         NO_SNAPSHOT vs NO_ORDER) and is the only place that distinction survives. They are not
         aliases — an earlier version carried the same value twice and a probe walked straight
         through the duplicate. */
      applied: false, skip: SKIP.NO_CHART, detail: chart.state,
      snapshotAt: chart.snapshotAt, ageMs: chart.ageMs,
      before: row.sum, after: row.sum, removed: [],
      starter: null, joined: row.joined,
    };
  }

  const starterId = String(chart.starter.playerId);
  const kept = [];
  const removed = [];
  for (const p of row.players ?? []) {
    const espnId = String(p.playerId ?? "").replace(/^nfl-athlete-/, "");
    (espnId === starterId ? kept : removed).push({ ...p, espnId });
  }

  /*
   * ⚠ IF THE STARTER IS NOT IN THE POOL, THE RULE DOES NOT FIRE. A depth chart naming a QB the
   * board never projected is a disagreement between two sources, not a licence to empty the pool —
   * and emptying it would delete every row a reader can see for that team.
   */
  if (!kept.length) {
    const onBoard = boardPlayerIds.has(starterId);
    return {
      team: row.team, pool: row.pool,
      applied: false,
      skip: onBoard ? SKIP.STARTER_NOT_IN_POOL : SKIP.STARTER_ABSENT_FROM_BOARD,
      detail: null,
      starterOnBoard: onBoard,
      snapshotAt: chart.snapshotAt, ageMs: chart.ageMs,
      before: row.sum, after: row.sum, removed: [],
      starter: { playerId: starterId, name: chart.starter.name }, joined: row.joined,
    };
  }

  const after = Number(kept.reduce((a, p) => a + (p.share ?? 0), 0).toFixed(4));
  return {
    team: row.team, pool: row.pool,
    applied: true, skip: null, detail: null,
    snapshotAt: chart.snapshotAt, ageMs: chart.ageMs,
    before: row.sum,
    after,
    /* Reported, never rescaled — see the header. */
    stillOverAllocated: after > 1 + 1e-9,
    starter: { playerId: starterId, name: chart.starter.name },
    removed: removed.map((p) => ({ playerId: p.playerId, name: p.name, share: p.share })),
    joined: row.joined,
    keptCount: kept.length,
  };
}

/** The whole slate, folded. Counts only; nothing here decides anything. */
export function qbShadowFold(results) {
  const applied = results.filter((r) => r.applied);
  const fixed = applied.filter((r) => r.before > 1 + 1e-9 && !r.stillOverAllocated);
  const stillOver = applied.filter((r) => r.stillOverAllocated);
  const skipped = results.filter((r) => !r.applied);
  const bySkipReason = {};
  for (const r of skipped) bySkipReason[r.skip] = (bySkipReason[r.skip] ?? 0) + 1;
  return {
    pools: results.length,
    applied: applied.length,
    overBefore: results.filter((r) => r.before > 1 + 1e-9).length,
    overAfter: applied.filter((r) => r.stillOverAllocated).length + skipped.filter((r) => r.before > 1 + 1e-9).length,
    fixed: fixed.length,
    stillOver: stillOver.length,
    skipped: skipped.length,
    bySkipReason,
    removedRows: applied.reduce((a, r) => a + r.removed.length, 0),
  };
}
