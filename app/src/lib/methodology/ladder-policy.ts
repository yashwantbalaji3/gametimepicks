/**
 * LADDER POLICY v2 — the profit-preserving Bank Builder ladder + the 3-day Moonshot ladder, as PURE,
 * tested policy functions. This is the SPEC/DISPLAY layer only: it never reads or writes canonical
 * money, and the live settlement engine still runs the v1 all-in model until settlement support for
 * partial cash-outs ships (see docs/METHODOLOGY_V2_LADDER.md § "Settlement changes required").
 *
 * Why v2 (from the CANONICAL settled ledger, not invented):
 *  · v1 rolls 100% of every win forward — a Step-3 loss surrenders the whole climb (July-3: $700.78
 *    position died on one leg; only the $100 seed was "realized" as a loss, but the paper climb reset).
 *  · Settled market reliability: double chance 8-0 · DNB strong · moneyline 8-2 (both losses knockout
 *    draw-traps) · totals 10-6 (recent losses all 90'-draw traps) · BTTS 1-3 · player props banned.
 *  · Settled card shape: 2-leg cards 12-7 vs 3-leg 2-2 (directional: fewer, stronger legs).
 * v2 therefore: 7 steps, cash-out starts at Step 3 (25% → 40% of winnings), later steps get SAFER
 * (lower target multiples, fewer legs, narrower markets), and a card may land "safe under target"
 * rather than adding a weak leg to force the rung.
 */

export type RiskBand = "standard" | "protected" | "safety-first";
export type LadderMarket = "double_chance" | "draw_no_bet" | "moneyline_90" | "match_total_goals" | "btts";

/** Settled-evidence market reliability weights (1 = most reliable). Shared with the survival selector. */
export const MARKET_RELIABILITY: Record<LadderMarket, number> = {
  double_chance: 1.0,    // 8-0 settled
  draw_no_bet: 0.95,     // draw-protected
  moneyline_90: 0.85,    // 8-2 — both losses were knockout draw-traps
  match_total_goals: 0.65, // 10-6 — penalized further in draw-risky games by the selector
  btts: 0.35,            // 1-3 settled — last resort only
};

export interface StepPolicy {
  step: number;                 // 1..7
  stake: number;                // the rolled position entering this step
  targetMultiple: number;       // the step's intended combined decimal multiple
  targetPayout: [number, number]; // acceptable payout range [min-target, max-target]
  minAcceptablePayout: number;  // "safe under target" floor — below this the card is not worth placing
  cashOutPct: number;           // share of step WINNINGS realized on a win (0 before Step 3)
  cashOut: (payout: number) => number;      // $ realized on a win at `payout`
  rollForward: (payout: number) => number;  // $ rolled into the next step on a win
  maxLegs: number;              // 2-3 early, 2 from Step 3
  riskBand: RiskBand;
  allowedMarkets: LadderMarket[];
  marketWeights: Record<LadderMarket, number>;
  note: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Per-step shape of the v2 ladder. Later steps trade payout for survival — by design. */
const STEP_SHAPE: Array<{ mult: number; cashOutPct: number; maxLegs: number; band: RiskBand; markets: LadderMarket[] }> = [
  { mult: 2.0, cashOutPct: 0,    maxLegs: 3, band: "standard",     markets: ["double_chance", "draw_no_bet", "moneyline_90", "match_total_goals", "btts"] },
  { mult: 3.5, cashOutPct: 0,    maxLegs: 3, band: "standard",     markets: ["double_chance", "draw_no_bet", "moneyline_90", "match_total_goals", "btts"] },
  { mult: 2.3, cashOutPct: 0.25, maxLegs: 2, band: "protected",    markets: ["double_chance", "draw_no_bet", "moneyline_90", "match_total_goals"] },
  { mult: 2.0, cashOutPct: 0.30, maxLegs: 2, band: "protected",    markets: ["double_chance", "draw_no_bet", "moneyline_90", "match_total_goals"] },
  { mult: 1.8, cashOutPct: 0.35, maxLegs: 2, band: "safety-first", markets: ["double_chance", "draw_no_bet", "moneyline_90"] },
  { mult: 1.6, cashOutPct: 0.40, maxLegs: 2, band: "safety-first", markets: ["double_chance", "draw_no_bet", "moneyline_90"] },
  { mult: 1.5, cashOutPct: 0.40, maxLegs: 2, band: "safety-first", markets: ["double_chance", "draw_no_bet"] },
];

/**
 * The v2 Bank Builder step policy. `historicalRisk` ("elevated" after recent stopped lanes) tightens the
 * target a notch. Pure — no I/O, no money mutation; callers use it for proposal shaping + display.
 */
export function bankBuilderStepPolicy(
  step: number,
  currentRoll: number,
  historicalRisk: "normal" | "elevated" = "normal",
): StepPolicy {
  const idx = Math.min(Math.max(1, Math.floor(step)), 7) - 1;
  const shape = STEP_SHAPE[idx];
  // Elevated recent risk (e.g. both lanes just stopped) shaves the target multiple ~10% — prefer
  // surviving the restart over re-chasing the old rung.
  const mult = historicalRisk === "elevated" ? round2(shape.mult * 0.9) : shape.mult;
  const stake = round2(currentRoll);
  const target = round2(stake * mult);
  const minAcceptable = round2(stake * (1 + (mult - 1) * 0.6)); // "safe under target": ≥60% of the intended edge
  const cashOut = (payout: number) => (shape.cashOutPct <= 0 ? 0 : round2(Math.max(0, (payout - stake) * shape.cashOutPct)));
  return {
    step: idx + 1,
    stake,
    targetMultiple: mult,
    targetPayout: [minAcceptable, round2(target * 1.15)],
    minAcceptablePayout: minAcceptable,
    cashOutPct: shape.cashOutPct,
    cashOut,
    rollForward: (payout: number) => round2(payout - cashOut(payout)),
    maxLegs: shape.maxLegs,
    riskBand: shape.band,
    allowedMarkets: shape.markets,
    marketWeights: MARKET_RELIABILITY,
    note: idx + 1 <= 2
      ? "Growth steps — full roll, 2-3 legs, all team markets eligible."
      : `Profit-preserving step — on a win, ${Math.round(shape.cashOutPct * 100)}% of the winnings are extracted to banked profit and the rest rolls. A card may settle for the minimum acceptable payout instead of forcing weak legs to hit the exact rung.`,
  };
}

// ── Moonshot 3-day ladder ────────────────────────────────────────────────────────────────────────
export interface MoonshotDayPolicy {
  day: 1 | 2 | 3;
  stake: number;
  targetPayout: number;
  targetMultiple: number;
  legRange: [number, number];
  playerPropsAllowed: boolean;   // false by default; only an explicit, labeled high-risk override flips it
  preferredMarkets: LadderMarket[];
  note: string;
}

const MOON_SHAPE = [
  { target: 100, legs: [3, 5] as [number, number] },   // $25 → $100 (4.0x)
  { target: 400, legs: [3, 6] as [number, number] },   // $100 → $400 (4.0x)
  { target: 1500, legs: [3, 6] as [number, number] },  // $400 → $1,500 (3.75x)
];

/** The 3-day Moonshot ladder policy. Pure; display/proposal shaping only. */
export function moonshotLadderPolicy(day: 1 | 2 | 3, currentRoll: number, allowPlayerProps = false): MoonshotDayPolicy {
  const shape = MOON_SHAPE[day - 1];
  const stake = round2(currentRoll);
  return {
    day,
    stake,
    targetPayout: shape.target,
    targetMultiple: round2(shape.target / Math.max(1, stake)),
    legRange: shape.legs,
    playerPropsAllowed: allowPlayerProps === true,
    preferredMarkets: ["draw_no_bet", "double_chance", "match_total_goals", "moneyline_90", "btts"],
    note: `Day ${day}: $${stake} → $${shape.target}. High-volatility by design — grouped by game, team markets preferred${allowPlayerProps ? ", player props explicitly enabled and labeled high-risk" : ", no player props"}. If no card clears the quality bar, the day is a NO-PLAY, never a forced card.`,
  };
}
