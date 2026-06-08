# Current Methodology Factor Inventory (latest)

> Honest classification of every selection factor as of main `a7828f7`
> (post #306 quarantine + #307 volatility/Bank-Builder). No fabrication.

| Factor | Status |
|---|---|
| Market reliability (settled Wilson-lo, per market) | **implemented + primary** (#306 quarantine + ranking) |
| Market quarantine (disabled/high-risk-only/downweighted/allowed) | **implemented + used** |
| Recent form L5/L10 (leaned side vs line) | implemented + used (ranking + Low/Bank gates) |
| Recent PLAYOFF form (NBA) | implemented + used — provider fetches Playoffs first |
| Volatility score (odds band, stale, sample, edge, L5/L10 disagree) | **implemented** (#307); tiebreaker + Bank gate |
| Odds band (favorite vs plus-money) | implemented + used (Low negative-odds; Bank ≤ -150) |
| Stale / missing form flags | implemented + used (fail-closed in Low/Bank) |
| Edge / model probability | implemented but DE-WEIGHTED (high edge penalized — overprojection) |
| Confidence label | present but NOT trusted (settled-inverted) |
| Per-game minutes (NBA, historical) | available in game logs; NOT used as a trend factor yet |
| Lineup status / lineup spot / expected PA (MLB) | **unavailable / missing provider** |
| Batter/pitcher handedness, platoon (MLB) | **unavailable / not confirmed wired** |
| Park factor / weather / wind (MLB) | **missing provider** |
| Starter quality / bullpen fatigue (MLB) | **missing provider** |
| NBA series score / playoff-game flag / Finals flag | **unavailable in data** (board has teams/tipoff/status only) |
| NBA injuries / questionable / out / minutes restriction | **missing provider** |
| NBA projected minutes / usage / role change | **missing provider** (only historical minutes exist) |
| Team implied total / spread / total / blowout risk | **unavailable in data** |
| Player/team/game exposure caps | implemented + used |
| UFC anything | schedule-only / fail-closed (no picks) |

## Recommended next steps (leakage-safe, provider-gated)
NBA: ingest series state + injury report + a projected-minutes/role source →
flag unknowns explicitly. MLB: lineup/PA + platoon + park/weather providers.
Until then: do not boost confidence from absent factors; flag unknown/stale.
