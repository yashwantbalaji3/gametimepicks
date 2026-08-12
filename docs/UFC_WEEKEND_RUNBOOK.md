# UFC Weekend Runbook — pre-card and post-card operations (Program 166 · Release F slice)

The instruments already exist (lineage classifier, results capture/adapter, corrections monitor,
bout_winner contract); this runbook sequences them around a real card. Next card: UFC 330
(Aug 15, per the committed schedule). Nothing here fabricates lineage, results, or replacements —
reality supplies receipts, these steps read them.

## Pre-card (fight-day morning, after the ~14:10 UTC cadence)

1. Verify the cadence: `npx tsx scripts/ops/verify-cadence-receipts.mjs --run <id> --before <run headSha>` — ufc-schedule should be QUALIFYING_CHANGE or NO_CHANGE_PROVEN.
2. Lineage diff vs the prior capture (`classifyUfcLineage(prev, latest)`): REPLACEMENT /
   BOTH_CORNERS_CHANGED / CANCELLED entries are the replacement-watch receipts — record them on
   the watch card; zero changes is a valid no-change observation.
3. Weigh-ins remain MISSING (no authorized timestamped source) → affected bouts would abstain in
   any future shadow run; nothing to do besides keeping the matrix honest.

## Post-card (next cadence after the card ends)

1. Results: ufc-results should be QUALIFYING_CHANGE; the adapter must show the card's finals
   JOINED (bout captures carry their lineage) with population-exact reconciliation; draw/NC
   finals surface as VOID_PENDING_REVIEW — visible, never silently settled.
2. Corrections: `monitorUfcResults(prev, next)` — OVERTURNED_RESULT / DECISION_CHANGE /
   STATUS_REGRESSION are review-gated with append-only receipts (commission overturns are real).
3. Update the sport assessment ONLY from these receipts; the settlement stage needs a
   scheduled-run joined receipt (the Aug-12 five-bout join was a bounded manual observation).

## Incident paths

- Card postponed/moved → schedule diff shows EVENT_DATE_CHANGE; results stay NO-change; nothing grades.
- A bout vanishes inside the window → DISAPPEARED_UNEXPECTED (preserve both records, review).
- Provider outage on fight day → SOURCE_STALE, last-known-good stands; the next cadence catches up.
