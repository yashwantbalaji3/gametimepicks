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
 *     where an artifact exists; there is NO independent full-game score sim (market-implied only).
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
    requiredData: ["schedule", "cutoff-versioned strength state", "preseason scoring model"],
    settlementSupport: "supported",
    publicExplanation: "10,000 simulations of the final score per game. Early model: on a season it had never seen it picked winners no better than a coin flip, so win percentages stay near even and it is never presented as sharper than the sportsbook price.",
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
    status: "settlement_blocked", predictionSource: "independent_sim",
    requiredData: ["current role evidence", "an offered touchdown market"],
    settlementSupport: "pending",
    publicExplanation: "The scoring model is calibrated, but nobody publishes preseason playing time and the books offer no touchdown market for these games — so it appears as a watchlist, never a card.",
  },
  {
    sport: "nfl", market: "player_props", publicLabel: "Passing / rushing / receiving",
    status: "provider_needed", predictionSource: "none",
    requiredData: ["event-bound player availability", "an offered player market"],
    settlementSupport: "pending",
    publicExplanation: "Withheld: no source publishes who dresses for a preseason game or how much they play, so a projection would be invented rather than measured.",
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
    status: "experimental", predictionSource: "market_implied",
    requiredData: ["Validated independent run-scoring model", "multi-season backtest"],
    settlementSupport: "supported",
    publicExplanation: "Full-game outcomes are currently MARKET-IMPLIED (from the de-vigged lines), not an independent score simulation. An independent, backtested sim is on the roadmap — not claimed until validated.",
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
    requiredData: ["Corners/cards odds provider", "match-event settlement source"],
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
  {
    sport: "ufc", market: "moneyline", publicLabel: "Moneyline (winner)",
    status: "experimental", predictionSource: "market_implied", requiredData: ["Odds API MMA moneyline"],
    settlementSupport: "pending",
    publicExplanation: "Market-implied winner read where odds exist. EXPERIMENTAL — excluded from Bank Builder / Moonshot until the model clears its validation threshold.",
  },
  {
    sport: "ufc", market: "method_of_victory", publicLabel: "Method of victory",
    status: "experimental", predictionSource: "experimental_model", requiredData: ["Method odds feed", "fighter finish/decision data"],
    settlementSupport: "unsupported",
    publicExplanation: "An experimental fighter-data read, NOT odds-backed. Shown for education only; not a priced market and never in a product card.",
  },
  {
    sport: "ufc", market: "round_distance", publicLabel: "Round / goes the distance",
    status: "provider_needed", predictionSource: "none",
    requiredData: ["Round & distance odds feed", "round-level settlement"],
    settlementSupport: "unsupported",
    publicExplanation: "Not offered — needs a round/distance odds feed. Never faked.",
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
  { key: "nfl", label: "NFL", note: "experimental 10k preseason score simulation — not product-eligible" },
  { key: "soccer", label: "Soccer", note: "market-implied 90' read — no live tournament right now" },
  { key: "ufc", label: "UFC", note: "experimental — market-implied, not product-eligible" },
];
