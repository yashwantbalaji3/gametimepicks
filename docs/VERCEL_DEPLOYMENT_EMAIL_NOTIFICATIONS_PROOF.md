# Vercel Deployment Email Notifications — Investigation & Configuration (2026-07-31)

**State: ROOT-CAUSED + CONFIGURATION MAPPED · founder toggle required (no dashboard access from
this session; no credentials requested).** Grounded against Vercel's official notifications
reference (docs page last updated 2026-06-26), not assumption.

## 1. Why deployment emails stopped — ranked

- **MOST_LIKELY (and healthy): the emails were failure emails, and failures stopped.** Vercel's
  native deployment email events are **Deployment Failures** and **Deployment Promotions** —
  there is **no per-deployment "build succeeded" email** in the current product. During May–June
  the duplicate-project era produced real failure emails (the June free-tier rate-limit run —
  "Deployment rate limited — retry in 24 hours" — blocked PR #261 and failed both projects'
  checks repeatedly). After deploy volume calmed and builds stopped failing, the failure emails
  had nothing to fire on. Silence = success, but it *feels* like notifications broke.
- **POSSIBLE:** notification preferences are per-user per-team ("changes only affect *your*
  notifications"); when the projects' team scope (`yashwantbalaji33-7164s-projects`) was
  created/upgraded, the founder's My Notifications for that team may differ from the old
  personal-scope defaults. Also, Vercel **suppresses the email if the web notification was
  already read in the dashboard**.
- **POSSIBLE:** role-based limitation — a member with the Developer role can only receive
  Deployment-failure and Integration notifications.
- **UNSUPPORTED:** any repo-side cause. Nothing in this repository sends or configures email.

## 2. Native events actually available (verified against the current docs) vs the wish-list

| Wanted | Native Vercel support | Verdict |
|---|---|---|
| Deployment queued / build started | **Not offered** as email events | GAP — dashboard only |
| Deployment ready/success (per deploy) | **Not offered.** Nearest: **Deployment Promotions** email (fires on promotions to production; whether Git auto-production deploys emit it is observable in one day of toggling it on) | PARTIAL — enable & observe |
| Deployment failed | **YES** — "Deployment Failures … for any Project on your team", email, **on by default** | ENABLE/verify |
| Deployment canceled | Not a distinct email event. In-repo distinction shipped instead: an ignored-build skip logs an explicit `[ignore-build] … skipping` line in the (dashboard-visible) build decision, and cancels-by-queue are visible in the deployments list | GAP — documented |
| Domain/configuration error | **YES** — Domain Misconfigured, Certificate renewal failed, payment failure (team owners, email) | ENABLE/verify |
| Usage/budget thresholds | **YES** — Usage increased / limit reached; **Pro team owners can customize on-demand usage categories and thresholds** (percentage or dollar); Spend Management adds SMS | ENABLE + set thresholds |

## 3. Founder configuration steps (one-time, ~3 minutes, canonical team scope)

1. Vercel dashboard → **switch to the team** that owns `gametime-picks` → Settings → Account →
   **My Notifications**.
2. Verify **Deployment Failures = Web + Email ON**; turn **Deployment Promotions = Email ON**.
3. Verify Domain group emails ON (Misconfigured, Certificate renewal failed, renewals).
4. Usage: keep **Usage increased / limit reached** ON; under on-demand usage notifications set
   thresholds (suggested: 75% and 100% of included Pro allowances — never a hard spend cap that
   could stop daily data publication; Vercel notifications warn, they don't stop deploys).
5. Confirm the account email address is verified.
6. No change on the duplicate project: it is Git-disconnected, so it can produce **zero**
   deployment events/emails — duplicate-email risk is structurally closed.

## 4. Delivery proof plan (no forced failures)

- **Success-path visibility:** with Promotions email ON, the next scheduled data deployment
  (nightly settle ≈01:30 ET or the morning slate) is the natural test — founder confirms
  receipt; the deployment fingerprint is `buildEtDate`+`builtAt` in the served
  `build-info.json` (no email headers needed in the record).
- **Failure-path:** NOT tested by breaking production. Historical evidence already proves the
  event class fires (June rate-limit failure emails). The Discord ops webhook independently
  covers workflow failures (DELIVERY_PROVEN 2026-07-31).
- Once the founder confirms the first email, append date + deployment fingerprint here.

## 5. Gaps and $0 fallbacks (no new vendor selected — per program boundary)

- Per-deploy success email: if Promotions doesn't fire for Git auto-deploys, the $0 options are
  (a) rely on the dashboard/web notifications, (b) treat the existing Discord ops channel as
  the success heartbeat (the observer/verify-deployment already prove serving), or (c) a Vercel
  → founder-owned webhook automation. A paid email vendor (Resend/Postmark/etc.) is explicitly
  **not** introduced and would need founder approval.
- Noise policy (Lane F): email = deployment lifecycle + usage; Discord = workflow/operational
  failures + budget anomalies; neither channel duplicates the other's job (matrix in
  `PROGRAM_088_091_EXECUTION_LOG.md`).

## 6. Rollback

Notification toggles are per-user and instantly reversible in the same My Notifications screen.
Nothing was changed in the repository for email delivery; there is nothing to revert here.
