# Program 233 — resume state

**Close tip:** `de298affe` · suites green (651 unit · 71 rendered · 472 browser · 321 a11y).

## Done
Phase 0 resync · Phase 1 review (`PROGRAM_233_PROJECT_REVIEW.md`) · Phase 2 plan
(`PROGRAM_233_ACTION_PLAN.md`) · Release A live incidents · Release B performance read model
(`app/src/lib/results/read-model.mjs`) · Release C filterable results journey
(`app/src/components/results/results-explorer.tsx`, live on `/results`).

## Next executable action — Release D, the fixed-frame simulation player

Confirmed absent: Generate auto-scrolls into a long report; there is no bounded stage, no chapter
manifest, no player controls.

Build on what already exists rather than starting over:
- `app/src/components/simulate/scenes.tsx` — four code-native sport scenes, already reduced-motion
  and hidden-tab safe, already keyed off a `phase` prop
- `app/src/components/simulate/simulation-stage.tsx` — owns the visibility/pause behaviour
- `app/src/lib/game-detail.ts` — `getGameDetail()` returns the report values a chapter must match
- `app/src/lib/simulate/day-view.ts` — the readiness state machine and its action vocabulary

Acceptance from the charter: one action begins a complete recordable narrative; the pointer can stay
still; every supported chapter is readable in one bounded area; values match the underlying report
exactly. Prototype MLB end to end first, then the other three sports.

## Do not repeat
- A guard that fails on an honest empty/mid-flight state gets deleted by whoever is on call. Use
  `app/src/lib/testing/day-in-flight.mjs`; its deadlines are **measured drift**, not cron hours.
- Two artifacts on two cadences will separate. Assert direction (behind, never ahead), not equality.
- Publication is not a label. Derive it from the thing published, not a state string.
