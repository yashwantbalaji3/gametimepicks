/**
 * Public schema for MLB Results — mirrors what
 * `pipeline/mlb/export_mlb_results.py` writes to
 * `app/public/data/mlb/results/`.
 */

export interface MlbSettledLean {
  id: string;
  date: string;
  gamePk: number;
  playerId: number | null;
  playerName: string;
  playerTeamAbbr: string | null;
  opponentAbbr: string | null;
  playerRole: "pitcher" | "batter";
  marketKey:
    | "pitcher_strikeouts"
    | "batter_hits"
    | "batter_total_bases";
  marketLabel: string;
  line: number;
  lean: "Over" | "Under" | "Pass" | "No Play";
  confidence: "High" | "Medium" | "Low" | "insufficient_data" | "no_play";
  projection: number | null;
  edgePct: number | null;
  actual: number;
  outcome: "Win" | "Loss" | "Push";
}

export interface MlbBucket {
  label: string;
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  /** Per-game bucket also carries the matchup label + gameDate. */
  matchup?: string;
  gameDate?: string;
}

export interface MlbPendingGame {
  gamePk: number;
  matchup: string;
  abstractState: string;
  detailedState: string;
}

export interface MlbComparisonReport {
  sport: "MLB";
  date: string;
  generatedAt: string;
  scheduledGames: number;
  finalGames: number;
  finalGamesSettled: number;
  pendingGames: number;
  partial: boolean;
  decisive: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  smallSample: boolean;
  byMarket: Record<string, MlbBucket>;
  byConfidence: Record<string, MlbBucket>;
  byGame: Record<string, MlbBucket>;
  topHits: (MlbSettledLean & { isAnomaly?: boolean })[];
  biggestMisses: (MlbSettledLean & { isAnomaly?: boolean })[];
  unavailableCount: number;
  unavailable: string[];
  pendingGameList: MlbPendingGame[];
  nameFallbackCount: number;
  nameFallbackNotes: string[];
}

export interface MlbLifetimeSummary {
  sport: "MLB";
  generatedAt: string;
  totalDates: number;
  totalSettled: number;
  decisive: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  smallSample: boolean;
  partial: boolean;
  pendingDates: string[];
  pendingGamesTotal: number;
  oldestDate: string | null;
  newestDate: string | null;
}

export interface MlbAvailableDates {
  sport: "MLB";
  generatedAt: string;
  dates: string[];
}
