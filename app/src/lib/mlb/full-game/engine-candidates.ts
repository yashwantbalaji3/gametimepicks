/**
 * ENGINE CANDIDATES (P317) — research parameter sets the full-game engine can be run under BESIDE the published
 * one, never instead of it. Each candidate is registered before it is run forward and its override here must
 * equal the registered protocol's, byte for byte (engine-candidates.test.mjs pins that). Nothing public reads
 * this module; the generator writes the candidate's rows to a private research file.
 */
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "./engine";

export interface EngineCandidate {
  id: string;
  /** The registration that authorises running it forward. */
  protocol: string;
  override: { league?: Partial<EngineParams["league"]>; advancement?: Partial<EngineParams["advancement"]>; starter?: Partial<EngineParams["starter"]> };
}

/** Documented 2020s league rates for the mechanisms the S008 engine held as literals or lacked. */
export const ENGINE_LEVEL_CANDIDATE_V1: EngineCandidate = {
  id: "mlb-fullgame-engine-league-rates-v1",
  protocol: "data/internal/research/mlb/reports/engine-level-shadow-protocol.json",
  override: {
    league: { WALK_RATE: 0.093, REACH_ON_ERROR_RATE: 0.009, BASES_PER_HIT_FALLBACK: 1.63 },
    advancement: { groundIntoDoublePlay: 0.12, freeAdvance: 0.013 },
  },
};

export function engineParamsFor(candidate: EngineCandidate): EngineParams {
  return {
    league: { ...DEFAULT_ENGINE_PARAMS.league, ...(candidate.override.league ?? {}) },
    advancement: { ...DEFAULT_ENGINE_PARAMS.advancement, ...(candidate.override.advancement ?? {}) },
    starter: { ...DEFAULT_ENGINE_PARAMS.starter, ...(candidate.override.starter ?? {}) },
  };
}
