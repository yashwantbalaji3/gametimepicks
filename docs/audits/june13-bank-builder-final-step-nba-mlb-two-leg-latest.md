# Bank Builder final step — remove stale Brazil blocker, retarget NBA+MLB / 2-NBA

Run: 2026-06-13 ~21:51 UTC (~5:45 PM ET) · Base `f43947f`. UI/copy cleanup — the Step 5
candidate itself was already published (pending) in PR #474. No data/ledger mutation.

## State at baseline
- Bank Builder $3,623.97 / 4-0 / Step 5/5. Official Step 5 Candidate (NBA Wembanyama Rebounds
  Under 11.5 + MLB Kyle Freeland K Under 4.5, +207, return $11,142.32) PUBLISHED + PENDING (#474).
- Production check: `/bank-builder` already renders the candidate (Wembanyama×2, Freeland×4),
  **Brazil = 0, API-Football = 0** — the stale Brazil panel was NOT actually showing on prod
  (the user's view was a pre-#474 cache). But the stale Brazil/API-Football logic still lived
  in the code's FALLBACK panel and would resurface if the candidate ever cleared.

## What this run changed (code only)
1. **Removed the Brazil / World Cup / API-Football blocker from the Step 5 fallback panel.**
   `loadStep5TargetStatus` was retargeted from "Brazil (WC) + NBA" to the owner-authorized
   "best real 2-leg card from NBA Finals + MLB, or two NBA Finals legs" — it now computes
   NBA + MLB readiness (both ready) and never references Brazil/World-Cup/API-Football.
2. **Page panel** copy + leg-state tones updated (dropped the dead "BLOCKED" state); the
   final-step review copy is now: "The model is evaluating NBA Finals and MLB legs for a
   2-leg card that can take $3,623.97 to $10,000+." World Cup no longer blocks Bank Builder.
3. **`/picks` now leads with a Bank Builder final-step callout** (when a candidate exists):
   the two legs, combined +207, $3,623.97 → $11,142.32, "Official Step 5 Candidate · pending",
   "Road to $10K", linking to /bank-builder. (Bank Builder lane first.)

## Published candidate (unchanged from #474 — pending, not settled)
- NBA: Victor Wembanyama Rebounds Under 11.5 @ -122 DK (model 0.72, market 0.55, edge +20.5%).
- MLB: Kyle Freeland Strikeouts Under 4.5 @ -145 DK (model 0.71, market 0.59, edge +11.6%,
  probable starter, 10:06 PM ET).
- Combined +207 · stake $3,623.97 · return $11,142.32 · profit +$7,518.35 · combined model
  0.51 · cross-sport zero correlation · both upcoming tonight.

## Integrity
Pending, not settled. Bankroll/record/ledger UNCHANGED ($3,623.97 / 4-0 / Step 5). No data
mutation this run (code only). World Cup stays honestly unavailable on /world-cup but no longer
blocks Bank Builder. 863 tests · tsc + build clean · copy + secret audits clean · 0 Brazil
references in the built Bank Builder page.

## Next operational step (NOT done here)
Settle Step 5 tonight ONLY from official box scores (Wembanyama rebounds + Freeland strikeouts),
after both games are final.
