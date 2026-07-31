# Program 084–087 — Founder Report (2026-07-31)

**One paragraph:** The platform's entire verified cash burn is ≈ **$30/month** — The Odds API —
and everything else is either verified $0 (GitHub, all sports stats, storage, monitoring,
analytics) or a small unknown awaiting one screenshot each (Vercel tier being the largest). The
real waste wasn't money: it was a broken refresh workflow burning 9 dead 25-minute runs a day
while blocking the writer queue, a 48 GB artifact pile, ~200 pointless Vercel builds a month, a
paid double-ingest on failed mornings, and a daily workflow failing silently for six days. All of
those are fixed and shipped. Your analytics approval is recorded; the webhook you configured is
proven delivering. Nothing was cancelled, downgraded, or migrated — those calls are yours, listed
at the end.

## 1. Fresh-session recovery
Checkout was on a stale branch at `d1791ce3`; reconciled and fast-forwarded `main` to
`origin/main = 23e32c1f`, which production serves exactly (built 16:16 UTC). `d1791ce3` (audit
docs) and `f3e8b2a9` (slate) are both ancestors — no divergence, nothing unpushed, stashes and
`vp/` untouched.

## 2. Analytics
**APPROVED_NOT_CONFIGURED.** Your approval is recorded verbatim (with its exact constraints) in
`ANALYTICS_ACTIVATION_DECISION.md` §7/§7.1, dated 2026-07-31. Per its own scope it does not pick
an endpoint — no endpoint exists, the sink is provably NOOP, production stays honestly dark, and
every metric remains NOT_YET_MEASURED. Your one remaining action: choose an option in
`ANALYTICS_ENDPOINT_OPTIONS.md` (recommended: Option A, first-party collector, $0 incremental).

## 3. Webhook
**DELIVERY_PROVEN.** `OPS_WEBHOOK_URL` (set 16:01 UTC today) accepted a real, redaction-tested,
explicitly-test-labeled message through the production alert path at 16:34 UTC (run 30647650414).
You should have received: *"GameTimePicks ops-alert delivery TEST (informational — nothing
failed)"*. Five workflows now alert on failure — including `daily-lifecycle`, which had failed 6
straight days with nobody told. Full chain: `OPS_WEBHOOK_ACTIVATION_PROOF.md`.

## 4–5. Burn
**Verified: $0/mo.** **Most-likely: ≈ $30/mo (≈ $360/yr)** — The Odds API 20K tier, inferred from
the first-party credit ledger (July: 19,982 → 10,300). **Unknown exposure:** Vercel tier ($0 or
$20/mo), API-Football and balldontlie tiers (both idle; $0 if free), any AI/dev subscription you
charge to the project. Unknowns are itemized, never counted as zero.

## 6–7. Inventory & sport map
Complete in `PLATFORM_VENDOR_AND_API_INVENTORY.md` and `SPORT_TO_PROVIDER_DATA_MAP.md`: every
provider with code location, calling workflow, status, and billing evidence. Headlines: The Odds
API is the **only** wired paid service; MLB runs on free official StatsAPI + $0.002/research-row
of odds credits; NBA/EPL/UFC/WC paid paths are all dormant/gated exactly as promotion states
claim; there is **no** database, storage, monitoring, or analytics SaaS anywhere.

## 8. Vercel verdict
**UNKNOWN plan / right-sized on usage.** Pure static export, no functions, trivial bandwidth.
Proven defect fixed: it built every push (even docs/scripts-only; `[skip ci]` ignored — measured
24 s push-to-build on a no-app-change commit). An in-repo Ignored Build Step now skips no-op
builds, fail-safe toward building. ~600 → ~400–450 builds/mo expected.

## 9. GitHub verdict
**RIGHT_SIZED, $0 verified** (public repo, standard runners). The waste was operational: 83% of
recent runner-minutes produced nothing (auto-refresh hang — fixed), 48 GB of duplicate artifact
storage (retention 90→7 — fixed), duplicate daily-refresh cron (removed). Watch item: repo write
amplification (5.4 GB raw blobs/30 days from slate commits) — 60-day retention design.

## 10. Sports APIs verdict
**Correctly sized; do not downgrade.** July used ~48% of the 20K quota including a one-off archive
experiment; steady-state is ~10–20%. That headroom is exactly what NBA revival needs — the 100K
tier (+$29/mo) is a decision for when preseason burn is measured, not now. Credit guards, floors,
cache TTL, and dry-run gates are all verified live; the one credit leak (double ingest after a
failed morning run) is fixed.

## 11. Domains, storage, monitoring, other SaaS
Domain is a subdomain of your personal `yashwantbalaji.com` (registrar evidence yours to attach).
Storage/monitoring/DB SaaS: none exist — $0 verified. Buttondown newsletter: conditionally wired,
active only if you set its env var. Webhook endpoint: yours, provider never inspected.

## 12. Top useless spend found
(1) auto-refresh's 9 dead runs/day; (2) 48 GB artifact pile; (3) ~200 no-op Vercel builds/mo;
(4) duplicate daily-refresh cron; (5) paid double-ingest on failed mornings; (6) daily-rebuild
green no-op (its deploy-hook secret was never set); (7) 339 MB of historic JSON shipped into every
build to serve 512 bytes. Full 13-item register: `WASTE_AND_DUPLICATE_SPEND_REGISTER.md`.

## 13. Shipped no-regret optimizations
Seven, all reversible, none touching cadence/coverage/money/tests-as-gates: the auto-refresh
timeout fix, daily-refresh cron removal, artifact retention 7d, Vercel ignored-build step,
workflow_run success guard, daily-lifecycle alert wiring, npm-ci dedupe. Details:
`PROGRAM_084_087_EXECUTION_LOG.md`.

## 14–15. Your approval queue (nothing executed)
**Conservative** (low risk): confirm Vercel Hobby ($0) suffices — it does on usage; cancel any
paid idle API-Football/balldontlie tier; set `VERCEL_DEPLOY_HOOK_URL` or delete `daily-rebuild`;
reduce auto-refresh to 2×/day until NBA preseason; pick one settlement writer
(`nightly-settle` recommended) and retire the `daily-lifecycle` roll or fix its gate timing.
**Aggressive** (design review first): public-data retention program (biggest structural lever);
pipeline consolidation to one writer chain. Savings math: `CURRENT_COST_BASELINE.md` §3.

## 16. Expansion costs
NBA live ≈ +$0–29/mo (tier decision on measured preseason burn); EPL results per its decision
package (free candidates exist); analytics Option A $0; monitoring $0. No false precision — all
labeled scenarios.

## 17. 30/60/90
`COST_OPTIMIZATION_30_60_90_DAY_PLAN.md` — 30: verify tiers, watch the fixes, credit-anomaly
alert, dead-code prune, your five decisions; 60: data-retention design, NBA cost rehearsal,
settlement consolidation; 90: analytics baseline, NBA promotion, re-audit.

## 18–19. Validation & protected state
No secret value read or printed anywhere (names only). Alert redaction/truncation/no-masking
guards green; analytics NOOP/kill-switch/PII guards green; internal routes verified pruned from
the export; full serial suite + typecheck + build + health gate + Python suites green **except two
pre-existing live-slate invariant failures** (morning boards lack evening-game odds at generation;
also the root cause of daily-lifecycle's gate refusals — documented, NOT weakened, adjudication
tracked). Money md5 `affe6b21…` and BB-lock md5 `cb80473f…` byte-exact; 19-14 · bankroll
$19,065.40 · crown $20,465.40; `vp/` untouched and uncommitted.

## 20. Exactly what I need from you
Nine evidence items + four decisions — `FOUNDER_BILLING_EVIDENCE_CHECKLIST.md`. The two that
matter most: **the Vercel plan screenshot** (largest unknown) and **the analytics endpoint
choice** (last gate to measurement).

## 21. Final verdict
**Cost-efficient and honestly small: verified $0 + ≈$30/mo likely, with guards that make paid
overrun structurally hard.** The platform's spend problem was never dollars — it was silent
operational waste, and the loud parts of that are now fixed and alarmed. The next real dollar
decision arrives with NBA preseason, and you'll make it with measured numbers.
