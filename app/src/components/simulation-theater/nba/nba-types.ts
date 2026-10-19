/** Shapes produced by lib/simulation-theater/nba (adapter-nba-sim-v1.mjs, nba-team-colors.mjs): plain JSON, server → client. */
export type NbaSide = "home" | "away";
export type NbaTeam = { abbr: string; name: string; providerTeamId: string | null };
export type NbaTeams = { home: NbaTeam; away: NbaTeam };
export type NbaPeriod = { period: number; label: string; home: number; away: number };
export type NbaTeamBox = { pts: number; reb: number; ast: number; threePa: number; threePm: number; twoPm: number; ftm: number; fgm: number };
export type NbaPlayerLine = { providerAthleteId?: string; name: string; minutes: number; pts: number; reb: number; ast: number; threePa: number; threePm: number; twoPm: number; ftm: number };
export type NbaSample = {
  runIndex: number;
  label: string;
  title: string;
  selectionRule: string;
  final: { home: number; away: number };
  periods: NbaPeriod[];
  overtimePeriods: number;
  team: { home: NbaTeamBox; away: NbaTeamBox };
  players: { home: NbaPlayerLine[]; away: NbaPlayerLine[] };
  validation: { ok: boolean; errors: { code: string; detail: string }[]; notes: { code: string; detail: string }[] };
};
export type Quantiles = { p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null; mean: number | null; sd: number | null } | null;
export type NbaManifest = {
  eventId: string;
  fixture: boolean;
  fixtureNote: string | null;
  file: string | null;
  role: string | null;
  provenance: { source: string | null; sha256: string | null; copiedAt: string | null; knownDeviation: string | null } | null;
  playRates: { home: Record<string, number>; away: Record<string, number> };
  date: string | null;
  dateUtc: string | null;
  venue: string | null;
  teams: NbaTeams;
  modelVersion: string;
  inputAsOf: string | null;
  generatedAt: string | null;
  simulations: number | null;
  seed: string | null;
  seedPolicy: string | null;
  structure: string | null;
  sim: {
    pHome: number | null; pAway: number | null; overtimeRate: number | null;
    total: Quantiles; margin: Quantiles; home: Quantiles; away: Quantiles;
    totalHistogram: { value: number; probability: number }[] | null;
    histogramNote: string | null;
  };
  invariants: { checkedDraws: number | null; violations: number } | null;
  samples: NbaSample[];
  disclosure: string;
  notModelled: string[];
};
export type NbaTeamPaint = { fill: string; ink: string; trim: string; court: string; courtInk: string; tint: string; tintPct?: number; patterned: boolean };
export type NbaPalette = { mode: "team" | "neutral"; status: string; clash: string | null; home: NbaTeamPaint; away: NbaTeamPaint };
export type NbaLoad = {
  eventId: string;
  file: string | null;
  ok: boolean;
  error: { code: string; reason: string } | null;
  manifest: NbaManifest | null;
  palettes: { team: NbaPalette; neutral: NbaPalette } | null;
};
export type NbaFrame = {
  t: number;
  phase: "LIVE" | "BREAK" | "FINAL";
  segIdx: number;
  period: string;
  periodDisplay: string;
  score: { home: number; away: number };
  scoreIllustrative: boolean;
  clockSec: number;
  clockIllustrative: boolean;
  lastCheckpoint: string;
  card: "HALFTIME" | "FINAL" | null;
  breakKind: string | null;
};
export type NbaSegment = {
  idx: number; period: number; label: string; ot: boolean; startT: number; endT: number; clockSec: number;
  before: { home: number; away: number }; pts: { home: number; away: number }; after: { home: number; away: number };
};
export type NbaCompiled = {
  segments: NbaSegment[];
  breaks: { kind: string; afterIdx: number; label: string; startT: number; endT: number; score: { home: number; away: number } }[];
  checkpoints: { t: number; label: string; score: { home: number; away: number } }[];
  tEnd: number;
  periodStarts: number[];
  final: { home: number; away: number };
};
