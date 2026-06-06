# June-6 MLB Generation Inspection (latest)

> June 6 generated and validated. **MLB-only slate** (0 NBA games). One paid
> morning-projections dispatch (after a push-race workflow fix). Generated
> **pre-first-pitch**. No fabricated/padded cards; V2 stays internal.

## Generation
- Run `27066658884` (workflow_dispatch) — **completed/success**, started 15:45:19
  UTC, board `generatedAt 2026-06-06T16:04:12 UTC`.
- **First MLB pitch 17:10 UTC** → generation finished ~66 min **pre-first-pitch** ✅.
- Pushed cleanly to `main` (`115792a`) via the new pull-rebase retry (#289) —
  the prior 14:55 cron run had generated the same slate but lost its push to a
  concurrent daily-refresh commit (60 credits wasted); the fix prevents that.
- **Paid credits this slate: 60** (15 MLB events × 4 markets; balance ~19,733 →
  ~19,670, then the successful run spent ~60 more). Guard: cap 75, floor 300.

## Artifacts (all present on main)
| artifact | status |
|---|---|
| `mlb/schedule/2026-06-06.json` | 15 games ✅ |
| `mlb/boards/2026-06-06.json` | 15 games · 686 leans · gen 16:04:12 UTC ✅ |
| `mlb/power/2026-06-06.json` | present ✅ |
| `parlays/optimizer/2026-06-06.json` | totalSlips 64 · legPool 477 ✅ |
| `parlays/snapshots/2026-06-06.json` | present ✅ |
| `parlays/graded/2026-06-06.json` | absent (correct — not played) ✅ |

- MLB events: **15 / 15** scheduled games have odds (complete slate).
- NBA: 0 games (Finals rest day) → NBA board has 0 actionable leans (placeholder).

## publicRiskSections (nba / mlb / multi)
| risk | nba | mlb | multi |
|------|----:|----:|------:|
| low | 0 | 6 | 0 |
| medium | 0 | 6 | 0 |
| high | 0 | 6 | 0 |
| longshot | 0 | 6 | 0 |

MLB carries the full 6-per-bucket target (#281); NBA & multi honestly 0.

## Validation summary (all green)
- current-live-quality **PASS** (634 leans, 15 games, 0 fails / 0 warns)
- low-risk-methodology **PASS** (12 Low legs, **0 violations**)
- feature-leakage **PASS** (0 leakage, 0 warns — form fresh)
- coverage **PASS** (All 24 = MLB 24; NBA 0, Mixed 0; no dups; 0 unsupported)
- count-consistency WARN (CASE 1 expected labels; displayed 8 = 5 low + 3 medium)
- V2 **0 launch candidates** (internal); app 712/712, tsc, build ✓; pytest 109 ✓
- browser QA **PASS** (MLB-only labeled, NBA/Mixed honestly empty, no overflow,
  0 console errors, two-record Results intact)

*Read-only inspection of a safe pipeline generation. No data/model/grading change.*
