/**
 * PLATE-APPEARANCE OUTCOME MODEL (Sprint 008 · Phase 2.1).
 *
 * The smallest scientifically coherent PA model the repo's REAL pregame inputs can support. For a batter B
 * facing pitcher P it returns a categorical outcome distribution over
 *   { strikeout, walk, single, double, triple, homeRun, fieldOut }
 * whose probabilities sum to 1 after deterministic normalization.
 *
 * WHERE THE NUMBERS COME FROM (all leakage-safe, all public-board or documented league priors):
 *   • per-PA hit rate   ← batter_hits projection ÷ a nominal PA/game  (E[hits] is reproduced by construction)
 *   • hit-type split    ← batter_total_bases ÷ batter_hits  (bases/hit; E[TB] is reproduced by construction)
 *   • strikeout rate    ← pitcher_strikeouts projection ÷ nominal batters-faced  (pitcher-driven)
 *   • walk/HBP rate     ← documented league prior (the public board carries no per-batter BB projection)
 *
 * HONEST LIMITATIONS (documented, surfaced in the report Methodology):
 *   • Strikeout rate is pitcher-driven and uniform across that pitcher's batters — the public board carries
 *     no per-batter K rate. The internal pregame-archive has splits, but it is research-gated and product-
 *     ineligible, so it is deliberately NOT used here.
 *   • Walk rate is a single league prior; no per-batter or per-pitcher walk projection exists on the board.
 *   • No park, weather, handedness, or batting-order effect (absent pregame on the public surface).
 * These make the engine transparent and testable rather than a large opaque system, per the sprint brief.
 */

/** The seven mutually-exclusive outcomes of a plate appearance. Probabilities sum to 1. */
export interface PaOutcomeProbs {
  strikeout: number;
  walk: number;
  single: number;
  double: number;
  triple: number;
  homeRun: number;
  fieldOut: number;
}

/** Documented league-average priors (2020s MLB). Central, deliberately transparent constants. */
export const LEAGUE = {
  /** Nominal plate appearances per starting batter per game — the divisor that turns a per-game projection
   *  (E[hits], E[TB]) into a per-PA rate. Calibrated to the engine's REALIZED average PA/batter (~3.85 over
   *  a 9-inning game once bottom-9 skips and walk-offs are accounted for) so simulated team hits reproduce
   *  the summed board projections and total runs land in a realistic MLB range. */
  PA_PER_GAME: 3.85,
  /** Nominal batters a starting pitcher faces (≈6 IP) — converts E[K] to a per-PA strikeout rate. Chosen to
   *  match the engine's batters-faced cap so realized starter strikeouts reproduce the K projection. */
  STARTER_BATTERS_FACED: 25,
  /** Walk + HBP per PA (league ~8.5% BB + ~1% HBP; the board carries no per-batter walk projection). */
  WALK_RATE: 0.085,
  /** Triples as a share of hits (rare, held league-constant). */
  TRIPLE_SHARE: 0.018,
  /** Fallback bases/hit when a batter has no total-bases projection. */
  BASES_PER_HIT_FALLBACK: 1.58,
  /** League bullpen strikeout rate per PA (relievers strike out more than starters). */
  BULLPEN_K_RATE: 0.24,
  /** Team-average per-PA hit rate fallback for a batter with no hits projection. */
  HIT_RATE_FALLBACK: 0.225,
  /** Clamp bounds keep derived rates inside plausible baseball ranges. */
  MIN_HIT_RATE: 0.05,
  MAX_HIT_RATE: 0.44,
  MIN_K_RATE: 0.09,
  MAX_K_RATE: 0.42,
} as const;

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/**
 * Per-PA strikeout rate for the pitcher currently on the mound. Starter rate is derived from the board's
 * `pitcher_strikeouts` projection over a nominal batters-faced; bullpen uses the documented league prior.
 */
export function pitcherStrikeoutRate(expStrikeouts: number | null, isStarter: boolean): number {
  if (!isStarter) return LEAGUE.BULLPEN_K_RATE;
  if (expStrikeouts == null || !Number.isFinite(expStrikeouts) || expStrikeouts <= 0) return 0.205; // league starter K/PA
  return clamp(expStrikeouts / LEAGUE.STARTER_BATTERS_FACED, LEAGUE.MIN_K_RATE, LEAGUE.MAX_K_RATE);
}

/**
 * Split a batter's hits into 1B/2B/3B/HR fractions (summing to 1) that reproduce a target bases-per-hit
 * ratio `r = E[TB] / E[hits]`. Triples are held at the league share; doubles rise modestly with power; the
 * singles↔home-run balance is then solved so the composition's expected bases equals `r` EXACTLY (when the
 * solution stays in range) — this is what makes simulated total bases match the board's TB projection.
 */
export function hitTypeSplit(basesPerHit: number): {
  single: number;
  double: number;
  triple: number;
  homeRun: number;
} {
  const r = clamp(basesPerHit, 1.05, 2.6);
  const triple = LEAGUE.TRIPLE_SHARE;
  // Doubles share grows gently with power (≈0.16 at r=1.3 → ≈0.22 at r=2.0), bounded.
  const dbl = clamp(0.16 + 0.09 * (r - 1.3), 0.11, 0.26);
  // Solve single + hr = S and single + 4·hr = B (bases from the single/HR bucket).
  const S = 1 - triple - dbl; // singles + home runs
  const B = r - 2 * dbl - 3 * triple; // bases contributed by singles + home runs
  let hr = (B - S) / 3;
  let single = S - hr;
  // Guard the extremes (very low/high r) so all fractions stay in [0, S].
  if (hr < 0) {
    hr = 0;
    single = S;
  } else if (hr > S) {
    hr = S;
    single = 0;
  }
  return { single, double: dbl, triple, homeRun: hr };
}

/**
 * Build the PA outcome distribution for a batter (given his per-game hit + total-base projections) facing a
 * pitcher with a known per-PA strikeout rate. Deterministic and pure. Probabilities are non-negative and
 * sum to 1 (a final normalization absorbs any rounding / clamp interaction).
 */
export function buildPaOutcome(params: {
  expHits: number | null;
  expTotalBases: number | null;
  pitcherKRate: number;
}): PaOutcomeProbs {
  const { expHits, expTotalBases, pitcherKRate } = params;

  // Per-PA hit rate from the hits projection (or a team-average fallback when the batter has no line).
  const rawHit =
    expHits != null && Number.isFinite(expHits) && expHits > 0
      ? expHits / LEAGUE.PA_PER_GAME
      : LEAGUE.HIT_RATE_FALLBACK;
  const pHit = clamp(rawHit, LEAGUE.MIN_HIT_RATE, LEAGUE.MAX_HIT_RATE);
  const pK = clamp(pitcherKRate, LEAGUE.MIN_K_RATE, LEAGUE.MAX_K_RATE);
  const pBB = LEAGUE.WALK_RATE;

  // Field outs are the remainder. If the three explicit buckets overflow (rare: a big hitter vs a big-K
  // pitcher), scale hits + strikeouts down proportionally to leave a small field-out floor, keeping walks.
  let field = 1 - pHit - pK - pBB;
  let hit = pHit;
  let k = pK;
  if (field < 0.02) {
    const room = 1 - pBB - 0.02; // total mass available to hits + strikeouts
    const scale = room / (pHit + pK);
    hit = pHit * scale;
    k = pK * scale;
    field = 0.02;
  }

  // Bases per hit → hit-type composition (reproduces E[TB] by construction when a TB line exists).
  const basesPerHit =
    expTotalBases != null && expHits != null && expHits > 0
      ? expTotalBases / expHits
      : LEAGUE.BASES_PER_HIT_FALLBACK;
  const split = hitTypeSplit(basesPerHit);

  const probs: PaOutcomeProbs = {
    strikeout: k,
    walk: pBB,
    single: hit * split.single,
    double: hit * split.double,
    triple: hit * split.triple,
    homeRun: hit * split.homeRun,
    fieldOut: field,
  };

  // Deterministic normalization → sums to exactly 1.
  const total =
    probs.strikeout +
    probs.walk +
    probs.single +
    probs.double +
    probs.triple +
    probs.homeRun +
    probs.fieldOut;
  const inv = total > 0 ? 1 / total : 0;
  return {
    strikeout: probs.strikeout * inv,
    walk: probs.walk * inv,
    single: probs.single * inv,
    double: probs.double * inv,
    triple: probs.triple * inv,
    homeRun: probs.homeRun * inv,
    fieldOut: probs.fieldOut * inv,
  };
}

/** The outcome kinds, in the fixed cumulative order used by the sampler (stable across versions). */
export const PA_OUTCOME_ORDER: (keyof PaOutcomeProbs)[] = [
  "strikeout",
  "walk",
  "single",
  "double",
  "triple",
  "homeRun",
  "fieldOut",
];

/** Sample one outcome from a PA distribution given a uniform draw u ∈ [0,1). Deterministic. */
export function samplePaOutcome(probs: PaOutcomeProbs, u: number): keyof PaOutcomeProbs {
  let acc = 0;
  for (const kind of PA_OUTCOME_ORDER) {
    acc += probs[kind];
    if (u < acc) return kind;
  }
  return "fieldOut";
}
