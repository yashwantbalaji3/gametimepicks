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

export type ConfidenceTier = "High" | "Medium" | "Low";

export type LeanType = "Over" | "Under" | "No Play";

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
  /** Model's projected stat value */
  projection: number;
  /** Model probability the prop hits (over OR under depending on lean) */
  modelProbability: number;
  /** Probability implied by the sportsbook odds */
  impliedProbability: number;
  /** Model probability minus implied, expressed as percentage points */
  edgePct: number;

  // Recommendation
  lean: LeanType;
  confidence: ConfidenceTier;
  /** One-sentence explanation rendered on the card */
  reason: string;

  // Tracking
  status: ResultStatus;
  /** Final stat value once the game is settled */
  actualValue?: number;
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
  kind: "nba" | "odds";
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
  dataMode?: "Demo" | "Live" | "Hybrid";
  nbaScheduleSource?: string;
  nbaStatsSource?: string;
  oddsSource?: string;
  activeProvider?: { nba: string; odds: string };
  providerStatuses?: ProviderStatus[];
  fallbackSourcesAvailable?: Record<string, "enabled" | "disabled">;
  lastSuccessfulFetch?: string;
}
