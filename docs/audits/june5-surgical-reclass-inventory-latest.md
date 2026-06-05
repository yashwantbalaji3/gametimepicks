# June 5 Surgical Reclass — Inventory + Dry-Run + Result (2026-06-05)

> Surgical, NON-OVERWRITE reclassification of June 5's Suggested-Parlay risk
> sections using current main code (#282 Low-Risk gate). **No Odds API, no board
> refetch, no board overwrite, no leans dropped.** Local only (not pushed).

## Method (safe entry point)
`python -m pipeline.snapshot_optimizer --date 2026-06-05` — reads the EXISTING
NBA + MLB board leans (`load_nba_leans` / `load_mlb_leans`; no network, no Odds
API), rebuilds `legPool` + `buckets` + `publicRiskSections` via the #282-gated
`generate_public_risk_sections`, and writes ONLY
`app/public/data/parlays/optimizer/2026-06-05.json`. Boards, snapshots, settled
data, and all other dates are untouched. Verified via `git diff`: 1 data file
changed (the optimizer), 0 boards, 0 other dates.

## Game-safety (the reason normal regen was blocked)
1 MLB game was already in-progress (ESPN `'in':1`; commenceTime 2026-06-05T18:21Z).
A normal `morning-projections` regen would re-fetch only current Odds-API events
and could drop it. The surgical path does NOT re-fetch — it reuses the existing
legPool, so **all 533 legs are preserved, including the started game's 40 legs**.

## Before → after (in-memory dry-run == written result)
| metric | BEFORE | AFTER |
|--------|-------:|------:|
| legPool legs | 533 | **533** (unchanged — no leans dropped) |
| started-game (18:21Z) legs | 40 | **40** (preserved) |
| totalSlips | 120 | 120 |
| sourcePools | nba 89 / mlb 687 | unchanged |

publicRiskSections by risk × sport (nba / mlb / multi):
| risk | BEFORE | AFTER |
|------|--------|-------|
| low | 4 / 4 / 4 | **0 / 6 / 0** |
| medium | 0 / 4 / 4 | 0 / 6 / 6 |
| high | 0 / 4 / 4 | 0 / 6 / 6 |
| longshot | 0 / 4 / 4 | 0 / 6 / 6 |

Displayed (UI Suggested): MLB 7 · NBA **0 (honest empty state)** · Mixed 5 · All 12.

## Low-Risk legs — before vs after
- **Before:** Low contained plus-money legs (+100/+102/+126/+137) and weak-form
  legs (Jose Alvarado L10 6/10, Miles McBride 6/10, Ben Rice 5/10), plus
  Keldon Johnson on stale regular-season "10/10" form.
- **After:** Low = 6 MLB legs only, all ≤ -150 (or near-even + ≥90% L10), all
  ≥ 80% L10. **0 plus-money legs in Low.** **Keldon removed from Low** (stale form
  fails the trust gate). NBA Low = 0 (all NBA form stale → fail-closed).

## Keldon Johnson status
- **Out of Low Risk** ✅ (and out of all single-sport NBA cards — NBA published = 0).
- Still appears in a **Mixed Medium/High** card (higher-variance; the strict form
  gate is Low-only by design). **Caveat:** his recent-form MODAL still shows the
  stale regular-season games — that is BOARD data, unchanged by this reclass.
  Correcting the modal requires regenerating the board (provider fix → refetch),
  which is out of this no-refetch scope. The #282 provider fix corrects it on the
  next fresh slate automatically.

## Honesty / scope
- Same pregame leans, re-bucketed by the corrected Low-Risk policy. No leans
  added/dropped, no fabrication, no manual card edits, no board overwrite.
- Grading stays consistent: settlement grades this optimizer's publicRiskSections,
  which now matches what the UI displays.
- NBA Low/Mixed-Low empty is the honest consequence of stale NBA form on June 5.

*Local only. Not pushed. No paid API, no workflow dispatch, no board/grading change.*
