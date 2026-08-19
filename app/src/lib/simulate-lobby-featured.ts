/**
 * FEATURED SIMULATIONS selector — a PURE, framework-free picker for the simulate-first lobby.
 *
 * Given the game-detail objects the lobby already builds (`buildAllGameDetails()`), return the
 * deterministic short list of games to feature ABOVE the full games list. Rules (honest — nothing here
 * fabricates a simulation):
 *
 *   • Featurable = an MLB game with a genuine `gameLabSimulation.status === "ready"` run simulation, OR a World
 *     Cup game that has a real market-implied report (`wcGameCenter`/`gameLabWc` present). WC cards are
 *     labelled `mode: "market-implied"` and NEVER carry a run-count claim.
 *   • RECENCY FIRST (the July-14 fix): when `today` is supplied, current/upcoming games (date >= today)
 *     are featured and stale games are DROPPED — a July-11 slate is never featured as "today's games"
 *     once the ET clock has passed it. Only when there is NO current/upcoming game do we fall back to the
 *     most-recent slate (so the row isn't empty), and `allCurrent` reports which case it is.
 *   • Ordering: current/upcoming by soonest date, then simulation coverage; the stale fallback by coverage.
 *     (Sprint 035 removed model-vs-market difference from ordering — it is inverted on settled results.)
 *   • Capped at `FEATURED_CAP` (5). `readyCount` is the total featurable count for honest "+N more" copy.
 *   • `simulationsToday` is a DIFFERENT number and exists because the two were conflated. readyCount
 *     is a POOL SIZE — it spans current AND upcoming, and it counts market-implied World Cup cards
 *     beside genuine run-count simulations, both of which are correct for "+N more below". The
 *     homepage reused it for the sentence "N games simulation-ready TODAY", where it was wrong twice
 *     over: on 2026-08-18 it read 30, which was 15 MLB games today plus 15 NFL games on the 22nd
 *     that were every one of them BASELINE ONLY. A pool size is not an availability claim.
 *
 * No React/Next imports so tsx can unit-test it directly and the server component can import it as-is.
 */

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
  homeLogo?: string | null;
  awayLogo?: string | null;
  venue?: string | null;
  /** Slate date (YYYY-MM-DD) for the fixture, when present. */
  date?: string | null;
  /** Team names on the detail — used for World Cup / market-implied cards (no sim view needed). */
  homeTeam?: string | null;
  awayTeam?: string | null;
  /** Presence of a real World Cup market-implied report. */
  wcGameCenter?: unknown | null;
  gameLabWc?: unknown | null;
  /** MLB run-simulation view. */
  gameLabSimulation?: FeaturedSimView | null;
}

export interface FeaturedSimulation {
  slug: string;
  href: string;
  /** Sport key (mlb / world_cup …) — drives the card's logos + sport label + mode badge. */
  sport: string;
  teams: { home: string; away: string };
  /**
   * CDN-resolvable team identifiers (the detail's abbreviations, e.g. "CHC"/"WSH"). Display uses
   * `teams`; the ESPN logo CDN needs THESE — a full name normalizes to a slug that 404s and the
   * monogram fallback hides the breakage (the /-renders-clean assurance caught exactly that).
   */
  teamAbbrs: { home: string; away: string } | null;
  homeLogo: string | null;
  awayLogo: string | null;
  venue: string | null;
  date: string | null;
  topEdgePct: number;
  pickCount: number;
  runCountLabel: string | null;
  headline: string | null;
  /** How the card should read: an MLB run-simulation, or a WC market-implied report. */
  mode: "simulation" | "market-implied";
}

export const FEATURED_CAP = 5;

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

export function runCountLabel(sim: Pick<FeaturedSimView, "allowsRunCountClaim" | "runCount">): string | null {
  if (sim.allowsRunCountClaim && sim.runCount != null && Number.isInteger(sim.runCount) && sim.runCount > 0) {
    return `${sim.runCount.toLocaleString()}-run model simulation`;
  }
  return null;
}

export interface FeaturedResult {
  featured: FeaturedSimulation[];
  /** Total number of featurable games across all details (may exceed `featured.length`). */
  readyCount: number;
  /**
   * Genuine run-count simulations dated EXACTLY today. This is the only number that may back a
   * sentence containing the word "today". Zero is a real answer and must render as one.
   */
  simulationsToday: number;
  /** True when every featured card is current/upcoming (date >= today); false on a stale fallback. */
  allCurrent: boolean;
}

/**
 * Pick the deterministic featured simulations from the lobby's game details.
 * @param today real ET date (YYYY-MM-DD). When supplied, stale slates are dropped once a current/upcoming
 *   game exists — this is what stops a July-11 slate from being featured on July-14.
 */
export function featuredSimulations(details: readonly FeaturedDetailInput[], today?: string): FeaturedResult {
  const cards: FeaturedSimulation[] = [];

  for (const d of details) {
    const sim = d.gameLabSimulation;
    // MLB (or any) genuine ready simulation.
    if (sim && sim.status === "ready" && sim.teams != null) {
      cards.push({
        slug: d.slug,
        href: `/games/${d.sport}/${d.slug}`,
        sport: d.sport,
        teams: sim.teams,
        teamAbbrs: d.homeTeam && d.awayTeam ? { home: d.homeTeam, away: d.awayTeam } : null,
        homeLogo: d.homeLogo ?? null,
        awayLogo: d.awayLogo ?? null,
        venue: d.venue ?? null,
        date: d.date ?? null,
        topEdgePct: strongestEdgePct(sim),
        pickCount: sim.generatedPicks.length,
        runCountLabel: runCountLabel(sim),
        headline: sim.simulationSummary?.headline ?? null,
        mode: "simulation",
      });
      continue;
    }
    // World Cup market-implied report (real fixtures + odds; never a run-count claim).
    if (d.sport === "world_cup" && (d.wcGameCenter != null || d.gameLabWc != null) && d.homeTeam && d.awayTeam) {
      cards.push({
        slug: d.slug,
        href: `/games/${d.sport}/${d.slug}`,
        sport: d.sport,
        teams: { home: d.homeTeam, away: d.awayTeam },
        teamAbbrs: null, // World Cup cards render FlagBadge from country codes, never the ESPN team CDN
        homeLogo: d.homeLogo ?? null,
        awayLogo: d.awayLogo ?? null,
        venue: d.venue ?? null,
        date: d.date ?? null,
        topEdgePct: 0,
        pickCount: 0,
        runCountLabel: null, // market-implied — never a run count
        headline: null,
        mode: "market-implied",
      });
    }
  }

  // Recency: prefer current/upcoming (date >= today). Drop stale ones when any current exists. When no
  // `today` is supplied, skip recency entirely (edge-sorted, back-compatible).
  const current = today ? cards.filter((c) => c.date != null && c.date >= today) : [];
  const pool = current.length > 0 ? current : cards;
  const allCurrent = current.length > 0;

  pool.sort((a, b) => {
    if (allCurrent) {
      // soonest kickoff first, then simulation coverage, then slug
      const da = (a.date ?? "9999-99-99").localeCompare(b.date ?? "9999-99-99");
      if (da !== 0) return da;
    }
    // Sprint 035: was `topEdgePct` — the model-vs-market difference, which is INVERTED on settled
    // results (20+pp rows hit .4317 vs .5203 under 2.5pp). Featuring by it surfaced the weakest
    // simulations first. Ordering now uses how many markets the simulation actually covered, which is
    // a property of the artifact rather than a claim about it — the same basis daily-brief.ts uses.
    return (b.pickCount - a.pickCount) || a.slug.localeCompare(b.slug);
  });

  const simulationsToday = today
    ? cards.filter((c) => c.mode === "simulation" && c.date === today).length
    : 0;

  return { featured: pool.slice(0, FEATURED_CAP), readyCount: pool.length, simulationsToday, allCurrent };
}
