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
import { generateDailyParlays, generateMixedParlays } from "./daily-parlays";
import { generateAllSameGameParlays } from "./same-game";
import { selectDualBankBuilder, survivalScore } from "./dual-bank-builder";
import { currentEtDate } from "../freshness";
import { RISK_LEVEL_ORDER } from "./risk-levels";
import { INDIVIDUAL_LEG_ODDS_GUARDS, getRiskBucketForCombinedOdds } from "./risk-odds-bands";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";
import { loadWorldCupPlayerPropLegs } from "./world-cup-player-prop-legs";
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
export interface Last5Game { date: string; opp: string; value: number; hit: boolean; }
export interface Last5 {
  stat?: string; line?: number; side?: string;
  games?: Last5Game[];
  hitRate?: { hits: number; total: number; pct: number };
  unavailable?: boolean; reason?: string; source?: string;
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
  last5: Last5 | null;               // real last-5 prop history (MLB legs in committed artifacts)
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
export interface LaneStepDisplay {
  step: number;
  status: "settled" | "pending" | "evaluating" | "coming_soon";
  result: string | null;        // won | lost | null
  slateDate: string | null;
  combinedOdds: number | null;
  survivalScore: number | null;
  stake: number | null;
  payout: number | null;        // realized (settled) or projected (pending)
  projected: boolean;           // true when payout is a projection (pending step)
  target: number | null;        // crown target ($) for coming-soon steps
  legs: ParlayLegDisplay[];
  blockers: string[];           // for an "evaluating" step
}
export interface LaneDisplay {
  label: string;
  legs: ParlayLegDisplay[];     // current-step legs (back-compat)
  survivalScore: number;
  combinedOdds: number | null;
  result: string | null;
  advanced: boolean;
  currentStep: number;          // 1-based; 0 when single-step (no ladder)
  target: number | null;
  steps: LaneStepDisplay[];     // full ladder; empty when single-step
  laneStatus: string | null;    // active | advanced | stopped | restarted | completed_success
  publicVisible: boolean;       // false → hidden from the public Bank Builder (e.g. stopped lanes)
  restart: { status: string; stake: number; step: number; note: string } | null;
  // The next-step candidate shown publicly when no card is placed yet: either an explicit card
  // (legs populated) "awaiting approval", or an honest reason (legs empty) why no card qualifies.
  nextCandidate: {
    status: string;             // "awaiting_approval" | "pending"
    headline: string;           // e.g. "Step 3 candidate · awaiting approval"
    reason: string;             // honest, specific reason (never vague filler)
    stake: number | null;
    combinedOdds: number | null;
    projectedReturn: number | null;
    legs: ParlayLegDisplay[];
  } | null;
}
export interface DualBankBuilderPreview {
  status: DualBankBuilderResult["status"];
  runId: string | null;
  date: string;
  isLadder: boolean;
  currentStep: number;
  laneA: LaneDisplay | null;
  laneB: LaneDisplay | null;
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
/**
 * Tally of cards/legs filtered out by the combined-odds bands + individual-leg price guards
 * (`risk-odds-bands.ts`). Surfaced so the Parlay Lab + the operator report can show exactly how many
 * extreme-favorite/underdog legs and out-of-band cards the bands removed — not silently dropped.
 */
export interface OddsBandDiagnostics {
  legsDroppedTooShort: number; // individual legs shorter than -500 (leg_too_short_price)
  legsDroppedTooLong: number; // individual legs longer than +1200, non-longshot (leg_too_long_price)
  cardsRebucketed: number; // cards re-homed to the band their combined odds actually fit
  cardsDroppedOutOfBucket: number; // cards whose combined odds priced shorter than -200 (combined_odds_out_of_bucket)
}

export interface TodaySlateView {
  date: string;
  available: boolean;
  sports: SportSlateStatus[];
  suggestedBySportRisk: Record<string, Partial<Record<RiskLevel, SuggestedParlayCard[]>>>;
  mixedByRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>>;
  allSuggested: SuggestedParlayCard[];
  gameSpecific: GameSpecificParlayGroup[];
  eligibleLegs: EligibleLegDisplay[];
  bankBuilderPreview: DualBankBuilderPreview;
  oddsBandDiagnostics: OddsBandDiagnostics;
}

const SPORT_KEY: Record<Sport, SportKey> = { MLB: "mlb", NBA: "nba", UFC: "ufc", WORLD_CUP: "world_cup" };

/*
 * ── EXPLORER SLATE VIEW (P211 · Release 0) ──────────────────────────────────────────────────────
 * The payload fix at the data boundary. Every suggested/mixed/game-specific card embeds its FULL
 * ParlayLegDisplay objects while `eligibleLegs` already carries each leg once — so the client prop
 * serialized every leg once per referencing group (the ~1.26MB /build/custom condition). The view
 * replaces card legs with ordered `legIds` and ships one legs-by-id index; the client resolves.
 * Group order, membership, grades, provenance and card fields are untouched — legs are REFERENCED,
 * never re-derived, and a card leg somehow absent from the index rides along inline in `extraLegs`
 * (fail-open to correctness, counted so a guard can see it). Dedup is by canonical legId only.
 */
export interface ExplorerCardView extends Omit<SuggestedParlayCard, "legs"> {
  legIds: string[];
}
export interface ExplorerGameGroupView extends Omit<GameSpecificParlayGroup, "parlays"> {
  parlays: ExplorerCardView[];
}
export interface ExplorerSlateView extends Omit<TodaySlateView, "suggestedBySportRisk" | "mixedByRisk" | "allSuggested" | "gameSpecific"> {
  suggestedBySportRisk: Record<string, Partial<Record<RiskLevel, ExplorerCardView[]>>>;
  mixedByRisk: Partial<Record<RiskLevel, ExplorerCardView[]>>;
  allSuggested: ExplorerCardView[];
  gameSpecific: ExplorerGameGroupView[];
  /** Legs referenced by a card but missing from eligibleLegs — carried inline so nothing drops. */
  extraLegs: ParlayLegDisplay[];
}

export function explorerSlateView(slate: TodaySlateView): ExplorerSlateView {
  const known = new Set(slate.eligibleLegs.map((l) => l.legId));
  const extraById = new Map<string, ParlayLegDisplay>();
  const toView = (card: SuggestedParlayCard): ExplorerCardView => {
    const { legs, ...rest } = card;
    for (const l of legs) if (!known.has(l.legId) && !extraById.has(l.legId)) extraById.set(l.legId, l);
    return { ...rest, legIds: legs.map((l) => l.legId) };
  };
  const mapRisk = (byRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>>): Partial<Record<RiskLevel, ExplorerCardView[]>> =>
    Object.fromEntries(Object.entries(byRisk).map(([k, cards]) => [k, (cards ?? []).map(toView)]));
  return {
    ...slate,
    suggestedBySportRisk: Object.fromEntries(Object.entries(slate.suggestedBySportRisk).map(([sport, byRisk]) => [sport, mapRisk(byRisk)])),
    mixedByRisk: mapRisk(slate.mixedByRisk),
    allSuggested: slate.allSuggested.map(toView),
    gameSpecific: slate.gameSpecific.map((g) => ({ ...g, parlays: g.parlays.map(toView) })),
    extraLegs: [...extraById.values()],
  };
}

function dataRoot(): string {
  return path.join(process.cwd(), "public", "data");
}

/**
 * The date of the slate the product is currently presenting — the latest date with a generated
 * MLB board OR World Cup projections. This is the public "current slate" pointer used for display
 * (e.g. the global status-bar chip), distinct from `currentEtDate()` (the real wall clock). When an
 * overnight job has generated today's slate they coincide; when the latest slate is behind the wall
 * clock (no fresh slate generated yet), this returns that latest slate so the header shows the real
 * slate date rather than a bare wall-clock date with no matching data. Returns null if no slate exists.
 */
export function currentSlateDate(): string | null {
  return latestSlateDate(dataRoot());
}

/**
 * Latest date with a populated MLB board OR World Cup projections, **capped at the wall-clock date**
 * (`capEtDate`, defaults to today ET). The cap stops a pre-generated FUTURE slate (e.g. a June 24 MLB
 * model board produced the night before) from surfacing as "today's slate" while it is still June 23 —
 * which would also break the World Cup current-slate (WC's latest slate can legitimately lag MLB by a day).
 * If every slate is in the future, falls back to the overall latest so the site is never empty.
 */
function latestSlateDate(root: string, capEtDate?: string): string | null {
  const cap = capEtDate ?? currentEtDate();
  const dirs = [path.join(root, "mlb", "boards"), path.join(root, "world-cup", "projections")];
  const dates: string[] = [];
  for (const dir of dirs) {
    try {
      for (const f of fs.readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f)) dates.push(f.slice(0, 10));
    } catch { /* dir absent → skip */ }
  }
  if (!dates.length) return null;
  dates.sort();
  const onOrBefore = dates.filter((d) => d <= cap);
  return onOrBefore.length ? onOrBefore[onOrBefore.length - 1] : dates[dates.length - 1];
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
    // The dual Bank Builder is a PERSISTENT multi-day ladder: a lane stays active/advanced/awaiting or
    // queued across days until its next card is placed. So surface a launched/settled active run for the
    // current slate or any LATER date (date >= the run's launch date) — not just an exact match — while
    // still staying empty for dates before it existed. Never touches the protected files.
    if (run && (run.status === "launched" || run.status === "settled") && String(date) >= String(run.date)) return { run };
    return null;
  } catch { return null; }
}

// ── Identity enrichment from the raw board (never fabricated) ───────────────────────────────────
interface IdentityMaps {
  mlbByKey: Map<string, { playerId: number | null; teamAbbr: string | null }>;
  wcByMatch: Map<string, { homeCode: string | null; awayCode: string | null }>;
  wcPlayerByName: Map<string, { photoUrl: string | null; playerId: number | null; countryCode: string | null }>;
}

function buildIdentityMaps(rawBySport: Partial<Record<Sport, any>>, root?: string, date?: string): IdentityMaps {
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
  // Player-prop feed: real API-Football headshots + the player's OWN team flag code, so the upside-pool
  // legs (`world-cup-player-prop-legs`) render a photo + flag instead of falling back to a monogram.
  if (root) {
    try {
      // Date-specific props file (so a past slate reads its own players even after latest.json rolls);
      // fall back to latest when no dated file exists.
      const ppDir = path.join(root, "world-cup", "player-projections");
      const ppDated = date ? path.join(ppDir, `${date}.json`) : "";
      const ppFile = ppDated && fs.existsSync(ppDated) ? ppDated : path.join(ppDir, "latest.json");
      const pp = JSON.parse(fs.readFileSync(ppFile, "utf8"));
      if (!date || !pp.date || pp.date === date) {
        for (const r of pp.matches ?? []) {
          const name = String(r?.player?.name ?? "");
          if (!name || wcPlayerByName.has(name)) continue; // don't overwrite a team-projection entry
          wcPlayerByName.set(name, {
            photoUrl: typeof r.player.photo === "string" ? r.player.photo : null,
            playerId: typeof r.player.id === "number" ? r.player.id : null,
            countryCode: wcTeamCodeFromName(r.player.team),
          });
        }
      }
    } catch { /* no player-projections → team-projection photos only */ }
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
  // Prefer the projection's home code; fall back to resolving the participant/selection label
  // ("USA", "Turkey or Draw") to an ISO code so the flag renders even when home codes are missing.
  const code = match?.homeCode ?? wcTeamCodeFromName(leg.participantName);
  return { ...base, kind: "team", countryCode: code, teamAbbr: code };
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
    last5: null,
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

/**
 * Re-assign every generated card to the risk bucket its COMBINED odds actually fit, and drop cards
 * priced shorter than the Low floor (-200). The generator buckets a card by its leg mix; this is the
 * final authority on display — a card can never surface in a bucket whose payout band it doesn't fit.
 * `moved` counts cards re-homed to a different band; `droppedShort` counts `combined_odds_out_of_bucket`
 * drops (combined shorter than -200).
 */
function rebucketByCombinedOdds(cards: SuggestedParlayCard[]): {
  buckets: Record<RiskLevel, SuggestedParlayCard[]>;
  moved: number;
  droppedShort: number;
} {
  const buckets: Record<RiskLevel, SuggestedParlayCard[]> = { low: [], medium: [], high: [], longshot: [] };
  let moved = 0;
  let droppedShort = 0;
  for (const c of cards) {
    const bucket = c.combinedOdds == null ? c.riskLevel : getRiskBucketForCombinedOdds(c.combinedOdds);
    if (!bucket) { droppedShort++; continue; } // combined shorter than -200 → too short; drop (out-of-bucket)
    if (bucket === c.riskLevel) buckets[bucket].push(c);
    else { moved++; buckets[bucket].push({ ...c, riskLevel: bucket }); }
  }
  return { buckets, moved, droppedShort };
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
/**
 * @param rootOverride  A pinned data root, for regressions that are ABOUT a specific historical lane
 *   state. Production always omits it. Without this, those tests could only assert against the live
 *   ladder — which is what made a running product break tests simply by advancing.
 */
export function loadTodaySlate(explicitDate?: string, nowIsoOverride?: string, rootOverride?: string): TodaySlateView {
  const root = rootOverride ?? dataRoot();
  const nowIso = nowIsoOverride ?? new Date().toISOString();
  // Cap the auto-resolved slate at the wall clock (ET) so a pre-generated future slate never surfaces.
  const date = explicitDate ?? latestSlateDate(root, currentEtDate(new Date(nowIso))) ?? "";
  const cacheKey = `${root}|${date}|${nowIsoOverride ?? "live"}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  const empty: TodaySlateView = {
    date, available: false, sports: [], suggestedBySportRisk: {}, mixedByRisk: {}, allSuggested: [],
    gameSpecific: [], eligibleLegs: [],
    bankBuilderPreview: { status: "no_qualified_launch", runId: null, date, isLadder: false, currentStep: 0, laneA: null, laneB: null, selectedFour: [], launchGateSummary: [], noLaunchReasons: ["No slate available."] },
    oddsBandDiagnostics: { legsDroppedTooShort: 0, legsDroppedTooLong: 0, cardsRebucketed: 0, cardsDroppedOutOfBucket: 0 },
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
    const maps = buildIdentityMaps(rawBySport, root, date);

    // The not-started gate uses the REAL current moment (or a test override): games already underway
    // are excluded so the live preview never lists a started/in-progress game as bettable.
    const allLegsBySport = results.map((r) => buildLegsForSport(r, nowIso, true));
    // World Cup player-prop UPSIDE pool (real posted markets, joined to team games, pre-event + guarded,
    // limited-data). Adding it lets the balanced same-game + multi-game generators build Moonshot-style
    // High Risk + Longshot World Cup cards (team anchors + attacking props) — never team-only.
    const allLegs = [...allLegsBySport.flat(), ...loadWorldCupPlayerPropLegs(root, nowIso, date)];
    // Individual-leg price guard: drop extreme-favorite filler (shorter than -500, e.g. -1000/-7000 —
    // barely moves a parlay's payout) and extreme underdogs (above +1200) so no card pads with them.
    const oddsBandDiagnostics: OddsBandDiagnostics = { legsDroppedTooShort: 0, legsDroppedTooLong: 0, cardsRebucketed: 0, cardsDroppedOutOfBucket: 0 };
    const eligible = eligibleLegs(allLegs).filter((l) => {
      const o = (l as { odds?: number | null }).odds;
      if (o == null) return true;
      if (o < INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican) { oddsBandDiagnostics.legsDroppedTooShort++; return false; }
      if (o > INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican) { oddsBandDiagnostics.legsDroppedTooLong++; return false; }
      return true;
    });

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
        // Re-bucket every card by its COMBINED odds so each sits in the band it actually fits
        // (Low -200..+100 / Medium ..+300 / High ..+600 / Longshot >+600); drop cards shorter than -200.
        const { buckets, moved, droppedShort } = rebucketByCombinedOdds(parlays.map((p) => cardDisplay(p, legByIdLookup)));
        oddsBandDiagnostics.cardsRebucketed += moved;
        oddsBandDiagnostics.cardsDroppedOutOfBucket += droppedShort;
        for (const lvl of RISK_LEVEL_ORDER) {
          byRisk[lvl] = buckets[lvl];
          byRiskCount[lvl] = buckets[lvl].length;
          allSuggested.push(...buckets[lvl]);
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

    // Mixed-sport suggested parlays (≥1 World Cup leg + a non-soccer leg, by risk).
    const mixedByRisk: Partial<Record<RiskLevel, SuggestedParlayCard[]>> = {};
    {
      const { parlays: mixed } = generateMixedParlays(eligible, date);
      const { buckets, moved, droppedShort } = rebucketByCombinedOdds(mixed.map((p) => cardDisplay(p, legByIdLookup)));
      oddsBandDiagnostics.cardsRebucketed += moved;
      oddsBandDiagnostics.cardsDroppedOutOfBucket += droppedShort;
      for (const lvl of RISK_LEVEL_ORDER) {
        const cards = buckets[lvl];
        if (cards.length) { mixedByRisk[lvl] = cards; allSuggested.push(...cards); }
      }
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
    // Fallback display for a committed ladder leg not in the live pool (game already started, or a
    // prior-step settled leg). The committed artifact carries the exact side/line/market + factors, so
    // the Over/Under line, the "why", identity, and the official result all still render.
    const minimalLeg = (ll: any): ParlayLegDisplay => {
      const label = String(ll.label ?? ll.legId ?? "");
      const participant = ll.participantName ?? (label.replace(/\s+(double_chance|Strikeouts|Hits.*|Total.*|Moneyline).*$/i, "").trim() || label);
      const ident = maps ? legIdentity({ sport: ll.sport, eventId: String(ll.eventId ?? ""), participantName: participant, marketType: ll.marketType ?? "" } as EligibleLeg, maps)
        : { kind: "team", playerId: null, teamAbbr: null, countryCode: null, photoUrl: null, avatarSport: "mlb" } as LegIdentity;
      return {
        legId: ll.legId, sport: ll.sport, sportKey: SPORT_KEY[ll.sport as Sport] ?? "mlb", market: ll.marketType ?? "",
        side: ll.side ?? null, participant, team: ll.teamLabel ?? null, opponent: ll.opponentName ?? null, line: ll.line ?? null, odds: ll.odds ?? null,
        modelProbability: ll.modelProbability ?? null, marketImpliedProbability: null, edge: null,
        confidenceTier: ll.confidenceTier ?? "", riskScore: ll.riskScore ?? 0, riskTier: "", legQualityTier: ll.legQualityTier ?? "",
        legQualityScore: ll.legQualityScore ?? 0, survivalScore: ll.legQualityScore ?? null,
        topPositiveFactors: (ll.topPositiveFactors ?? []).map((f: any) => f.label), topNegativeFactors: (ll.topNegativeFactors ?? []).map((f: any) => f.label),
        missingFlags: [], staleFlags: [], smallSampleFlags: [],
        leakagePassed: true, startTime: ll.startTime ?? null,
        settlementResult: ll.settlement?.result ?? null, settlementOfficial: ll.settlement?.official ?? null,
        last5: ll.last5 ?? null,
        identity: ident,
      };
    };
    // When the run is settled, prefer the artifact leg (carries the official result) over the live leg.
    const settledLegByIdLookup = (ll: any): ParlayLegDisplay => {
      const live = legByIdLookup.get(ll.legId);
      // Always prefer the committed artifact's settlement + last-5 + opponent (live pool legs lack them).
      if (live) return { ...live, settlementResult: ll.settlement?.result ?? null, settlementOfficial: ll.settlement?.official ?? null, last5: ll.last5 ?? null, opponent: ll.opponentName ?? live.opponent ?? null, team: ll.teamLabel ?? live.team ?? null };
      return minimalLeg(ll);
    };
    const toStep = (s: any): LaneStepDisplay => ({
      step: s.step,
      status: s.status,
      result: s.result ?? null,
      slateDate: s.slateDate ?? null,
      combinedOdds: s.combinedOdds ?? null,
      survivalScore: s.laneSurvivalScore ?? null,
      stake: s.stake ?? null,
      payout: s.payout ?? s.projectedPayout ?? null,
      projected: s.status === "pending",
      target: s.target ?? null,
      legs: (s.legs ?? []).map((ll: any) => settledLegByIdLookup(ll)),
      blockers: s.blockers ?? [],
    });
    const toLane = (lane: any): LaneDisplay | null => lane ? {
      label: lane.label,
      legs: (lane.legs ?? []).map((ll: any) => settledLegByIdLookup(ll)),
      survivalScore: lane.laneSurvivalScore,
      combinedOdds: lane.combinedOdds,
      result: lane.result ?? null,
      advanced: lane.advanced ?? false,
      currentStep: lane.currentStep ?? 0,
      target: lane.target ?? null,
      steps: Array.isArray(lane.steps) ? lane.steps.map(toStep) : [],
      laneStatus: lane.laneStatus ?? null,
      publicVisible: lane.publicVisible !== false,
      restart: lane.restart ? { status: lane.restart.status, stake: lane.restart.stake ?? 100, step: lane.restart.step ?? 1, note: lane.restart.note ?? "" } : null,
      nextCandidate: lane.nextCandidate ? {
        status: lane.nextCandidate.status ?? "pending",
        headline: lane.nextCandidate.headline ?? "Candidate awaiting approval",
        reason: lane.nextCandidate.reason ?? "",
        stake: lane.nextCandidate.stake ?? null,
        combinedOdds: lane.nextCandidate.combinedOdds ?? null,
        projectedReturn: lane.nextCandidate.projectedReturn ?? null,
        legs: Array.isArray(lane.nextCandidate.legs) ? lane.nextCandidate.legs.map((ll: any) => settledLegByIdLookup(ll)) : [],
      } : null,
    } : null;
    const bankBuilderPreview: DualBankBuilderPreview = {
      status: bb.status,
      runId: bb.runId,
      date,
      isLadder: Boolean((bb as any).currentStep && (bb.laneA as any)?.steps?.length),
      currentStep: (bb as any).currentStep ?? 0,
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
      mixedByRisk,
      allSuggested,
      gameSpecific,
      eligibleLegs: eligible.map((l) => legByIdLookup.get(l.legId)).filter(Boolean) as EligibleLegDisplay[],
      bankBuilderPreview,
      oddsBandDiagnostics,
    };
    _cache.set(cacheKey, view);
    return view;
  } catch {
    _cache.set(cacheKey, empty);
    return empty;
  }
}
