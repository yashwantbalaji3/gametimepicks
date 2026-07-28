/**
 * market-coverage — the honest answer to "what can this site actually tell me right now?"
 *
 * WHY THIS EXISTS
 * `buildAllGameDetails()` already builds canonical `GameIntelligence` for every MLB game and hangs
 * it on `PublicGameDetail.marketIntelligence`. `/today` and the homepage never read it. So the two
 * surfaces a user actually lands on could not say whether a sportsbook line existed, whether a
 * model artifact existed, when the book was last captured, or WHY a market was missing — while the
 * data answering all four sat one field away, already computed.
 *
 * This derives that answer at the slate level. It adds no data and fetches nothing; it reads what
 * the canonical layer already decided and counts it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It does not rank, score, or recommend. `modelValidatedAgainstMarket` is false for every MLB
 * family today — the modeled markets were demoted to market-context after backtesting — so a
 * coverage summary is a statement about AVAILABILITY, never about who is right. There is no
 * "model vs market" verdict here and there must not be one; presenting coverage as advantage is
 * the exact failure this file is shaped to prevent.
 *
 * FAIL CLOSED
 * A game with no `marketIntelligence` counts as UNAVAILABLE against the slate total, attributed to
 * an explicit gate. It is never dropped from the denominator — silently shrinking the denominator
 * is how a partial slate comes to look like full coverage.
 */

import type { GameIntelligence } from "../markets/game-intelligence";
import type { ArtifactFreshness } from "../markets/freshness";
import type { IntelligenceMode, MarketIntelligence, PairingGate } from "../markets/pairing";
import type { PublicGameDetail } from "../game-detail";

/** The three game-level families the canonical layer produces per event. */
export const GAME_FAMILIES = ["moneyline", "runLine", "total"] as const;
export type GameFamily = (typeof GAME_FAMILIES)[number];

export const FAMILY_LABEL: Record<GameFamily, string> = {
  moneyline: "Moneyline",
  runLine: "Run line",
  total: "Total",
};

/**
 * Reader-facing explanation for every gate.
 *
 * Phrased as a plain reason, not an apology or a promise. "We do not model this" and "the lineup is
 * not posted yet" are genuinely different facts and a reader deserves to be able to tell them
 * apart — that distinction is the whole reason gates are recorded instead of collapsed to a count.
 */
export const GATE_EXPLANATION: Record<PairingGate, string> = {
  SPORT_NOT_MODEL_ELIGIBLE: "This sport is not cleared for forward-looking model output.",
  FAMILY_UNKNOWN: "The sportsbook offered a market type this site does not normalize.",
  NO_SPORTSBOOK_MARKET: "No sportsbook line was captured for this market.",
  MARKET_INCOMPLETE: "The line or price could not be read, and is never guessed at.",
  NO_MODEL_FAMILY: "GameTimePicks does not model this market.",
  MODEL_ARTIFACT_MISSING: "The simulation this comparison needs has not been produced for this game.",
  THRESHOLD_UNSUPPORTED: "The simulation cannot evaluate the exact line the sportsbook posted.",
  ARTIFACT_NOT_CURRENT: "The captured snapshot is not current enough to sit beside a live line.",
  EVENT_UNRESOLVED: "This market could not be matched to a specific game.",
  TEAM_UNRESOLVED: "The player's team could not be established from the available evidence.",
  IDENTITY_AMBIGUOUS: "The evidence pointed at more than one player.",
};

/** Neutral, availability-only descriptions. No mode implies correctness — only what is showable. */
export const MODE_LABEL: Record<IntelligenceMode, string> = {
  FULL_COMPARISON: "Model and sportsbook",
  MODEL_ONLY: "Model only",
  SPORTSBOOK_ONLY: "Sportsbook only",
  UNAVAILABLE: "Not available",
};

export type ModeCounts = Record<IntelligenceMode, number>;

export interface FamilyCoverage {
  readonly family: GameFamily;
  readonly label: string;
  readonly counts: ModeCounts;
  /** Games where BOTH sides are showable. Availability, not accuracy. */
  readonly bothSides: number;
  /** Slate total — the denominator. Always every game, including the ones with nothing. */
  readonly total: number;
}

export interface GateTally {
  readonly gate: PairingGate;
  readonly explanation: string;
  readonly count: number;
}

export interface SnapshotSummary {
  readonly capturedAt: string | null;
  readonly captureLabel: string | null;
  readonly bookmaker: string | null;
  /** Canonical `ArtifactFreshness` state when the artifact supplied one. Null = no claim possible. */
  readonly freshness: ArtifactFreshness | null;
  /** Whole days between the artifact's slate date and today. Null when unknown. */
  readonly ageDays: number | null;
  /** True ONLY when the canonical layer says this snapshot may be shown as the current picture. */
  readonly isCurrent: boolean;
  readonly isHistorical: boolean;
}

export interface MarketCoverage {
  readonly slateDate: string | null;
  readonly totalGames: number;
  /** Games carrying canonical intelligence at all. */
  readonly gamesWithIntelligence: number;
  readonly families: ReadonlyArray<FamilyCoverage>;
  /** Why rows were withheld, most frequent first. Empty when nothing was blocked. */
  readonly gates: ReadonlyArray<GateTally>;
  readonly snapshot: SnapshotSummary;
  /**
   * False for every MLB family today. Exposed so a surface must read a real value rather than
   * assume, and so any copy implying a proven advantage has to walk past an explicit `false`.
   */
  readonly anyFamilyValidatedAgainstMarket: boolean;
  /** True when nothing at all is showable — surfaces render an honest empty state, not a blank. */
  readonly isEmpty: boolean;
}

const EMPTY_COUNTS = (): ModeCounts => ({
  FULL_COMPARISON: 0,
  MODEL_ONLY: 0,
  SPORTSBOOK_ONLY: 0,
  UNAVAILABLE: 0,
});

/** Read one family's gate off a `GameIntelligence`, tolerating absence without inventing a mode. */
function familyIntelligence(intel: GameIntelligence, family: GameFamily): MarketIntelligence | null {
  const block = intel[family] as { intelligence?: MarketIntelligence } | null | undefined;
  return block?.intelligence ?? null;
}

/**
 * Build the slate-wide coverage answer.
 *
 * `details` is the full slate — every game, not a filtered subset. Filtering before this point is
 * what produces a flattering denominator, so callers pass everything and let the gates explain the
 * shortfall.
 */
export function buildMarketCoverage(
  details: ReadonlyArray<PublicGameDetail>,
  slateDate: string | null,
): MarketCoverage {
  const totalGames = details.length;
  const gateCounts = new Map<PairingGate, number>();
  const families = GAME_FAMILIES.map((family) => ({
    family,
    label: FAMILY_LABEL[family],
    counts: EMPTY_COUNTS(),
    bothSides: 0,
    total: totalGames,
  }));

  let gamesWithIntelligence = 0;
  let anyValidated = false;
  let snapshot: SnapshotSummary = {
    capturedAt: null,
    captureLabel: null,
    bookmaker: null,
    freshness: null,
    ageDays: null,
    // Fail closed: with nothing read, a snapshot is NOT current.
    isCurrent: false,
    isHistorical: false,
  };
  let newestCapture = -Infinity;

  for (const detail of details) {
    const intel = detail.marketIntelligence ?? null;

    if (!intel) {
      // No canonical intelligence for this game. It still counts against every family's total —
      // dropping it would quietly overstate coverage.
      for (const f of families) f.counts.UNAVAILABLE += 1;
      gateCounts.set(
        "MODEL_ARTIFACT_MISSING",
        (gateCounts.get("MODEL_ARTIFACT_MISSING") ?? 0) + 1,
      );
      continue;
    }

    gamesWithIntelligence += 1;

    // Track the newest capture across the slate so provenance reflects the freshest real reading
    // rather than whichever game happened to sort first.
    const capturedAt = intel.snapshot?.capturedAt ?? null;
    const ts = capturedAt ? Date.parse(capturedAt) : NaN;
    if (Number.isFinite(ts) && ts > newestCapture) {
      newestCapture = ts;
      const reading = intel.snapshot?.freshness ?? null;
      snapshot = {
        capturedAt,
        captureLabel: intel.snapshot?.captureLabel ?? null,
        bookmaker: intel.snapshot?.bookmaker ?? null,
        freshness: reading?.state ?? null,
        ageDays: reading?.ageDays ?? null,
        // Never inferred from the date — only the canonical reading may assert currency.
        isCurrent: reading?.isCurrent === true,
        isHistorical: Boolean(detail.marketIsHistorical),
      };
    }

    for (const f of families) {
      const mi = familyIntelligence(intel, f.family);
      if (!mi) {
        f.counts.UNAVAILABLE += 1;
        continue;
      }
      f.counts[mi.mode] += 1;
      if (mi.hasModel && mi.hasSportsbook) f.bothSides += 1;
      if (mi.modelValidatedAgainstMarket) anyValidated = true;
      for (const gate of mi.blockedBy) {
        gateCounts.set(gate, (gateCounts.get(gate) ?? 0) + 1);
      }
    }
  }

  const gates: GateTally[] = [...gateCounts.entries()]
    .map(([gate, count]) => ({ gate, explanation: GATE_EXPLANATION[gate], count }))
    // Most frequent first; ties broken by name so the order is deterministic across builds.
    .sort((a, b) => b.count - a.count || a.gate.localeCompare(b.gate));

  const showable = families.reduce(
    (n, f) => n + f.counts.FULL_COMPARISON + f.counts.MODEL_ONLY + f.counts.SPORTSBOOK_ONLY,
    0,
  );

  return {
    slateDate,
    totalGames,
    gamesWithIntelligence,
    families,
    gates,
    snapshot,
    anyFamilyValidatedAgainstMarket: anyValidated,
    isEmpty: totalGames === 0 || showable === 0,
  };
}

/**
 * One factual sentence for the coverage headline.
 *
 * States counts only. No comparative or evaluative language — a reader learns what exists, and
 * decides for themselves what it is worth.
 */
export function coverageHeadline(coverage: MarketCoverage): string {
  if (coverage.totalGames === 0) return "No games on this slate.";
  if (coverage.isEmpty) {
    return `No sportsbook or model data is available for the ${coverage.totalGames} game${
      coverage.totalGames === 1 ? "" : "s"
    } on this slate.`;
  }
  const ml = coverage.families.find((f) => f.family === "moneyline");
  const both = ml?.bothSides ?? 0;
  return `${coverage.totalGames} game${coverage.totalGames === 1 ? "" : "s"} on this slate · ${both} with both a model read and a sportsbook line.`;
}
