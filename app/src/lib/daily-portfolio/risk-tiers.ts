/**
 * Risk-tier framework for Bank Builder SAFEST-card selection. Every leg is scored into a tier by HOW
 * FRAGILE its market is (probability of the bet landing on a typical slate), independent of price. The
 * safest-card selector prefers lower tiers and maximizes the COMBINED hit probability — not EV.
 *
 *   Tier 1 (safest)  — batter to record a hit, pitcher-strikeout ladders w/ edge, team total Over 0.5,
 *                      double chance, draw-no-bet.
 *   Tier 2           — both-teams-to-score, Under 3.5, Over 1.5.
 *   Tier 3 (riskiest)— bare match totals (e.g. Over 2.5), exact-outcome / multi-bucket props.
 */

export type RiskTier = 1 | 2 | 3;

export interface Tierable {
  category?: string;     // "team" | "total_btts" | "player"
  marketKey?: string;    // e.g. "batter_hits", "pitcher_strikeouts", "double_chance", "match_total_goals"
  selection?: string;    // e.g. "Over 0.5", "Under 3.5", "Double Chance: X2"
  sport?: string;        // "MLB" | "WORLD_CUP"
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase();

/** Parse "Over 2.5" / "Under 3.5" → { side, line }. */
export function parseOverUnder(selection: string | undefined): { side: "over" | "under" | null; line: number | null } {
  const m = norm(selection).match(/(over|under)\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return { side: null, line: null };
  return { side: m[1] === "over" ? "over" : "under", line: Number(m[2]) };
}

/** Classify a leg into its risk tier. Lower = safer (more likely to land). */
export function classifyRiskTier(leg: Tierable): RiskTier {
  const mk = norm(leg.marketKey);
  const sel = norm(leg.selection);
  const { side, line } = parseOverUnder(leg.selection);

  // ---- Tier 1: the safest, highest-base-rate markets ----
  if (mk.includes("batter_hits") && !mk.includes("runs")) {
    // "batter to record a hit" — Over 0.5 is the canonical safe form.
    if (side === "over" && (line ?? 1) <= 0.5) return 1;
    return 2; // a higher hit line is less safe
  }
  if (mk.includes("pitcher_strikeout")) return 1; // strikeout ladder (edge is enforced by the model floor)
  if (mk.includes("double_chance") || sel.includes("double chance")) return 1;
  if (mk.includes("draw_no_bet") || sel.includes("draw no bet") || mk.includes("dnb")) return 1;
  if ((mk.includes("team_total") || sel.includes("team total")) && side === "over" && (line ?? 1) <= 0.5) return 1;

  // ---- Tier 2: moderate ----
  if (mk.includes("btts") || mk.includes("both_teams") || sel.includes("both teams to score")) return 2;
  if (mk.includes("moneyline") || mk === "h2h" || mk.includes("match_result")) return 2; // a single side to win
  if (mk.includes("batter_total_bases") || mk.includes("hits_runs_rbis")) return 2;
  if ((mk.includes("total") || mk.includes("goals")) && side === "under" && (line ?? 0) >= 3.5) return 2; // Under 3.5+
  if ((mk.includes("total") || mk.includes("goals")) && side === "over" && (line ?? 99) <= 1.5) return 2;  // Over 1.5

  // ---- Tier 3: bare match totals (Over 2.5 etc.) + everything riskier / exotic ----
  return 3;
}

/** Human label for a tier. */
export function tierLabel(t: RiskTier): string {
  return t === 1 ? "Tier 1 (safest)" : t === 2 ? "Tier 2 (moderate)" : "Tier 3 (higher variance)";
}

/** The worst (highest) tier among a card's legs drives the card's overall fragility. */
export function cardTier(legs: Tierable[]): RiskTier {
  return (legs.length ? (Math.max(...legs.map((l) => classifyRiskTier(l))) as RiskTier) : 3);
}
