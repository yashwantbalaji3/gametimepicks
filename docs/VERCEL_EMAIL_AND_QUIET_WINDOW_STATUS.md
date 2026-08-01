# Vercel Email & Quiet Window Status (2026-07-31 close)

## Email

Unchanged from `VERCEL_DEPLOYMENT_EMAIL_FINAL_STATUS.md`: engineering-complete;
**one founder click** (team → Settings → My Notifications: Failures, Promotions, Domain, Usage
@75/100%). Vercel does not natively email queued/started/per-success states — current account
evidence has shown nothing to the contrary; the next data deployment after the toggle is the
natural receipt proof (no forced failures; failure-class delivery already proven by the June
rate-limit emails). Discord remains the hard workflow-failure channel — 5 workflows wired plus
WARNING-kind sentinels (credit budget, watchdog, top-up fail-closed).

## Duplicate quiet window (through Aug 7)

Four entries banked in `VERCEL_DUPLICATE_QUIET_WINDOW_LOG.md`; latest verification
**2026-07-31 ~22:25 ET**: duplicate's last deployment still `2026-07-31T17:16:04Z` — dormant
through the busiest deploy evening on record (production pushes, previews, and the analytics
staging branch). Single `Production` env naming and single Vercel status context persist; no
unique domain/hook/config dependency has surfaced. Daily check:

```bash
gh api "/repos/yashwantbalaji3/gametimepicks/deployments?environment=Production%20%E2%80%93%20gametimepicks&per_page=1" --jq '.[0].created_at'   # expect: 2026-07-31T17:16:04Z, forever
```

Deletion stays a separate founder decision at the Aug-7 review.
