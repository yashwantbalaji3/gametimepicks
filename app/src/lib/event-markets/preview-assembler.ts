/**
 * Internal event-market PREVIEW assembler. Turns a market + a price snapshot + an evidence list into the prototype
 * view-model: market probabilities, an evidence timeline with source reliability, a modelability score, a scenario
 * tree, and per-outcome estimates. It produces NO independent probability — the honest first state is
 * `estimateStatus: "NOT_YET_MODELED"` with `estimatedProbability: null`. Never inserts an arbitrary percentage.
 *
 * Pure + deterministic. Internal only (a future thin route under a pruned path renders this; it is never public).
 */
import type { EventMarket, MarketSnapshot, EvidenceItem, OutcomeEstimate } from "./types";
import { scoreModelability, type EventCategory } from "./modelability-contract";

export interface PreviewViewModel {
  public: false;
  fixture: boolean;
  disclaimer: string;
  market: EventMarket;
  latestSnapshot: MarketSnapshot | null;
  modelability: ReturnType<typeof scoreModelability>;
  estimates: OutcomeEstimate[];
  evidenceTimeline: Array<EvidenceItem & { usableAsTimedEvidence: boolean }>;
  scenarioTree: Array<{ outcome: string; label: string; marketProbability: number | null; supporting: string[]; opposing: string[] }>;
  updateHistory: Array<{ capturedAt: string; kind: "snapshot" | "evidence"; ref: string }>;
}

const DISCLAIMER =
  "Internal fixture preview. Not live, not public, not a prediction. Market data + evidence + rules are organized here; " +
  "the independent estimate is NOT YET MODELED — no probability is asserted until a validated engine + founder approval exist.";

/** Evidence completeness for an outcome: how much reliable, unexpired, non-social evidence touches it (0..1). */
function evidenceCompletenessFor(outcomeId: string, evidence: EvidenceItem[]): number {
  const touching = evidence.filter((e) => outcomeId in e.directionByOutcome && e.publishedAt != null);
  if (touching.length === 0) return 0;
  const weight = touching.reduce((a, e) => a + (e.reliabilityTier === "social_unverified" ? 0.1 : e.confidence), 0);
  return Math.max(0, Math.min(1, weight / 2)); // ~2 solid pieces of evidence ⇒ "complete"
}

export function assemblePreview(
  input: { market: EventMarket; snapshot: MarketSnapshot | null; evidence: EvidenceItem[] },
  opts: { fixture?: boolean } = {},
): PreviewViewModel {
  const { market, snapshot, evidence } = input;
  const modelability = scoreModelability({
    category: market.category as EventCategory,
    dimensions: {
      outcomeClarity: market.outcomes.length > 0 ? 4 : 1,
      ruleClarity: market.resolutionRules ? 4 : 1,
      outcomeExhaustiveness: market.outcomes.some((o) => o.isResidual) ? 5 : 3,
      liquidity: snapshot?.liquidity != null ? Math.min(5, Math.round((snapshot.liquidity / 20000) * 5)) : 2,
    },
  });

  const contractConfidence = market.resolutionRules && market.resolutionSource && market.resolutionDeadline ? 0.8 : 0.4;

  const estimates: OutcomeEstimate[] = market.outcomes.map((o) => ({
    marketId: market.marketId,
    generatedAt: snapshot?.capturedAt ?? market.opensAt ?? "",
    outcome: o.outcomeId,
    estimatedProbability: null, // NOT YET MODELED — never an arbitrary number
    marketProbability: snapshot?.outcomePrices?.[o.outcomeId] ?? null,
    differencePts: null,
    evidenceCompleteness: Number(evidenceCompletenessFor(o.outcomeId, evidence).toFixed(2)),
    forecastConfidence: null,
    contractConfidence,
    modelability: modelability.classification,
    estimateStatus: "NOT_YET_MODELED",
    explanationVersion: "preview-0",
  }));

  const evidenceTimeline = evidence
    .map((e) => ({ ...e, usableAsTimedEvidence: e.publishedAt != null }))
    .sort((a, b) => String(a.publishedAt ?? a.capturedAt).localeCompare(String(b.publishedAt ?? b.capturedAt)));

  const scenarioTree = market.outcomes.map((o) => ({
    outcome: o.outcomeId,
    label: o.label,
    marketProbability: snapshot?.outcomePrices?.[o.outcomeId] ?? null,
    supporting: evidence.filter((e) => (e.directionByOutcome[o.outcomeId] ?? 0) > 0).map((e) => e.evidenceId),
    opposing: evidence.filter((e) => (e.directionByOutcome[o.outcomeId] ?? 0) < 0).map((e) => e.evidenceId),
  }));

  const updateHistory = [
    ...(snapshot ? [{ capturedAt: snapshot.capturedAt, kind: "snapshot" as const, ref: "price" }] : []),
    ...evidence.map((e) => ({ capturedAt: e.capturedAt, kind: "evidence" as const, ref: e.evidenceId })),
  ].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

  return { public: false, fixture: opts.fixture ?? true, disclaimer: DISCLAIMER, market, latestSnapshot: snapshot, modelability, estimates, evidenceTimeline, scenarioTree, updateHistory };
}
