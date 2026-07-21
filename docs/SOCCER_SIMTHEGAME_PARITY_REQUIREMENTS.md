# Soccer SimTheGame Parity Requirements — future active competitions only

**Hard constraint:** the 2026 FIFA World Cup is **complete and closed off** (see `world-cup-closeout`). Nothing in this doc reactivates it. World Cup may appear only as archive / methodology / past-proof. Soccer parity here targets a **future active competition** (a league or tournament with live fixtures, odds, and settlement) — not the World Cup.

**Why this doc exists:** SimTheGame's reference screenshots are soccer-heavy (half results, first scorer, corners, team goal totals, match markets, Asian handicap, BTTS, double chance, scoreline distributions). To reach that presentation honestly for soccer, GameTime needs the following — none of which exist for an active competition today.

## Requirements matrix (all Class C/D — future)

| Capability | Needed input | Have it? | Class | Blocker |
|---|---|---|---|---|
| Active soccer competition | a live league/tournament we choose to cover | ❌ (WC archived) | D | product decision + calendar |
| Fixture feed | schedule + kickoff + venue | partial (ESPN schedule lib) | C | needs an active comp |
| Odds feed | 1X2 / totals / AH / BTTS / DC prices | ❌ for an active comp | D | The Odds API soccer key + credits |
| Team ratings | attack/defence strength | internal FIFA-Poisson exists (N=5, insufficient) | C | needs ≥1 validated season |
| Player projections | minutes, shots, goals | ❌ | D | player-level provider |
| Confirmed lineups | XI + bench | ❌ | D | lineup provider |
| xG provider | shot-quality feed | ❌ | D | xG provider |
| Corners | corners feed | ❌ | D | provider |
| Cards | cards feed | ❌ | D | provider |
| First scorer | scorer odds + minutes model | ❌ | D | provider + model |
| BTTS / double chance | derivable from a bivariate-Poisson score model | internal engine exists, unvalidated | C | validation |
| Team totals / correct score | score distribution | internal engine (bivariate-Poisson) unvalidated | C | validation |
| Asian handicap | score distribution | internal | C | validation |
| Market agreement | model probs vs de-vigged odds | possible once odds+model exist | C | inputs above |
| Distributions | score/goal histograms | internal engine can emit | C | validation |
| Settlement source | official FT result feed | had one for WC (now archived) | C | needs active-comp feed |
| Product eligibility | settleable + validated market | ❌ | D | all of the above |

## The honest gate for soccer predictions

Our internal soccer engine (`build-internal-soccer-projections.mjs`, bivariate-Poisson) is **internal-only** and flagged `insufficient_sample` (N=5). It must **not** be surfaced publicly until it is validated against a full historical season (e.g., backtest vs 2022 World Cup or a completed league season) with a calibration report — mirroring the MLB player-prop discipline. See `internal-projection-engines`.

## Realistic sequencing (when a future soccer competition is chosen)

1. Pick an **active** competition with a reliable schedule + odds + FT-result feed.
2. Ingest fixtures + de-vigged odds → ship **market context** first (like MLB team markets).
3. Validate the internal bivariate-Poisson engine on that competition's history → calibration report.
4. Only then surface model reads (match result, totals, BTTS) behind the same public gate MLB uses.
5. Player markets (shots, first scorer) require a separate player-level provider + model — furthest out (D).

## Where we are behind SimTheGame on soccer, plainly

Behind on **everything** for an active competition: we have no live soccer product, no active odds feed, no validated model, no player feed. The only soccer asset we have is an **unvalidated internal score engine** and an **archived** World Cup. Closing this is a multi-provider, multi-week effort gated on a product decision to cover a specific future competition — not a code toggle.
