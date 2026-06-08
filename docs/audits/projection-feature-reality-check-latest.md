# Projection Feature Reality Check (latest)

> Honest availability matrix. The settled leg-level evidence (only batter_hits
> clears 50%; ~50% elsewhere) is itself proof the projections are near-coinflip
> on most markets — consistent with the missing context below. This is a
> high-level assessment from settled behavior + known pipeline inputs; a deeper
> per-feature code audit is the recommended next step (not completed here — not
> claimed as done).

## MLB (batter/pitcher props)
| Factor | Status |
|---|---|
| recent form (L5/L10, recentSeries) | implemented + used |
| edge vs market line | implemented but MIS-CALIBRATED (high edge = worse) |
| market implied prob / odds band | available; now used as hard gate |
| market reliability (settled) | implemented + now primary |
| lineup spot / expected PA | **missing/uncertain** — likely not wired |
| batter vs pitcher handedness / platoon | **uncertain** — not confirmed wired |
| opponent starter quality / bullpen | **missing** |
| park factor / weather | **missing** |
| confidence label | present but NON-PREDICTIVE (dropped from ranking) |

## NBA (player props)
| Factor | Status |
|---|---|
| recent form | implemented + used |
| market reliability (PTS/REB strong, AST weak) | implemented + gated |
| projected minutes / usage / pace | **uncertain/partial** |
| injuries / rotation / blowout risk | **missing/uncertain** |
| opponent defense | **uncertain** |
| odds implied prob | available; used as gate |

## Takeaway
The model lacks the contextual drivers (lineup/PA, platoon, park, bullpen,
minutes, injuries) that would push leg accuracy meaningfully above 50%. Until
those land, the only honest posture is: publish from reliable markets only,
fewer cards, and never imply high win probability. No fake features were added.
