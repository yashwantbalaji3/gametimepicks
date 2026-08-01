# Daily Reliability Defect Closure (Program 092-095, 2026-07-31)

Open-item ledger with final classifications. Nothing marked ALREADY_FIXED was reworked.

| # | Item | Classification | Evidence / action |
|---|---|---|---|
| 1 | First green `auto-refresh` | **CLOSED** | Run **30669837038**: success, 11m12s (22:24–22:35Z) — the workflow's first green in its observable history. Timeout fail-soft fired correctly mid-run (8m cap on the offseason nba_api hydrate, continued on cache); a later scheduled run (18:35 ET) also committed "zero Odds API credits" |
| 2 | Live-slate sim-orphan invariant | **CLOSED** | State-model rewrite; true orphans/collisions/unsafe sources still hard-fail with mutation proofs — `LIVE_SLATE_INVARIANT_CONTRACT.md` |
| 3 | Nightly public-contract ordering lag | **ALREADY_FIXED (workflow order) + residual hole CLOSED** | Order settle→corpus→contract→health→push has been in nightly-settle since 080-083. Residual: the contract build is deliberately non-fatal, so a failed rebuild could publish the STALE previous contract. New health-gate check `research-contract:stale` (contract `asOfSettledDate` must equal ledger newest settled date) — live mutation proof: stale contract → exit 1, restored byte-identical. The manual `--write` workaround is no longer an operating requirement |
| 4 | Hit-rate denominator including voids | **CLOSED** | `aggregate_outcomes()` in `settle_mlb_results.py`: decisive = W+L only; `settled`/`decisive`/`voids`/`pushes` are separate named fields in report, buckets, and log line (buckets also miscounted Void as Push — fixed). Regression test pins July-30: 162/(162+206) = **44.02%**, and asserts 42.08% can never return |
| 5 | Multiple settlement writers | **CLOSED** | `CANONICAL_SETTLEMENT_WRITER.md` — nightly-settle is the one scheduled writer; daily-lifecycle cron removed (manual recovery kept); ownership guard test fails on a second scheduled writer |
| 6 | `daily-rebuild` hook-or-delete | **CLOSED — retired** | `DAILY_REBUILD_DISPOSITION.md` |
| 7 | Missed-cron fallback | **CLOSED** | `cron-watchdog` workflow + tested decision script — `CRON_FALLBACK_AND_PAID_INGEST_SAFETY.md` |
| 8 | Duplicate-ID capture recurrence | **RECURRENCE_ONLY — watch posture** | Fail-closed refusal unchanged (board-generation publication gate + alias-collision refusal, Sprint 043/045; collision test pins the 3 pre-fix boards). Diagnostics on refusal already persist provider event ids + canonical candidates in the gate output and the pregame-archive manifests; no credits are spent reproducing a non-recurring provider defect. No code change — by design |
| 9 | Vercel email toggles/delivery | **BLOCKED_BY_ONE_FOUNDER_CLICK** | `VERCEL_DEPLOYMENT_EMAIL_FINAL_STATUS.md` |
| 10 | Analytics endpoint implementation | **STAGING_PROVEN** | `FIRST_PARTY_ANALYTICS_IMPLEMENTATION.md` — one founder action remains (store + env vars) |
| 11 | July-31 settled PROVEN_STAMPED acceptance | **OBSERVATION_PENDING (wall clock)** | Flips when the Aug-1 nightly settle stamps tonight's rows; the acceptance machinery was proven on July-31 (227/227) already |
| 12 | Afternoon coverage top-up | **IMPLEMENTED + live-corrected** | `MLB_AFTERNOON_TOPUP_DESIGN_AND_PROOF.md` — including the root cause the first live dispatch exposed |
