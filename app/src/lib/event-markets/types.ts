/**
 * SPORTS EVENT-INTELLIGENCE domain model + provider-neutral adapter contract.
 *
 * This is a SEPARATE system from the per-game prop simulator. Event contracts (Kalshi/Polymarket-style) resolve on
 * news + rules over long horizons, not box scores, so they get their own entities: a market, its price snapshots, an
 * evidence timeline with source reliability, an independent outcome estimate (which may be "NOT YET MODELED"), and a
 * resolution record. See docs/SPORTS_EVENT_INTELLIGENCE_ARCHITECTURE.md.
 *
 * Types + contracts only. READ-ONLY: no trading, no wallet, no order placement. No probability is produced here.
 */
import type { ModelabilityClass } from "./modelability-contract";

export type Platform = "kalshi" | "polymarket" | "internal_fixture" | "other";
export type MarketStatus = "open" | "closing_soon" | "closed" | "resolved" | "void";

export interface EventEntity {
  entityId: string;
  kind: "player" | "team" | "coach" | "executive" | "league" | "tournament" | "other";
  name: string;
  /** Optional cross-references into existing identity registries (sport-identity.ts) — never invented. */
  refs?: Record<string, string>;
}

export interface EventOutcome {
  outcomeId: string;
  label: string;
  /** True only if the platform's outcome set is collectively exhaustive + mutually exclusive. */
  isResidual?: boolean;
}

export interface EventMarket {
  marketId: string;
  platform: Platform;
  question: string;
  category: string; // maps to EventCategory in the modelability contract
  sport: string | null;
  league: string | null;
  entities: EventEntity[];
  outcomes: EventOutcome[];
  opensAt: string | null;
  closesAt: string | null;
  resolutionDeadline: string | null;
  resolutionRules: string; // the platform's precise resolution criteria (verbatim, cited)
  resolutionSource: string; // who/what officially resolves it
  status: MarketStatus;
  providerUrl: string | null;
}

export interface MarketSnapshot {
  marketId: string;
  capturedAt: string; // when WE captured it (provenance)
  outcomePrices: Record<string, number>; // outcomeId -> implied probability 0..1 (platform mid/last)
  bidAsk?: Record<string, { bid: number | null; ask: number | null }>;
  volume: number | null;
  liquidity: number | null;
  source: Platform;
}

export type ReliabilityTier = "official" | "tier1_reporter" | "reputable_outlet" | "aggregator" | "social_unverified";

export interface EvidenceItem {
  evidenceId: string;
  marketId: string;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null; // when the SOURCE published — required for a timeline; null ⇒ not usable as timed evidence
  capturedAt: string; // when WE captured it
  reliabilityTier: ReliabilityTier;
  entities: string[]; // entityIds referenced
  claim: string;
  /** Which outcomes this evidence points toward, and how strongly (-1..1). Never a probability. */
  directionByOutcome: Record<string, number>;
  confidence: number; // 0..1 — our confidence the evidence is real + relevant (NOT the outcome probability)
  expiresAt: string | null; // when the claim goes stale
}

export interface OutcomeEstimate {
  marketId: string;
  generatedAt: string;
  outcome: string; // outcomeId
  /** null until a validated engine exists — the honest default is NOT YET MODELED. */
  estimatedProbability: number | null;
  marketProbability: number | null;
  differencePts: number | null; // neutral difference; NEVER labelled "edge"
  evidenceCompleteness: number; // 0..1 — how much of the needed evidence we actually have
  forecastConfidence: number | null; // confidence in the estimate (null when NOT YET MODELED)
  contractConfidence: number; // confidence we understand the CONTRACT (rules/resolution) itself
  modelability: ModelabilityClass;
  estimateStatus: "NOT_YET_MODELED" | "MODELED";
  explanationVersion: string;
}

export interface ResolutionRecord {
  marketId: string;
  resolvedOutcome: string | null;
  resolvedAt: string | null;
  source: string | null;
  ruleVersion: string | null;
}

/**
 * Provider-neutral READ-ONLY adapter. Implementations map a platform's API to these shapes. They NEVER trade, place
 * orders, connect wallets, or write to a platform. Fields a platform does not expose are returned null (never faked).
 * See docs/SPORTS_EVENT_INTELLIGENCE_ARCHITECTURE.md for the per-provider legal/ToS/auth caveats.
 */
export interface MarketDataAdapter {
  readonly platform: Platform;
  /** Static metadata for a market (question, outcomes, rules, resolution). */
  fetchMarket(marketId: string): Promise<EventMarket>;
  /** A point-in-time price/liquidity snapshot, stamped with capturedAt. */
  fetchSnapshot(marketId: string): Promise<MarketSnapshot>;
  /** Optional: list markets for discovery (may be unsupported → returns []). */
  listMarkets?(query: { sport?: string; category?: string; limit?: number }): Promise<EventMarket[]>;
  /** Documents what this adapter cannot do (auth, rate limits, ToS, unavailable fields). */
  readonly capabilities: {
    priceHistory: boolean;
    orderBook: boolean;
    resolutionRules: boolean;
    requiresAuth: boolean;
    notes: string;
  };
}
