# UFC Prediction Engine V1 (2026-07-10)

A real, deterministic engine that turns the repo's UFC data into ONE complete read per fight — replacing the
"Provider needed" clutter with formula-backed reads, honestly labeled. Also documents data-source coverage.

## Data sources used

| source | path | fields used | coverage (UFC 329) |
|---|---|---|---|
| ESPN MMA schedule | `public/data/ufc/schedule-latest.json` | 14 fights (fighterA/B, boutId) | 14/14 |
| The Odds API MMA | `public/data/ufc/odds-latest.json` | two-sided h2h moneyline | ~10 fights with odds |
| Fighter stats DB | `public/data/ufc/fighters-latest.json` | **2,695 fighters** · finishes (KO/sub/decision, finishRate) · rates (sig str/round, accuracy, TD/round) · record · dataCompleteness | **11/14 fights have BOTH fighters** |
| (stale) expanded projections | `public/data/ufc/expanded-projections-latest.json` | — | ⚠️ generated for a DIFFERENT card — **not used** |

The engine consumes the schedule + odds + the fighter-stats DB directly (the stale expanded artifact is
ignored — see residuals).

## Engine (`app/src/lib/ufc/ufc-prediction-engine.ts`, pure + tested)

`buildUfcCardPredictions(fights, oddsIndex, fighterIndex)` → one `UfcPredictionRowV1` per fight:

- **Moneyline — market-backed.** `impliedFromAmerican` → `deVig` (`noVig = impliedA/(impliedA+impliedB)`);
  a ≥58% no-vig favorite is a market lean; confidence bands ≥.70 high / .60 med / .58 low / else no-read.
- **Style scores from real stats** (null-safe, 0..1): `finishThreat`, `distance`, `striking`, `grappling`
  — built from each fighter's win-type shares (KO/sub/decision), finishRate, and rate stats.
- **Goes-distance** (mission 4.4): `clamp(0.5 + 0.24·(distance−0.5) − 0.30·(finishThreat−0.35), 0.25, 0.75)`.
- **Method mix** (mission 4.5): decision≈distance, KO≈striking, sub≈grappling → normalized (sums to 1).
- **Round range / fight type**: derived from the distance read + finish threat (labels only, no fake round).
- **Confidence** drops with separation-from-coinflip AND both fighters' `dataCompleteness`.
- Where odds are missing → moneyline "Odds pending"; where a fighter isn't in the DB → "Insufficient data".

## UFC 329 output (real)
**10 market-backed moneylines · 11 model-derived fight reads · 3 insufficient-data.** No provider-needed
clutter — every fight with two rostered fighters gets an experimental read.

## UI — Predictions V2 (`components/ufc/ufc-predictions-v2.tsx`)
One clean card per fight: **GameTime Read** headline, then Moneyline / Fight type / Distance / Method with a
confidence dot and a data-coverage chip, and a plain "why". An **Experimental model reads · validation in
progress** badge + a collapsible **"How UFC predictions are calculated"** methodology panel (shows the
no-vig formula + the style-score summary). The animation surfaces the featured fight's model reads.

## Honesty / guardrails
Moneyline = market-implied. Fight-type/distance/method = **GameTime V1 experimental** model reads,
validation in progress (0/150), paper-only, never a verified edge. No best bet / lock / positive EV /
official pick. No fabricated stats/odds/props/results. No external images. Money md5 `affe6b21…`, 19-14, $0.

## Residuals
- `expanded-projections-latest.json` is **stale** (a different card) — the pipeline's expanded model wasn't
  regenerated for UFC 329, so the engine computes style scores directly from the fighter DB instead.
  Regenerating it (`build_expanded_projections.py`) would add per-bout perFighter method splits.
- 3 fights have a fighter missing from the DB → honest "Insufficient data".
- The V1 style-score weights are **experimental and unbacktested** — validation (0/150) is unchanged.
