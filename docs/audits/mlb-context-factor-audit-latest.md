# MLB Context Factor Audit (latest)

| Factor | Status |
|---|---|
| Recent form L5/L10 | implemented + used |
| Market reliability (batter_hits allowed; total_bases/strikeouts/HRR gated) | implemented + used (#306) |
| Odds band (favorites preferred; plus-money not Low) | implemented + used |
| Volatility score | implemented + used (#307) |
| Lineup status (confirmed in lineup) | **missing provider** |
| Lineup spot / expected plate appearances | **missing provider** |
| Batter handedness / pitcher handedness / platoon | **uncertain — not confirmed wired** |
| Park factor | **missing provider** |
| Weather / wind | **missing provider** |
| Starting pitcher quality | **uncertain / not a direct factor** |
| Bullpen fatigue | **missing provider** |

## Safe upgrades already in force (no new providers)
Prefer batter_hits over quarantined markets; prefer heavy favorites; require
fresh/reliable recent form; penalize high-edge overprojection; exposure caps;
fewer public cards when the eligible pool is thin. These are live (#306/#307).

## Honest gap
Without lineup/PA, platoon, park, weather, and bullpen context, MLB leg accuracy
sits near coin-flip outside batter_hits — which is exactly why only batter_hits
is publish-eligible. These are the highest-value future providers; none are faked.
