# UFC public UX polish (fail-closed) — June 9

Adds the first public UFC surface — polished + honest, **no picks**.

## Shipped
- **`/ufc` page** (`app/src/app/ufc/page.tsx`): server component that reads the
  real readiness artifact and renders:
  - honest header using the artifact's `publicMessage` (educational, no guarantees),
  - a **data-readiness ladder** (Schedule ready ✓; Odds / Fighter stats / Grading /
    Backtest pending; Model picks & Suggested Parlays **locked**),
  - gated empty states for Projections + Results (no fake content),
  - a plain-English "why the wait" note (no odds-only/name-only picks).
- **Discoverability:** the existing `SPORTS_COVERAGE` UFC entry now links to
  `/ufc` (Overview) + the schedule, with copy that states picks are data-gated.

## Honesty / fail-closed
- The page derives every state from `readiness-latest.json`; if a provider gate is
  false, that row shows "pending" and picks stay "locked". If the artifact is
  missing, the page fails closed (everything pending).
- No banned certainty copy. "Locked" labels the picks GATE (the opposite of an
  overclaim). No projections, parlays, odds-only claims, or fake fighters.
- Build verified: 156 static pages incl. `/ufc` (prerendered); tsc clean;
  ufc-types tests pass.

## Not changed
NBA/MLB live behavior, Results (UFC excluded until graded), V2 (internal). UFC
projections/parlays remain locked until odds + fighter stats + grading + backtest
exist (see the foundation PR + provider/model plans).
