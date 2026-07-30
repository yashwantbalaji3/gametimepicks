/**
 * CANONICAL SPORTSBOOK MARKET DOMAIN (Sprint 028 · Phase 1).
 *
 * One provider-agnostic shape for every sportsbook market this repo can honestly represent, so no
 * consumer surface ever parses a provider payload. What this layer may contain is bounded by
 * docs/SPORTSBOOK_COVERAGE_MATRIX.md — measured from live artifacts, not from provider docs:
 *
 *   · game families are MONEYLINE / RUN_LINE / TOTAL only — the live artifact has no team total
 *   · there is NO row-level capture timestamp, so freshness is an ARTIFACT property (see Phase 3)
 *   · there is NO snapshot history, so this domain has no opening line and no movement concept
 *   · player props carry `team: null` on every row, so team attribution is a resolved STATE here,
 *     never an assumption
 *
 * The deliberate omissions are the point. A type cannot carry `openingLine` or `movement`, so no
 * surface can render one by accident — the absence is enforced by the domain, not by discipline.
 */

/**
 * Game-level market families across the sports this domain can represent.
 *
 * `RUN_LINE` is baseball's fixed 1.5 line; `SPREAD` is the variable point spread every other sport
 * posts. They are separate families rather than one "handicap" because they are not the same market
 * — a run line does not move, a spread does, and collapsing them would make "the line moved" an
 * expressible claim about MLB. Which sport OFFERS which family is `sport-config.ts`'s answer, not
 * this union's: representable and offered are different questions, exactly as they are for props.
 */
export type GameMarketFamily = "MONEYLINE" | "RUN_LINE" | "SPREAD" | "TOTAL";

/**
 * Player prop families, normalized from the provider's market strings. Normalization capability is
 * deliberately INDEPENDENT of model-comparison capability: the book offers eight families and the
 * model covers four, so every offered family is representable here as market context even when no
 * model exists to pair with it. Pairing is decided elsewhere (Phase 5).
 */
export type PlayerMarketFamily =
  | "PITCHER_STRIKEOUTS"
  | "PITCHER_OUTS"
  | "PITCHER_EARNED_RUNS"
  | "BATTER_HITS"
  | "BATTER_TOTAL_BASES"
  | "BATTER_HOME_RUNS"
  | "BATTER_RBIS"
  | "BATTER_RUNS_SCORED"
  /**
   * MODEL-SIDE ONLY. GameTimePicks projects hits+runs+RBIs; the book does not post it on this
   * slate, so it has no provider key and can never arrive from a provider payload.
   *
   * It belongs here anyway. Defining the vocabulary purely from what the book sells would make a
   * modeled family literally unrepresentable, and "unrepresentable" renders as "absent" — the
   * MODEL_ONLY mode would be structurally unreachable rather than merely empty. A family we model
   * and nobody prices is a real state worth naming.
   */
  | "BATTER_HITS_RUNS_RBIS";

/** Which side of a two-sided market a price belongs to. */
export type MarketSide = "HOME" | "AWAY" | "OVER" | "UNDER";

/**
 * Whether a market is usable. `UNSUPPORTED` is for a family this domain does not model;
 * `MALFORMED` is for a row that exists but whose price/line could not be read. Both fail closed —
 * neither is ever coerced into a number.
 */
export type MarketStatus = "OK" | "UNAVAILABLE" | "UNSUPPORTED" | "MALFORMED";

/**
 * How confidently a market row is attached to a real entity.
 *
 * Player props arrive with `team: null`, so `UNRESOLVED` is the honest default until the Phase 4
 * resolver runs. `RESOLVED_FROM_GAME` records that the attachment was derived rather than stated by
 * the provider — a distinction a consumer surface is entitled to see.
 */
export type MappingStatus = "EXACT" | "RESOLVED_FROM_GAME" | "AMBIGUOUS" | "UNRESOLVED";

/** A single priced selection. `null` price means unavailable — never zero. */
export interface MarketPrice {
  readonly side: MarketSide;
  /** American odds as stored by the provider. Null when absent or unreadable. */
  readonly americanOdds: number | null;
  /** Raw implied probability, when the artifact already provides it. Never recomputed here. */
  readonly impliedProb: number | null;
  /**
   * Vig-removed probability, when the artifact already provides it. This is carried through, NOT
   * derived — the existing pipeline computes it, and inventing a second methodology would create
   * two numbers that disagree. Null for markets where the artifact has none (e.g. player props).
   */
  readonly noVigProb: number | null;
  readonly status: MarketStatus;
}

/** Provenance shared by every canonical market: where it came from and when the FILE was made. */
export interface MarketProvenance {
  /** The artifact's date key (its slate date), e.g. "2026-07-26". */
  readonly artifactDate: string;
  /** The artifact's own generation timestamp. The ONLY timestamp that exists — no row-level one. */
  readonly artifactGeneratedAt: string | null;
  /** Provider / book identity as recorded by the artifact. */
  readonly source: string | null;
  /** Named book when the artifact identifies one (game markets do; props give a provider string). */
  readonly book: string | null;
  /** Repo-relative path of the artifact this market was read from, for audit. */
  readonly artifactRef: string;
}

export interface SportsbookGameMarket {
  readonly kind: "game";
  readonly sport: string;
  readonly league: string;
  readonly eventId: string;
  readonly eventStart: string | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly family: GameMarketFamily;
  /** Total / run-line number. Null for moneyline, and null (never 0) when absent. */
  readonly line: number | null;
  readonly prices: ReadonlyArray<MarketPrice>;
  readonly status: MarketStatus;
  readonly mapping: MappingStatus;
  readonly provenance: MarketProvenance;
}

export interface SportsbookPlayerMarket {
  readonly kind: "player";
  readonly sport: string;
  readonly league: string;
  readonly eventId: string;
  readonly eventStart: string | null;
  readonly playerName: string;
  /** Canonical player id when one is known. The live artifact does not supply one. */
  readonly playerId: string | null;
  /**
   * Team attribution. Null on every live row today; `mapping` records WHY, so a consumer can tell
   * "not yet resolved" apart from "resolved to nothing".
   */
  readonly team: string | null;
  readonly opponent: string | null;
  /**
   * Canonical family, or NULL when the provider offered a family this domain does not model.
   * Nullable on purpose: a placeholder value here would eventually be read as if it were real.
   * `providerFamily` always preserves what the book actually said.
   */
  readonly family: PlayerMarketFamily | null;
  /** The provider's original market string, kept for audit and for families we do not normalize. */
  readonly providerFamily: string;
  readonly line: number | null;
  readonly prices: ReadonlyArray<MarketPrice>;
  readonly status: MarketStatus;
  readonly mapping: MappingStatus;
  readonly provenance: MarketProvenance;
}

export type SportsbookMarket = SportsbookGameMarket | SportsbookPlayerMarket;

/** Provider market string → canonical player family. Anything absent fails closed as unsupported. */
export const PLAYER_FAMILY_BY_PROVIDER_KEY: Readonly<Record<string, PlayerMarketFamily>> = {
  pitcher_strikeouts: "PITCHER_STRIKEOUTS",
  pitcher_outs: "PITCHER_OUTS",
  pitcher_earned_runs: "PITCHER_EARNED_RUNS",
  batter_hits: "BATTER_HITS",
  batter_total_bases: "BATTER_TOTAL_BASES",
  batter_home_runs: "BATTER_HOME_RUNS",
  batter_rbis: "BATTER_RBIS",
  batter_runs_scored: "BATTER_RUNS_SCORED",
};

/**
 * Canonical player family → the provider key it came from.
 *
 * PARTIAL on purpose. A model-side-only family has no provider key, and typing this as total would
 * be a lie the compiler enforces on everyone else: callers would read `undefined` through a
 * `string` annotation and pass it into a join, where it matches nothing in a way no test catches.
 */
export const PROVIDER_KEY_BY_PLAYER_FAMILY: Readonly<Partial<Record<PlayerMarketFamily, string>>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(PLAYER_FAMILY_BY_PROVIDER_KEY).map(([k, v]) => [v, k]),
    ) as Partial<Record<PlayerMarketFamily, string>>,
  );

/**
 * Canonical player family → the key model artifacts and the calibration registry are keyed by.
 *
 * A superset of the provider map: identical wherever the book prices a family, plus the modeled
 * families it does not price. Kept separate because "what the book calls this" and "what our model
 * artifact calls this" are different questions that happen to share an answer most of the time —
 * collapsing them would silently break the moment they diverge.
 */
export const MODEL_KEY_BY_PLAYER_FAMILY: Readonly<Partial<Record<PlayerMarketFamily, string>>> =
  Object.freeze({
    ...PROVIDER_KEY_BY_PLAYER_FAMILY,
    BATTER_HITS_RUNS_RBIS: "batter_hits_runs_rbis",
  });

/** True when a canonical market is usable by a consumer surface. */
export function isUsable(m: SportsbookMarket): boolean {
  return m.status === "OK";
}
