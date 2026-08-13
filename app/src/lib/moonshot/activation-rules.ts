/**
 * Moonshot activation rules — a single, honest gate for when a Moonshot CANDIDATE may become an
 * ACTIVE (placed) lane. Keeps late exposure off the board: a candidate can only activate while every
 * leg is comfortably pre-event. Once any leg is within the cutoff window it is "kickoff_too_close",
 * and once any game has kicked off the candidate is "expired" (review-only — never placed late).
 *
 * Pure + deterministic (takes nowIso) so it can be unit tested and used at build time.
 */
import type { MoonshotCandidate } from "./moonshot-lane";

/** Do not activate a Moonshot card if any leg kicks off within this many minutes. */
/**
 * ⚠️ THIS MODULE IS NOT THE LIVE ACTIVATION AUTHORITY (documented Program 172 · Release F).
 *
 * The band below (+600..+2000) is NOT what decides a real Moonshot lane. The live path is
 * buildPersistedDailyPortfolio → laneEligibility in src/lib/daily-portfolio/accounting.ts, which
 * uses MOONSHOT_MIN_COMBINED_ODDS (+700, no upper bound) from world-cup/model-qualified-picks.ts.
 * The two have silently disagreed; this note records which one actually runs so nobody reads the
 * dormant band as policy. moonshot-policy.test.mjs pins the divergence, so if either side moves,
 * the guard fails and the fork must be resolved deliberately rather than drifting further.
 *
 * Callers today: tests only. Do not wire this without first reconciling it with the live band.
 */
export const ACTIVATION_CUTOFF_MIN = 30;
/** Moonshot combined-odds activation band. */
export const MOONSHOT_MIN_COMBINED = 600;
export const MOONSHOT_MAX_COMBINED = 2000;
/** Default paper stake per activated lane, and the caps on concurrent lanes / total exposure. */
export const MOONSHOT_DEFAULT_STAKE = 25;
export const MOONSHOT_MAX_ACTIVE_LANES = 2;
export const MOONSHOT_MAX_EXPOSURE = 50;

export type CandidateReadiness = "ready" | "kickoff_too_close" | "expired" | "out_of_band";

export interface CandidateReadinessResult {
  state: CandidateReadiness;
  reason: string;
  earliestKickoffUtc: string | null;
  minutesToKickoff: number | null;
}

/** Earliest leg kickoff (ms) across a candidate, or null if no leg carries a machine kickoff. */
function earliestKickoffMs(candidate: MoonshotCandidate): { ms: number | null; iso: string | null } {
  let best: number | null = null;
  let iso: string | null = null;
  for (const l of candidate.legs ?? []) {
    if (!l.startTimeUtc) continue;
    const t = Date.parse(l.startTimeUtc);
    if (!Number.isFinite(t)) continue;
    if (best === null || t < best) { best = t; iso = l.startTimeUtc; }
  }
  return { ms: best, iso };
}

/**
 * Whether a candidate may be activated right now, with an honest reason string for the UI.
 * Order: out_of_band (odds outside the Moonshot band) → expired (a game started) →
 * kickoff_too_close (within the cutoff) → ready.
 */
export function candidateReadiness(candidate: MoonshotCandidate, nowIso: string): CandidateReadinessResult {
  const now = Date.parse(nowIso);
  const { ms, iso } = earliestKickoffMs(candidate);
  const minutesToKickoff = ms !== null && Number.isFinite(now) ? Math.round((ms - now) / 60000) : null;

  if (candidate.combinedOdds < MOONSHOT_MIN_COMBINED || candidate.combinedOdds > MOONSHOT_MAX_COMBINED) {
    return { state: "out_of_band", reason: `Combined ${candidate.combinedOdds > 0 ? "+" : ""}${candidate.combinedOdds} is outside the Moonshot band (${MOONSHOT_MIN_COMBINED}–${MOONSHOT_MAX_COMBINED}).`, earliestKickoffUtc: iso, minutesToKickoff };
  }
  if (ms === null || !Number.isFinite(now)) {
    return { state: "ready", reason: "Ready for the next slate — review before activating.", earliestKickoffUtc: iso, minutesToKickoff };
  }
  if (now >= ms) {
    return { state: "expired", reason: "Expired — a game has kicked off; not activatable (review only, no exposure).", earliestKickoffUtc: iso, minutesToKickoff };
  }
  if (ms - now < ACTIVATION_CUTOFF_MIN * 60000) {
    return { state: "kickoff_too_close", reason: `Not activated — kickoff within ${ACTIVATION_CUTOFF_MIN} minutes.`, earliestKickoffUtc: iso, minutesToKickoff };
  }
  return { state: "ready", reason: "Ready to activate — all legs comfortably pre-event.", earliestKickoffUtc: iso, minutesToKickoff };
}
