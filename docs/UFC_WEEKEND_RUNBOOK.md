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
3. Weigh-ins remain MISSING (no authorized timestamped source) → the shadow ladder's
   CARD_UNCERTAIN rule abstains on any lineage instability; nothing to do besides keeping the
   matrix honest.
4. **Shadow preflight (P167-F):** `node scripts/ufc/ufc330-shadow-preflight.mjs --now <iso>` —
   per-bout ladder states from the newest two committed captures. Expected shape pre-
   authorization: READY_EXCEPT_ODDS for covered bouts, ABSTAIN(SPARSE/IDLE/IDENTITY/
   CARD_UNCERTAIN) elsewhere; probabilities CANNOT appear (no authorized market). The Aug-12
   receipt: 11 READY_EXCEPT_ODDS + 1 ABSTAIN(SPARSE) across the twelve bouts.
5. **Market preflight:** the odds lane stays AUTHORIZATION_REQUIRED (see /launch sports cards)
   unless a founder authorization receipt lands in the repository. If one does: ONE guarded
   canary (`--sport ufc --max-credits 5 --authorized`), then re-run the preflight — covered
   bouts with fresh two-way h2h flip to CURRENT_PRE_EVENT (validateShadowRun-clean, private,
   publicActivation OFF). No receipt → no call; the preflight is complete evidence by itself.
6. **Freeze review:** any bout still ABSTAIN at freeze stays ABSTAIN — a no-play is an answer.
   Late lineage changes after freeze (replacement announced fight-day) re-run step 4; the
   CARD_UNCERTAIN abstention is the correct terminal state for those bouts.

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
