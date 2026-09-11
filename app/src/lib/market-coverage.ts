/**
 * market-coverage — the single honest registry of WHICH markets each sport's simulation covers, and for
 * everything we DON'T cover, exactly WHY and what data/source would unblock it. This is the product's
 * "no hidden gaps" contract: unsupported markets are shown as provider-needed / settlement-blocked /
 * coming-soon, never silently missing and never faked.
 *
 * Complements (does not replace): `sports-coverage.ts` (per-SPORT level) and `simulate-availability.ts`
 * (per-GAME badges). This is per-sport-per-MARKET.
 *
 * PURE DATA — no fabrication. `status`/`predictionSource`/`settlementSupport` describe the real pipeline:
 *   - MLB team markets are de-vigged sportsbook lines (market-anchored); player props are a 10k prop sim
 *     where an artifact exists; the full-game score is an independent Monte Carlo where its artifact
 *     qualifies (experimental — never claimed to out-predict the market).
 *   - World Cup is a de-vigged, market-IMPLIED 90' read — never an independent soccer sim. Player props
 *     and set-piece markets need a provider feed + settlement source.
 *   - UFC moneyline is market-implied (experimental); method/round/distance need an odds feed; nothing
 *     UFC is product-card eligible until the validation threshold is met.
 */

export type MarketSport = "mlb" | "nfl" | "soccer" | "ufc";

export type MarketStatus =
  | "supported" // live where odds/artifacts exist; safe to show + (if settlement supported) product-eligible
  | "conditional" // supported only when a specific input exists (e.g. a 10k prop artifact, or settlement)
  | "experimental" // shown with an experimental label; never product-eligible until validated
  | "provider_needed" // blocked: requires a data/odds provider feed we don't ingest yet
  | "settlement_blocked" // predictable but NOT settleable → excluded from products (can't grade a result)
  | "coming_soon"; // planned, not yet built

export type PredictionSource =
  | "independent_sim" // a real independent Monte-Carlo model (NOT claimed unless it exists)
  | "market_anchored" // de-vigged sportsbook lines used directly (MLB team markets)
  | "market_implied" // de-vigged implied probabilities (World Cup 90', UFC moneyline)
  | "projection_only" // a projection vs the line, no full sim (MLB pitcher props pre-10k)
  | "experimental_model" // a fighter/context model, clearly experimental (UFC method reads)
  | "none";

export type SettlementSupport = "supported" | "unsupported" | "pending";

export interface MarketCoverage {
  sport: MarketSport;
  market: string;
  publicLabel: string;
  status: MarketStatus;
  predictionSource: PredictionSource;
  requiredData: string[];
  settlementSupport: SettlementSupport;
  publicExplanation: string;
}

/** NFL coverage (Program 175 · Release C). Every row states what the market actually is today. */
export const NFL_COVERAGE: MarketCoverage[] = [
  {
    sport: "nfl", market: "team_score", publicLabel: "Projected score",
    status: "experimental", predictionSource: "independent_sim",
    requiredData: ["schedule", "cutoff-versioned strength state", "phase-appropriate scoring model"],
    settlementSupport: "supported",
    publicExplanation: "A simulated score range and win chance for every regular-season game from the evaluated team-strength model, frozen before kickoff and always marked experimental — it picked about 64% of winners on a held-out 2025 season. (The archived preseason identity picked winners no better than a coin flip on its held-out preseason, which is why it never fed products.) Neither is presented as sharper than the sportsbook price.",
  },
  {
    sport: "nfl", market: "moneyline", publicLabel: "Win chance",
    status: "experimental", predictionSource: "independent_sim",
    requiredData: ["team score simulation"],
    settlementSupport: "supported",
    publicExplanation: "Read from the same simulation as the projected score, so the two can never disagree. Experimental — never a validated pick.",
  },
  {
    sport: "nfl", market: "totals", publicLabel: "Total points",
    status: "experimental", predictionSource: "independent_sim",
    requiredData: ["team score simulation"],
    settlementSupport: "supported",
    publicExplanation: "Median and likely range from the same 10,000 runs, shown beside the sportsbook total for context.",
  },
  {
    sport: "nfl", market: "market_consensus", publicLabel: "Sportsbook prices",
    status: "supported", predictionSource: "market_anchored",
    requiredData: ["authorized odds capture"],
    settlementSupport: "supported",
    publicExplanation: "The books' own moneyline, spread and total with the margin removed, captured before kickoff and attributed. Not a GameTimePicks prediction.",
  },
  {
    sport: "nfl", market: "anytime_touchdown", publicLabel: "Anytime touchdown",
    status: "experimental", predictionSource: "independent_sim",
    requiredData: ["role evidence + availability states", "an authorized touchdown market for pricing"],
    settlementSupport: "supported",
    publicExplanation: "The calibrated scoring model publishes weekly touchdown boards, with each player's availability state attached (injury-listed players marked; everyone else availability-uncertain until kickoff). No authorized touchdown market is captured for these games, so it is model-only — a watchlist, never a card.",
  },
  {
    sport: "nfl", market: "player_props", publicLabel: "Player volume props (validated + labelled estimates)",
    status: "experimental", predictionSource: "independent_sim",
    requiredData: ["walk-forward role evidence", "per-family evaluation receipts"],
    settlementSupport: "supported",
    publicExplanation: "Receptions and receiving yards publish as validated model forecasts under their own evaluation receipts. Passing and rushing yards display as UNVALIDATED ESTIMATES — each failed a named evaluation bar (passing loses to a simple recent-form baseline; rushing failed calibration) and carries that caveat wherever it renders. Availability states on every row; no family is priced against a market and none is product-eligible.",
  },
];

/** A market may enter a Bank Builder / Moonshot product card ONLY if it is settleable and not experimental. */
export function isProductEligible(m: MarketCoverage): boolean {
  return (
    m.settlementSupport === "supported" &&
    (m.status === "supported" || m.status === "conditional")
  );
}

export const MARKET_COVERAGE: readonly MarketCoverage[] = [
  // ── MLB ────────────────────────────────────────────────────────────────────
  {
    sport: "mlb", market: "moneyline", publicLabel: "Moneyline",
    status: "supported", predictionSource: "market_anchored", requiredData: ["Odds API team markets"],
    settlementSupport: "supported",
    publicExplanation: "De-vigged sportsbook moneyline. Settled from the official box score.",
  },
  {
    sport: "mlb", market: "run_line", publicLabel: "Run line",
    status: "supported", predictionSource: "market_anchored", requiredData: ["Odds API team markets"],
    settlementSupport: "supported",
    publicExplanation: "De-vigged run line. Settled from the official final score.",
  },
  {
    sport: "mlb", market: "total", publicLabel: "Total (O/U)",
    status: "supported", predictionSource: "market_anchored", requiredData: ["Odds API team markets"],
    settlementSupport: "supported",
    publicExplanation: "De-vigged total. Settled from the official final score.",
  },
  {
    sport: "mlb", market: "player_props", publicLabel: "Player props (K / hits / TB)",
    status: "conditional", predictionSource: "projection_only",
    requiredData: ["MLB StatsAPI game logs", "10k prop simulation artifact"],
    settlementSupport: "supported",
    publicExplanation: "Strikeouts / hits / total bases projected from game logs vs the line; a 10,000-run prop sim is shown only where the artifact exists. Settled from the official box score.",
  },
  {
    sport: "mlb", market: "full_game_sim", publicLabel: "Full-game score simulation",
    status: "experimental", predictionSource: "independent_sim",
    requiredData: ["Full-game simulation artifact (10k complete games from board projections)"],
    settlementSupport: "supported",
    publicExplanation: "An independent full-game Monte Carlo — 10,000 complete simulated games from the pregame board projections — produces the projected score, win probability and run distributions where its artifact qualifies; games without one show no projected score. Experimental: it has not been validated to out-predict the market.",
  },
  {
    sport: "mlb", market: "team_totals", publicLabel: "Team totals",
    status: "settlement_blocked", predictionSource: "market_implied",
    requiredData: ["Odds API team-total lines", "team-total settlement source"],
    settlementSupport: "pending",
    publicExplanation: "Team totals can be read from odds but are not yet settlement-validated, so they stay out of product cards until grading is proven.",
  },
  {
    sport: "mlb", market: "first_5_innings", publicLabel: "First 5 innings (F5)",
    status: "coming_soon", predictionSource: "none",
    requiredData: ["Odds API F5 lines", "F5 settlement (linescore innings 1-5)"],
    settlementSupport: "pending",
    publicExplanation: "First-5-innings markets are planned; they need the F5 line feed and inning-level settlement.",
  },

  // ── World Cup / soccer ───────────────────────────────────────────────────────
  {
    sport: "soccer", market: "match_result", publicLabel: "Match result (1X2)",
    status: "supported", predictionSource: "market_implied", requiredData: ["Odds API soccer_fifa_world_cup"],
    settlementSupport: "supported",
    publicExplanation: "De-vigged 90-minute 3-way. Market-implied read (not an independent soccer sim). Settled on the 90' result (ET/pens do not count for 90' markets).",
  },
  {
    sport: "soccer", market: "double_chance", publicLabel: "Double chance",
    status: "supported", predictionSource: "market_implied", requiredData: ["Odds API"],
    settlementSupport: "supported",
    publicExplanation: "Derived from the de-vigged 3-way. Settled on the 90' result.",
  },
  {
    sport: "soccer", market: "draw_no_bet", publicLabel: "Draw no bet",
    status: "supported", predictionSource: "market_implied", requiredData: ["Odds API"],
    settlementSupport: "supported",
    publicExplanation: "Derived from the de-vigged 3-way. Settled on the 90' result.",
  },
  {
    sport: "soccer", market: "total_goals", publicLabel: "Total goals",
    status: "supported", predictionSource: "market_implied", requiredData: ["Odds API totals"],
    settlementSupport: "supported",
    publicExplanation: "De-vigged goal total where odds exist. Settled on the 90' score.",
  },
  {
    sport: "soccer", market: "btts", publicLabel: "Both teams to score",
    status: "supported", predictionSource: "market_implied", requiredData: ["Odds API BTTS"],
    settlementSupport: "supported",
    publicExplanation: "De-vigged BTTS where odds exist. Settled on the 90' score.",
  },
  {
    sport: "soccer", market: "asian_handicap", publicLabel: "Asian handicap",
    status: "conditional", predictionSource: "market_implied", requiredData: ["Odds API AH lines", "AH settlement (push/half-win)"],
    settlementSupport: "pending",
    publicExplanation: "Shown as a market read where odds exist; full product eligibility needs AH push/half-win settlement.",
  },
  {
    sport: "soccer", market: "anytime_scorer", publicLabel: "Anytime goalscorer",
    status: "experimental", predictionSource: "market_implied",
    requiredData: ["paid API-Football plan (2026 season access)", "lineup confirmation"],
    settlementSupport: "unsupported",
    publicExplanation: "LIVE as a market-implied read from real Odds API prices. Grading is built + validated deterministically on real finished-match data, but LIVE settlement is blocked — the API-Football key is a free plan with no 2026-season stats. Educational only; never in a product card until settlement runs.",
  },
  {
    sport: "soccer", market: "shots_shots_on_target", publicLabel: "Shots / shots on target / assists",
    status: "experimental", predictionSource: "market_implied",
    requiredData: ["paid API-Football plan (2026 season access)", "lineup confirmation"],
    settlementSupport: "unsupported",
    publicExplanation: "LIVE as a market-implied read from real Odds API prices. Deterministic grading is built + validated on real finished-match stats; LIVE settlement is blocked by the free API-Football plan (no 2026-season access). Educational only; never product-eligible until settlement runs.",
  },
  {
    sport: "soccer", market: "corners_cards", publicLabel: "Corners / cards",
    status: "provider_needed", predictionSource: "none",
    requiredData: ["Corners/cards odds feed", "match-event settlement source"],
    settlementSupport: "unsupported",
    publicExplanation: "Not offered — needs a set-piece/discipline feed + settlement. On the roadmap.",
  },
  {
    sport: "soccer", market: "correct_score", publicLabel: "Correct score",
    status: "provider_needed", predictionSource: "none",
    requiredData: ["Correct-score odds", "independent scoreline model"],
    settlementSupport: "unsupported",
    publicExplanation: "Not offered — a market-implied read can't price a full scoreline grid honestly without a real model + odds.",
  },

  // ── UFC ──────────────────────────────────────────────────────────────────────
  /*
   * P246 (UFC labeling audit): these three rows described the RETIRED de-vigged-market read
   * (moneyline "market_implied", round "none"), while the live /ufc card has published a
   * fitted fight model since 2026-08-22 — winner, method AND round heads, each on its own
   * PASS verdict, price-free by construction. A model number publicly registered as
   * market-implied is the exact mislabel class this registry exists to prevent.
   */
  {
    sport: "ufc", market: "moneyline", publicLabel: "Moneyline (winner)",
    status: "experimental", predictionSource: "experimental_model", requiredData: ["fight corpus (results, tale-of-the-tape)"],
    settlementSupport: "pending",
    publicExplanation: "The fight model's own win probability — a fitted, Platt-calibrated read, NOT a market price. EXPERIMENTAL: graded publicly beside the de-vigged line, which the cumulative comparison currently favours.",
  },
  {
    sport: "ufc", market: "method_of_victory", publicLabel: "Method of victory",
    status: "experimental", predictionSource: "experimental_model", requiredData: ["fighter finish/decision corpus"],
    settlementSupport: "unsupported",
    publicExplanation: "The fight model's method read (KO / submission / decision, among fights that end with a winner). Model-only — no method odds feed exists here; never a priced market and never in a product card.",
  },
  {
    sport: "ufc", market: "round_distance", publicLabel: "Round / goes the distance",
    status: "experimental", predictionSource: "experimental_model",
    requiredData: ["Round & distance odds feed", "round-level settlement"],
    settlementSupport: "unsupported",
    publicExplanation: "The fight model's ending-round read (R1 / R2 / R3+, where R3+ includes every decision). Model-only and unpriced — a round/distance odds feed would be needed before any product use. Never faked.",
  },
  ...NFL_COVERAGE,
];

export function coverageForSport(sport: MarketSport): MarketCoverage[] {
  return MARKET_COVERAGE.filter((m) => m.sport === sport);
}

/** Sports in the registry, ordered by current activity: MLB is the live sport; soccer is a market-implied
 *  capability with no live tournament right now (the 2026 World Cup is complete); UFC is experimental. */
export const COVERAGE_SPORTS: { key: MarketSport; label: string; note: string }[] = [
  { key: "mlb", label: "MLB", note: "market-anchored + 10k player-prop sim" },
  // P175-C: NFL joins the SHARED coverage registry rather than getting a forked matrix.
  { key: "nfl", label: "NFL", note: "experimental 10k score simulation — not product-eligible" },
  { key: "soccer", label: "Soccer", note: "market-implied 90' read — no live tournament right now" },
  { key: "ufc", label: "UFC", note: "experimental fight model — model-only, not product-eligible" },
];
