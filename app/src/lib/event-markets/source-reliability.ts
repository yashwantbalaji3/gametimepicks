/**
 * SOURCE-RELIABILITY framework for event-market evidence (Phase 13). Configurable tiers, versioned. Reliability is a
 * TIER, not a probability — and it never converts to one. Many low-quality sources do NOT aggregate up to one
 * authoritative source; copied reports are deduplicated; retractions/contradictions are represented. Reliability can
 * vary by sport/league/reporter domain via overrides. Pure + deterministic. No modeling.
 */
import type { ReliabilityTier } from "./types";

export const RELIABILITY_TIERS: Record<ReliabilityTier, { rank: number; label: string }> = {
  official: { rank: 1, label: "Official league/team/player/agent/transaction record" },
  tier1_reporter: { rank: 2, label: "Proven high-reliability national or team reporter" },
  reputable_outlet: { rank: 3, label: "Established outlet with sourced reporting" },
  aggregator: { rank: 4, label: "Aggregation or speculative commentary" },
  social_unverified: { rank: 5, label: "Unverified social source" },
};

export const SOURCE_RELIABILITY_VERSION = "source-reliability-1";

/** A source's assignment, optionally scoped to a sport/league/domain. Changes are versioned via `version`. */
export interface SourceAssignment {
  source: string;
  tier: ReliabilityTier;
  domain?: string; // e.g. "nba", "trades" — a source may be tier1 for one domain, aggregator for another
  version: string;
}

export interface ReliabilityConfig {
  assignments: SourceAssignment[];
  /** Default tier for an unknown source (conservative). */
  defaultTier?: ReliabilityTier;
}

/** Resolve a source's tier, preferring a domain-scoped assignment over a global one; unknown ⇒ conservative default. */
export function resolveTier(config: ReliabilityConfig, source: string, domain?: string): { tier: ReliabilityTier; rank: number; matched: "domain" | "global" | "default" } {
  const scoped = domain ? config.assignments.find((a) => a.source === source && a.domain === domain) : undefined;
  const global = config.assignments.find((a) => a.source === source && !a.domain);
  const a = scoped ?? global;
  const tier = a?.tier ?? config.defaultTier ?? "aggregator";
  return { tier, rank: RELIABILITY_TIERS[tier].rank, matched: scoped ? "domain" : global ? "global" : "default" };
}

/** True if `a` is at least as authoritative as `b` (lower rank = more authoritative). */
export function atLeastAsReliable(a: ReliabilityTier, b: ReliabilityTier): boolean {
  return RELIABILITY_TIERS[a].rank <= RELIABILITY_TIERS[b].rank;
}

/**
 * Deduplicate copied reports: items sharing a normalized claim + entity set collapse to the MOST authoritative one
 * (lowest rank). Returns the surviving representatives. Many aggregator copies never outrank one official source.
 */
export function dedupeEvidence<T extends { claim: string; entities: string[]; reliabilityTier: ReliabilityTier }>(items: T[]): T[] {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const byKey = new Map<string, T>();
  for (const it of items) {
    const key = `${norm(it.claim)}::${[...it.entities].sort().join(",")}`;
    const prev = byKey.get(key);
    if (!prev || RELIABILITY_TIERS[it.reliabilityTier].rank < RELIABILITY_TIERS[prev.reliabilityTier].rank) byKey.set(key, it);
  }
  return [...byKey.values()];
}

/**
 * Represent a retraction/contradiction: given items possibly including a retraction (directionByOutcome all ~0 or a
 * `retracts` id), mark superseded items. Returns { active, superseded } — evidence is never deleted, only flagged.
 */
export function applyRetractions<T extends { evidenceId: string; retracts?: string[] }>(items: T[]): { active: T[]; superseded: T[] } {
  const retracted = new Set<string>();
  for (const it of items) for (const id of it.retracts || []) retracted.add(id);
  const active = items.filter((it) => !retracted.has(it.evidenceId));
  const superseded = items.filter((it) => retracted.has(it.evidenceId));
  return { active, superseded };
}
