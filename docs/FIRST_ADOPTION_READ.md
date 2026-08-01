# First Adoption Read (Program 092-095 Lane H)

**State: NOT_CONFIGURED — honestly.** Analytics is STAGING_PROVEN but production collection is
not active (awaiting the one founder action in `FIRST_PARTY_ANALYTICS_IMPLEMENTATION.md`), so
there are **zero measured events and no adoption claims**. Nothing below renders publicly.

## What the first read will contain (contract, ready to fill)

When production events exist, the internal (founder-only, never exported) read reports, per
`ADOPTION_DASHBOARD_CONTRACT.md` definitions and only from validated stored events:

- Valid event counts by closed event type (22-name taxonomy).
- Reach: `daily_hub_view` / `market_center_view` / `game_report_open` counts by dayBucket.
- Interaction depth: `availability_explanation_opened`, `probability_explainer_opened`,
  `market_disagreement_opened`, `slate_filter_changed`.
- Trust loop: `results_recap_open`, `methodology_viewed`, `status_viewed`,
  `today_slate_clicked_from_results`.
- Sport interest: `sport_interest_selected` counts.
- **No unique-user, session, or retention claim** — the architecture stores no identifier that
  could support one; `return_visit.cohortBucket` counts are reported as event counts only.

Metric states remain `NOT_CONFIGURED → NOT_YET_MEASURED → NOT_ENOUGH_DATA → MEASURED /
DATA_QUALITY_BLOCKED`; no metric ever renders a fabricated zero, and no conclusion may cite a
single day.

## Seven-day operating protocol (starts at activation, alongside the quiet-window log)

Daily: operating freshness (observer) · top-up coverage gain + credits · settlement closure ·
fallback/incident count · email + Discord delivery · analytics delivery + data quality ·
interaction counts. **No product redesign until the window produces enough evidence.**
