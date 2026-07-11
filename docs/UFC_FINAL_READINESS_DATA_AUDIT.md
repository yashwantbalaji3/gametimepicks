# UFC Final Readiness — Data & Artifact Audit (2026-07-10)

State of the UFC data feeding the Prediction Engine V1, and the fixes this pass. Includes a correction to a
prior mislabel.

## Card

| field | value |
|---|---|
| Event | UFC 329 (schedule `eventName` "…McGregor vs. Holloway 2") · `isRealCard: true` |
| Date / venue | 2026-07-11T21:00Z · T-Mobile Arena |
| Fights | **14** (prelims + main card) |
| Odds-backed | **10** two-sided moneylines (The Odds API MMA, generatedAt today — fresh) |

## Artifacts

| artifact | status | used? |
|---|---|---|
| `schedule-latest.json` | current (14 fights) | ✅ engine source |
| `odds-latest.json` | current (today) | ✅ moneyline (market-implied) |
| `fighters-latest.json` | **2,695 fighters** (canonicalName + aliases + finishes/rates/record) | ✅ engine style-score source |
| `features-card-latest.json` | 9 card bouts with deltas | available (not required by V1) |
| `expanded-projections-latest.json` | **7 fights = the MAIN-CARD subset of this schedule** | not consumed by the engine; safety-guarded in the Expanded tab |

## ⚠️ Correction to the prior "stale expanded-projections" claim

The previous pass reported `expanded-projections-latest.json` as **stale / a different card**. That was a
**misdiagnosis** — it compared only the first three *prelim* schedule fights. On full check, **all 7 expanded
fights' fighters are on the current 14-fight schedule** (they are the main card: Topuria/Gaethje,
Pereira/Gane, O'Malley/Zahabi, etc.). The expanded artifact is **current**, just a subset (main card only).

The V1 engine still derives fight-type/distance/method from the **fighter-stats DB** rather than the
expanded artifact, because the DB covers MORE fights (12/14 vs 7). A future pass may prefer the expanded
per-bout method splits where present.

## Stale-artifact GUARD (shipped)

Even though the artifact is current today, `/ufc` now filters the Expanded tab to only fights whose fighters
are on the **current schedule** (`schedFighterKeys`). If a future expanded artifact is generated for a
different card, its wrong-card fighters are dropped automatically instead of shown publicly.

## Coverage after this pass

- **Model-derived reads: 12 / 14** (up from 11) — diacritic folding recovered **Benoît Saint Denis**.
- **Insufficient data: 2** — **John Garza** and **Gable Steveson** are genuinely absent from the 2,695-fighter
  DB (a last-name fallback would false-match "Pablo Garza" / none; correctly rejected). Honest, not hidden.
- **Market moneylines: 10.**

Validation unchanged: `moneylineValidated=false`, `publicPicksVisible=false`, `cleanGradedRows 0/150`.
