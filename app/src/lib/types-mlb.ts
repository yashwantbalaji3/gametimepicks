/**
 * MLB type contracts — sibling to types.ts (NBA).
 *
 * Mirrors the schema written by pipeline/mlb/generate_mlb_board.py.
 * Kept separate from NBA types because the markets, player roles, and
 * recent-series shapes differ.
 */

export type MlbMarketKey =
  | "pitcher_strikeouts"
  | "batter_hits"
  | "batter_total_bases"
  | "batter_hits_runs_rbis";

export type MlbConfidenceTier =
  | "High"
  | "Medium"
  | "Low"
  | "insufficient_data"
  | "no_play";

export type MlbLean = "Over" | "Under" | "Pass" | "No Play";

export interface MlbScheduleGame {
  gamePk: number | null;
  gameDate: string | null;
  date: string;
  venue: string | null;
  status: string;
  awayTeamId: number | null;
  awayTeamAbbr: string | null;
  awayTeamName: string | null;
  homeTeamId: number | null;
  homeTeamAbbr: string | null;
  homeTeamName: string | null;
  awayProbablePitcherId: number | null;
  awayProbablePitcherName: string | null;
  homeProbablePitcherId: number | null;
  homeProbablePitcherName: string | null;
}

export interface MlbBoardLean {
  id: string;
  sport: "MLB";
  date: string;
  gameId: string;
  gamePk: number | null;
  commenceTime: string;
  homeTeamAbbr: string | null;
  homeTeamName: string | null;
  awayTeamAbbr: string | null;
  awayTeamName: string | null;
  venue: string | null;
  /** MLB Stats API personId for the player (resolved via probable pitchers
   *  or active roster lookup). Null when the name couldn't be resolved
   *  (recent call-ups, spelling mismatches). */
  playerId: number | null;
  playerName: string;
  /** The team this player is suiting up for in this game. */
  playerTeamAbbr: string | null;
  playerTeamName: string | null;
  /** The opposing team's abbreviation. */
  opponentAbbr: string | null;
  playerRole: "pitcher" | "batter";
  marketKey: MlbMarketKey;
  marketLabel: string;
  line: number;
  oddsOver: number;
  oddsUnder: number;
  impliedOver: number;
  impliedUnder: number;
  bookmaker: string;
  projection: number | null;
  sigma: number | null;
  samples: number;
  recentSeries: number[];
  lean: MlbLean;
  confidence: MlbConfidenceTier;
  modelProbOver: number | null;
  modelProbUnder: number | null;
  edgePct: number | null;
  edgePctOver: number | null;
  edgePctUnder: number | null;
  riskFlags: string[];
  reason: string;
  /** Structured bullet list — sibling to NBA's buildLeanReasonBullets
   *  output. Each bullet has a short label (e.g. "Recent form"), a
   *  one-line text, and a tone the UI can color (default | mute | warn).
   *  Optional: older boards predate this field. */
  reasonBullets?: MlbReasonBullet[];
}

export interface MlbReasonBullet {
  label: string;
  text: string;
  tone: "default" | "mute" | "warn" | "success";
}

export interface MlbByMarketCount {
  total: number;
  high: number;
  medium: number;
  low: number;
  insufficient: number;
}

export interface MlbBoardSummary {
  scheduledGames: number;
  eventsWithOdds: number;
  leans: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  insufficientData: number;
  anomalies: number;
  byMarket: Partial<Record<MlbMarketKey, MlbByMarketCount>>;
}

export interface MlbBoardCredits {
  before: string | null;
  after: string | null;
  spent: number;
  estimated: number | null;
}

export interface MlbBoardData {
  sport: "MLB";
  date: string;
  generatedAt: string;
  generatedFor: string;
  isDemo: boolean;
  scheduleAvailable: boolean;
  propsAvailable: boolean;
  scheduleSource: string;
  oddsSource: string | null;
  dataSources: string[];
  pendingReason?: string;
  games: MlbScheduleGame[];
  leans: MlbBoardLean[];
  summary: MlbBoardSummary;
  credits: MlbBoardCredits;
}

export interface MlbScheduleData {
  sport: "MLB";
  date: string;
  generatedAt: string;
  source: string;
  games: MlbScheduleGame[];
}

export interface MlbPowerData {
  sport: "MLB";
  scope: "home_runs";
  date: string;
  generatedAt: string;
  state: "pending" | "available";
  reason: string;
  inputsPlanned: string[];
  games: MlbScheduleGame[];
}
