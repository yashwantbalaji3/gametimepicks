/**
 * UI loader — SERVER-ONLY (uses node:fs at build time, like the other data loaders). Reads the
 * committed board/projection JSON, runs the PURE parlay engine, and returns serializable display
 * data for the UI. It NEVER mutates protected Bank Builder data, NEVER launches, and NEVER fabricates
 * a card: a missing/bad board yields an honest empty/evaluating state.
 *
 * Do not import this from a client component — import the display TYPES only (they are erased) or
 * receive the data via props from a server component.
 */
import fs from "node:fs";
import path from "node:path";
import type { Sport } from "../methodology/types";
import type { ExtractorStatus } from "../methodology/adapter";
import { loadSourceForSport, ALL_SPORTS } from "../methodology/sources";
import { extractPredictionsBySport, type SportExtractionResult } from "../methodology/adapter";
import { buildLegsForSport, eligibleLegs } from "./eligible-leg";
import { generateDailyParlays } from "./daily-parlays";
import { generateAllSameGameParlays } from "./same-game";
import { selectDualBankBuilder, survivalScore } from "./dual-bank-builder";
import { RISK_LEVEL_ORDER } from "./risk-levels";
import type { EligibleLeg, RiskLevel, SuggestedParlay, DualBankBuilderResult } from "./types";

// ── Display types (safe to import from client components — interfaces are erased) ────────────────
export type SportKey = "mlb" | "nba" | "ufc" | "world_cup";
export interface LegIdentity {
  kind: "player" | "team" | "fighter";
  playerId: number | null;
  teamAbbr: string | null;
  countryCode: string | null;
  photoUrl: string | null;
  avatarSport: "mlb" | "nba";
}
export interface ParlayLegDisplay {
  legId: string;
  sport: Sport;
  sportKey: SportKey;
  market: string;
  side: string | null; // over/under/yes/no — the exact pick side
  participant: string;
  team: string | null;
  opponent: string | null;
  line: number | null;
  odds: number | null;
  modelProbability: number | null;
  marketImpliedProbability: number | null;
  edge: number | null;
  confidenceTier: string;
  riskScore: number;
  riskTier: string;
  legQualityTier: string;
  legQualityScore: number;
  survivalScore: number | null;
  topPositiveFactors: string[];
  topNegativeFactors: string[];
  missingFlags: string[];
  staleFlags: string[];
  smallSampleFlags: string[];
  leakagePassed: boolean;
  startTime: string | null;
  settlementResult: string | null;   // won | lost | void | pending | needs_review | null (unsettled)
  settlementOfficial: string | null; // official stat/score line, e.g. "4 K (5.0 IP)"
  identity: LegIdentity;
}
export interface SuggestedParlayCard {
  parlayId: string;
  sport: Sport | "MIXED";
  sportKey: SportKey | "mixed";
  riskLevel: RiskLevel;
  parlayType: "cross_game" | "same_game";
  legs: ParlayLegDisplay[];
  combinedOdds: number | null;
  estimatedHitProbability: number | null;
  payoutMultiple: number | null;
  averageLegQuality: number;
  confidenceTier: string;
  riskTier: string;
  correlationScore: number;
  correlationSummary: string;
  whyThisParlay: string[];
  whyItCouldFail: string[];
}
export interface GameSpecificParlayGroup {
  gameId: string;
  sport: Sport;
  label: string;
  parlays: SuggestedParlayCard[];
}
export type EligibleLegDisplay = ParlayLegDisplay;
export interface DualBankBuilderPreview {
  status: DualBankBuilderResult["status"];
  runId: string | null;
  date: string;
  laneA: { label: string; legs: ParlayLegDisplay[]; survivalScore: number; combinedOdds: number | null; result: string | null; advanced: boolean } | null;
  laneB: { label: string; legs: ParlayLegDisplay[]; survivalScore: number; combinedOdds: number | null; result: string | null; advanced: boolean } | null;
  selectedFour: ParlayLegDisplay[];
  launchGateSummary: DualBankBuilderResult["launchGateSummary"];
  noLaunchReasons: string[];
}
export interface NoQualifiedReason { sport: Sport; status: ExtractorStatus; message: string; }
export interface SportSlateStatus {
  sport: Sport;
  sportKey: SportKey;
  extractorStatus: ExtractorStatus;
  totalCandidates: number;
  eligibleCount: number;
  suggestedByRisk: Record<RiskLevel, number>;
  gameSpecificCount: number;
  noQualified: NoQualifiedReason | null;
}
export interface TodaySlateView {
  date: string;
  available: boolean;
  sports: SportSlateStatus[];
  suggestedBySportRisk: Record<string, Partial<Record<RiskLevel, SuggestedParlayCard[]>>>;
  allSuggested: SuggestedParlayCard[];
  gameSpecific: GameSpecificParlayGroup[];
  eligibleLegs: EligibleLegDisplay[];
  bankBuilderPreview: DualBankBuilderPreview;
}

const SPORT_KEY: Record<Sport, SportKey> = { MLB: "mlb", NBA: "nba", UFC: "ufc", WORLD_CUP: "world_cup" };

function dataRoot(): string {
  return path.join(process.cwd(), "public", "data");
}

/** Latest date that has a populated MLB board (the active sport); else null. */
function latestSlateDate(root: string): string | null {
  const dir = path.join(root, "mlb", "boards");
  try {
    const dates = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
    return dates.length ? dates[dates.length - 1] : null;
  } catch { return null; }
}

/**
 * Read an operator-launched dual run from the engine's NON-protected namespace
 * (public/data/methodology/launch/). Returns the run only if it matches the slate date. This never
 * touches the protected public/data/bank-builder/* files.
 */
function readActiveLaunchedRun(root: string, date: string): { run: DualBankBuilderResult } | null {
  try {
    const p = path.join(root, "methodology", "launch", "dual-bank-builder-active.json");
    if (!fs.existsSync(p)) return null;
    const doc = JSON.parse(fs.readFileSync(p, "utf8"));
    const run = doc?.run;
    // Show the run while it is launched (live) OR settled (official results in).
    if (run && run.date === date && (run.status === "launched" || run.status === "settled")) return { run };
    return null;
  } catch { return null; }
}

// ── Identity enrichment from the raw board (never fabricated) ───────────────────────────────────
interface IdentityMaps {
  mlbByKey: Map<string, { playerId: number | null; teamAbbr: string | null }>;
  wcByMatch: Map<string, { homeCode: string | null; awayCode: string | null }>;
  wcPlayerByName: Map<string, { photoUrl: string | null; playerId: number | null; countryCode: string | null }>;
}

function buildIdentityMaps(rawBySport: Partial<Record<Sport, any>>): IdentityMaps {
  const mlbByKey = new Map<string, { playerId: number | null; teamAbbr: string | null }>();
  const mlb = rawBySport.MLB;
  for (const l of mlb?.leans ?? []) {
    mlbByKey.set(`${l.gameId}:${l.playerName}`, { playerId: typeof l.playerId === "number" ? l.playerId : null, teamAbbr: l.playerTeamAbbr ?? null });
  }
  const wcByMatch = new Map<string, { homeCode: string | null; awayCode: string | null }>();
  const wcPlayerByName = new Map<string, { photoUrl: string | null; playerId: number | null; countryCode: string | null }>();
  const wc = rawBySport.WORLD_CUP;
  for (const r of wc?.public ?? []) {
    if (r.matchId != null) wcByMatch.set(String(r.matchId), { homeCode: r.homeCode ?? null, awayCode: r.awayCode ?? null });
    if (r.player && typeof r.player === "object") {
      wcPlayerByName.set(String(r.player.name ?? ""), {
        photoUrl: typeof r.player.photo === "string" ? r.player.photo : null,
        playerId: typeof r.player.id === "number" ? r.player.id : null,
        countryCode: r.homeCode ?? r.awayCode ?? null,
      });
    }
  }
  return { mlbByKey, wcByMatch, wcPlayerByName };
}

function legIdentity(leg: EligibleLeg, maps: IdentityMaps): LegIdentity {
  const base: LegIdentity = { kind: "team", playerId: null, teamAbbr: null, countryCode: null, photoUrl: null, avatarSport: "mlb" };
  if (leg.sport === "MLB") {
    const id = maps.mlbByKey.get(`${leg.eventId}:${leg.participantName}`);
    const isPlayer = leg.marketType !== "moneyline" && !!id?.playerId;
    return { ...base, kind: isPlayer ? "player" : "team", playerId: id?.playerId ?? null, teamAbbr: id?.teamAbbr ?? null, avatarSport: "mlb" };
  }
  if (leg.sport === "NBA") {
    return { ...base, kind: "player", avatarSport: "nba" };
  }
  if (leg.sport === "UFC") {
    return { ...base, kind: "fighter" };
  }
  // WORLD_CUP
  const player = maps.wcPlayerByName.get(leg.participantName);
  if (player) return { ...base, kind: "player", playerId: player.playerId, photoUrl: player.photoUrl, countryCode: player.countryCode };
  const match = maps.wcByMatch.get(leg.eventId);
  return { ...base, kind: "team", countryCode: match?.homeCode ?? null, teamAbbr: match?.homeCode ?? null };
}

function legDisplay(leg: EligibleLeg, maps: IdentityMaps): ParlayLegDisplay {
  return {
    legId: leg.legId,
    sport: leg.sport,
    sportKey: SPORT_KEY[leg.sport],
    market: leg.marketType,
    side: leg.side,
    participant: leg.participantName,
    team: leg.teamName,
    opponent: leg.opponentName,
    line: leg.line,
    odds: leg.odds,
    modelProbability: leg.modelProbability,
    marketImpliedProbability: leg.marketImpliedProbability,
    edge: leg.edge,
    confidenceTier: leg.confidenceTier,
    riskScore: leg.riskScore,
    riskTier: leg.riskTier,
    legQualityTier: leg.legQualityTier,
    legQualityScore: leg.legQualityScore,
    survivalScore: leg.eligible ? survivalScore(leg) : null,
    topPositiveFactors: leg.topPositiveFactors.map((f) => f.label),
    topNegativeFactors: leg.topNegativeFactors.map((f) => f.label),
    missingFlags: leg.missingDataFlags.filter((f) => !/planned|not_available/.test(f.reason)).map((f) => f.field),
    staleFlags: leg.staleDataFlags.map((f) => f.field),
    smallSampleFlags: leg.smallSampleFlags.map((f) => f.field),
    leakagePassed: leg.leakageValidationPassed,
    startTime: leg.startTime,
    settlementResult: null,
    settlementOfficial: null,
    identity: legIdentity(leg, maps),
  };
}

function cardDisplay(p: SuggestedParlay, legByIdLookup: Map<string, ParlayLegDisplay>): SuggestedParlayCard {
  const legs = p.legs.map((lv) => legByIdLookup.get(lv.legId)).filter(Boolean) as ParlayLegDisplay[];
  const sportKey = p.sport === "MIXED" ? ("mixed" as const) : SPORT_KEY[p.sport];
  return {
    parlayId: p.parlayId,
    sport: p.sport,
    sportKey,
    riskLevel: p.riskLevel,
    parlayType: p.parlayType,
    legs,
    combinedOdds: p.combinedOdds,
    estimatedHitProbability: p.estimatedHitProbability,
    payoutMultiple: p.estimatedPayoutMultiple,
    averageLegQuality: p.averageLegQuality,
    confidenceTier: p.confidenceTier,
    riskTier: p.riskTier,
    correlationScore: p.correlationScore,
    correlationSummary: p.correlationSummary,
    whyThisParlay: p.whyThisParlay,
    whyItCouldFail: p.whyItCouldFail,
  };
}

const NO_QUALIFIED_MESSAGES: Record<ExtractorStatus, (sport: Sport) => string> = {
  wired_no_candidates: (s) => s === "NBA" ? "No eligible NBA board today (off-season or no slate)." : `No eligible ${s} candidates for today.`,
  source_missing: (s) => s === "WORLD_CUP" ? "No odds-backed World Cup projections for today (schedule only)." : `No ${s} source data for today.`,
  wired: () => "",
};

const _cache = new Map<string, TodaySlateView>();

/**
 * Build the full slate view at build time. Memoized. Server-only.
 * `nowIsoOverride` fixes the "now" used by the not-started gate (tests pass a fixed time); the live
 * site uses the real current moment so games already started are excluded — never shown as bettable.
 */
export function loadTodaySlate(explicitDate?: string, nowIsoOverride?: string): TodaySlateView {
  const root = dataRoot();
  const date = explicitDate ?? latestSlateDate(root) ?? "";
  const nowIso = nowIsoOverride ?? new Date().toISOString();
  const cacheKey = `${root}|${date}|${nowIsoOverride ?? "live"}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  const empty: TodaySlateView = {
    date, available: false, sports: [], suggestedBySportRisk: {}, allSuggested: [],
    gameSpecific: [], eligibleLegs: [],
    bankBuilderPreview: { status: "no_qualified_launch", runId: null, date, laneA: null, laneB: null, selectedFour: [], launchGateSummary: [], noLaunchReasons: ["No slate available."] },
  };
  if (!date) { _cache.set(cacheKey, empty); return empty; }

  try {
    const rawBySport: Partial<Record<Sport, any>> = {};
    const results: SportExtractionResult[] = [];
    for (const sport of ALL_SPORTS) {
      const loaded = loadSourceForSport(sport, date, root);
      rawBySport[sport] = loaded.mlb ?? loaded.nba ?? loaded.ufc ?? loaded.worldCupTeam ?? loaded.worldCupPlayer;
      results.push(extractPredictionsBySport(sport, loaded));
    }
    const maps = buildIdentityMaps(rawBySport);

    // The not-started gate uses the REAL current moment (or a test override): games already underway
    // are excluded so the live preview never lists a started/in-progress game as bettable.
    const allLegsBySport = results.map((r) => buildLegsForSport(r, nowIso, true));
    const allLegs = allLegsBySport.flat();
    const eligible = eligibleLegs(allLegs);

    const legByIdLookup = new Map<string, ParlayLegDisplay>();
    for (const l of allLegs) legByIdLookup.set(l.legId, legDisplay(l, maps));

    const suggestedBySportRisk: Record<string, Partial<Record<RiskLevel, SuggestedParlayCard[]>>> = {};
    const allSuggested: SuggestedParlayCard[] = [];
    const sports: SportSlateStatus[] = [];

    for (const r of results) {
      const sportLegs = eligible.filter((l) => l.sport === r.sport);
      const byRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>> = {};
      const byRiskCount = { low: 0, medium: 0, high: 0, longshot: 0 } as Record<RiskLevel, number>;
      if (sportLegs.length > 0) {
        const { parlays } = generateDailyParlays(sportLegs, date);
        for (const lvl of RISK_LEVEL_ORDER) {
          const cards = parlays.filter((p) => p.riskLevel === lvl).map((p) => cardDisplay(p, legByIdLookup));
          byRisk[lvl] = cards;
          byRiskCount[lvl] = cards.length;
          allSuggested.push(...cards);
        }
      }
      suggestedBySportRisk[r.sport] = byRisk;
      const eligibleCount = sportLegs.length;
      sports.push({
        sport: r.sport,
        sportKey: SPORT_KEY[r.sport],
        extractorStatus: r.extractorStatus,
        totalCandidates: r.totalCandidates,
        eligibleCount,
        suggestedByRisk: byRiskCount,
        gameSpecificCount: 0,
        noQualified: eligibleCount === 0 ? { sport: r.sport, status: r.extractorStatus, message: NO_QUALIFIED_MESSAGES[r.extractorStatus]?.(r.sport) || `No eligible ${r.sport} candidates today.` } : null,
      });
    }

    // Game-specific parlays (across eligible legs).
    const sameGame = generateAllSameGameParlays(eligible, date);
    const gameSpecific: GameSpecificParlayGroup[] = sameGame.map((g) => ({
      gameId: g.gameId,
      sport: g.sport,
      label: g.parlays[0]?.legs.map((l) => l.eventId).length ? g.gameId : g.gameId,
      parlays: g.parlays.map((p) => cardDisplay(p, legByIdLookup)),
    }));
    for (const s of sports) s.gameSpecificCount = gameSpecific.filter((g) => g.sport === s.sport).length;

    // Dual Bank Builder: prefer the LAUNCHED run if an operator launched one (engine namespace,
    // never the protected files); else show the live soccer-preferred dry-run PREVIEW.
    const launched = readActiveLaunchedRun(root, date);
    const bb = launched?.run ?? selectDualBankBuilder(eligible, date, { mode: "dry_run", preferSoccerPerLane: true });
    // Fallback display for a launched leg whose game already started (not in the live pool). The
    // committed artifact carries the exact side + factors, so the "why" + Over/Under still render.
    const minimalLeg = (ll: any): ParlayLegDisplay => ({
      legId: ll.legId, sport: ll.sport, sportKey: SPORT_KEY[ll.sport as Sport] ?? "mlb", market: "",
      side: null, participant: String(ll.label ?? ll.legId), team: null, opponent: null, line: null, odds: ll.odds ?? null,
      modelProbability: ll.modelProbability ?? null, marketImpliedProbability: null, edge: null,
      confidenceTier: ll.confidenceTier ?? "", riskScore: ll.riskScore ?? 0, riskTier: "", legQualityTier: ll.legQualityTier ?? "",
      legQualityScore: ll.legQualityScore ?? 0, survivalScore: ll.legQualityScore ?? null,
      topPositiveFactors: (ll.topPositiveFactors ?? []).map((f: any) => f.label), topNegativeFactors: (ll.topNegativeFactors ?? []).map((f: any) => f.label),
      missingFlags: [], staleFlags: [], smallSampleFlags: [],
      leakagePassed: true, startTime: ll.startTime ?? null,
      settlementResult: ll.settlement?.result ?? null, settlementOfficial: ll.settlement?.official ?? null,
      identity: { kind: "team", playerId: null, teamAbbr: null, countryCode: null, photoUrl: null, avatarSport: "mlb" },
    });
    // When the run is settled, prefer the artifact leg (carries the official result) over the live leg.
    const settledLegByIdLookup = (ll: any): ParlayLegDisplay => {
      const live = legByIdLookup.get(ll.legId);
      if (live && ll.settlement) return { ...live, settlementResult: ll.settlement.result ?? null, settlementOfficial: ll.settlement.official ?? null };
      return live ?? minimalLeg(ll);
    };
    const toLane = (lane: any) => lane ? {
      label: lane.label,
      legs: lane.legs.map((ll: any) => settledLegByIdLookup(ll)),
      survivalScore: lane.laneSurvivalScore,
      combinedOdds: lane.combinedOdds,
      result: lane.result ?? null,
      advanced: lane.advanced ?? false,
    } : null;
    const bankBuilderPreview: DualBankBuilderPreview = {
      status: bb.status,
      runId: bb.runId,
      date,
      laneA: toLane(bb.laneA),
      laneB: toLane(bb.laneB),
      selectedFour: bb.selectedFourLegs.map((ll) => legByIdLookup.get(ll.legId) ?? minimalLeg(ll)),
      launchGateSummary: bb.launchGateSummary,
      noLaunchReasons: bb.noLaunchReasons,
    };

    const view: TodaySlateView = {
      date,
      available: results.some((r) => r.sourcePath != null || r.totalCandidates > 0),
      sports,
      suggestedBySportRisk,
      allSuggested,
      gameSpecific,
      eligibleLegs: eligible.map((l) => legByIdLookup.get(l.legId)).filter(Boolean) as EligibleLegDisplay[],
      bankBuilderPreview,
    };
    _cache.set(cacheKey, view);
    return view;
  } catch {
    _cache.set(cacheKey, empty);
    return empty;
  }
}
