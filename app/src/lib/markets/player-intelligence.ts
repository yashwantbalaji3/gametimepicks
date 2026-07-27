/**
 * MLB PLAYER-PROP MODEL / MARKET INTELLIGENCE (Sprint 029 · Phase 5).
 *
 * The player-level counterpart to ./game-intelligence: one canonical object per prop row, carrying
 * the model side, the sportsbook side, and a neutral comparison — but only the parts each row has
 * actually earned. Pairing (./pairing) decides the mode; this assembles the content.
 *
 * ── What is deliberately NOT carried ──
 *
 * The board lean also contains `lean` ("Over"), `edgePct`, and a `confidence` grade. None of them
 * appear in this object, and that omission is the most important decision in the file.
 *
 * Per lib/mlb/model-calibration-status, all four modeled MLB families were DEMOTED: across 18,659
 * settled leans none out-predicts the market on Brier or log loss, and the model is systematically
 * overconfident — its highest-confidence reads under-perform. So `lean` is a recommendation the
 * evidence does not support, and `edgePct` is a claim of advantage that the audit specifically
 * refutes. Passing them through "just as data" is how they end up on a page. A field that cannot be
 * honestly rendered should not be in the object a renderer receives.
 *
 * What IS carried is the projection, its dispersion, its sample size and the player's recent form —
 * the evidence a reader can weigh, rather than a conclusion drawn for them.
 *
 * ── Probability provenance ──
 *
 * The board stores only RAW implied probabilities for props (they sum to well over 1 — the book's
 * margin is still in them). No-vig is therefore DERIVED here through the canonical ./probability
 * helpers, never back-filled from the raw number, and it requires both sides: a one-sided market
 * cannot be de-vigged because the overround is only observable across the pair.
 *
 * ── Leakage safety ──
 *
 * Recent form is pre-event evidence and must stay that way. Every recent game is filtered to dates
 * strictly BEFORE the slate date, and `recentFormLeakageSafe` reports whether anything was dropped,
 * so a surface can refuse rather than silently render a post-event fact in a pregame research view.
 */
import { getMarketIntelligenceMode, modelKeyFor, type MarketIntelligence } from "./pairing";
import { deVigPair, impliedFromPrice, DEVIG_METHODOLOGY_NOTE } from "./probability";
import { evaluateArtifactFreshness, evaluateEventPhase, type EventPhase, type FreshnessReading } from "./freshness";
import { isPublishableTeamMapping } from "./resolve-team";
import { MLB_CALIBRATION_DISCLOSURE, modelBeatsMarket } from "../mlb/model-calibration-status";
import type { MappingStatus, PlayerMarketFamily } from "./types";

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────

/** One row of `mlb/player-props/<date>.json`. */
export interface BookPropRow {
  readonly gameId: string;
  readonly player: string;
  readonly market: string;
  readonly marketLabel?: string | null;
  readonly point?: number | null;
  readonly americanOdds?: number | null;
  readonly selection?: string | null;
  readonly provider?: string | null;
  readonly startTimeUtc?: string | null;
}

/** One projected lean of `mlb/boards/<date>.json`. */
export interface BoardLean {
  readonly gameId: string;
  readonly gamePk?: number | null;
  readonly playerId?: number | null;
  readonly playerName: string;
  readonly playerTeamAbbr?: string | null;
  readonly opponentAbbr?: string | null;
  readonly playerRole?: string | null;
  readonly marketKey: string;
  readonly marketLabel?: string | null;
  readonly line?: number | null;
  readonly oddsOver?: number | null;
  readonly oddsUnder?: number | null;
  readonly projection?: number | null;
  readonly sigma?: number | null;
  readonly samples?: number | null;
  readonly modelProbOver?: number | null;
  readonly modelProbUnder?: number | null;
  readonly riskFlags?: ReadonlyArray<string> | null;
  readonly recentGames?: ReadonlyArray<RecentGame> | null;
  readonly homeTeamAbbr?: string | null;
  readonly awayTeamAbbr?: string | null;
  readonly commenceTime?: string | null;
}

export interface RecentGame {
  readonly date: string;
  readonly opponent?: string | null;
  readonly isHome?: boolean | null;
  readonly value: number;
}

// ── Output ──────────────────────────────────────────────────────────────────────────────────────

export interface PlayerIdentity {
  readonly name: string;
  /** Canonical MLB player id when the board resolved one. Null is honest; 0 would not be. */
  readonly playerId: number | null;
  readonly team: string | null;
  readonly opponent: string | null;
  readonly role: string | null;
  readonly mapping: MappingStatus;
}

export interface EventContext {
  readonly gameId: string;
  readonly gamePk: number | null;
  readonly homeTeam: string | null;
  readonly awayTeam: string | null;
  readonly startTime: string | null;
  readonly phase: EventPhase;
}

export interface RecentForm {
  readonly games: ReadonlyArray<RecentGame>;
  readonly average: number | null;
  /** How often the player exceeded the current line, over the retained window. */
  readonly overLineCount: number | null;
  /** False when a post-slate game was filtered out — a surface should refuse rather than render. */
  readonly leakageSafe: boolean;
}

export interface PlayerModelSide {
  readonly projection: number;
  /** Dispersion of the projection. Null when the board published none. */
  readonly sigma: number | null;
  /** Game-log sample the projection rests on. Small samples are shown, not hidden. */
  readonly samples: number | null;
  readonly probOver: number | null;
  readonly probUnder: number | null;
  readonly riskFlags: ReadonlyArray<string>;
  readonly recentForm: RecentForm | null;
}

export interface PlayerBookSide {
  readonly line: number | null;
  readonly overOdds: number | null;
  readonly underOdds: number | null;
  readonly overImpliedProb: number | null;
  readonly underImpliedProb: number | null;
  /** Derived here from both prices. Null whenever one side is missing. */
  readonly overNoVigProb: number | null;
  readonly underNoVigProb: number | null;
  readonly provider: string | null;
  readonly methodologyNote: string;
}

export interface PlayerComparison {
  readonly modelProbOver: number;
  readonly marketProbOver: number;
  /** model − market in PERCENTAGE POINTS. Neutral: a gap, never an advantage. */
  readonly differencePoints: number;
}

export interface PlayerPropIntelligence {
  readonly intelligence: MarketIntelligence;
  readonly family: PlayerMarketFamily | null;
  readonly marketLabel: string | null;
  readonly player: PlayerIdentity;
  readonly event: EventContext;
  readonly snapshot: { readonly capturedAt: string | null; readonly freshness: FreshnessReading };
  readonly model: PlayerModelSide | null;
  readonly sportsbook: PlayerBookSide | null;
  readonly comparison: PlayerComparison | null;
  /**
   * Always false for every MLB family today. Present on the object so a surface must read a
   * `false` in order to imply a proven advantage, rather than simply not knowing.
   */
  readonly modelValidatedAgainstMarket: boolean;
  readonly calibrationDisclosure: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Retain only games that finished strictly BEFORE the slate date.
 *
 * `<` not `<=`: a game dated the same day as the slate may not have been played when the board was
 * built, and including it would put a same-day outcome into pregame research.
 */
export function filterLeakageSafeGames(
  games: ReadonlyArray<RecentGame> | null | undefined,
  slateDate: string,
): { kept: ReadonlyArray<RecentGame>; dropped: number } {
  const all = games ?? [];
  const kept = all.filter((g) => typeof g.date === "string" && g.date < slateDate);
  return { kept, dropped: all.length - kept.length };
}

function buildRecentForm(
  lean: BoardLean,
  slateDate: string,
  line: number | null,
): RecentForm | null {
  const { kept, dropped } = filterLeakageSafeGames(lean.recentGames, slateDate);
  if (kept.length === 0) return null;
  const values = kept.map((g) => g.value).filter((v): v is number => typeof v === "number");
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return {
    games: kept,
    average: average === null ? null : Math.round(average * 100) / 100,
    overLineCount: line === null ? null : values.filter((v) => v > line).length,
    leakageSafe: dropped === 0,
  };
}

// ── Builder ─────────────────────────────────────────────────────────────────────────────────────

export interface PlayerIntelligenceInput {
  readonly sport?: string;
  readonly prop: BookPropRow;
  /** The matching board lean, when one exists for this exact player/market/line. */
  readonly lean: BoardLean | null;
  /** Canonical family for the provider market string, or null when unmodeled by the domain. */
  readonly family: PlayerMarketFamily | null;
  readonly gamePk: number | null;
  readonly homeTeam: string | null;
  readonly awayTeam: string | null;
  /** Team attribution decided by the resolver, already participant-verified by the caller. */
  readonly teamMapping: MappingStatus;
  readonly artifact: { readonly date: string | null; readonly generatedAt: string | null };
  readonly todayEt: string;
  readonly nowIso: string;
}

/**
 * Build the canonical intelligence object for one player prop.
 *
 * Pure: no clock, no filesystem. `todayEt` and `nowIso` are supplied so a surface and its test can
 * pin the same instant.
 */
export function buildPlayerPropIntelligence(input: PlayerIntelligenceInput): PlayerPropIntelligence {
  const { prop, lean } = input;
  const sport = input.sport ?? "mlb";
  const slateDate = input.artifact.date ?? input.todayEt;

  const freshness = evaluateArtifactFreshness(
    { artifactDate: input.artifact.date, generatedAt: input.artifact.generatedAt },
    input.todayEt,
  );

  const line = num(prop.point);
  const overOdds = num(prop.americanOdds);
  const projection = num(lean?.projection);
  const modelPresent = lean != null && projection !== null;

  const intelligence = getMarketIntelligenceMode({
    sport,
    kind: "player",
    family: input.family,
    sportsbook: { present: true, americanOdds: overOdds, line, requiresLine: true },
    model: { present: modelPresent, supportsThreshold: modelPresent },
    freshness,
    eventResolved: input.gamePk != null,
    teamMapping: input.teamMapping,
  });

  const team = isPublishableTeamMapping(input.teamMapping)
    ? lean?.playerTeamAbbr ?? null
    : null;

  const player: PlayerIdentity = {
    name: prop.player,
    playerId: num(lean?.playerId),
    team,
    opponent: team ? lean?.opponentAbbr ?? null : null,
    role: lean?.playerRole ?? null,
    mapping: input.teamMapping,
  };

  const event: EventContext = {
    gameId: prop.gameId,
    gamePk: input.gamePk,
    homeTeam: input.homeTeam,
    awayTeam: input.awayTeam,
    startTime: prop.startTimeUtc ?? lean?.commenceTime ?? null,
    phase: evaluateEventPhase(prop.startTimeUtc ?? lean?.commenceTime ?? null, input.nowIso),
  };

  // ── Sportsbook side ───────────────────────────────────────────────────────────────────────────
  const underOdds = num(lean?.oddsUnder);
  // De-vig requires BOTH prices. The prop feed carries one row per selection, so the paired price
  // comes from the board; without it there is no overround to remove and no-vig stays null.
  const devig = deVigPair(overOdds, underOdds);
  const sportsbook: PlayerBookSide | null = intelligence.hasSportsbook
    ? {
        line,
        overOdds,
        underOdds,
        overImpliedProb: impliedFromPrice(overOdds),
        underImpliedProb: impliedFromPrice(underOdds),
        overNoVigProb: devig ? devig.side : null,
        underNoVigProb: devig ? devig.other : null,
        provider: prop.provider ?? null,
        methodologyNote: DEVIG_METHODOLOGY_NOTE,
      }
    : null;

  // ── Model side ────────────────────────────────────────────────────────────────────────────────
  // `lean` and `edgePct` are intentionally not read here. See the module header.
  const model: PlayerModelSide | null =
    intelligence.hasModel && lean && projection !== null
      ? {
          projection,
          sigma: num(lean.sigma),
          samples: num(lean.samples),
          probOver: num(lean.modelProbOver),
          probUnder: num(lean.modelProbUnder),
          riskFlags: lean.riskFlags ?? [],
          recentForm: buildRecentForm(lean, slateDate, line),
        }
      : null;

  // ── Comparison ────────────────────────────────────────────────────────────────────────────────
  const marketOver = sportsbook?.overNoVigProb ?? null;
  const comparison: PlayerComparison | null =
    model && model.probOver !== null && marketOver !== null
      ? {
          modelProbOver: model.probOver,
          marketProbOver: marketOver,
          differencePoints: Math.round((model.probOver - marketOver) * 1000) / 10,
        }
      : null;

  return {
    intelligence,
    family: input.family,
    marketLabel: prop.marketLabel ?? lean?.marketLabel ?? null,
    player,
    event,
    snapshot: { capturedAt: input.artifact.generatedAt, freshness },
    model,
    sportsbook,
    comparison,
    modelValidatedAgainstMarket: modelBeatsMarket(modelKeyFor(input.family) ?? ""),
    calibrationDisclosure: MLB_CALIBRATION_DISCLOSURE,
  };
}

/**
 * Join key for matching a prop row to its board lean.
 *
 * All four parts are required. Player and market alone would collide across the alternate lines the
 * book posts for the same player, silently pairing a 0.5 projection against a 1.5 price.
 */
export function propJoinKey(
  playerName: string,
  gameId: string,
  marketKey: string,
  line: number | null | undefined,
): string {
  return `${playerName}|${gameId}|${marketKey}|${line ?? ""}`;
}

/** Join key for a board lean, using the same shape so the two sides cannot drift apart. */
export function leanJoinKey(lean: BoardLean): string {
  return propJoinKey(lean.playerName, lean.gameId, lean.marketKey, lean.line);
}
