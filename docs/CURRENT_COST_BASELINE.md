# Current Cost Baseline — Program 084–087 (2026-07-31)

Evidence hierarchy: invoice/billing export > provider dashboard > workflow logs & credit ledgers >
repo config > public pricing (labeled estimate). **UNKNOWN is never totaled as zero** — verified,
estimated, and unknown are kept in separate columns and never summed together.

## 1. Cost baseline by category

| Category | Monthly verified | Monthly estimated | Annualized (est.) | Variable | Unknown exposure | Confidence |
|---|---|---|---|---|---|---|
| Vercel (hosting/build) | — | $0 (Hobby) **or** $20 (Pro) | $0–240 | bandwidth/builds within plan | **Plan tier unverified** — the largest single unknown | LOW until founder screenshot |
| GitHub (Actions/storage) | **$0** (public repo, standard runners — verified) | — | $0 | none at current usage | Account plan (Free vs Pro $4/mo) unverified but not repo-attributable | HIGH for $0 Actions |
| Sports APIs — The Odds API | — | **$30** (20K credits/mo tier; quota inferred from first-party credit ledger: 19,982 on Jul-1, ~9,700 consumed in July; public pricing $30/20K) | ~$360 | credit overage impossible (hard quota + floors) | Could be a different tier or pack — invoice confirms | MEDIUM-HIGH |
| Sports APIs — API-Football | — | $0 (free tier assumed) | $0 | — | **Paid plan possible** — key active, WC retired; if paid, it is idle spend | LOW |
| Sports APIs — balldontlie | — | $0 (free tier assumed) | $0 | — | Paid plan possible; fallback disabled either way | LOW |
| MLB StatsAPI / ESPN / nba_api / UFC CSV | **$0** (no key, no billing surface — verified) | — | $0 | — | none | HIGH |
| Analytics | **$0** (nothing provisioned — verified) | — | $0 | — | none | HIGH |
| Domains/DNS | — | ~$10–15/yr (subdomain of the founder's personal `yashwantbalaji.com`; renewal is a personal-domain cost, partially attributable) | ~$10–15 | — | Registrar + renewal date unverified | LOW |
| Storage / DB / monitoring SaaS | **$0** (none exist — verified by dependency sweep) | — | $0 | — | none | HIGH |
| Email/newsletter (Buttondown) | — | $0 (free tier if active at all) | $0 | scales with subscribers | Whether an account/env var exists at Vercel is unverified | LOW |
| Ops webhook endpoint | — | $0 (founder-provisioned; typical free webhook) | $0 | — | provider unknown by design (never inspected) | MEDIUM |
| AI/dev subscriptions charged to the project | — | — | — | — | **UNKNOWN** — outside the repo's visibility; founder lists any (e.g. Claude, IDEs) | — |
| **TOTAL** | **$0/mo verified** | **~$30–50/mo estimated** (most-likely: $30 Odds API + $0 Vercel Hobby) | **~$360–600** | small | Vercel tier, API-Football tier, balldontlie tier, project-charged AI/dev subs | — |

**Most-likely total burn: ≈ $30/month (≈ $360/year), dominated entirely by The Odds API.**
Upper bound if Vercel=Pro and one sports API is on a small paid tier: ≈ $60–90/month.

## 2. Unit costs (at $30/20K ⇒ $0.0015/credit; July measured)

| Unit | Cost |
|---|---|
| Per MLB slate-day (all July credits ÷ 22 slate days ≈ 440 credits) | ≈ **$0.66** (July, incl. the pregame-archive experiment); ≈ $0.10–0.20 at current steady-state |
| Per odds-covered game (~10–15/slate) | ≈ $0.04–0.07 |
| Per generated research row (~319–385 rows/slate) | ≈ **$0.002** |
| Per decisive settled row (July-30: 368 decisive of 385) | ≈ $0.002 |
| Per active sport | MLB carries ~100% of paid spend ⇒ ≈ $30/mo; NBA/EPL/UFC $0 |
| Per production deployment (~600/mo) | $0 marginal within plan; ~3 min build each |
| Per measured active day | **NOT CALCULABLE — analytics denominator does not exist yet** (and per the standing rule, no cost-per-user figure may be invented until it does) |

## 3. Savings scenarios

| Scenario | Description | Monthly savings | Annual | Risk | Approval |
|---|---|---|---|---|---|
| **No-regret (SHIPPED this program)** | auto-refresh timeout fix; daily-refresh cron removal; artifact retention 90→7d; Vercel ignored-build step; workflow_run success guard; npm ci dedupe; daily-lifecycle alert wiring | $0 direct (public repo) — recovers ~2 h/day runner time, ~44 GB storage, ~150–200 builds/mo, occasional wasted credits; removes the queue-eviction failure mode | — | Low | Done |
| **Conservative** | Confirm Vercel Hobby is sufficient (static export, no functions — it is, on usage); cancel any paid API-Football/balldontlie tier while idle; delete-or-configure `daily-rebuild`; retire one of the two settlement paths | $0–20 (Vercel) + $0–40 (idle API tiers) | $0–720 | Low–medium | **Founder** |
| **Aggressive** | Odds API is already right-sized (do NOT downgrade — free=500 credits); aggressive lever is architectural instead: public-data retention policy to shrink the 339 MB build input and git write-amplification; consolidate the daily pipeline to one writer chain | $0 direct; buys build speed, clone health, and future-proofing rather than dollars | — | Medium–high (touches settled-history surfaces) | **Founder** (design review first) |

## 4. Expansion costs (labeled scenarios, not quotes)

| Expansion | Incremental cost |
|---|---|
| NBA live (season) | ~200–400 credits/day → July-style month ≈ +6–12K credits. Combined MLB+NBA ≈ 16–22K/mo ⇒ **either fits the $30/20K tier tightly or needs the $59/100K tier (+$29/mo)**. Decide when preseason usage is measured |
| EPL official results | Per `EPL_RESULTS_PROVIDER_DECISION_PACKAGE.md`: free candidates exist; API-Football paid tier if chosen ≈ +$0–39/mo (verify quote at decision time) |
| Analytics at beta scale | Option A (first-party collector on existing Vercel): **$0 incremental** at beta volume; Option C (self-hosted Umami): ~$0 on free tiers; Option B (Plausible CE): a VPS, ~$5–15/mo |
| Monitoring/alerts | $0 — proven webhook path; provider is founder's existing channel |
| Vercel/GitHub growth impact | Public repo keeps Actions at $0; Vercel bandwidth at beta scale is far below any plan limit. First real trigger would be sustained traffic or team seats |
