# MLB Independent Full-Game Model — Feature Plan (2026-07-14)

The market-anchored engine **mirrors the closing market** at scale (81 games, ΔBrier −0.0005 — see
`MLB_FULL_GAME_PUBLIC_READINESS_AUDIT.md`). By construction it re-derives the book's probabilities, so it can
never beat them. Beating the market requires **information the market doesn't already fully price** — real
features. This plan adds them **one signal at a time**, each measured against the 81-game closing-market baseline,
each **internal-only, public:false, out of Bank Builder / Moonshot** until it clearly and repeatably wins.

## The discipline (non-negotiable)
1. **One signal at a time.** Add a feature, re-run `backtest-mlb-full-game-vs-market.mjs`, and keep it **only** if
   it improves Brier + log loss vs the market on a held-out sample. No feature is added on a hunch.
2. **Leakage control.** Every feature value must be knowable **before first pitch** (probable pitchers, standings,
   bullpen usage through the prior day, park, forecast). Never use anything from the game being predicted.
3. **Independent, not re-anchored.** The signal must move the win prob **away** from the market in a way that is
   *right more often than the market* — otherwise it's just noise around the anchor. The engine already supports
   bounded "shadow" adjustments (`independent` inputs in `GameSimInput`); this plan makes them real + validated.
4. **Internal gate stays shut.** `public:false`, no public win-prob / projected runs / distributions, not
   product-eligible, until a feature (or stack) **beats** the market out-of-sample AND the founder approves.

## Signals, in priority order (highest expected edge first)

### 1. Probable pitcher strength ⭐ (biggest lever)
- **Why:** the starting pitcher is the single largest driver of a team's run expectation; the market prices it,
  but pitcher form/matchup mispricings are the classic edge.
- **Inputs (pre-game):** season + trailing-30d ERA/FIP/xFIP, K-BB%, opponent handedness splits, days rest.
  Source: StatsAPI (probable pitchers + game logs).
- **Model move:** convert a pitcher-strength delta into a bounded shift on each team's run mean → win prob.
- **Done when:** with pitcher strength on, Brier + log loss beat the market on held-out dates; the shift is
  bounded (no runaway); leakage test passes (only prior starts used).

### 2. Bullpen fatigue
- **Why:** a gassed bullpen (heavy usage the prior 1–3 days) inflates late-game run allowance — often underpriced.
- **Inputs (pre-game):** relievers' pitch counts / appearances over the trailing 3 days, closer availability.
  Source: StatsAPI box scores (strictly-earlier).
- **Model move:** widen the trailing-innings run distribution / bump the opponent's late run mean when fatigue is high.
- **Done when:** measured lift on totals/over calibration without hurting moneyline.

### 3. Park & weather
- **Why:** run environment varies materially by park and by wind/temperature; the total line prices the park but
  same-day weather (wind out/in, temp) is a smaller, sometimes-underpriced signal.
- **Inputs:** static park run factors (replace the current approximate ±3%) + game-time forecast (wind vector,
  temp). Source: park-factor table + a weather API.
- **Model move:** scale the total run mean by a park×weather factor; re-derive over/under.
- **Done when:** total-runs MAE / O-U calibration improves vs the market baseline.

### 4. Team offense / defense splits
- **Why:** vs-LHP/RHP and home/away offensive splits refine each team's run mean beyond the market's team prior.
- **Inputs (pre-game):** team wRC+ / runs-per-game splits by opponent handedness + home/away, trailing windows.
- **Model move:** adjust each team's run mean by the matchup-appropriate split.
- **Done when:** joint lift with pitcher strength (they interact) is positive out-of-sample.

### 5. Confirmed lineups
- **Why:** a star resting or a callup starting changes the run mean; lineups post ~2–4h pre-game.
- **Inputs:** confirmed starting lineup (batting order + who's out). Source: StatsAPI lineups (when posted).
- **Model move:** adjust the team run mean by the delta between projected and confirmed lineup strength; when
  lineups aren't posted, fall back to projected (flag `lineupStatus: projected`).
- **Done when:** measured lift on games with confirmed lineups; graceful fallback when not posted.

## Validation harness (already built)
- **Baseline:** `data/internal/mlb/reference/mlb-closing-odds.json` (82 games, de-vigged closing market).
- **Backtest:** `backtest-mlb-full-game-vs-market.mjs` → Brier / log loss / winner acc / total MAE / margin MAE /
  O-U / run-line / calibration, sim-vs-market paired.
- **Add a feature** → regenerate sim artifacts with that `independent` input on → re-run → compare Δ vs market.
- **Grow the sample:** fetch more settled dates (The Odds API historical + StatsAPI linescores) so each feature is
  tested on a wider, out-of-sample window, not the same 81 games it was tuned on.

## Explicit non-goals (for now)
- No public MLB win probability, projected runs, total-runs/margin distribution, or scoreline buckets.
- No product eligibility (Bank Builder / Moonshot never consume the full-game sim).
- No claim of an "independent" or "market-beating" model until a feature stack **demonstrably** beats the closing
  market out-of-sample and the founder signs off.
