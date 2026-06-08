# UFC Data-Source Audit (latest)

> Research of existing code/data only. No paid UFC calls (none made).

| Capability | Status |
|---|---|
| UFC schedule (fight cards) | **implemented** — schedule-only via event-schedules (named cards, dates) |
| Fighter roster / identity | partial — names appear on cards; no structured fighter entity |
| Two-sided odds (ML / method / rounds) | **missing provider** — none fetched |
| Fighter stats (striking/grappling/cardio) | **missing provider** — not fetched/stored |
| Historical fight results | **missing** — no results store |
| Grading contract (settle a fight bet) | **missing** — no grader |
| Leakage-safe feature builder | **missing** — not built |

## Classification
- implemented: schedule surface only.
- needs odds API: moneyline / method / round totals (two-sided for de-vig).
- needs scraper/provider: fighter career + per-fight stats.
- needs grading: results ingestion + bet settlement.
- unsafe to launch: everything beyond schedule until the above exist + backtest.

## Spend posture
No paid UFC data this pass. Any future odds/stat provider must pass the existing
cost/balance guards and be explicitly approved — same discipline as MLB/NBA.
