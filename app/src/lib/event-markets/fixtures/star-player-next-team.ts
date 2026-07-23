/**
 * FIXTURE — "Star Player Next Team". Entirely SYNTHETIC and clearly labelled: not live, not public, not a prediction,
 * and NOT a real current person (the entity is a placeholder "Player X"). Used only by the internal event-market
 * preview prototype + its test to demonstrate the view-model states without any live data or fabricated probability.
 */
import type { EventMarket, MarketSnapshot, EvidenceItem } from "../types";

export const FIXTURE_MARKET: EventMarket = {
  marketId: "fixture:star-player-next-team",
  platform: "internal_fixture",
  question: "[FIXTURE] Which team will Player X sign with next?",
  category: "player_movement",
  sport: "basketball",
  league: "example-league",
  entities: [{ entityId: "player-x", kind: "player", name: "Player X (fixture)" }],
  outcomes: [
    { outcomeId: "team-a", label: "Team A" },
    { outcomeId: "team-b", label: "Team B" },
    { outcomeId: "team-c", label: "Team C" },
    { outcomeId: "field", label: "Any other team / no signing", isResidual: true },
  ],
  opensAt: "2026-07-01T00:00:00Z",
  closesAt: "2026-08-15T00:00:00Z",
  resolutionDeadline: "2026-08-31T00:00:00Z",
  resolutionRules: "[FIXTURE] Resolves to the team that officially announces Player X's signing before the deadline; 'field' if no listed team signs them.",
  resolutionSource: "official league transaction log (fixture)",
  status: "open",
  providerUrl: null,
};

export const FIXTURE_SNAPSHOT: MarketSnapshot = {
  marketId: FIXTURE_MARKET.marketId,
  capturedAt: "2026-07-22T18:00:00Z",
  outcomePrices: { "team-a": 0.42, "team-b": 0.33, "team-c": 0.15, field: 0.10 },
  volume: 125000,
  liquidity: 42000,
  source: "internal_fixture",
};

export const FIXTURE_EVIDENCE: EvidenceItem[] = [
  {
    evidenceId: "ev-1", marketId: FIXTURE_MARKET.marketId, source: "Fixture Beat Reporter", sourceUrl: null,
    publishedAt: "2026-07-20T14:00:00Z", capturedAt: "2026-07-20T14:05:00Z", reliabilityTier: "tier1_reporter",
    entities: ["player-x"], claim: "[FIXTURE] Reporter says Team A has made the strongest offer.",
    directionByOutcome: { "team-a": 0.6, "team-b": -0.2, "team-c": -0.2, field: -0.2 }, confidence: 0.7,
    expiresAt: "2026-08-15T00:00:00Z",
  },
  {
    evidenceId: "ev-2", marketId: FIXTURE_MARKET.marketId, source: "Fixture Cap Analyst", sourceUrl: null,
    publishedAt: "2026-07-21T09:00:00Z", capturedAt: "2026-07-21T09:10:00Z", reliabilityTier: "reputable_outlet",
    entities: ["player-x"], claim: "[FIXTURE] Team B has the cap space to match any offer.",
    directionByOutcome: { "team-a": -0.1, "team-b": 0.4, "team-c": 0, field: 0 }, confidence: 0.6,
    expiresAt: "2026-08-15T00:00:00Z",
  },
  {
    evidenceId: "ev-3", marketId: FIXTURE_MARKET.marketId, source: "Fixture Social (unverified)", sourceUrl: null,
    publishedAt: "2026-07-22T02:00:00Z", capturedAt: "2026-07-22T02:03:00Z", reliabilityTier: "social_unverified",
    entities: ["player-x"], claim: "[FIXTURE] Unverified rumor of a Team C meeting.",
    directionByOutcome: { "team-c": 0.3 }, confidence: 0.2, expiresAt: "2026-07-25T00:00:00Z",
  },
];
