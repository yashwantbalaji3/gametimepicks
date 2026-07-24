/**
 * DAILY MLB INTELLIGENCE BRIEF — the pure selector behind the /today executive digest that answers
 * "what should I know about MLB today?" WITHOUT any prediction, ranking-by-difference, or confidence claim.
 *
 * It reuses the ONE availability contract (`slateGames`) for the slate overview, then adds a FACTUAL
 * intelligence layer computed only from the real simulation artifact:
 *   • marketsSimulated — how many player-prop markets the game's simulation covers (the count of real
 *     `distributions`). This is "richest available analysis" — an information-quality signal, never a pick.
 *   • widestRange — the single market with the largest simulated p10–p90 outcome spread (from the real
 *     histogram bins). This is "largest uncertainty / largest simulation range" — the simulation's own
 *     spread, never a predicted winner.
 *
 * Games are ordered by information quality (most markets simulated, then widest range) — a deterministic
 * DISPLAY sort, explicitly NOT a performance claim. Nothing here reads model-difference/modelProbability/marketProbability
 * or fabricates a distribution: a game without a real distributions block simply contributes no signal.
 *
 * No React/Next imports so tsx can unit-test it directly; the input is a structural SUBSET of the real
 * PublicGameDetail, so the hub passes `buildAllGameDetails()` rows as-is.
 */
import { slateGames, type SlateGameDetailInput } from "./slate-games";
import { deriveStartState } from "./availability";

/** One histogram bin (a structural subset of the real SimDistributionBin). */
interface BriefBin {
  lowerEdge?: number | null;
  probability?: number | null;
}
/** One named market distribution (a structural subset of the real SimDistribution). */
interface BriefDistribution {
  label?: string | null;
  bins?: BriefBin[] | null;
}

/** The per-game shape the brief reads — availability input plus the sim's factual signals. */
export interface BriefDetailInput extends SlateGameDetailInput {
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Market-implied Game Center — carries the scheduled first pitch used for honest start-state. */
  gameCenter?: { firstPitch?: string | null } | null;
  gameLabSimulation?:
    | {
        status: "ready" | "unavailable" | "stale" | "error";
        generatedAt?: string | null;
        distributions?: Record<string, BriefDistribution> | null;
      }
    | null;
}

export interface BriefSpotlightGame {
  slug: string;
  href: string;
  teams: { home: string; away: string };
  homeLogo: string | null;
  awayLogo: string | null;
  /** Count of real simulated markets — richest-analysis signal (factual, not a pick). */
  marketsSimulated: number;
  /** Human label of the market with the widest simulated p10–p90 spread, or null. */
  widestRangeMarket: string | null;
  /** The widest simulated p10–p90 outcome band, as [p10, p90], or null when no real distribution. */
  widestRange: [number, number] | null;
  /** Neutral, factual one-liner — never a prediction. */
  note: string;
  /** True when the scheduled first pitch has passed (a real clock proved it) — the sim is a preserved pregame read. */
  started: boolean;
  /** Start-aware action: "Review simulation →" once a game is underway, else "Open simulation →". */
  actionLabel: string;
}

export interface DailyBriefOverview {
  games: number;
  simulationsReady: number;
  awaitingInputs: number;
}

export interface DailyBrief {
  slateDate: string;
  /** Max simulation `generatedAt` across today's ready sims (ISO), or null. */
  lastUpdatedIso: string | null;
  overview: DailyBriefOverview;
  /** How many spotlight/attention games are already underway (a real clock proved it) — for the honest
   *  "these are the preserved pregame reads, not live predictions" note during games. */
  gamesInProgress: number;
  /** The single most information-rich game to explore first, or null on a no-sim day. */
  spotlight: BriefSpotlightGame | null;
  /** The next most information-rich games (deterministic display order), excluding the spotlight. */
  attention: BriefSpotlightGame[];
}

/** Outcome value (a bin's lowerEdge) at cumulative probability `q`. Pure; null on empty/invalid mass. */
export function numericPercentile(bins: readonly BriefBin[], q: number): number | null {
  const valid = bins.filter((b) => typeof b?.probability === "number" && Number.isFinite(b.probability) && typeof b?.lowerEdge === "number" && Number.isFinite(b.lowerEdge));
  const total = valid.reduce((s, b) => s + (b.probability as number), 0);
  if (total <= 0) return null;
  let cum = 0;
  for (const b of valid) {
    cum += (b.probability as number) / total;
    if (cum >= q) return b.lowerEdge as number;
  }
  return valid.length ? (valid[valid.length - 1].lowerEdge as number) : null;
}

/** Factual signals from a game's real distributions block: market count + widest p10–p90 spread. */
export function gameSignals(
  dist: Record<string, BriefDistribution> | null | undefined,
): { marketsSimulated: number; widestRange: [number, number] | null; widestRangeMarket: string | null } | null {
  if (!dist || typeof dist !== "object") return null;
  const entries = Object.entries(dist);
  if (entries.length === 0) return null;
  let widest: { spread: number; band: [number, number]; market: string } | null = null;
  for (const [key, d] of entries) {
    const bins = d?.bins;
    if (!Array.isArray(bins) || bins.length === 0) continue;
    const p10 = numericPercentile(bins, 0.1);
    const p90 = numericPercentile(bins, 0.9);
    if (p10 == null || p90 == null) continue;
    const spread = p90 - p10;
    if (widest == null || spread > widest.spread) {
      widest = { spread, band: [p10, p90], market: (typeof d.label === "string" && d.label) || key };
    }
  }
  return {
    marketsSimulated: entries.length,
    widestRange: widest ? widest.band : null,
    widestRangeMarket: widest ? widest.market : null,
  };
}

/**
 * Build the daily MLB intelligence brief for the presented slate.
 * @param today the presented slate date (YYYY-MM-DD). Only that day's games contribute.
 * @param opts.nowMs real clock threaded into the availability overview (honest start-state).
 * @param opts.spotlightCount how many attention games to surface after the spotlight (default 3).
 */
export function buildDailyBrief(
  details: readonly BriefDetailInput[],
  today: string,
  opts?: { nowMs?: number; spotlightCount?: number },
): DailyBrief {
  const slate = slateGames(details, today, { nowMs: opts?.nowMs });
  const overview: DailyBriefOverview = {
    games: slate.total,
    simulationsReady: slate.summary.counts.simulation,
    awaitingInputs: slate.total - slate.summary.counts.simulation,
  };

  // Rank the ready-sim games by information quality (markets simulated, then widest range) — a display sort.
  const ranked = details
    .filter((d) => d.date === today && d.gameLabSimulation?.status === "ready" && !!d.homeTeam && !!d.awayTeam && !!d.slug)
    .map((d) => ({ d, sig: gameSignals(d.gameLabSimulation?.distributions) }))
    .filter((x): x is { d: BriefDetailInput; sig: NonNullable<ReturnType<typeof gameSignals>> } => x.sig != null)
    .sort(
      (a, b) =>
        b.sig.marketsSimulated - a.sig.marketsSimulated ||
        (b.sig.widestRange ? b.sig.widestRange[1] - b.sig.widestRange[0] : 0) - (a.sig.widestRange ? a.sig.widestRange[1] - a.sig.widestRange[0] : 0) ||
        (a.d.slug as string).localeCompare(b.d.slug as string),
    );

  const toBriefGame = ({ d, sig }: { d: BriefDetailInput; sig: NonNullable<ReturnType<typeof gameSignals>> }): BriefSpotlightGame => {
    // A real clock + first pitch decides whether the game is underway; the simulation is a PRESERVED pregame
    // read either way, so the action reframes to "Review" (never implying a live prediction).
    const started = deriveStartState(typeof d.gameCenter?.firstPitch === "string" ? d.gameCenter.firstPitch : null, opts?.nowMs) === "started";
    return {
      slug: d.slug as string,
      href: `/games/${d.sport}/${d.slug}`,
      teams: { home: d.homeTeam as string, away: d.awayTeam as string },
      homeLogo: d.homeLogo ?? null,
      awayLogo: d.awayLogo ?? null,
      marketsSimulated: sig.marketsSimulated,
      widestRangeMarket: sig.widestRangeMarket,
      widestRange: sig.widestRange,
      note: `${sig.marketsSimulated} player-prop market${sig.marketsSimulated === 1 ? "" : "s"} simulated`,
      started,
      actionLabel: started ? "Review simulation →" : "Open simulation →",
    };
  };

  // Last updated = the freshest sim generatedAt across today's ready sims.
  let lastUpdatedIso: string | null = null;
  for (const d of details) {
    if (d.date !== today) continue;
    const g = d.gameLabSimulation;
    if (g?.status === "ready" && typeof g.generatedAt === "string" && g.generatedAt) {
      if (lastUpdatedIso == null || g.generatedAt > lastUpdatedIso) lastUpdatedIso = g.generatedAt;
    }
  }

  const count = opts?.spotlightCount ?? 3;
  const spotlight = ranked[0] ? toBriefGame(ranked[0]) : null;
  const attention = ranked.slice(1, 1 + count).map(toBriefGame);
  const gamesInProgress = [spotlight, ...attention].filter((g) => g?.started).length;
  return {
    slateDate: today,
    lastUpdatedIso,
    overview,
    gamesInProgress,
    spotlight,
    attention,
  };
}
