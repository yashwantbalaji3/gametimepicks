# UFC Beta Public Launch Policy

_Last updated: 2026-06-09._

UFC has two distinct public tracks. **Beta** ships now; **official validated** stays
fail-closed until the backtest passes. They never share a label.

## Official validated UFC picks (still gated)
- Require `backtestReady=true` (≥150 clean graded fights + acceptable calibration).
- Public parlays additionally require `parlaySimReady=true`.
- Remain **disabled** until validation honestly passes. Beta does NOT change these gates.
- `projectionsReady` / `parlayReady` stay derived from the official readiness ladder only.

## Beta UFC projections (public now)
Eligible (`betaProjectionsEligible=true`) only when ALL hold:
- a real ESPN card exists (`schedule-latest.json`),
- card-only The Odds API h2h lines are matched to that real schedule,
- fighter stats resolve for both sides (deterministic unique match; ambiguous → dropped),
- no futures / hypothetical bouts remain,
- internal moneyline model output exists,
- per-row data quality ≥ 0.75,
- every row is labeled **beta** and market scope is **h2h / moneyline only**,
- public copy is honest (no banned terms; never "official"/"validated"/"guaranteed").

## Beta Suggested Parlays (public now)
Eligible (`betaParlaysEligible=true`) only when:
- beta projections exist,
- legs are **moneyline only** (no method/distance/round, no props),
- no same-fight duplicate legs,
- no low-quality / unmatched / futures legs,
- cards are short (Conservative ≤2 legs, Balanced ≤2 legs; built only from strong model favorites ≥0.65),
- every card is labeled beta/experimental and makes no validation claim.
- If no card qualifies → `publicReady=false`, polished empty state, never a forced parlay.

## Auto-hide beta when
schedule invalid · odds missing/stale/post-commence · fighter stats missing ·
futures/hypothetical detected · model output missing · rows carry blockers · copy audit fails.
The `/ufc` page renders beta sections only when the artifact flags are true and rows exist;
otherwise it falls back to the locked/validation-progress state.

## Honesty guarantees
- `officiallyValidated` is **always false** in beta artifacts while backtest is not ready.
- No fake backtest rows, no fabricated prop odds, no method/distance/round projections.
- Beta is real schedule + real sportsbook moneylines + fighter stats + a conservative
  (≤4pp, shrunk-to-market) model — clearly marked experimental and not yet backtested.
