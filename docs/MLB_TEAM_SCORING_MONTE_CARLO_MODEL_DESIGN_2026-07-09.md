# MLB Team-Scoring Monte Carlo — Model Design (2026-07-09)

The conservative first version: a **market-anchored** simulation. Pure engine at
`app/src/lib/full-game-sim/mlb/` (`rng`, `expected-runs`, `simulate-game`, `artifact-builder`),
deterministic (seeded), no io/money. Emits a schema-valid `FullGameSimulationArtifact` labelled
`market_anchored_simulation` / `hybrid_shadow` / `experimental_internal`.

---

## Pipeline

1. **Expected runs (market anchor).** With home/away runs modelled as independent overdispersed counts
   (variance = mean·VMR), the run-margin variance is `total·VMR` regardless of the split, so the margin
   matching the market home-win-prob `p` is closed-form:
   `m = Φ⁻¹(p) · √(total·VMR)`; then `homeExp = (total+m)/2`, `awayExp = (total−m)/2`.
   ⇒ simulated total ≈ market total and simulated win prob ≈ market win prob **by construction**.
2. **Count model.** Negative binomial per team (Gamma–Poisson mixture, `variance = mean·VMR`, VMR ≈ 1.35)
   — MLB team runs are over-dispersed vs Poisson. `VMR = 1` degrades to Poisson.
3. **Monte Carlo.** N = 10,000 seeded draws of `(awayRuns, homeRuns)`.
4. **Derive** win probability, projected score, total-runs + margin distributions, run-line / total
   coverage, and the most common scorelines.

## Assumptions — acceptable or risky

| Assumption | Acceptable? | Note |
|---|---|---|
| market total ≈ expected total | ✅ | the total line is the market's ~median total |
| win margin anchored to the moneyline | ✅ (honest) | this is *why* it's market-anchored, not independent |
| negative-binomial runs, VMR ≈ 1.35 | ⚠️ documented | not fitted per-game; a fixed dispersion assumption |
| team runs independent | ⚠️ | ignores game-state correlation (blowouts, bullpen) |
| ties → 0.5/0.5 win | ⚠️ minor | a stand-in for "headed to extra innings" |
| no pitcher/park/lineup adjustment | ⚠️ (limits value) | none are committed — see the input audit |

## Fields this model fills vs leaves caveated

- **Fills:** `winProbability` (`hybrid_shadow`), `projectedScore`, `distributions.{totalRuns, margin}`,
  `marketCoverage.{moneyline (market_implied), runLine, total}` (`hybrid_shadow`), top scorelines.
- **Caveated / not independent:** the win probability is market-anchored (carried as `hybrid_shadow`,
  with the raw market moneyline kept separately as `market_implied`). No independent predictive signal.
- **Still blocked:** a fitted, market-independent model; per-inning / joint score distributions;
  pitcher/park/weather effects.

## Limitations

Because it's market-anchored, its moneyline/total accuracy will **track the market baseline** — it
cannot beat the market. Its genuine added content is the *distributions* (margin, total, alternate-line
cover) the market doesn't publish directly. Value beyond the market requires the missing scoring inputs
+ a fitted model, gated on a real forward backtest. **Not for public rollout.**
