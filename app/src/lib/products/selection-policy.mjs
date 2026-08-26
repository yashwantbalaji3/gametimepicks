/**
 * VERSIONED FROZEN SELECTION POLICIES (P211 · Release B) — the leg-selection contract each
 * signature product runs under, pinned as committed data. The live code remains the EXECUTOR; this
 * registry is the RECORD of what the policy is, so a policy change must arrive as a new version in
 * its own commit rather than as a silent constant edit. The drift guard imports the live constants
 * and fails the build the moment a bar here and a bar in the executor disagree.
 *
 * FROZEN means frozen: bars in a version never change after the version ships — not tightened, not
 * loosened, not "fixed" — no matter what the outputs look like. A better idea is the next version.
 *
 * NO_PLAY IS A FEATURE. Every bar below can refuse the whole slate; nothing in this registry or
 * the executor may lower a bar at runtime to force a card out of a thin pool.
 */

export const SELECTION_POLICIES = Object.freeze({
  "bank-builder@1": Object.freeze({
    product: "bank-builder",
    version: 1,
    frozenAt: "2026-08-26",
    frozenBy: "P211 R-B (recording the policy the product already ran under)",
    bars: Object.freeze({
      lanes: 2,                    // A and B, independent legs
      legsPerLane: 2,              // a lane below this NEVER activates — it types as awaiting/no-play
      maxLegOdds: 400,             // a high-hit-rate addable leg, never a longshot
      maxLegsPerGame: 1,           // one leg per game per lane
      poolOddsMax: 2000,           // the model-qualified pool's outer price bound
      seedStake: 100,              // the $100 seed each lane risks (rolled stake rides the ladder)
      activationCutoffMinutes: 30, // every leg must be at least this far from first pitch/kickoff
      candidateSource: "model-qualified picks only (the model-pick pool; sportsbook prices alone never qualify a leg)",
      ranking: "hitRateScore desc, then shorter price",
    }),
    executors: Object.freeze([
      "src/lib/world-cup/model-qualified-picks.ts · buildDailyLaneCandidates (BANK_BUILDER_MAX_ODDS, POOL_ODDS_MAX, selectLegs used-set)",
      "src/lib/daily-portfolio/accounting.ts · laneEligibility (targetLegs, ACTIVATION_CUTOFF_MIN)",
    ]),
  }),
  "moonshot@1": Object.freeze({
    product: "moonshot",
    version: 1,
    frozenAt: "2026-08-26",
    frozenBy: "P211 R-B (recording the policy the product already ran under)",
    bars: Object.freeze({
      lanes: 2,                    // A (result + total per game) and B (adds BTTS)
      targetLegs: 5,
      minLegs: 3,                  // a thin slate may field 3–4; below 3 the lane types as awaiting
      minCombinedOdds: 700,        // the longshot floor — a genuine longshot, not a glorified BB card
      teamMarketsOnly: true,       // structured team markets; never random player-prop stacks
      stake: 25,
      maxExposure: 50,             // both lanes together
      activationCutoffMinutes: 30,
      candidateSource: "model-qualified picks only (team-market pool; structured per game)",
    }),
    executors: Object.freeze([
      "src/lib/world-cup/model-qualified-picks.ts · buildStructuredMoonshotLanes (MOONSHOT_TARGET_LEGS, MOONSHOT_MIN_LEGS, MOONSHOT_MIN_COMBINED_ODDS)",
      "src/lib/daily-portfolio/accounting.ts · laneEligibility (MOONSHOT_MAX_EXPOSURE, ACTIVATION_CUTOFF_MIN)",
    ]),
  }),
});

/** The version each product runs TODAY. The lifecycle receipts stamp this. */
export const CURRENT_POLICY = Object.freeze({
  "bank-builder": "bank-builder@1",
  "moonshot": "moonshot@1",
});

/**
 * CHAMPION / CHALLENGER — the honest partition. A challenger is feasible only when its bars are
 * committed BEFORE any of its output is seen (the pre-registration rule every rejected model
 * bake-off in this repo was judged under). No challenger policy has been authored, so the slot is
 * EMPTY rather than invented; declaring one is a deliberate act, not a default.
 */
export const CHALLENGER_POLICY = Object.freeze({
  "bank-builder": null,
  "moonshot": null,
  note:
    "empty by honesty, not by omission — a challenger requires its own pre-frozen bars in their own " +
    "commit plus a shadow lane that never touches exposure; neither exists. Declaring a challenger " +
    "is FOUNDER/ENGINEERING work for a future train, recorded here so the absence is typed.",
});
