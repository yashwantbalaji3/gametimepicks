/**
 * Sport feature-group registry hub — aggregates the per-sport registries and exposes helpers to
 * query them (by sport, by group) and to summarize implementation coverage honestly.
 */
import type { Sport, SportFeatureRegistry, FeatureGroup, ImplementationStatus, FeatureDefinition } from "./types";
import { MLB_REGISTRY } from "./mlb";
import { NBA_REGISTRY } from "./nba";
import { UFC_REGISTRY } from "./ufc";
import { WORLD_CUP_REGISTRY } from "./world-cup";

export const REGISTRIES: Record<Sport, SportFeatureRegistry> = {
  MLB: MLB_REGISTRY,
  NBA: NBA_REGISTRY,
  UFC: UFC_REGISTRY,
  WORLD_CUP: WORLD_CUP_REGISTRY,
};

export const FEATURE_GROUPS: FeatureGroup[] = [
  "availability", "opportunity", "role", "efficiency", "matchup", "context", "market", "uncertainty", "validation",
];

export function registryFor(sport: Sport): SportFeatureRegistry {
  return REGISTRIES[sport];
}

export function featuresByGroup(sport: Sport, group: FeatureGroup): FeatureDefinition[] {
  return REGISTRIES[sport].features.filter((x) => x.group === group);
}

/** Honest coverage summary per sport: counts by implementation status. */
export function coverage(sport: Sport): Record<ImplementationStatus, number> {
  const out: Record<ImplementationStatus, number> = { implemented: 0, partial: 0, planned: 0, not_available: 0 };
  for (const ftr of REGISTRIES[sport].features) out[ftr.status] += 1;
  return out;
}
