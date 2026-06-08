# Suggested-Parlay Quality Gates (latest)

What now gates a market/leg INTO the public Suggested sections (publish-only;
generated-pool tracking is unaffected).

## Market quarantine (by settled Wilson lower bound; explicit override supported)
| wilsonLo | status | sections allowed | current markets |
|---|---|---|---|
| < 0.41 | disabled | none | batter_total_bases (0.40), NBA AST (0.41) |
| 0.41–0.46 | high_risk_only | High, Longshot | pitcher_strikeouts (0.42) |
| 0.46–0.50 | downweighted | not Low; ranked lower | batter_hits_runs_rbis (0.47) |
| ≥ 0.50 | allowed | everywhere | batter_hits (0.51), NBA PTS (0.51), REB (0.52) |

Unmeasured markets default to **allowed** (never invent a negative signal). A
`suggestedStatus` field in `market-reliability.json` overrides the derived value
(manual kill-switch).

## Low-risk leg gate (all required)
allowed market · Over/Under with a line · non-stale recent form · L10 ≥ 80% ·
negative-odds price (heavy-fav ≥80% L10, favorite ≥90% L10, near-even needs 5/5
L5). Plus-money is never Low. If nothing qualifies, **Low is empty** (no padding).

## Leg ranking (`_sgp_leg_quality`)
Driven by realized reliability + recent form; **high edge is penalized**
(overprojection); confidence label untrusted; downweighted markets ranked below
allowed. Tests cover every rule (`MarketQuarantineTests`, updated ranking tests).
