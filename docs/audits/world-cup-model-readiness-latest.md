# World Cup / Soccer Model Readiness (2026-06-06)

> Roadmap only — do NOT implement predictions; no data pipeline exists. Keep
> separate from MLB/NBA.

## Current app support
Schedule/board/groups pages exist (schedule-only). **No** projection model, **no**
odds ingestion, **no** prop markets, **no** grading pipeline for soccer. It is a
"coming-soon / schedule" sport in `sports-coverage.ts` (not modeled → excluded
from Suggested Parlays + Build-Your-Own by the capability gates).

## What a real soccer model would need (staged)
1. **Data sources (provider work):** fixtures + confirmed lineups/starting XI (timing-sensitive), team strength/form, market odds (match + player props), referee, venue.
2. **Markets + grading contract (new schema):** define supported props (e.g. shots, shots-on-target, passes, cards, anytime-scorer), each with a deterministic grading rule and settlement source.
3. **Features (target roadmap):** match context, team strength, tactics/formation, player role/minutes, set-piece duties, referee tendencies — all leakage-safe (pre-match only; lineups confirmed before kickoff).
4. **Leakage rules:** no post-match stats; lineup features only when confirmed pre-match; rolling form excludes the target match.

## Implementation stages (only when data exists)
- Stage 0 (now): schedule-only (current). No predictions.
- Stage 1: ingest fixtures + odds → projections-only surface (no graded parlays), gated by `capabilitiesForLevel("projections")`.
- Stage 2: add grading contract → graded suggested parlays, gated to `full`.
- Stage 3: advanced features (tactics/referee) as providers allow.

## Why separate from MLB/NBA
Different data providers, markets, grading rules, and leakage timing (lineups). Bolting it onto the baseball/basketball optimizer would risk both. Keep a dedicated soccer pipeline behind the existing capability gates so it can never leak into NBA/MLB Suggested Parlays before it's real.

## Verdict
**Not model-ready.** Schedule-only is correct today. No work beyond this roadmap without a soccer data provider + grading contract.

*Roadmap only. No code/data change.*
