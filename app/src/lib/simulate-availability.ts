/**
 * SIMULATE AVAILABILITY BADGES — a PURE, framework-free derivation of the high-level "what can I
 * simulate here" chips shown on each `/simulate` game card, BEFORE the user opens the game.
 *
 * The whole point is honesty at a glance: every badge is backed by a real joined artifact on the
 * game detail (the SAME `PublicGameDetail` the lobby already builds via `buildAllGameDetails()`), so
 * a chip appears ONLY when its module genuinely exists for that fixture. Nothing here reads fs,
 * imports React/Next, or fabricates a market — it takes a structural subset of the detail and returns
 * the chips. That keeps it trivially unit-testable (relative import, no `@/`) and lets the server
 * component compute chips once and pass them to the client card as plain data.
 *
 * Pre-click leakage policy (critical): a badge says WHAT is available, never the prediction. We emit
 * `Moneyline`, `Total`, `Player Props`, `10,000-run`, `Asian Handicap` — never `Rays 57%`,
 * `Under 7.5`, or `France -1 cover 46.5%`. No probability, price, or lean ever crosses this boundary.
 *
 * Sport honesty:
 *   • MLB carries a real sampled simulation → a `${runCount.toLocaleString()}-run` chip is allowed
 *     ONLY when the artifact sets `allowsRunCountClaim` on a positive integer run count.
 *   • Soccer / World Cup is a de-vigged, market-implied 90' dashboard — NEVER a run count. Its lead
 *     chip is `Market-implied`; there is no `10,000-run` soccer chip anywhere in this file.
 */

/** The badge category — drives the chip's visual weight (coming-soon is subdued + trails). */
export type AvailabilityBadgeKind = "simulation" | "market" | "prop" | "comingSoon";

/** One availability chip, fully derived from a real artifact field (never fabricated). */
export interface GameAvailabilityBadge {
  /** Stable machine id (e.g. "mlb_moneyline") — used for dedup + tests, never shown. */
  key: string;
  /** The display label, e.g. "Moneyline" or "10,000-run". Says what's available, not the prediction. */
  label: string;
  /** Visual category. */
  kind: AvailabilityBadgeKind;
  /** Artifact provenance for transparency/tests, e.g. "mlb_team_markets" / "wc_projection". */
  source: string;
}

/** The minimal MLB slice this reads — a structural subset of `PublicGameDetail`. */
export interface MlbAvailabilityInput {
  gameLabSimulation?: {
    status: string;
    runCount: number | null;
    allowsRunCountClaim: boolean;
    generatedPicks: readonly unknown[];
  } | null;
  gameCenter?: {
    moneyline: unknown | null;
    total: unknown | null;
    runLine: unknown | null;
  } | null;
}

/** The minimal World Cup / soccer slice this reads — a structural subset of `PublicGameDetail`. */
export interface WcAvailabilityInput {
  wcGameCenter?: {
    matchResult: unknown | null;
    total: unknown | null;
    btts: unknown | null;
    doubleChance: unknown | null;
    drawNoBet: unknown | null;
  } | null;
  wcExpanded?: {
    asianHandicap: unknown | null;
    teamTotals: unknown | null;
  } | null;
}

/** A simulation view counts as revealable (its modules exist) when it's ready or merely stale. */
function simIsUsable(status: string | undefined): boolean {
  return status === "ready" || status === "stale";
}

/**
 * MLB availability chips for one fixture. Order is intentional: the run-count simulation leads, then
 * the de-vigged team markets (moneyline / run line / total), then player props, then a single subdued
 * coming-soon chip for the documented-but-unbuilt alternate-line distribution ladders.
 *
 * A chip is emitted ONLY when its backing field is present:
 *   • `${N}-run`      ⇐ sim ready/stale AND `allowsRunCountClaim` AND a positive-integer runCount.
 *   • `Moneyline`     ⇐ Game Center carries a de-vigged moneyline.
 *   • `Run Line`      ⇐ Game Center carries a de-vigged run line.
 *   • `Total`         ⇐ Game Center carries a de-vigged total.
 *   • `Player Props`  ⇐ the sim carries ≥1 generated pick.
 *   • `Distributions soon` ⇐ (coming-soon) any of the above exist — the margin/total ladders are a
 *      documented roadmap item (docs/MLB_ALTERNATE_LADDERS_AUDIT_2026-07-09.md), not yet built.
 */
export function mlbAvailabilityBadges(detail: MlbAvailabilityInput): GameAvailabilityBadge[] {
  const out: GameAvailabilityBadge[] = [];
  const sim = detail.gameLabSimulation;
  const usable = simIsUsable(sim?.status);

  if (
    sim &&
    usable &&
    sim.allowsRunCountClaim &&
    typeof sim.runCount === "number" &&
    Number.isInteger(sim.runCount) &&
    sim.runCount > 0
  ) {
    out.push({ key: "mlb_runs", label: `${sim.runCount.toLocaleString()}-run`, kind: "simulation", source: "mlb_simulation" });
  }

  const gc = detail.gameCenter;
  if (gc?.moneyline) out.push({ key: "mlb_moneyline", label: "Moneyline", kind: "market", source: "mlb_team_markets" });
  if (gc?.runLine) out.push({ key: "mlb_run_line", label: "Run Line", kind: "market", source: "mlb_team_markets" });
  if (gc?.total) out.push({ key: "mlb_total", label: "Total", kind: "market", source: "mlb_team_markets" });

  if (sim && usable && sim.generatedPicks.length > 0) {
    out.push({ key: "mlb_player_props", label: "Player Props", kind: "prop", source: "mlb_simulation" });
  }

  // Coming-soon (subdued, trails): alternate-line margin/total distribution ladders are a documented
  // roadmap item, not fabricated. Only shown on a game that already has a real MLB dashboard.
  if (out.length > 0) {
    out.push({
      key: "mlb_distributions_soon",
      label: "Distributions soon",
      kind: "comingSoon",
      source: "roadmap:MLB_ALTERNATE_LADDERS_AUDIT_2026-07-09",
    });
  }

  return out;
}

/**
 * Soccer / World Cup availability chips for one fixture — every one market-implied (de-vigged), never
 * a simulation. `Market-implied` leads (the base honest framing), then each supported 90' market, then
 * the expanded modules (Asian handicap / team totals) when their artifact backs them.
 *
 * A chip is emitted ONLY when its backing field is present:
 *   • `Market-implied` ⇐ a de-vigged Game Center exists for the match.
 *   • `Match Result`   ⇐ 3-way result present.
 *   • `Total`          ⇐ match total present.
 *   • `BTTS`           ⇐ both-teams-to-score present.
 *   • `Double Chance`  ⇐ double chance present.
 *   • `Draw No Bet`    ⇐ draw-no-bet present.
 *   • `Asian Handicap` ⇐ expanded-markets artifact carries a handicap for the match.
 *   • `Team Totals`    ⇐ expanded-markets artifact carries team totals for the match.
 *
 * There is deliberately NO run-count chip and NO coming-soon chip here — soccer stays honestly
 * market-implied, and the game page's own "coming soon" tab carries the roadmap detail.
 */
export function worldCupAvailabilityBadges(detail: WcAvailabilityInput): GameAvailabilityBadge[] {
  const out: GameAvailabilityBadge[] = [];
  const gc = detail.wcGameCenter;
  const ex = detail.wcExpanded;

  if (gc) {
    // Lead framing + the primary 90' markets.
    out.push({ key: "wc_market_implied", label: "Market-implied", kind: "market", source: "wc_projection" });
    if (gc.matchResult) out.push({ key: "wc_match_result", label: "Match Result", kind: "market", source: "wc_projection" });
    if (gc.total) out.push({ key: "wc_total", label: "Total", kind: "market", source: "wc_projection" });
    if (gc.btts) out.push({ key: "wc_btts", label: "BTTS", kind: "market", source: "wc_projection" });
  }

  // Expanded modules rank ahead of the derivative double-chance / draw-no-bet views so the
  // most informative markets stay visible when the card caps the number of chips shown.
  if (ex?.asianHandicap) out.push({ key: "wc_asian_handicap", label: "Asian Handicap", kind: "market", source: "wc_expanded" });
  if (ex?.teamTotals) out.push({ key: "wc_team_totals", label: "Team Totals", kind: "market", source: "wc_expanded" });

  if (gc) {
    if (gc.doubleChance) out.push({ key: "wc_double_chance", label: "Double Chance", kind: "market", source: "wc_projection" });
    if (gc.drawNoBet) out.push({ key: "wc_draw_no_bet", label: "Draw No Bet", kind: "market", source: "wc_projection" });
  }

  return out;
}
