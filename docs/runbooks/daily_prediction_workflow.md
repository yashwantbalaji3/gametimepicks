# Runbook — Daily Prediction Workflow

_Order matters. Settlement first; leakage validation before any projection is published._

1. **Settle yesterday first** — run the settlement workflow (see `daily_settlement_workflow.md`)
   before generating today. Never generate on top of an unsettled prior slate.
2. **Provider status checks** — The Odds API credits remaining; API-Football status/quota.
   Free schedule/box-score endpoints (MLB Stats API, API-Football fixtures) before paid odds.
3. **Slate inventory** — list today's scheduled events per sport; identify which are odds-backed
   (in focus) vs scheduled-only (odds pending).
4. **Event cutoff checks** — exclude any event whose `event_start_time <= now` (started/final). Only
   upcoming events are projectable.
5. **Feature snapshot** — capture `feature_snapshot_time`; compute rolling windows that **exclude
   the target event**.
6. **Odds snapshot** — capture `market_snapshot_time` (≤ prediction_time); never closing odds if
   predicting earlier.
7. **Lineup / injury / weather snapshot** — capture each snapshot time; missing → missing flag;
   older than the sport threshold → stale flag (`FRESHNESS_THRESHOLDS`).
8. **Leakage validation** — run `validateLeakage()` on every prediction row; drop/queue any that
   fail (`feature_timestamp <= prediction_time < event_start_time`).
9. **Projection generation** — per-sport models; emit `PredictionOutput` (probability + edge +
   confidence + risk + flags).
10. **Curated pick generation** — rank model picks per game; mark eligibility flags.
11. **Card generation** — suggested cards from curated picks (+ eligible player props), with
    portraits/logos and per-leg hit rates where available.
12. **Bank Builder V2 eligibility** — evaluate only; launch a run **only** via the launch runbook.
13. **QA / deploy** — tsc + tests + build + copy/secret audits; browser QA; verify both domains.

Honesty gates throughout: surface missing/stale/small-sample flags; never fabricate a feed —
stub `planned`/`not_available`.
