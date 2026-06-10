# UFC Moneyline Model Methodology

_Last updated: 2026-06-09. Companion to `ufc-prediction-methodology-latest.md`._

## Sportsbook market baseline
The model starts from the **sportsbook moneyline** (The Odds API MMA, h2h). Prices are
converted to implied probability and de-vigged (single-side normalization) to a market
baseline. The market is treated as a strong prior — the model adjusts, it does not replace.

## Fighter stats source
Derived features from the **Greco1899/scrape_ufc_stats** CSVs (UFCStats-sourced, GPL-3.0,
attribution kept; only derived features published, never raw CSVs). Names are matched
deterministically (exact → suffix-stripped → normalized-unique); ambiguous matches are
**blocked**, never guessed.

## Signals used (deltas between the two fighters)
- **Recent form** — last-5 win rate.
- **Finish profile** — career finish rate.
- **Striking** — significant strikes landed per round.
- **Grappling** — takedowns per round.
- **Physical/profile** — reach, age, experience (fight count).

## Conservative adjustment cap
The model computes a small logistic adjustment from the deltas, **shrunk toward the
market** and **capped at ±4 percentage points** (further shrunk when data quality < 0.75).
This keeps every projection close to the market — by design, the model expresses a *lean*,
not a contrarian call.

## Beta status (public, experimental) — 2026-06-09
The model powers a **public beta** track (`beta-projections-latest.json`,
`beta-suggested-parlays-latest.json`): real ESPN schedule + The Odds API h2h lines +
fighter stats + the conservative model above. Beta is clearly labeled experimental and
**not yet backtested**; `officiallyValidated` is always false while `backtestReady=false`.
Beta parlays are **moneyline only**, conservative (strong model favorites ≥0.65, ≤2 legs,
no same-fight duplicates).

## Official launch gates
- `projectionsReady` requires `backtestReady=true` — ≥150 clean graded fights from
  forward-collected pregame snapshots + acceptable calibration (Brier vs market,
  model not worse than market, max adjustment ≤4pp, zero leakage).
- `parlayReady` additionally requires `parlaySimReady=true`.
- Beta does **not** change any of these gates.

## Why props are not shown yet
The Odds API MMA exposes **h2h only** (live-confirmed). No method/distance/round
projections are produced without a real prop-odds feed (see
`docs/research/ufc-prop-odds-provider-search-latest.md`).

## What turns beta into official validated picks
Run the pre-card/post-card loop every real card to accumulate clean graded fights. When
the backtest clears 150 clean rows with acceptable calibration, `backtestReady` flips,
`projectionsReady` follows, and official validated moneyline projections publish
automatically; `parlaySimReady` then unlocks official parlays.
