# Program 088–091 Founder Report — One Clean Project, Full Visibility, Everything Working

**2026-07-31 · Bottom line: your disconnect finished the job the skip guard started — the
duplicate is now doubly dormant, the canonical project serves everything, and the machine got
two real bug fixes out of it. Deployment emails never "broke": Vercel only emails failures and
promotions, and you stopped having failures. Three dashboard toggles restore everything Vercel
can natively send. Verified burn is unchanged: $0 + ~$30/mo Odds API + whatever the Pro plan
turns out to cost — one screenshot closes that last unknown.**

## What your 5:30 PM action accomplished

`gametimepicks` (no-dash) last deployed at **17:16 UTC — pre-disconnect — and never again**.
The in-repo guard had already zeroed its builds; your Git disconnect makes it impossible at the
account level too. It sits dormant as a rollback artifact until the **Aug 7 quiet-window
review**; the daily log (`VERCEL_DUPLICATE_QUIET_WINDOW_LOG.md`) tracks it with two
copy-paste commands. Deletion stays a separate approval.

## The email mystery, solved honestly

Vercel's current product emails exactly four things: **deployment failures, deployment
promotions, domain problems, and usage thresholds**. There is no "build succeeded" email per
deploy. In May–June you received failure emails because the duplicate era *produced failures*
(the rate-limit meltdown). Once things stopped failing, inbox silence — correct, but
indistinguishable from broken. Your 3-minute fix list is in
`VERCEL_DEPLOYMENT_EMAIL_NOTIFICATIONS_PROOF.md` §3: verify Deployment Failures ON, turn
Promotions ON (may cover success-visibility for auto-deploys — the next nightly data deploy is
the natural test), domain + usage emails ON with 75%/100% thresholds. No new email vendor was
added or needed.

## Two real bugs fixed (both found because earlier fixes worked)

1. **auto-refresh has never successfully completed** in its observable history: first the
   25-minute offseason hang (fixed in 084-087), and behind it a silent `set -e` kill — a
   log-summary grep that dies on unittest-style output. Fixed and replay-proven; tonight's
   9 PM ET run should be its first green ever.
2. **The ignored-build step now has behavioral proof**, not just intent: six mutation tests run
   the real script against a throwaway git repo — docs-only skips, data builds, a push batch
   ending in docs can't strand an app change, unknown anything fails open to BUILD, and the
   duplicate slug always skips.

## Resources now watched instead of eyeballed

- **Odds API**: a budget sentinel runs after every production slate — single-run spend > 500
  credits or balance < 4,000 (2× the hard floor) pings your Discord as a labeled WARNING
  (never a fake failure). July used 48.5% of quota including a one-off experiment;
  steady-state is 10–20%, so NBA season fits without a tier change.
- **Actions**: npm caches added to the two uncached daily workflows; the ~48 GB artifact pile
  decays to ~3–4 GB by late October on the new 7-day retention.
- **Scorecard**: `RESOURCE_EFFICIENCY_SCORECARD.md` — every ratio has a numerator, denominator,
  and window. Useful-builds ratio went from ~50% (duplicate ate half) to ~100% by construction;
  ~460 duplicate builds/month are gone.

## Your open decisions (ranked)

1. **3-minute email toggles** (above) — then confirm the first success/promotion email arrives.
2. **Billing screenshot** (Vercel plan/seats/usage) — the last dollar unknown in the entire
   platform audit.
3. **Afternoon top-up ingest** (+20–60 credits/day) for the ~5 evening games whose odds post
   after the morning board — also naturally clears the two red morning invariants and the
   lifecycle gate refusals. Recommended; awaiting your yes because it changes refresh cadence.
4. **Aug 7**: duplicate deletion-readiness review.
5. Settlement-writer overlap (`daily-lifecycle` vs `nightly-settle`) and `daily-rebuild`
   hook-or-delete — housekeeping, no money at stake.

## Verification

Suite green except the two documented pre-existing morning-slate invariants (not weakened,
root cause = odds timing, fix = decision #3). Typecheck, build, health gate (17 checks),
Python suites, alerter contract tests, canonical guards: all green. Money byte-exact:
19-14 · $19,065.40 · `affe6b21…`/`cb80473f…`. `vp/` untouched. Production serves the newest
app-affecting SHA; docs commits skip on the canonical project and cannot deploy at all on the
duplicate.

**Verdict: the platform now runs one observable, email-visible, budget-alarmed production
environment, with every metered resource either free, ~10–20% utilized with alarms, or waiting
on a single founder screenshot.**
