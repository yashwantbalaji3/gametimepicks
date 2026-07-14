# SimTheGame-Level Output Contract (2026-07-14)

The per-market truth table that ends the "why don't we just show it" debate. For every output a full simulator
would show, this states what we can honestly produce **now**, what unlocks it, and whether it is public/product
safe. Status vocabulary:

`supported_public` · `market_implied_public` · `internal_validating` · `provider_backed_settlement_pending` ·
`provider_needed` · `model_needed` · `settlement_needed` · `unavailable`

## Soccer / World Cup

| Output | Current status | Needed to unlock | Public safe? | Product eligible? |
|---|---|---|---|---|
| 1X2 (match result) | market_implied_public **+** internal_validating (v1 FIFA-Poisson, backtested N=64) | market baseline to promote the internal model | Yes (market-implied) | Yes (team market, settleable) |
| Total goals O/U | market_implied_public + internal_validating | market baseline | Yes (market-implied) | Yes |
| BTTS | market_implied_public + internal_validating | market baseline | Yes (market-implied) | Yes |
| Double chance / DNB | market_implied_public + internal_validating | market baseline | Yes (market-implied) | Yes |
| Projected goals (xG-style λ) | internal_validating (Poisson λ, not xG) | market baseline + real xG data | **No** (internal) | No |
| Correct-score distribution | internal_validating (Poisson matrix) | validation + founder approval | **No** (internal) | No |
| Team totals | market_implied (thin books) | settlement wiring | market-implied only | No (settlement pending) |
| Player goalscorer / shots / SOT / assists | provider_backed_settlement_pending | paid API-Football (2026 stats) | display only, "settlement pending" | **No** |
| Corners / cards | provider_needed / model_needed | event-data provider | No | No |
| Lineups / injuries / referee | provider_needed | lineup + injury feed | No | No |
| Bracket / tournament impact | supported_public | — (done) | Yes | n/a |
| Market agreement / biggest leans | market_implied_public | — | Yes (market read) | n/a |
| Confidence / risk | market_implied_public | — | Yes | n/a |

## MLB

| Output | Current status | Needed to unlock | Public safe? | Product eligible? |
|---|---|---|---|---|
| Player props (batter/pitcher) | supported_public (10k artifact) | — | Yes | Yes (settleable via StatsAPI) |
| Player-prop distributions | supported_public | — | Yes | n/a |
| Win probability | internal_validating (market_anchored_simulation) | backtest beats market + approval | **No** | No |
| Projected runs / total-runs / margin dist | internal_validating | backtest + approval | **No** | No |
| Scoreline buckets | internal_validating | backtest + approval | **No** | No |
| Moneyline / run-line / total (full-game) | market_implied_public (de-vigged lines) | — | Yes (market-anchored) | Yes (team markets, StatsAPI settle) |
| Team totals / F5 / alt lines | provider_needed / settlement_needed | odds ingest + settlement | No | No |
| Pitcher/bullpen/lineup/park/weather impact | model_needed | features + validation | No | No |

## UFC / NBA / NHL
`experimental` / `unavailable` across the board — no validated engine, no product eligibility. Out of scope until
soccer + MLB are settled.

## The three rules this table enforces
1. **market_implied_public** = we show the de-vigged price, labelled as such. Honest, not a model claim.
2. **internal_validating** = the artifact exists but stays under `data/internal/`; **no numbers surface** until a
   backtest beats a market baseline and the founder approves.
3. **provider_/model_/settlement_needed** = "coming soon" with a real reason, never a fabricated value.

## What this contract says about "stop circling"
The public reports are already at the honest frontier of `market_implied_public + supported_public`. The next
real gains are **not** UI — they are (a) a **soccer market baseline** (blocked on a paid odds-history provider)
and (b) **MLB full-game validation** (data we have). Everything else needs a provider. See
`SIMTHEGAME_PARITY_PROVIDER_ROADMAP.md`.
