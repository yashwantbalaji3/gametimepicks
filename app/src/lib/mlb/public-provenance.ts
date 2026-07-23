/**
 * MLB PUBLIC PROVENANCE + transparency view-model (Phases 3/4/6). Pure + deterministic. Turns a public sim game
 * artifact (+ the game's commenceTime from team-markets) into honest, user-readable provenance: when the market line
 * was captured, how long before first pitch, when the simulation was generated, a completeness status, and a
 * market-vs-simulation explanation. It NEVER fabricates a value: a missing timestamp is null → "Capture time
 * unavailable"; a post-first-pitch capture is never labelled pregame; simulation spread is never called model
 * confidence. No "edge/value/lock/best bet/profitable/market mistake" language. No modeling.
 */

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

/** Format an ISO instant as ET time-of-day (handles DST via the IANA zone). Null-safe. */
export function formatEtTime(iso: string | null | undefined): string | null {
  const t = ms(iso);
  if (!Number.isFinite(t)) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(t)) + " ET";
  } catch {
    return null;
  }
}

/** Human duration like "1h 44m" / "12m" / "0m". */
export function humanDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

export interface SimGameLike {
  status?: string | null;
  marketSnapshot?: { capturedAt?: string | null; bookmaker?: string | null } | null;
  freshness?: { sourceCapturedAt?: string | null; generatedAt?: string | null } | null;
  unavailableModules?: unknown[] | null;
}

export interface ProvenanceTimestamps {
  generatedAt: string | null;
  generatedLabel: string | null;
  marketCapturedAt: string | null;
  firstPitch: string | null;
  minutesBeforeFirstPitch: number | null;
  capturedPregame: boolean | null; // null when it can't be determined
  captureLabel: string; // always a safe, user-facing string
}

/** Build the timestamp block. commenceTime is the game's first pitch (from team-markets[gameId].commenceTime). */
export function buildTimestamps(game: SimGameLike, commenceTime: string | null | undefined): ProvenanceTimestamps {
  const capturedAt = game.marketSnapshot?.capturedAt ?? game.freshness?.sourceCapturedAt ?? null;
  const generatedAt = game.freshness?.generatedAt ?? null;
  const firstPitch = commenceTime ?? null;
  const cap = ms(capturedAt), fp = ms(firstPitch);
  let minutesBeforeFirstPitch: number | null = null;
  let capturedPregame: boolean | null = null;
  let captureLabel: string;
  if (!Number.isFinite(cap)) {
    captureLabel = "Capture time unavailable";
  } else if (!Number.isFinite(fp)) {
    captureLabel = `Market captured ${formatEtTime(capturedAt)}`; // no first pitch to compare against
  } else if (cap >= fp) {
    capturedPregame = false;
    captureLabel = "Market captured AFTER first pitch — not a pregame price"; // NEVER call this pregame
  } else {
    capturedPregame = true;
    minutesBeforeFirstPitch = Math.round((fp - cap) / 60000);
    captureLabel = `Market captured ${humanDuration(minutesBeforeFirstPitch)} before first pitch`;
  }
  return { generatedAt, generatedLabel: generatedAt ? `Simulation generated at ${formatEtTime(generatedAt)}` : null, marketCapturedAt: capturedAt, firstPitch, minutesBeforeFirstPitch, capturedPregame, captureLabel };
}

/** A minimal histogram bin — structurally a subset of SimDistributionBin (label + probability mass). */
export interface BandBin { label: string; probability?: number | null; count?: number | null }
export interface DistributionBand { p10: string; median: string; p90: string; sampleCount: number | null }

/**
 * Derive a numeric band (p10 / median / p90 outcome labels) from a real histogram's mass. Pure: reads the bins'
 * `probability` (falling back to `count`), walks the CDF, and returns the bin LABEL each quantile lands in. Returns
 * null when the bins carry no usable mass — never fabricates a spread. This is the SIMULATION's own dispersion,
 * NOT a validated predictive interval and NOT model-vs-market confidence.
 */
export function distributionBand(bins: BandBin[] | null | undefined, sampleCount?: number | null): DistributionBand | null {
  if (!Array.isArray(bins) || bins.length === 0) return null;
  const mass = bins.map((b) => (Number.isFinite(b.probability as number) ? (b.probability as number) : Number.isFinite(b.count as number) ? (b.count as number) : 0));
  const total = mass.reduce((s, m) => s + (m > 0 ? m : 0), 0);
  if (!(total > 0)) return null;
  const at = (q: number): string => {
    const target = q * total;
    let cum = 0;
    for (let i = 0; i < bins.length; i++) {
      cum += mass[i] > 0 ? mass[i] : 0;
      if (cum >= target) return bins[i].label;
    }
    return bins[bins.length - 1].label;
  };
  return { p10: at(0.1), median: at(0.5), p90: at(0.9), sampleCount: Number.isFinite(sampleCount as number) ? (sampleCount as number) : null };
}

export type CompletenessStatus =
  | "FULLY_SUPPORTED" | "LINEUP_PENDING" | "MARKET_PENDING" | "PARTIAL_FEATURES" | "STALE_INPUTS" | "GAME_STARTED" | "UNAVAILABLE";

const PREGAME_STATUSES = new Set(["ready", "scheduled", "pregame", "upcoming", "preview"]);

export interface PickLike { market?: string | null; marketProbability?: number | null; player?: string | null }

/**
 * Honest completeness status for a projection — artifact-backed only. Batter props are LINEUP_PENDING because MLB
 * boards carry no confirmed batter lineup (only a probable pitcher). Never implies "confirmed".
 */
export function completenessStatus(game: SimGameLike, pick: PickLike, ts: ProvenanceTimestamps, opts: { staleMinutes?: number } = {}): CompletenessStatus {
  const status = game.status ?? null;
  if (status != null && !PREGAME_STATUSES.has(status)) return "GAME_STARTED";
  if (ts.capturedPregame === false) return "GAME_STARTED"; // market captured post-first-pitch
  if (pick.marketProbability == null || !Number.isFinite(pick.marketProbability)) return "MARKET_PENDING";
  if (Array.isArray(game.unavailableModules) && game.unavailableModules.length > 0) return "PARTIAL_FEATURES";
  // a batter prop has no confirmed lineup source in the MLB artifacts → pending, never "confirmed"
  const isBatter = typeof pick.market === "string" && pick.market.startsWith("batter_");
  if (isBatter) return "LINEUP_PENDING";
  const stale = opts.staleMinutes ?? 24 * 60;
  if (ts.minutesBeforeFirstPitch != null && ts.minutesBeforeFirstPitch > stale) return "STALE_INPUTS";
  return "FULLY_SUPPORTED";
}

export const COMPLETENESS_LABEL: Record<CompletenessStatus, string> = {
  FULLY_SUPPORTED: "Fully supported",
  LINEUP_PENDING: "Lineup pending",
  MARKET_PENDING: "Market pending",
  PARTIAL_FEATURES: "Partial inputs",
  STALE_INPUTS: "Stale inputs",
  GAME_STARTED: "Game started",
  UNAVAILABLE: "Unavailable",
};

export interface CompletenessMeta {
  label: string;
  /** User-facing tooltip — artifact-backed, never implies certainty the source can't support. */
  tooltip: string;
  /** May the deterministic simulation still be shown? True for MLB (the sim is a model read, not a confirmed-lineup
   *  claim); a started game shows it as a FROZEN pregame read. False only when the game is truly UNAVAILABLE. */
  canShowSimulation: boolean;
  /** Should public sharing be enabled? Off for pending/started/frozen states — never share an incomplete read as final. */
  canShare: boolean;
  tone: "ok" | "pending" | "muted";
}

/** The single source of truth for how each completeness status is presented + what it permits. */
export const COMPLETENESS_META: Record<CompletenessStatus, CompletenessMeta> = {
  FULLY_SUPPORTED: { label: "Fully supported", tooltip: "Market, matchup and pitcher inputs are available for this game.", canShowSimulation: true, canShare: true, tone: "ok" },
  LINEUP_PENDING: { label: "Lineup pending", tooltip: "Batter lineups aren't posted yet — batter projections are provisional, not final.", canShowSimulation: true, canShare: false, tone: "pending" },
  MARKET_PENDING: { label: "Market pending", tooltip: "A captured market line isn't available yet for this projection.", canShowSimulation: true, canShare: false, tone: "pending" },
  PARTIAL_FEATURES: { label: "Partial inputs", tooltip: "Some supporting inputs are unavailable for this game.", canShowSimulation: true, canShare: false, tone: "pending" },
  STALE_INPUTS: { label: "Stale inputs", tooltip: "The compared inputs were captured long before first pitch and may be stale.", canShowSimulation: true, canShare: false, tone: "muted" },
  GAME_STARTED: { label: "Game started", tooltip: "This pregame report is frozen — the game has started.", canShowSimulation: true, canShare: false, tone: "muted" },
  UNAVAILABLE: { label: "Unavailable", tooltip: "This game's data could not be reconciled or is unavailable.", canShowSimulation: false, canShare: false, tone: "muted" },
};

// Most-limiting first: the game-level floor takes the worst status across the game's projections.
const COMPLETENESS_SEVERITY: Record<CompletenessStatus, number> = {
  FULLY_SUPPORTED: 0, LINEUP_PENDING: 1, PARTIAL_FEATURES: 2, STALE_INPUTS: 3, MARKET_PENDING: 4, UNAVAILABLE: 5, GAME_STARTED: 6,
};

/** Game-level completeness = the HONEST FLOOR: the most-limiting status across the game's projections. A game with
 *  both fully-supported pitcher props and lineup-pending batter props reads LINEUP_PENDING (never overstates). */
export function gameCompleteness(game: SimGameLike, picks: PickLike[], ts: ProvenanceTimestamps, opts: { staleMinutes?: number } = {}): CompletenessStatus {
  if (!Array.isArray(picks) || picks.length === 0) return "UNAVAILABLE";
  let worst: CompletenessStatus = "FULLY_SUPPORTED";
  for (const p of picks) {
    const s = completenessStatus(game, p, ts, opts);
    if (COMPLETENESS_SEVERITY[s] > COMPLETENESS_SEVERITY[worst]) worst = s;
  }
  return worst;
}

export interface ExplanationView {
  simulationProbability: number | null;
  marketProbability: number | null;
  differencePts: number | null; // neutral magnitude in points; NEVER "edge"
  generatedAt: string | null;
  marketCapturedAt: string | null;
  strongestAvailableFactors: string[];
  opposingFactors: string[];
  missingFactors: string[];
  completenessStatus: CompletenessStatus;
  limitationText: string;
}

/** Market-vs-simulation explanation, built ONLY from factors actually present on the pick (reasonBullets). */
export function buildExplanation(pick: PickLike & { modelProbability?: number | null; reasonBullets?: string[] | null }, ts: ProvenanceTimestamps, status: CompletenessStatus): ExplanationView {
  const sim = Number.isFinite(pick.modelProbability as number) ? Math.round(1000 * (pick.modelProbability as number)) / 10 : null;
  const mkt = Number.isFinite(pick.marketProbability as number) ? Math.round(1000 * (pick.marketProbability as number)) / 10 : null;
  const diff = sim != null && mkt != null ? Math.round(10 * Math.abs(sim - mkt)) / 10 : null;
  const bullets = Array.isArray(pick.reasonBullets) ? pick.reasonBullets.filter((b) => typeof b === "string" && b.trim()) : [];
  const missing: string[] = [];
  if (status === "MARKET_PENDING") missing.push("a captured market line");
  if (status === "LINEUP_PENDING") missing.push("a confirmed lineup");
  if (status === "PARTIAL_FEATURES") missing.push("some pregame feature families");
  const limitationText =
    "The simulation is a deterministic 10,000-run model read compared to the market line — a difference, not a claim the simulation is more accurate. Modeled MLB markets are not market-proven (public beta).";
  return {
    simulationProbability: sim, marketProbability: mkt, differencePts: diff,
    generatedAt: ts.generatedAt, marketCapturedAt: ts.marketCapturedAt,
    strongestAvailableFactors: bullets.slice(0, 3),
    opposingFactors: [], // only populated when the artifact carries signed factor directions (it does not today)
    missingFactors: missing,
    completenessStatus: status, limitationText,
  };
}
