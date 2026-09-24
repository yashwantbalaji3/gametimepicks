/**
 * THE PREDICTION PRESENTATION CONTRACT — one grammar for every published player prediction.
 *
 * WHY IT EXISTS. The NFL surfaces disagreed about what a player prediction looks like. The Endzone
 * Vault printed a portrait, the player's position and club, the game, a probability and a playing-time
 * state. The five weekly top boards — the SAME model, the same players, often the same game — printed a
 * rank, a name, "TEAM vs OPP" and one number. One read as a finished product; four read as a research
 * table someone forgot to design.
 *
 * WHAT THE AUDIT FOUND, AND IT IS THE POINT. The weekly-board artifact ALREADY carries the kickoff, the
 * p10/median/p90 range, the participation state and a typed pricing state on every row. The renderer
 * dropped all four. So this is not new data and it is not model work: it is the read model the surfaces
 * should always have shared, and one renderer over it.
 *
 * FOUR KINDS OF TRUTH, AND THEY NEVER OVERWRITE EACH OTHER. The product contract separates the pre-game
 * model forecast (immutable, ours), the frozen pre-game market (an immutable snapshot of a book's price
 * at capture time, theirs), live factual event state (ephemeral, the provider's) and final settlement
 * (canonical). This type keeps them in separate slots for exactly that reason: `model` and `market` are
 * different fields with different owners, and nothing here derives one from the other. The live slots are
 * declared and deliberately NOT implemented — see `live` below.
 *
 * WHAT THIS MODULE WILL NOT DO. It never invents a line, a price, a probability or a book. A family with
 * no approved market capture gets a TYPED ABSENCE that renders as words, never a blank that reads as
 * zero and never a current price standing in for the price at publication.
 */

/** A sport key, as the capability registry spells it. */
export type PresentationSport = "nfl" | "mlb" | "epl" | "ufc";

// ── MARKET ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Why no price is shown. Every value is a statement a reader can act on, and each maps from a real
 * owner's own field — none is inferred from the absence of data.
 *
 *   FROZEN_CAPTURE   a real captured price. The ONLY state that carries numbers.
 *   NOT_AUTHORIZED   the capture lane holds no live authorization for this family. Maps from the
 *                    weekly-board row's own `pricingState`, which the builder stamps because the
 *                    P171 NFL odds authorization is expired.
 *   NOT_OFFERED      we asked and the book does not offer it. Maps from a capture's `absentMarkets`.
 *   NOT_PROBED       we have never asked. Maps from a capture's `propMarkets.state`.
 *   UNSUPPORTED      the family has no market counterpart to show.
 */
export type MarketState =
  | "FROZEN_CAPTURE"
  | "NOT_AUTHORIZED"
  | "NOT_OFFERED"
  | "NOT_PROBED"
  | "UNSUPPORTED";

/** American odds, kept as the integer the book published (+125, -110). Never derived, never rounded. */
export type AmericanOdds = number;

/**
 * A FROZEN pre-game market snapshot. Present only when `state === "FROZEN_CAPTURE"`.
 *
 * `capturedAt` is load-bearing and required: a price without the instant it was taken cannot be
 * distinguished from a live line, and showing a live line as though it were the line at publication is
 * the specific error this shape exists to make impossible.
 */
export interface FrozenMarket {
  /** The line itself — 71.5 receiving yards, 6.5 receptions. Absent for a pure yes/no market. */
  line?: number;
  overOdds?: AmericanOdds;
  underOdds?: AmericanOdds;
  /** For a yes/no market (anytime touchdown), the single price. */
  yesOdds?: AmericanOdds;
  /** The book this price came from, named. Never "consensus" unless the owner says consensus. */
  sportsbook: string;
  /** ISO instant the price was captured. Required — see above. */
  capturedAt: string;
}

export interface MarketSnapshot {
  state: MarketState;
  /** One short line of plain English for a reader. Present for every non-FROZEN state. */
  note?: string;
  frozen?: FrozenMarket;
}

/** The reader-facing wording for each absence. Short, factual, never apologetic and never a tease. */
const MARKET_NOTE: Record<Exclude<MarketState, "FROZEN_CAPTURE">, string> = {
  NOT_AUTHORIZED: "No sportsbook price — we hold no current pricing authorization for this market.",
  NOT_OFFERED: "No sportsbook price — our books do not offer this market.",
  NOT_PROBED: "No sportsbook price — this market has not been checked.",
  UNSUPPORTED: "No sportsbook price for this kind of prediction.",
};

/**
 * Build the market slot from an owner's own typed state.
 *
 * Deliberately total and deliberately fail-closed: an unrecognised state becomes NOT_PROBED (we do not
 * know that we asked) rather than being dropped, because a dropped market slot renders as nothing and
 * nothing reads as "there is no market", which is a claim we would not have measured.
 */
export function marketFromPricingState(pricingState: string | null | undefined): MarketSnapshot {
  const s = String(pricingState ?? "").trim().toUpperCase();
  const state: MarketState =
    s === "NOT_AUTHORIZED" ? "NOT_AUTHORIZED"
      : s === "NOT_OFFERED" ? "NOT_OFFERED"
        : s === "UNSUPPORTED" ? "UNSUPPORTED"
          : "NOT_PROBED";
  return { state, note: MARKET_NOTE[state as Exclude<MarketState, "FROZEN_CAPTURE">] };
}

/** A frozen capture, from a real owner. The only path that produces numbers. */
export function marketFromFrozenCapture(frozen: FrozenMarket): MarketSnapshot {
  if (!frozen.sportsbook || !frozen.capturedAt) {
    throw new Error("a frozen market must name its book and its capture instant — an unattributed price is not a fact");
  }
  return { state: "FROZEN_CAPTURE", frozen };
}

// ── MODEL ────────────────────────────────────────────────────────────────────────────────────────────

/** What kind of number the model publishes. A family is one or the other, never both at once. */
export type PredictionKind = "PROBABILITY" | "NUMERIC";

/**
 * The publication state, carried through from the board owner rather than re-derived.
 * PUBLISHED cleared every bar; ESTIMATE carries real numbers WITH the bar it failed and a caveat.
 */
export type ModelStatus = "PUBLISHED" | "ESTIMATE";

export interface ModelForecast {
  kind: PredictionKind;
  /** PROBABILITY only: 0–1. Never present on a NUMERIC family. */
  probability?: number;
  /** NUMERIC only: the published central value, already at the owner's display precision. */
  predictedValue?: number;
  /** "yds", "rec" — the unit the value is in. Absent for a probability. */
  unit?: string;
  /** The 10th/90th percentile band, where the family publishes one. Both or neither. */
  p10?: number;
  p90?: number;
  status: ModelStatus;
  /** Present when status is ESTIMATE: what the reader should not do with the number. */
  caveat?: string;
  /** Present when status is ESTIMATE: the bar the family failed, in the owner's words. */
  reason?: string;
  modelId: string;
  modelVersion: number | string;
  /** The instant the forecast set was stamped. */
  forecastAt: string;
}

// ── IDENTITY · GAME · THE WHOLE CARD ────────────────────────────────────────────────────────────────

export interface PlayerIdentity {
  /** The canonical player id in this repo's lineage, e.g. "nfl-athlete-4430878". */
  playerId: string;
  name: string;
  /** Club abbreviation, as the board spells it. */
  teamAbbr: string;
  /**
   * The numeric provider athlete id the canonical portrait owner takes, or null when the lineage does
   * not yield one. Null is a real answer: the avatar falls to its initials disc, which is the same
   * policy every other sport uses, and the layout does not move.
   */
  portraitId: number | null;
}

export interface GameContext {
  /** The opposing club abbreviation. */
  opponentAbbr: string;
  /** The provider event id, which is also the route segment for the game page. */
  providerEventId: string;
  /** ISO kickoff. Formatting to ET is the renderer's job, once. */
  startTimeUtc: string;
  /** The board owner's participation state, carried through unchanged. */
  participation: string;
}

/**
 * The live slots, DECLARED AND NOT IMPLEMENTED.
 *
 * A later release adds factual live state (the stat so far) and, separately and only if separately
 * approved, a live market line. They are typed here so that the card can grow into them without the
 * frozen forecast or the frozen line being rewritten to make room — the whole point of keeping the
 * pre-game truths immutable. Nothing in this release populates them, and nothing derives a live
 * probability, an updated projection, an "on track" reading or a live edge from anything.
 */
export interface LiveSlots {
  factual?: never;
  market?: never;
}

export interface PredictionPresentation {
  sport: PresentationSport;
  /** Stable within a board render: the family plus the player plus the event. */
  predictionId: string;
  /** The market family key, e.g. "player_reception_yds". */
  marketFamily: string;
  /** The reader-facing family name, e.g. "Receiving yards". */
  marketLabel: string;
  player: PlayerIdentity;
  game: GameContext;
  market: MarketSnapshot;
  model: ModelForecast;
  live?: LiveSlots;
}
