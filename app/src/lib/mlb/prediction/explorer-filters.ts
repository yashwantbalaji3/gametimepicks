/**
 * SIMULATION EXPLORER FILTERS + SORTS (Sprint 013 · Phase 7). Pure, deterministic selectors that reorder or
 * narrow the Explorer's cards. Every criterion reads a value that ALREADY EXISTS on the canonical full-game
 * artifact — nothing here simulates, predicts, or invents a number; the worst it can do is show fewer cards.
 *
 * Definitions (stated so the UI label can never overclaim):
 *   closest        → |winProbability − 0.5| is smallest (the simulation is least decided)
 *   biggest-edge   → the winning side's probability is highest (the simulation is most decided)
 *   highest-scoring→ the largest median total runs
 *   most-uncertain → the widest total-runs p10–p90 band (the widest simulated spread)
 */
import type { FullGameSimGame } from "@/lib/mlb/full-game/types";

export type ExplorerFilter = "all" | "closest" | "decisive" | "highest-scoring" | "most-uncertain";
export type ExplorerSort = "first-pitch" | "win-probability" | "total-runs" | "uncertainty";

export const FILTER_LABELS: { key: ExplorerFilter; label: string }[] = [
  { key: "all", label: "All games" },
  { key: "closest", label: "Closest simulations" },
  { key: "decisive", label: "Most decided" },
  { key: "highest-scoring", label: "Highest scoring" },
  { key: "most-uncertain", label: "Widest range" },
];

export const SORT_LABELS: { key: ExplorerSort; label: string }[] = [
  { key: "first-pitch", label: "First pitch" },
  { key: "win-probability", label: "Win probability" },
  { key: "total-runs", label: "Total runs" },
  { key: "uncertainty", label: "Widest range" },
];

/** How decided the simulation is: the winning side's probability (always ≥ 0.5). Null when unavailable. */
export function decisiveness(g: FullGameSimGame): number | null {
  if (!g.winProbability) return null;
  return Math.max(g.winProbability.away, g.winProbability.home);
}

/** The width of the simulated total-runs band (p90 − p10). Null when unavailable. */
export function totalSpread(g: FullGameSimGame): number | null {
  if (!g.totalRuns) return null;
  return g.totalRuns.p90 - g.totalRuns.p10;
}

/** Median simulated total runs. Null when unavailable. */
export function medianTotal(g: FullGameSimGame): number | null {
  return g.totalRuns ? g.totalRuns.median : null;
}

/**
 * Apply a filter then a sort. Games missing the value a criterion needs are excluded from that FILTER (never
 * shown with a fabricated stand-in) and sink to the end of a SORT. Deterministic: ties fall back to slug.
 */
export function applyExplorerView<T extends { slug: string; game: FullGameSimGame }>(
  cards: T[],
  filter: ExplorerFilter,
  sort: ExplorerSort,
  opts?: { topN?: number },
): T[] {
  const topN = opts?.topN ?? 6;
  let out = [...cards];

  // ── Filter ──
  if (filter === "closest") {
    out = out
      .filter((c) => decisiveness(c.game) != null)
      .sort((a, b) => decisiveness(a.game)! - decisiveness(b.game)! || a.slug.localeCompare(b.slug))
      .slice(0, topN);
  } else if (filter === "decisive") {
    out = out
      .filter((c) => decisiveness(c.game) != null)
      .sort((a, b) => decisiveness(b.game)! - decisiveness(a.game)! || a.slug.localeCompare(b.slug))
      .slice(0, topN);
  } else if (filter === "highest-scoring") {
    out = out
      .filter((c) => medianTotal(c.game) != null)
      .sort((a, b) => medianTotal(b.game)! - medianTotal(a.game)! || a.slug.localeCompare(b.slug))
      .slice(0, topN);
  } else if (filter === "most-uncertain") {
    out = out
      .filter((c) => totalSpread(c.game) != null)
      .sort((a, b) => totalSpread(b.game)! - totalSpread(a.game)! || a.slug.localeCompare(b.slug))
      .slice(0, topN);
  }

  // ── Sort (a filter already ordered its own subset; an explicit sort still wins) ──
  const nullsLast = (v: number | null) => (v == null ? Number.NEGATIVE_INFINITY : v);
  if (sort === "win-probability") {
    out.sort((a, b) => nullsLast(decisiveness(b.game)) - nullsLast(decisiveness(a.game)) || a.slug.localeCompare(b.slug));
  } else if (sort === "total-runs") {
    out.sort((a, b) => nullsLast(medianTotal(b.game)) - nullsLast(medianTotal(a.game)) || a.slug.localeCompare(b.slug));
  } else if (sort === "uncertainty") {
    out.sort((a, b) => nullsLast(totalSpread(b.game)) - nullsLast(totalSpread(a.game)) || a.slug.localeCompare(b.slug));
  } else {
    out.sort((a, b) => (a.game.firstPitch ?? "").localeCompare(b.game.firstPitch ?? "") || a.slug.localeCompare(b.slug));
  }
  return out;
}
