# Founder Billing Evidence Checklist — Program 084–087

The audit is complete on everything visible from the repository, workflow history, and production.
These items need **account-side** evidence only the founder can retrieve. **Never share logins.
Redacted screenshots or CSV exports only** (crop/blur account IDs, payment methods, and emails).

| # | Service | Retrieve | Safe format | Closes which unknown |
|---|---|---|---|---|
| 1 | **Vercel** | Plan tier + latest invoice (if any) + Usage page for last 30/90 days (build minutes, bandwidth). **UPDATE (same day): canonical is now PROVEN = `gametime-picks`; the no-dash `gametimepicks` is the duplicate and is skip-guarded in-repo. Remaining founder steps are F1 (disconnect duplicate's Git integration) and F2 (redacted settings screenshots) in `VERCEL_DUPLICATE_CONSOLIDATION_PLAN.md`** | Redacted screenshot/CSV + ~2-min dashboard action | The single largest unknown: $0 vs $240/yr; June evidence says Hobby; F1 halves deployment-cap use at the source |
| 2 | **The Odds API** | Subscription page showing tier + monthly price + current-cycle usage | Redacted screenshot | Confirms the inferred $30/20K tier (ledger strongly suggests it) |
| 3 | **API-Football (api-sports.io)** | Account plan page (free vs paid) + last invoice if paid | Redacted screenshot | Whether idle WC capability is costing money while EPL is undecided |
| 4 | **balldontlie** | Account plan (free vs paid) | Redacted screenshot | Idle-credential cost (fallback is disabled in code either way) |
| 5 | **Domain registrar** for `yashwantbalaji.com` | Renewal invoice + date | Redacted screenshot | Attributable share of the subdomain's cost |
| 6 | **GitHub** | Settings → Billing summary (plan; confirm $0 Actions/storage) | Redacted screenshot | Formal confirmation of the verified-$0 assumption |
| 7 | **Buttondown** (if an account exists) | Plan + subscriber count; confirm whether `NEXT_PUBLIC_BUTTONDOWN_USERNAME` is set in Vercel env | Redacted screenshot | Whether the newsletter form is live or "coming soon" |
| 8 | **Webhook endpoint provider** (Slack/Discord/other) | Nothing — just confirm the test message *"GameTimePicks ops-alert delivery TEST (informational — nothing failed)"* arrived ~2026-07-31 16:34 UTC | A yes/no | End-to-end visual confirmation on top of the proven HTTP delivery |
| 9 | **Any AI/dev subscription charged to this project** (e.g. Claude, editors, CI add-ons) | Name + monthly amount | List, no invoices needed | The one category with zero repo visibility |

## Founder actions (not evidence) still open after this program

1. **Set `VERCEL_DEPLOY_HOOK_URL`** (GitHub → Settings → Secrets → Actions) — or say "delete
   `daily-rebuild`". Until then the daily freshness rebuild it exists for does not happen.
2. **Pick the analytics endpoint option** (`ANALYTICS_ENDPOINT_OPTIONS.md`; recommended: Option A,
   $0). Approval of the contract is recorded; this is the only remaining gate to measurement.
3. **EPL results provider decision** (`EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md`).
4. **Decide the `daily-lifecycle` vs `nightly-settle` overlap** — one canonical settlement writer
   (recommendation: keep `nightly-settle` + `mlb-daily-production`, retire the lifecycle roll or
   fix its gate timing first; see the waste register #6/#11).
