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

export type MarketSport = "mlb" | "soccer" | "ufc";

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
    requiredData: ["lineup/minutes confirmation", "scorer settlement source"],
    settlementSupport: "unsupported",
    publicExplanation: "LIVE as a market-implied read from real Odds API prices (Phase C pilot). Lineups + a scorer settlement source are pending, so it is educational only and never enters a product card.",
  },
  {
    sport: "soccer", market: "shots_shots_on_target", publicLabel: "Shots / shots on target / assists",
    status: "experimental", predictionSource: "market_implied",
    requiredData: ["shots/assists settlement source", "lineup confirmation"],
    settlementSupport: "unsupported",
    publicExplanation: "LIVE as a market-implied read from real Odds API prices (Phase C pilot). Settlement (shots/assists) is pending, so it is educational only and never product-eligible.",
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
];

export function coverageForSport(sport: MarketSport): MarketCoverage[] {
  return MARKET_COVERAGE.filter((m) => m.sport === sport);
}

/** Sports in the registry, ordered most-covered first (soccer live now, then MLB, then experimental UFC). */
export const COVERAGE_SPORTS: { key: MarketSport; label: string; note: string }[] = [
  { key: "soccer", label: "World Cup / soccer", note: "market-implied 90' read" },
  { key: "mlb", label: "MLB", note: "market-anchored + 10k player-prop sim" },
  { key: "ufc", label: "UFC", note: "experimental — market-implied, not product-eligible" },
];
