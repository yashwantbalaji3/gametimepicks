# Settlement & Outcome Audit

**Window:** 2026-07-25 → 2026-07-27 · **Generated:** 2026-07-29T05:19:45.377Z · **Read-only**

## Population reconciliation

| Date | Generated | Win | Loss | Void | Pending | Unavailable | Unresolved | Pass | Gap |
|---|---|---|---|---|---|---|---|---|---|
| 2026-07-25 | 650 | 272 | 281 | 42 | 0 | 0 | 0 | 55 | **0** |
| 2026-07-26 | 690 | 297 | 297 | 33 | 0 | 0 | 0 | 63 | **0** |
| 2026-07-27 | 557 | 213 | 228 | 64 | 2 | 2 | 0 | 48 | **0** |

## Headline rates — each with its denominator

| Metric | Value | Population |
|---|---|---|
| decisiveHitRate | 49.24% (782/1588) | directional gradable rows with a Win or Loss |
| terminalCoverage | 91.04% (1727/1897) | all generated board leans |
| settlementCompletion | 99.77% (1727/1731) | directional gradable rows expected to reach a terminal state |

## Decisive hit rate by date

| Date | Rate |
|---|---|
| 2026-07-25 | 49.19% (272/553) |
| 2026-07-26 | 50.00% (297/594) |
| 2026-07-27 | 48.30% (213/441) |

## Decisive hit rate by market family

| Market | Rate |
|---|---|
| batter_hits | 53.86% (335/622) |
| batter_hits_runs_rbis | 49.18% (300/610) |
| batter_total_bases | 40.42% (116/287) |
| pitcher_strikeouts | 44.93% (31/69) |

## Decisive hit rate by descriptive category

> These are descriptive groupings shown in-product. They are NOT predictive confidence.

| Category | Rate |
|---|---|
| High | 48.23% (340/705) |
| Low | 49.47% (328/663) |
| Medium | 51.82% (114/220) |

## Model vs sportsbook — identical rows, market de-vigged

Paired decisive rows: **1588** · excluded for no model probability: 0 · excluded for no two-way market: 0

| | Brier | Log loss | Mean predicted |
|---|---|---|---|
| Model | 0.2548 | 0.7047 | 59.11% |
| Market (de-vigged) | 0.2398 | 0.6724 | 50.16% |
| Observed | — | — | 49.24% |

Difference (model − market): Brier **+0.0150**, log loss **+0.0323**. Lower is better for both, so a positive difference means the model scored worse than the de-vigged market over this window.

## Calibration by predicted probability

| Bucket | n | Mean predicted | Observed |
|---|---|---|---|
| 0.3-0.4 | 74 | 36.2% | 32.4% |
| 0.4-0.5 | 246 | 45.8% | 41.9% |
| 0.5-0.6 | 524 | 55.2% | 44.8% |
| 0.6-0.7 | 469 | 64.9% | 54.8% |
| 0.7-0.8 | 246 | 73.7% | 57.7% |
| 0.8-0.9 | 29 | 82.1% | 72.4% |

_Buckets with small n are shown rather than hidden; read them as noise until n is large._