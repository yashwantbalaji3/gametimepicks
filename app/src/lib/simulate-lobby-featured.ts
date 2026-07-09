/**
 * FEATURED SIMULATIONS selector — a PURE, framework-free picker for the simulate-first lobby.
 *
 * Given the game-detail objects the lobby already builds (`buildAllGameDetails()`), return the
 * deterministic short list of games to feature ABOVE the full games list. The rules are strict and
 * honest — nothing here fabricates a simulation:
 *
 *   • ONLY games whose joined artifact is genuinely `status === "ready"` are eligible. Stale,
 *     unavailable, error, or missing simulations are never featured.
 *   • Ordered by each game's STRONGEST generated-pick edge (max `edgePct` over `generatedPicks`),
 *     descending, tie-broken by `slug` ascending — so the same slate always yields the same order.
 *   • Capped at `FEATURED_CAP` (5). `readyCount` reports how many ready games existed in total so the
 *     lobby can honestly say "+N more ready below" (they remain in the full list).
 *
 * No React/Next imports so tsx can unit-test it directly and the server component can import it as-is.
 */

/** The minimal shape this selector needs from a game-detail's joined simulation view. */
export interface FeaturedSimView {
  status: "ready" | "stale" | "unavailable" | "error";
  teams: { home: string; away: string } | null;
  runCount: number | null;
  allowsRunCountClaim: boolean;
  generatedPicks: Array<{ edgePct?: number | null }>;
  simulationSummary: { headline?: string } | null;
}

/** The minimal game-detail shape the selector reads (a structural subset of the real detail). */
export interface FeaturedDetailInput {
  sport: string;
  slug: string;
  /** Real provider team-logo URLs (mlbstatic / api-sports) when the artifact carries them — never fabricated. */
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Venue for the fixture, when the detail carries one (surfaced on the featured card). */
  venue?: string | null;
  /** Slate date (YYYY-MM-DD) for the fixture, when present. */
  date?: string | null;
  gameLabSimulation?: FeaturedSimView | null;
}

/** One featured card, fully derived from a real ready artifact — nothing synthesized. */
export interface FeaturedSimulation {
  slug: string;
  /** `/games/mlb/<slug>` — links to the game page where "Generate Simulation" lives. */
  href: string;
  teams: { home: string; away: string };
  /**
   * Real provider team-logo URLs (mlbstatic / api-sports) threaded from the game detail. `null` when
   * the detail carries none — the card then falls back to a monogram via TeamMark, never a fake logo.
   */
  homeLogo: string | null;
  awayLogo: string | null;
  /** Venue for the fixture (null when the detail has none). */
  venue: string | null;
  /** Slate date (YYYY-MM-DD) for the fixture (null when the detail has none). */
  date: string | null;
  /** Max edge (percentage points) across the game's generated picks; the sort key. */
  topEdgePct: number;
  /** Real count of generated picks on the artifact. */
  pickCount: number;
  /** Honest run-count label: only a real "N-run" claim when the artifact allows it, else null. */
  runCountLabel: string | null;
  /** The artifact's own one-line headline, when present. */
  headline: string | null;
}

/** The hard cap on how many simulations the lobby features up top. */
export const FEATURED_CAP = 5;

/** Highest `edgePct` across a game's generated picks (0 when none carry a numeric edge). */
export function strongestEdgePct(sim: FeaturedSimView): number {
  let max = 0;
  let seen = false;
  for (const p of sim.generatedPicks) {
    const e = p?.edgePct;
    if (typeof e === "number" && Number.isFinite(e)) {
      if (!seen || e > max) max = e;
      seen = true;
    }
  }
  return seen ? max : 0;
}

/**
 * Honest run-count label for a card. Returns a real "N-run model simulation" ONLY when the artifact
 * both allows the claim AND carries a positive integer run count; otherwise the neutral fallback.
 */
export function runCountLabel(sim: Pick<FeaturedSimView, "allowsRunCountClaim" | "runCount">): string | null {
  if (sim.allowsRunCountClaim && sim.runCount != null && Number.isInteger(sim.runCount) && sim.runCount > 0) {
    return `${sim.runCount.toLocaleString()}-run model simulation`;
  }
  return null;
}

/** Result of the selector: the capped featured cards plus the TOTAL ready count for honest "+N more" copy. */
export interface FeaturedResult {
  featured: FeaturedSimulation[];
  /** Total number of ready simulations across all details (may exceed `featured.length`). */
  readyCount: number;
}

/**
 * Pick the deterministic featured simulations from the lobby's game details.
 *
 * @param details the game-detail objects (only MLB currently carries `gameLabSimulation`)
 */
export function featuredSimulations(details: readonly FeaturedDetailInput[]): FeaturedResult {
  const ready = details.filter(
    (d): d is FeaturedDetailInput & { gameLabSimulation: FeaturedSimView } =>
      d.gameLabSimulation != null &&
      d.gameLabSimulation.status === "ready" &&
      d.gameLabSimulation.teams != null,
  );

  const cards: FeaturedSimulation[] = ready.map((d) => {
    const sim = d.gameLabSimulation;
    return {
      slug: d.slug,
      href: `/games/${d.sport}/${d.slug}`,
      teams: sim.teams as { home: string; away: string },
      // Threaded straight from the detail — a real provider URL or null (monogram fallback), never fabricated.
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      venue: d.venue ?? null,
      date: d.date ?? null,
      topEdgePct: strongestEdgePct(sim),
      pickCount: sim.generatedPicks.length,
      runCountLabel: runCountLabel(sim),
      headline: sim.simulationSummary?.headline ?? null,
    };
  });

  // Strongest edge first; deterministic slug tie-break so the order is stable per slate.
  cards.sort((a, b) => (b.topEdgePct - a.topEdgePct) || a.slug.localeCompare(b.slug));

  return { featured: cards.slice(0, FEATURED_CAP), readyCount: cards.length };
}
