/**
 * Pool availability diagnostic — pure helper that classifies each
 * sport pool in an optimizer snapshot so the UI can honestly explain
 * gaps rather than silently render an MLB-only page.
 *
 * Context: the morning pipeline can attach NBA recent-form game logs
 * only when `stats.nba.com` is responsive. When it isn't (as on
 * 2026-05-28), every NBA lean is downgraded by the R1 guardrail
 * (`R1_no_logs_insufficient_data`) to `lean="No Play"`, and the
 * optimizer correctly skips them. The `sourcePools.nbaCount` field
 * stays > 0 (raw leans were loaded), but the per-bucket sport counts
 * collapse to zero. This helper detects exactly that case.
 *
 * Pure — no fetches, no fabrication. Honest classification only.
 */
import type { OptimizerSnapshot } from "./parlay-optimizer";

export type SportPoolState =
  /** Raw pool absent (board not generated for this sport). */
  | "absent"
  /** Raw pool present AND at least one slip survived eligibility. */
  | "present"
  /** Raw pool present but ZERO slips survived eligibility — usually
   *  the R1 "no logs / insufficient data" guardrail downgrading every
   *  lean to No Play, or an outage in an upstream stats provider. */
  | "pool-but-no-slips";

export interface PoolAvailability {
  nba: SportPoolState;
  mlb: SportPoolState;
  /** Mixed-sport state. "present" when at least one Mixed slip exists;
   *  "absent" when either source pool is absent; "pool-but-no-slips"
   *  when both source pools are present but no Mixed slips were
   *  produced (typically because one sport's leans were all dropped). */
  multi: SportPoolState;
}

/** Classify each sport pool inside an optimizer snapshot. Pure. */
export function classifyPoolAvailability(
  payload: OptimizerSnapshot | null | undefined,
): PoolAvailability {
  if (!payload) {
    return { nba: "absent", mlb: "absent", multi: "absent" };
  }
  const nbaCount = payload.sourcePools?.nbaCount ?? 0;
  const mlbCount = payload.sourcePools?.mlbCount ?? 0;
  const buckets = payload.buckets ?? {};
  let nbaSlipsTotal = 0;
  let mlbSlipsTotal = 0;
  let multiSlipsTotal = 0;
  for (const profile of Object.keys(buckets) as Array<keyof typeof buckets>) {
    const perSport = buckets[profile];
    nbaSlipsTotal += perSport?.nba?.length ?? 0;
    mlbSlipsTotal += perSport?.mlb?.length ?? 0;
    multiSlipsTotal += perSport?.multi?.length ?? 0;
  }
  return {
    nba: classifySingle(nbaCount, nbaSlipsTotal),
    mlb: classifySingle(mlbCount, mlbSlipsTotal),
    multi: classifyMulti(nbaCount, mlbCount, multiSlipsTotal),
  };
}

function classifySingle(rawCount: number, slipsTotal: number): SportPoolState {
  if (rawCount <= 0) return "absent";
  return slipsTotal > 0 ? "present" : "pool-but-no-slips";
}

function classifyMulti(
  nbaCount: number,
  mlbCount: number,
  slipsTotal: number,
): SportPoolState {
  if (nbaCount <= 0 || mlbCount <= 0) return "absent";
  return slipsTotal > 0 ? "present" : "pool-but-no-slips";
}

/** True iff at least one sport is in `pool-but-no-slips`. The UI
 *  uses this as the gate for surfacing the diagnostic banner. */
export function hasPoolWithoutSlips(p: PoolAvailability): boolean {
  return (
    p.nba === "pool-but-no-slips" ||
    p.mlb === "pool-but-no-slips" ||
    p.multi === "pool-but-no-slips"
  );
}
