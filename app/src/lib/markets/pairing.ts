/**
 * MODEL / MARKET PAIRING REGISTRY (Sprint 029 · Phase 3).
 *
 * ONE decision layer that answers a single question for every market row a surface might render:
 * what kind of intelligence may we honestly show for this row?
 *
 * The question exists because NORMALIZATION CAPABILITY IS NOT COMPARISON CAPABILITY. The canonical
 * domain (./types) can represent all eight sportsbook prop families, and that is deliberate — a
 * family we do not model is still real market context worth showing. But representable is a much
 * weaker claim than comparable. Comparison additionally needs a model for that exact family, an
 * identity we can stand behind, a snapshot current enough to compare against, and a model artifact
 * that can actually evaluate the sportsbook's exact threshold.
 *
 * Before this module those five conditions were re-derived per page, which is how surfaces drift
 * apart: one page shows a comparison another page refuses, and neither is obviously wrong. Pages
 * must not invent these states. They ask here.
 *
 * ── The four modes ──
 *
 *   FULL_COMPARISON   both sides real and pairable — show model and market together
 *   MODEL_ONLY        GameTimePicks models it, the book does not offer it
 *   SPORTSBOOK_ONLY   the book offers it, GameTimePicks does not model it
 *   UNAVAILABLE       fail-closed default: unknown, unresolved, or missing a required input
 *
 * UNAVAILABLE is the default, not the exception. Every gate below can only ever REMOVE capability,
 * so a row with an input we forgot to supply degrades instead of over-claiming.
 *
 * ── What this module deliberately does NOT decide ──
 *
 * It does not rank rows, score them, or say which side of a market is preferable. A mode describes
 * what may be DISPLAYED, never what anyone should do about it. Per lib/mlb/model-calibration-status,
 * none of the four modeled MLB families currently out-predicts the market, so FULL_COMPARISON means
 * "both numbers are real and may be shown side by side" — it never means the model is the better
 * estimate. `modelValidatedAgainstMarket` is carried on every result so a surface can assert that
 * directly rather than assuming it.
 */
import { canShowLiveProjections } from "../sport-capability-registry";
import { MLB_SPORT_KEY, marketConfigFor, type SimulationSportModel } from "./sport-config";
import { isPublishableTeamMapping } from "./resolve-team";
import type { FreshnessReading } from "./freshness";
import type { GameMarketFamily, MappingStatus, PlayerMarketFamily } from "./types";
import { MODEL_KEY_BY_PLAYER_FAMILY, PROVIDER_KEY_BY_PLAYER_FAMILY } from "./types";

/** What kind of intelligence a surface may present for one market row. */
export type IntelligenceMode =
  | "FULL_COMPARISON"
  | "MODEL_ONLY"
  | "SPORTSBOOK_ONLY"
  | "UNAVAILABLE";

/**
 * Why capability was withheld. Recorded rather than discarded so a surface can explain an empty
 * state honestly ("no posted lineup yet" reads very differently from "we do not model this"), and
 * so the coverage census can attribute every dropped row to a specific gate instead of reporting an
 * unexplained shortfall.
 */
export type PairingGate =
  /** Sport is unknown, disabled, or not cleared for forward-looking model output. */
  | "SPORT_NOT_MODEL_ELIGIBLE"
  /** The provider offered a family this domain does not normalize. */
  | "FAMILY_UNKNOWN"
  /** No sportsbook market for this row. */
  | "NO_SPORTSBOOK_MARKET"
  /** The row exists but its line or price could not be read. Never coerced to a number. */
  | "MARKET_INCOMPLETE"
  /** GameTimePicks does not model this family. */
  | "NO_MODEL_FAMILY"
  /** The model artifact this comparison needs is absent for this event. */
  | "MODEL_ARTIFACT_MISSING"
  /** The artifact exists but cannot evaluate the sportsbook's exact line/side. */
  | "THRESHOLD_UNSUPPORTED"
  /** Snapshot is not current, so it may not back a live comparison. */
  | "ARTIFACT_NOT_CURRENT"
  /** The row could not be attached to a canonical event. */
  | "EVENT_UNRESOLVED"
  /** Player prop whose team could not be established from evidence. */
  | "TEAM_UNRESOLVED"
  /** Evidence pointed at more than one player. Fails closed rather than picking. */
  | "IDENTITY_AMBIGUOUS";

export interface MarketIntelligence {
  readonly mode: IntelligenceMode;
  /** Every gate that was not satisfied, in evaluation order. Empty only for FULL_COMPARISON. */
  readonly blockedBy: ReadonlyArray<PairingGate>;
  /** True when the GameTimePicks side may be shown. */
  readonly hasModel: boolean;
  /** True when the sportsbook side may be shown. */
  readonly hasSportsbook: boolean;
  /**
   * Whether this family's model has been VALIDATED to out-predict the market. False for every MLB
   * family today. Carried on the result so a surface never has to assume — and so any presentation
   * implying a proven advantage has to read a `false` to do it.
   */
  readonly modelValidatedAgainstMarket: boolean;
}

/** The sportsbook side of a row, reduced to what pairing needs. */
export interface SportsbookAvailability {
  /** Does a market row exist at all for this family/event? */
  readonly present: boolean;
  /** A readable American price. Null when absent — never zero, which is not a real price. */
  readonly americanOdds?: number | null;
  /** The market's number. Null is legitimate for moneyline and disqualifying for line markets. */
  readonly line?: number | null;
  /** True for families that are meaningless without a number (totals, run line, every prop). */
  readonly requiresLine?: boolean;
}

/** The model side of a row, reduced to what pairing needs. */
export interface ModelAvailability {
  /** Does the required simulation/projection artifact exist for this event? */
  readonly present: boolean;
  /**
   * Can that artifact evaluate the sportsbook's EXACT line and side?
   *
   * Defaults to `present`. It is separate because an artifact can exist and still be unable to
   * answer the question asked of it — a simulation that published cover probabilities at 1.5 and
   * 2.5 cannot speak to a 3.5 run line, and interpolating one would be a fabricated number wearing
   * the artifact's credibility. Callers that evaluate a threshold must set this explicitly.
   */
  readonly supportsThreshold?: boolean;
}

export interface PairingInput {
  readonly sport: string;
  readonly kind: "game" | "player";
  /** Canonical family. Null means the provider offered something this domain does not normalize. */
  readonly family: GameMarketFamily | PlayerMarketFamily | null;
  readonly sportsbook: SportsbookAvailability | null;
  readonly model: ModelAvailability | null;
  /** Artifact-level freshness for the sportsbook snapshot. Null when no snapshot was loaded. */
  readonly freshness: FreshnessReading | null;
  /** Whether the row is attached to a canonical event. */
  readonly eventResolved: boolean;
  /** Player rows only: how confidently the player was attached to a team. */
  readonly teamMapping?: MappingStatus | null;
}

/**
 * SEAM 3 — the calibration/model source, read per sport instead of imported from `lib/mlb`.
 *
 * Returns null for a sport that models nothing, which is the honest answer for NBA: below coin-flip
 * historically, `publicApproved:false`, and nothing model-derived surfaces. The gates below can then
 * only remove capability, so a no-model sport degrades to market context rather than over-claiming.
 */
function simulationModelFor(sport: string): SimulationSportModel | null {
  const model = marketConfigFor(sport)?.model;
  return model && model.kind === "SIMULATION_AND_PROPS" ? model : null;
}

/**
 * Does GameTimePicks model this player family, for this sport?
 *
 * Still derived from the sport's calibration registry rather than restated — a second
 * hand-maintained list would eventually disagree with it, at which point one of the two would be
 * silently wrong. `sport` defaults to MLB so every existing caller keeps its exact behaviour.
 */
export function modelSupportsPlayerFamily(
  family: PlayerMarketFamily | null,
  sport: string = MLB_SPORT_KEY,
): boolean {
  if (!family) return false;
  const model = simulationModelFor(sport);
  if (!model) return false;
  const modelKey = MODEL_KEY_BY_PLAYER_FAMILY[family];
  return modelKey !== undefined && model.modeledPlayerFamilyKeys.has(modelKey);
}

/** The key model artifacts and the calibration registry use for a family. */
export function modelKeyFor(family: PlayerMarketFamily | null): string | null {
  return family ? MODEL_KEY_BY_PLAYER_FAMILY[family] ?? null : null;
}

/** Does GameTimePicks model this game family, for this sport? */
export function modelSupportsGameFamily(
  family: GameMarketFamily | null,
  sport: string = MLB_SPORT_KEY,
): boolean {
  const model = simulationModelFor(sport);
  return Boolean(model && family && model.modeledGameFamilies.has(family));
}

/** Provider key for a canonical family, for joins into model artifacts keyed the provider's way. */
export function providerKeyFor(family: PlayerMarketFamily | null): string | null {
  return family ? PROVIDER_KEY_BY_PLAYER_FAMILY[family] ?? null : null;
}

function unavailable(blockedBy: PairingGate[], validated: boolean): MarketIntelligence {
  return {
    mode: "UNAVAILABLE",
    blockedBy,
    hasModel: false,
    hasSportsbook: false,
    modelValidatedAgainstMarket: validated,
  };
}

/**
 * THE canonical pairing decision. Every surface that shows a market row calls this.
 *
 * Evaluated as two independent availability questions — may we show the model side, may we show the
 * sportsbook side — whose combination yields the mode. Structuring it that way is what makes the
 * degradations correct by construction: a stale snapshot removes the sportsbook side and therefore
 * downgrades FULL_COMPARISON to MODEL_ONLY, without anyone writing that rule down.
 */
export function getMarketIntelligenceMode(input: PairingInput): MarketIntelligence {
  const blocked: PairingGate[] = [];

  const isPlayer = input.kind === "player";
  const playerFamily = isPlayer ? (input.family as PlayerMarketFamily | null) : null;
  const gameFamily = isPlayer ? null : (input.family as GameMarketFamily | null);

  const model = simulationModelFor(input.sport);
  const validated = isPlayer ? Boolean(model?.beatsMarket(modelKeyFor(playerFamily) ?? "")) : false;

  // ── Identity gates: they disqualify the ROW, not one side of it ──────────────────────────────
  // An unidentified row has no honest presentation at all. A sportsbook line attached to the wrong
  // player is not "market context" — it is misinformation with a price on it.
  if (!input.eventResolved) blocked.push("EVENT_UNRESOLVED");
  if (isPlayer && input.teamMapping === "AMBIGUOUS") blocked.push("IDENTITY_AMBIGUOUS");
  if (blocked.length) return unavailable(blocked, validated);

  // A family this domain does not normalize cannot be paired or presented as a known market.
  if (!input.family) {
    blocked.push("FAMILY_UNKNOWN");
    return unavailable(blocked, validated);
  }

  // ── Sportsbook side ─────────────────────────────────────────────────────────────────────────
  let hasSportsbook = true;
  const book = input.sportsbook;
  if (!book || !book.present) {
    blocked.push("NO_SPORTSBOOK_MARKET");
    hasSportsbook = false;
  } else {
    // Zero is not a price and null is not a line. Both must fail rather than render as numbers.
    const priceUnusable = book.americanOdds === null || book.americanOdds === 0;
    const lineUnusable = book.requiresLine === true && (book.line === null || book.line === undefined);
    if (priceUnusable || lineUnusable) {
      blocked.push("MARKET_INCOMPLETE");
      hasSportsbook = false;
    }
    // Freshness is an ARTIFACT property (see ./freshness). A snapshot from an earlier slate is real
    // history but not a current market, so it may not stand as today's sportsbook side.
    if (hasSportsbook && (!input.freshness || !input.freshness.isCurrent)) {
      blocked.push("ARTIFACT_NOT_CURRENT");
      hasSportsbook = false;
    }
  }

  // ── Model side ──────────────────────────────────────────────────────────────────────────────
  let hasModel = true;
  // Sport capability is authoritative for forward-looking output. A sport with live sportsbook
  // markets but no validated model gets market context and no prediction — which is precisely how
  // a sportsbook-only sport should behave.
  if (!canShowLiveProjections(input.sport)) {
    blocked.push("SPORT_NOT_MODEL_ELIGIBLE");
    hasModel = false;
  }
  if (hasModel) {
    const familyModeled = isPlayer
      ? modelSupportsPlayerFamily(playerFamily, input.sport)
      : modelSupportsGameFamily(gameFamily, input.sport);
    if (!familyModeled) {
      blocked.push("NO_MODEL_FAMILY");
      hasModel = false;
    }
  }
  if (hasModel) {
    if (!input.model || !input.model.present) {
      blocked.push("MODEL_ARTIFACT_MISSING");
      hasModel = false;
    } else if (input.model.supportsThreshold === false) {
      blocked.push("THRESHOLD_UNSUPPORTED");
      hasModel = false;
    }
  }

  // ── Team attribution: a FULL_COMPARISON-only requirement ────────────────────────────────────
  // Pairing a model projection to a market price asserts "this player, on this team, in this game".
  // Without team evidence that assertion is unsupported, so comparison is withheld. The sportsbook
  // line itself remains real and showable — the row degrades to market context rather than
  // vanishing, since player name, game and price are all still known.
  if (isPlayer && hasModel && hasSportsbook && !isPublishableTeamMapping(input.teamMapping ?? "UNRESOLVED")) {
    blocked.push("TEAM_UNRESOLVED");
    hasModel = false;
  }

  if (hasModel && hasSportsbook) {
    return { mode: "FULL_COMPARISON", blockedBy: [], hasModel, hasSportsbook, modelValidatedAgainstMarket: validated };
  }
  if (hasModel) {
    return { mode: "MODEL_ONLY", blockedBy: blocked, hasModel, hasSportsbook, modelValidatedAgainstMarket: validated };
  }
  if (hasSportsbook) {
    return { mode: "SPORTSBOOK_ONLY", blockedBy: blocked, hasModel, hasSportsbook, modelValidatedAgainstMarket: validated };
  }
  return unavailable(blocked, validated);
}

// ── Coverage census ─────────────────────────────────────────────────────────────────────────────

export interface PairingCensus {
  readonly total: number;
  readonly byMode: Record<IntelligenceMode, number>;
  /** How many rows each gate removed capability from. Rows can appear under several gates. */
  readonly byGate: Partial<Record<PairingGate, number>>;
}

/**
 * Tally modes and gates across a slate.
 *
 * The gate histogram is the point. A bare "N of M rows are comparable" invites the reading that the
 * shortfall is a defect; attributing every dropped row to a named gate shows which shortfalls are
 * missing data (a posted lineup that has not gone up yet) and which are honest scope (a family
 * GameTimePicks does not model, and should not pretend to).
 */
export function censusPairing(results: ReadonlyArray<MarketIntelligence>): PairingCensus {
  const byMode: Record<IntelligenceMode, number> = {
    FULL_COMPARISON: 0,
    MODEL_ONLY: 0,
    SPORTSBOOK_ONLY: 0,
    UNAVAILABLE: 0,
  };
  const byGate: Partial<Record<PairingGate, number>> = {};
  for (const r of results) {
    byMode[r.mode] += 1;
    for (const g of r.blockedBy) byGate[g] = (byGate[g] ?? 0) + 1;
  }
  return { total: results.length, byMode, byGate };
}
