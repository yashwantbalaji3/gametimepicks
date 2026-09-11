# Morning trigger — a start signal that does not depend on GitHub's scheduler

**Why.** On 2026-09-11 GitHub started the first nightly-settle 4h22m late and never started
cron-watchdog or the three morning backstops. The whole morning chain (settle → projections → MLB
production → daily products) hangs off that first start.

**What.** A Vercel cron (`app/vercel.json`, `20 9 * * *` UTC ≈ 5:20 AM EDT / 4:20 AM EST; Hobby crons
may fire anywhere in that hour) calls `app/api/morning-trigger.mjs`. It lists today's nightly-settle
runs and starts one through GitHub's API **only** if none has succeeded, is queued, or is running
today (ET). The GitHub schedules stay in place as the backup. Decision logic:
`app/api/_morning-trigger-core.mjs`, guarded by `app/src/lib/morning-trigger.test.mjs`.

**Status: FAIL-CLOSED until the founder adds the token.** Without it the endpoint answers 503 and
starts nothing.

## Founder step (≈3 minutes)

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories → gametimepicks**
   - Permissions → Repository → **Actions: Read and write** (nothing else)
   - Expiry: your choice (note the date — the trigger goes quiet when it lapses)
2. Vercel → project **gametime-picks** → Settings → Environment Variables → add
   `GTP_DISPATCH_TOKEN` = the token, environment **Production** only. Redeploy (or wait for the next deploy).
3. Never paste the token into chat, a commit, or an issue.

**Verify.** The next morning, the Vercel function log for `/api/morning-trigger/` shows
`dispatched` (or `skipped — already succeeded today`), and `gh run list --workflow nightly-settle.yml`
shows a `workflow_dispatch` run by your account.
