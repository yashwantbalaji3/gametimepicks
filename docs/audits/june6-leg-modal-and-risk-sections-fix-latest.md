# June-6 Fix — Leg-Modal Metadata + High/Longshot Display

> Targeted fixes from the June-6 validation. No rebuild, no paid API, no
> projection/grading-math change. Free MLB Stats API re-enrichment + a free
> snapshot re-optimize of the existing June-6 slate.

## Issue 1 — leg-detail modal missing last-5 opponent/date metadata
**Root cause:** the UI (`player-recent-form-drawer` → `EnrichedRecentList`) and the
optimizer (`parlay_optimizer.py`, PR #116) were *already* wired to render/pass a
`recentGames` array — but the MLB model never **emitted** it, so every MLB lean
had only `recentSeries` (raw values) and the modal fell back to generic
G-1..G-5 plus a "metadata isn't attached" note.

**Fix (upstream data shape):**
- `pipeline/mlb/mlb_model.py`: new `recent_games_for_market()` emits
  `{date, opponent, isHome, value}` per game (same inclusion rule as the value
  series, so values align; drops no-date and did-not-appear rows; never
  fabricates a date). Wired into `project_pitcher_strikeouts` /
  `project_batter_market`.
- `pipeline/mlb/mlb_stats.py`: game-log parser now captures `isHome` and resolves
  the opponent **abbreviation** from the stable team-id map (the gameLog
  `opponent` object carries id+name only).
- `pipeline/mlb/generate_mlb_board.py`: surfaces `recentGames` on each lean
  (future boards get it at generation time).
- `pipeline/mlb/attach_recent_games.py` (new): FREE, idempotent, in-place
  re-enrichment of an existing board's `recentGames` from MLB Stats API (no Odds
  API credits). Leakage guard: only games strictly before the slate date.
- UI: `EnrichedRecentList` already rendered date · @/vs opponent · value ·
  Over/Under; added a small warning when >2 of 5 shown rows lack metadata.

**June-6 result:** ran `attach_recent_games --date 2026-06-06` (free) → 634/634
actionable leans enriched (avg 9.9 rows), 0 missing date/opponent, **0 leakage**;
re-ran `snapshot_optimizer` (free) so legs carry `recentGames` (slip composition
**identical**, only metadata added). Modal now shows e.g.
`Jun 1 @CIN 5 Over · May 26 vs NYY 1 Under · …`.

## Issue 2 — High Risk & Longshot not displaying
**Root cause:** `applyVolumeDiscipline` used **cumulative cross-section** exposure
counters. On an MLB-only slate the market vocabulary is tiny (hits / total bases
/ H+R+RBI / strikeouts), so `maxMarketExposure` was fully consumed by Low+Medium
and **every High/Longshot slip was then skipped** — even though the optimizer
generated 6 High + 6 Longshot cards. The cards existed; the UI starved them.

**Fix:** make the player/market/game exposure counters **per-section** (reset
each section). Each section stays internally diverse; the per-section count caps
and global `totalMax` still bound volume; no padding. Test-safe (every existing
exposure test is intra-section).

## Issue 3 — validation to catch this next time
- `app/scripts/audit-leg-modal-metadata.mjs` (new): FAIL on target/future-game
  leakage or widespread legs-with-values-but-no-recentGames; WARN on partial
  coverage.
- `app/scripts/audit-risk-section-display.mjs` (new): FAIL if a risk bucket is
  generated (>0) but displays 0 (UI/discipline starvation), with reason codes.

## Before / after (June 6 displayed Suggested view)
| | totalSlips | Low | Medium | High | Longshot |
|---|---:|---:|---:|---:|---:|
| before | 64 | 5 | 3 | **0** | **0** |
| after | 64 | 5 | 3 | **3** | **2** |

(publicRiskSections generated 6/6/6/6 throughout — unchanged.)

## Validation (all green)
- app tests **713/713**, `tsc` clean, `next build` ✓
- pipeline: `mlb_model_test` (incl. new recentGames assertions) ✓, pytest 109 ✓
- audits June-6: current-live-quality PASS · low-risk PASS (12 legs, 0
  violations) · leakage PASS (0) · coverage PASS · **risk-section-display PASS
  (displayed 5/3/3/2)** · **leg-modal-metadata PASS (100/100 rows have
  date+opponent, 0 leakage)**
- browser QA: modal shows real last-5 date/opponent rows; High & Longshot render
  ("No qualifying" gone, 13 cards); 0 console errors; 0 overflow at 375/1280

## Preserved (no regression)
Active slate 2026-06-06 pregame · latest settled 2026-06-05 · MLB-only badge ·
"No NBA games scheduled today" · NBA/Mixed honestly empty · Low Risk conservative
(0 violations) · Results two-record UX · no banned/V2 copy · V2 internal · no
duplicate slips · no target-game leakage.

*Free re-enrichment + free re-optimize + UI/pipeline/validation code. No paid
API, no projection/grading change.*
