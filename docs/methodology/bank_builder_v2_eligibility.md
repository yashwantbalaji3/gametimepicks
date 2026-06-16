# Bank Builder V2 — Eligibility & Survival Score

_Implemented in `pipeline/daily/bank_builder_v2_eligibility.py` (pure + unit-tested in
`pipeline/daily/test_bank_builder_v2_eligibility.py`). This is the gate that decides whether a new
Dual Bank Builder run may launch. It exists because Run #2 went 0/2 on volatile single-player
props (a hitless 1+-hit prop, a star beating a low Under, and a DNP void)._

## Why V2 is different from Parlay Lab

Parlay Lab surfaces good edges across the whole risk spectrum (lower-variance → longshot). **Bank
Builder may only use elite, low-fragility, high-data-quality legs.** A "high model probability" on
a single game is not enough — Run #2 proved it. V2 computes a separate **survival score** focused on
*fragility*, not just edge, and refuses to launch unless the slate genuinely offers enough
independent, non-fragile legs.

## Survival score (0–100)

Each candidate leg earns positive points, then loses penalty points. The score is clamped to 0–100.

### Positive components (max 100)
| Component | Max | What it measures |
|---|---|---|
| Base model | 35 | Model probability (0.55→0, 0.95→35) + a small positive-edge nudge |
| Market type | 25 | Bank Builder suitability of the market (see table) |
| Recent form | 15 | Share of recent games that cleared this exact line (MLB) or favourable last-5 results (WC). Never fabricated — 0 if no data |
| Odds band | 10 | Rewards short-priced favourites, penalises longshots |
| Data quality | 15 | A=15, B=11, C=6, D/limited=0 |

### Market-type suitability (the 25-pt component)
- **double_chance 25** (covers 2 of 3 outcomes — most survivable)
- **draw_no_bet 22** (draw refunds)
- moneyline_90 14 · totals 12 · btts 8
- pitcher_strikeouts 12 (announced probable starter, stable distribution)
- batter_hits 11 (only the 0.5 / Under lines reach here) · total_bases / HRR (Under) 9
- soccer player props (goalscorer / shots) 6

### Penalties
- **Volatility** — team 0 · pitcher −8 · MLB hitter −18 · soccer player −22 (single-game variance).
- **DNP / lineup** — team 0 · player prop with **no confirmed lineup −30** (the Run #2 risk) ·
  probable pitcher −6. A player prop without a confirmed lineup is also flagged as a rejection.
- **Data-quality floor** — C / D / limited / unknown → rejection reason.
- **Longshot** — odds longer than +160 → rejection reason.
- **Fragile market** — MLB Over 1.5+ hits → rejection reason (defence in depth).

### Tiers
- **≥ 80 and no rejection reasons → eligible** (Bank Builder usable)
- **70–79 → watchlist** (shown, not usable)
- **< 80 or any rejection reason → not eligible**

The 80 threshold is tuned to current data availability (early World Cup, MLB props): the strongest
legit legs (WC double-chance / DNB favourites) score ~80–93; volatile single-player props score
~30–55 and never clear the bar. It is conservative by design.

## Launch rule (two independent lanes)

A Dual run needs **two _differentiated_ lanes** — running two correlated lanes defeats the purpose.
So a launch requires:
1. **≥ 4 eligible legs across ≥ 4 distinct games** (so two lanes can be game-disjoint),
2. each lane = 2 eligible legs from different games, combined decimal in **[1.45, 2.60]** (meaningful
   return without chasing longshots), lane joint probability ≥ **0.50**,
3. the two lanes share **no game** (and therefore no leg).

If these cannot be met, V2 returns `decision: "evaluating"` with the strongest candidates and the
exact blockers — and **does not** launch. The settled previous run is never overwritten.

## Integrity

No fabrication: every input is a real odds price (The Odds API) or an official stat artifact (MLB
Stats API recent games; API-Football WC form). A leg with no recent-form data scores 0 on that
dimension. A void/DNP is never an eligibility pass. The completed Run #1 and closed Run #2 artifacts
are never read or mutated by the gate.

## June 16, 2026 — first live evaluation

`decision: evaluating`. 91 candidates scored; **5 eligible** (WC double-chance / DNB favourites,
survival 80–93) but spanning **only 3 distinct games** → cannot form two non-correlated lanes. All
MLB single-player props were rejected (volatility + unconfirmed-lineup DNP). The eligible WC
favourites are also too short-priced (−850 to −3000) to build a meaningful 2-leg return. → **No
qualifying Run #3 launch.** This is the gate working as intended.
