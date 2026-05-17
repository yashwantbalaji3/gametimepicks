/**
 * Shared types — the contract between the Python pipeline and the Next.js app.
 *
 * The pipeline writes JSON files into app/public/data/ matching these shapes.
 * The frontend imports these types and reads the JSON via lib/data.ts.
 *
 * If you change a type here, also update:
 *   - pipeline/generate_daily_board.py (writes board.json)
 *   - pipeline/build_features.py (writes trends.json)
 *   - pipeline/settle_results.py  (writes hit_rates.json)
 */

// ---------------------------------------------------------------------------
// Model Board
// ---------------------------------------------------------------------------

export type Market = "PTS" | "REB" | "AST";

/**
 * ConfidenceTier — the model's confidence in its own projection.
 *
 * Phase 7B-3.1 adds two states the pipeline already emitted but the
 * frontend hadn't typed:
 *   - "insufficient_data" — player game logs unavailable; no projection
 *   - "no_play" — explicit pass (e.g. risk override or below edge bar)
 *
 * UI must handle these without crashing, even though they're not the
 * traditional High/Medium/Low scoring buckets.
 */
export type ConfidenceTier =
  | "High"
  | "Medium"
  | "Low"
  | "insufficient_data"
  | "no_play";

/**
 * LeanType — direction the model leans, or "Pass" when it explicitly
 * declines to recommend a side. Phase 7B-3.1 adds "Pass" alongside the
 * existing "No Play" since the pipeline emits both labels.
 */
export type LeanType = "Over" | "Under" | "No Play" | "Pass";

export type ResultStatus = "Pending" | "Won" | "Lost" | "Push" | "Void";

export interface PropLean {
  /** Stable composite id: `{date}-{playerId}-{market}` */
  id: string;
  /** ISO date string (YYYY-MM-DD) for the game date */
  date: string;
  /** Game tipoff in ET, displayed as "7:30 PM ET" */
  tipoff: string;

  // Player + matchup
  playerId: number;
  playerName: string;
  team: string;
  teamFullName: string;
  opponent: string;
  opponentFullName: string;
  homeAway: "Home" | "Away";

  // Market
  market: Market;
  /** Sportsbook line, e.g. 24.5 */
  line: number;
  /** American odds, e.g. -110 */
  oddsOver: number;
  oddsUnder: number;
  /** Sportsbook source label */
  bookmaker: string;

  // Model output
  // Phase 7B-3.1: any of these may be null when a player's game logs are
  // unavailable (real props from Odds API + nba_api unreachable for stats).
  // The pipeline already emitted nulls for that case; the frontend now
  // matches the contract.
  /** Model's projected stat value, or null if no projection could be made */
  projection: number | null;
  /** Model probability the prop hits, or null if no model output */
  modelProbability: number | null;
  /** Probability implied by sportsbook odds — always computable from odds */
  impliedProbability: number;
  /** Model probability minus implied (percentage points), or null if no model */
  edgePct: number | null;

  // Recommendation
  lean: LeanType;
  confidence: ConfidenceTier;
  /** One-sentence explanation rendered on the card */
  reason: string;

  // Tracking
  status: ResultStatus;
  /** Final stat value once the game is settled */
  actualValue?: number;

  // Phase 7B-1 additions
  /** Optional gameId — wires settlement to box scores when present */
  gameId?: string;
  /** News signals matched to this lean (manual overrides) */
  newsSignals?: NewsSignal[];
  /** Aggregate model action from news signals */
  newsAction?: "none" | "flag_risk" | "reduce_minutes" | "increase_usage" | "remove_from_board" | "manual_review_required";
  /** Risk flags surfaced on the card, e.g. ["b2b_away", "thin_sample"] */
  riskFlags?: string[];
  /**
   * Derived honest context tag from existing guardrail fields. One of:
   *   "clean"               — High/Medium confidence, no anomaly flags
   *   "sample-watch"        — confidence ≤ Medium with recent10 length 5-7
   *   "model-anomaly"       — riskFlags contains "suspicious_edge"
   *   "recent-form-backed"  — confidence == High with recent10 length ≥ 8
   *   "volatile-market"     — sport-specific high-variance market (HR/sixes/goals)
   * Optional — older boards may omit this field. UI must degrade gracefully.
   */
  contextTag?:
    | "clean"
    | "sample-watch"
    | "model-anomaly"
    | "recent-form-backed"
    | "volatile-market";
  /** Composite source-reliability score 0..1 */
  sourceReliability?: number;
  /** Phase 7B-1.1: tag demo cards explicitly so UI can wash them */
  isDemo?: boolean;
  /**
   * Phase 8 — last-10 stat values for this player+market, in chronological
   * order (oldest → newest). Optional. When present, the sparkline renders;
   * when absent, the row shows "trend unavailable" gracefully.
   *
   * To populate: extend pipeline/generate_daily_board.py to include the
   * last-10 stat values from the existing fetch_player_game_logs() call
   * directly on each lean. Frontend already supports the field — no UI
   * change needed once the pipeline emits it.
   */
  recent10?: number[];
}

export interface BoardData {
  /** Date the board is for (YYYY-MM-DD, ET) */
  generatedFor: string;
  /** Timestamp the pipeline ran (ISO 8601) */
  generatedAt: string;
  /** Source labels for transparency, e.g. "nba_api", "the-odds-api" */
  dataSources: string[];
  /** Whether this is demo data or live data */
  isDemo: boolean;
  /** All leans + no-plays for the day */
  leans: PropLean[];

  // Phase 7B-1 additions
  /** Whether real (non-demo) schedule data was available for this date */
  scheduleAvailable?: boolean;
  /** Whether real (non-demo) props were available for this date */
  propsAvailable?: boolean;
  /** Source label for schedule, e.g. "nba_api" or "demo" */
  scheduleSource?: string;
  /** Source label for odds, or null if unavailable */
  oddsSource?: string | null;
  /** Scheduled games for this date — useful when leans is empty */
  games?: ScheduleGame[];
  /** Phase 7B-1.1: explicit state for UI rendering */
  dataMode?: DataMode;
  /** Optional explanation when nba_api fell through to demo */
  failureReason?: string | null;

  // Phase 7B-1.2 diagnostic fields
  requestedDate?: string;
  timezone?: string;
  scheduleProviderStatus?: "ok" | "failed" | "empty" | null;
  scheduleFetchAttempted?: boolean;
  scheduleFetchSucceeded?: boolean;
  scheduleFailureReason?: string | null;
  rawGameCountBeforeFiltering?: number;
  parsedGameCountAfterFiltering?: number;
  manualOverrideUsed?: boolean;
  manualOverrideSource?: string | null;
  endpointHistory?: Array<{
    endpoint: string;
    status: "ok" | "error";
    raw_count: number;
    error?: string | null;
  }>;

  // Phase 7B-2 odds diagnostic fields
  /** Sub-state for the odds provider — drives PropsUnavailable copy */
  oddsProviderStatus?:
    | "not_configured"
    | "ok_with_props"
    | "ok_no_props"
    | "failed"
    | "demo"
    | "dry_run"
    | null;
  oddsFetchAttempted?: boolean;
  oddsFetchSucceeded?: boolean;
  oddsFailureReason?: string | null;
  rawOddsEventCount?: number;
  matchedOddsEventCount?: number;
  attemptedOddsEventCount?: number;
  parsedPropCount?: number;
  oddsCacheStatus?: "fresh" | "stale" | "miss" | null;
  oddsCachedAt?: string | null;
  oddsQuotaRemaining?: number | null;
  oddsQuotaUsed?: number | null;
  oddsLastCallCost?: number | null;
  oddsCostEstimatePerRun?: number;
  oddsBookmakers?: string[];
  oddsMarketsRequested?: string[];
  oddsRegions?: string;
}

// ---------------------------------------------------------------------------
// Player Trends
// ---------------------------------------------------------------------------

export interface PlayerGameLog {
  date: string;
  opponent: string;
  homeAway: "Home" | "Away";
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
}

export interface PlayerTrend {
  playerId: number;
  playerName: string;
  team: string;
  position: string;

  // Recent rolling averages
  last5: { pts: number; reb: number; ast: number; minutes: number };
  last10: { pts: number; reb: number; ast: number; minutes: number };
  season: { pts: number; reb: number; ast: number; minutes: number };

  // Splits
  homeAvg: { pts: number; reb: number; ast: number };
  awayAvg: { pts: number; reb: number; ast: number };

  // Recent game logs (most recent first, up to 10)
  recentGames: PlayerGameLog[];

  /** Optional status — Active / Questionable / Out / Day-to-Day */
  status?: string;
}

export interface TrendsData {
  generatedAt: string;
  isDemo: boolean;
  players: PlayerTrend[];
}

// ---------------------------------------------------------------------------
// Hit Rates / Results
// ---------------------------------------------------------------------------

export interface HitRateBreakdown {
  label: string;
  total: number;
  won: number;
  lost: number;
  push: number;
  hitRate: number; // 0-1
}

export interface CalibrationBucket {
  /** Lower edge of the model-probability bucket, e.g. 0.50 */
  bucketLow: number;
  bucketHigh: number;
  predictedAvg: number;
  actualAvg: number;
  count: number;
}

export interface HitRatesData {
  generatedAt: string;
  isDemo: boolean;
  /** Date range covered by the historical data, e.g. "2025-11-01 to 2026-04-29" */
  dateRange: string;

  overall: HitRateBreakdown;
  byMarket: HitRateBreakdown[];
  byConfidence: HitRateBreakdown[];

  /** Optional calibration data for chart */
  calibration?: CalibrationBucket[];

  /** Optional clarifying note when the data is sample/demo */
  sampleNote?: string;

  /** Recent settled leans, most recent first */
  recentSettled: Array<{
    date: string;
    playerName: string;
    market: Market;
    line: number;
    lean: LeanType;
    confidence: ConfidenceTier;
    actualValue: number;
    status: ResultStatus;
  }>;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export interface ScheduleGame {
  gameId: string;
  date: string;
  tipoff: string;
  homeTeamAbbr: string;
  homeTeamFull: string;
  awayTeamAbbr: string;
  awayTeamFull: string;
  status: string;
}

export interface ScheduleData {
  generatedAt: string;
  source: string;
  isDemo: boolean;
  date: string;
  games: ScheduleGame[];
}

export interface ProviderStatus {
  name: string;
  kind: "nba" | "odds" | "news" | "injury";
  tier: number;
  enabled: boolean;
  requires_api_key: boolean;
  api_key_configured: boolean;
  is_demo: boolean;
  is_stub: boolean;
  last_status: string;
  last_error: string | null;
  last_run_at: string | null;
  notes: string;
}

// ---------------------------------------------------------------------------
// Slate (Phase 7B-1) — multi-day window
// ---------------------------------------------------------------------------

/**
 * Phase 7B-1.2 — refined data-mode state machine.
 *
 *   Live                            real schedule + real odds (Phase 7B-2)
 *   ScheduleLiveOddsUnavailable     real schedule (nba_api OR manual override),
 *                                    no odds key configured
 *   NoGames                         provider explicitly confirmed zero games
 *                                    (status=ok, rawCount=0)
 *   ScheduleUnavailable             provider failed AND no manual override —
 *                                    we genuinely don't know what's on today
 *   DemoForced                      operator explicitly set NBA_DATA_MODE=demo
 *
 * Removed in 7B-1.2: DemoFallback, Unavailable (collapsed into the above).
 * Auto-fallback to demo is gone — silently substituting demo data was the
 * root cause of the May 4 bug. Demo content now only renders when explicitly
 * opted in.
 */
export type DataMode =
  | "Live"
  | "ScheduleLiveOddsUnavailable"
  | "NoGames"
  | "ScheduleUnavailable"
  | "DemoForced";

export interface NewsSignal {
  id: string;
  createdAt: string;
  expiresAt: string;
  sourceName: string;
  sourceType: "official" | "reporter" | "provider" | "manual";
  sourceUrl: string;
  playerName: string;
  team: string;
  gameId: string | null;
  updateType:
    | "injury"
    | "trade"
    | "lineup"
    | "minutes"
    | "rest"
    | "transaction"
    | "coaching"
    | "personal"
    | "other";
  note: string;
  confidence: number;
  impact: "low" | "medium" | "high";
  modelAction:
    | "none"
    | "flag_risk"
    | "reduce_minutes"
    | "increase_usage"
    | "remove_from_board"
    | "manual_review_required";
  manuallyConfirmed: boolean;
  sourceReliability: number;
}

export interface SlateDay {
  /** YYYY-MM-DD (ET) */
  date: string;
  /** Display label, e.g. "Today", "Tomorrow", "Tue May 5" */
  dayLabel: string;
  /** Whether the pipeline successfully produced data for this date */
  isAvailable: boolean;
  /** Number of scheduled games */
  gameCount: number;
  /** Number of model leans (0 if odds unavailable) */
  leanCount: number;
  /** Number of high-confidence leans */
  highConfidenceCount: number;
  /** Whether props/odds were available for this date */
  propsAvailable: boolean;
  /** Whether this is the date the user should see by default */
  isPrimary: boolean;
  /** Source label for the schedule data behind this date */
  scheduleSource: string;
  /** Source label for the odds data, or null if unavailable */
  oddsSource: string | null;
  /** Whether this date's data is from demo fallback */
  isDemo: boolean;
  /** Phase 7B-1.1: explicit state for UI rendering */
  dataMode: DataMode;
  /** Optional explanation when nba_api fell through to demo */
  failureReason?: string | null;
  /** Phase 7B-2: sub-state for odds provider — drives subtitles + copy */
  oddsProviderStatus?:
    | "not_configured"
    | "ok_with_props"
    | "ok_no_props"
    | "failed"
    | "demo"
    | "dry_run"
    | null;
}

export interface SlateData {
  generatedAt: string;
  primaryDate: string;
  slateDays: number;
  days: SlateDay[];
  newsSignalsActive: number;
  newsSignalsConfigured: boolean;
  /** Slate-wide mode (mirrors today's dataMode) */
  dataMode?: DataMode;
  /** Phase 7B-1.2: whether schedule_overrides.json exists */
  scheduleOverridesConfigured?: boolean;
}

export interface MetaData {
  appName: string;
  version: string;
  lastPipelineRun: string;
  dataSources: Array<{
    name: string;
    description: string;
    url?: string;
  }>;
  isDemo: boolean;

  // Multi-source pipeline metadata (added in Batch 2)
  /** Phase 7B-1.1: switched from {Demo,Live,Hybrid} to full DataMode union */
  dataMode?: DataMode;
  nbaScheduleSource?: string;
  nbaStatsSource?: string;
  oddsSource?: string;
  activeProvider?: { nba: string; odds: string };
  providerStatuses?: ProviderStatus[];
  fallbackSourcesAvailable?: Record<string, "enabled" | "disabled">;
  lastSuccessfulFetch?: string;

  // Phase 7B-1 additions
  slateDays?: number;
  primaryDate?: string;
  newsSignalsConfigured?: boolean;
  newsSignalsActive?: number;

  // Phase 7B-1.1 additions
  /** Today's data-mode state — drives top-level UI mode banner */
  todayDataMode?: DataMode;
  /** When today is in DemoFallback, why nba_api failed */
  todayFailureReason?: string | null;

  // Phase 7B-1.2 additions
  /** Whether schedule_overrides.json exists at all */
  scheduleOverridesConfigured?: boolean;
  /** Whether today's schedule came from a manual override */
  todayManualOverrideUsed?: boolean;

  // Phase 7B-2 additions
  /** Whether ODDS_API_KEY is set in environment */
  oddsApiKeyConfigured?: boolean;
  /** Today's odds provider sub-state */
  todayOddsProviderStatus?:
    | "not_configured"
    | "ok_with_props"
    | "ok_no_props"
    | "failed"
    | "demo"
    | "dry_run"
    | null;
  /** Provider error message if odds fetch failed today */
  todayOddsFailureReason?: string | null;
  /** Remaining credits on the free tier (from x-requests-remaining header) */
  todayOddsQuotaRemaining?: number | null;
  /** Number of real prop rows generated for today */
  todayParsedPropCount?: number;
  /** Bookmaker keys configured in ODDS_BOOKMAKERS */
  oddsBookmakersConfigured?: string[];
  /** Markets configured in ODDS_MARKETS */
  oddsMarketsConfigured?: string[];
  /** Regions configured in ODDS_REGIONS */
  oddsRegionsConfigured?: string;
  /** Cache TTL for odds responses */
  oddsCacheTtlMinutes?: number;
  /** Per-run cap on event-odds calls */
  oddsMaxEventsPerRun?: number;
}
