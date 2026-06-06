# June-6 Generation Inspection (latest)

> Captured 2026-06-06T07:2x UTC. **June 6 is not generated yet** — this records
> the pre-generation state, the slate shape from free schedule sources, the
> no-dispatch decision, and the post-generation checklist. No paid API spent.

## Generation status
| artifact | state |
|---|---|
| NBA board `boards/2026-06-06.json` | placeholder only (`generatedAt 2026-06-05T16:11`, **0 games / 0 leans**) |
| MLB board `mlb/boards/2026-06-06.json` | **absent** |
| optimizer `parlays/optimizer/2026-06-06.json` | **absent** |
| snapshot / risk sections | **absent** (no optimizer) |
| graded `parlays/graded/2026-06-06.json` | absent (correct — not played) |

## Slate shape (free ESPN schedule, no Odds API)
- **MLB: 15 games, all `pre` (Scheduled) — none started.** SEA@DET, KC@MIN,
  CIN@STL, SF@CHC, BAL@TOR, CHW@PHI, PIT@ATL, TB@MIA, ATH@HOU, WSH@ARI, …
- **NBA: 0 games** — NBA Finals rest day. No NBA slate June 6.

So once generated, **June 6 will be MLB-only**. NBA-specific outputs (NBA Low,
NBA recent-form verification, NBA Bank Builder) are N/A for June 6.

## Generation decision: DO NOT DISPATCH
`morning-projections` has not run for June 6 and is **not stalled** — recent runs
land 14:15–18:07 UTC; it was 07:2x UTC at inspection (~7–11h before its normal
window). Also an `auto-refresh` run was in progress. The dispatch conditions
(cron stalled **and** no run in progress) are not met, so no paid run was
dispatched. Cost/balance guards were therefore not exercised.

⚠ **Future safety note:** the normal `morning-projections` window (≈14–18 UTC)
overlaps MLB first pitches (early games ≈17 UTC). `generate_mlb_board` is a full
overwrite. So a *manual* dispatch is only safe **before** the first June-6 game
starts. If the cron stalls past ~17 UTC with games already live, a full-overwrite
regen could drop started games — prefer the surgical `snapshot_optimizer` path or
wait.

## Post-generation checklist (run after morning-projections lands June 6)
1. `git fetch && git pull` (sync the generated artifacts onto main).
2. Re-run Phase 3 audits with `--date 2026-06-06`: current-live-quality,
   low-risk-methodology, feature-leakage-safety, suggested-parlay-coverage,
   parlay-count-consistency — expect PASS (leakage WARN only if NBA placeholder
   lingers).
3. Confirm MLB Low legs all pass the strict gate (L10 ≥ 80%, odds floor, no weak
   plus-money); NBA Low expected 0 (no NBA slate / stale form fails closed).
4. Re-check Suggested Parlay depth (MLB + Mixed only; NBA 0 expected).
5. Browser QA the live June-6 slate.

*Read-only inspection + free schedule check. No paid API, no data/model change.*
