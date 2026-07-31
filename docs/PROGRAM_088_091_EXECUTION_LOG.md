# Program 088–091 Execution Log (2026-07-31)

Canonical Vercel operations · deployment email notifications · full resource optimization.
Fresh-session anchor 5:30 PM ET (founder disconnected the duplicate's Git integration).

## Starting truth (verified, not assumed)

- Local HEAD = origin/main = `d81d5987`; production served `8df72085`→`9e17733b` (the newest
  app-affecting SHA; docs-tail commits `0f4c7706`/`d81d5987` correctly skip-listed). Two
  historical stashes untouched; `vp/` dirty-but-uncommitted as required.
- Canonical `gametime-picks` re-proven serving (builtAt fingerprint). Duplicate's **last
  deployment remains 2026-07-31T17:16:04Z** — pre-disconnect; the in-repo skip guard had
  already zeroed its builds from `9e17733b` onward; disconnect makes it belt-and-braces.
  Post-disconnect push watcher armed; result appended to the quiet-window log.
- Protected: money md5 `affe6b21…`, BB locks `cb80473f…` byte-exact; 19-14 · $19,065.40.
- Billing: Pro badge = clue; billing screenshots remain the founder evidence item.

## Root causes found & fixed this program

1. **auto-refresh silent exit-1** (`scripts/automation_refresh.sh`): unittest-style suite output
   (no "assertions passed" phrase) made a summary-extraction grep return 1 under `set -e` —
   silent death right after `simulation_test`. Latent forever behind the 25-min hang; surfaced
   by the 084-087 timeout fix (runs 17:42/19:39/21:09 all failed there). Fixed (`|| true` on
   both extraction substitutions); fixed loop replayed verbatim over both output styles.
2. **Why deployment emails "stopped"**: Vercel natively emails only deployment *failures* and
   *promotions* (+ domain/usage events) — never per-deploy success. The May–June failure emails
   (rate-limit era) dried up when failures did. Full matrix, founder toggles, and gaps:
   `VERCEL_DEPLOYMENT_EMAIL_NOTIFICATIONS_PROOF.md`.

## Shipped (commits this program)

- `scripts/automation_refresh.sh` silent-exit fix.
- `app/src/lib/vercel-ignore-build.behavior.test.mjs` — 6 behavioral mutation tests against a
  throwaway git fixture: docs-only→skip, data→build, push-batch stranding→build, missing/unknown
  SHA→build, duplicate slug→skip, unknown slug→fail-open build (§12 mutation proofs).
- Credit budget/anomaly alerting: `app/scripts/check-odds-credit-budget.mjs` + **warning** kind
  in `scripts/ops_alert.sh` (guard-tested: says WARNING, never FAILED/TEST) + step 6b in
  `mlb-daily-production` + threshold repo-vars.
- npm cache parity: `mlb-daily-production`, `nightly-settle` first setup-node.
- Docs: email proof · quiet-window log · canonical runbook · Pro utilization audit · Actions
  optimization · credit/refresh optimization · resource baseline · efficiency scorecard ·
  analytics resource impact · this log · founder report.

## Notification severity routing (Lane F)

| Event class | Email (Vercel) | Discord ops | Dashboard/log |
|---|---|---|---|
| Production deploy success | Promotions email if it fires for auto-deploys (observe) | no | yes |
| Production deploy failure | yes (native, default-on) | no (Vercel-side failure ≠ workflow failure) | yes |
| Workflow hard failure | no | **yes** (5 wired) | yes |
| Credit budget warning | no | **yes** (warning kind) | yes (::warning) |
| Usage thresholds | yes (Pro custom thresholds) | only if urgent/sustained | yes |
| Coverage partial (morning slate) | no | only on SLA breach | yes (availability states) |

## Boundaries honored

No duplicate deletion; no Git reconnect; no env-var changes on either project; no new email/
analytics/data vendor; no cadence/coverage reduction (staged-refresh Option B documented and
gated on founder approval); no test weakened (morning invariant reds remain honest and red);
no secret values anywhere; `vp/` untouched.

## Founder decisions open after this program

1. Vercel: email toggles (3 min) · billing/usage screenshots (F2) · duplicate deletion after
   2026-08-07 review.
2. Staged afternoon top-up ingest for lean-less evening games (Option B, +20–60 credits/day).
3. auto-refresh cadence review once a green week is measured.
4. `daily-lifecycle` vs `nightly-settle` overlap; `daily-rebuild` hook-or-delete.
5. Analytics endpoint choice (resource impact now quantified — trivial at beta scale).
