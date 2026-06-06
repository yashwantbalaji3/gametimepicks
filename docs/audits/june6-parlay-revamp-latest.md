# June-6 Parlay Revamp — Conservative Low, Exposure Diversification, Bank Builder

> Finished-product pass on the existing June-6 MLB slate. **No paid credits** —
> free `snapshot_optimizer` + `snapshot_parlays` re-derivation from the already-
> generated board, plus optimizer-rule / UI / validation changes. No projection,
> odds, or grading math changed.

## Root causes (from Phase-0 ground truth, not screenshots)
1. **Low Risk had near-even/+100 legs.** The Low gate admitted any −150..+110 leg
   with ≥90% L10, so even-money legs (Avila @ +100, 4/5 L5) qualified.
2. **One player anchored most of the board.** `_select_diverse_sgp` spread
   exposure only *within* a (section,sport) bucket, so a top leg repeated across
   Low/Medium/High/Longshot. Before: **Luinder Avila in 8/13 displayed cards
   (62%)**; the exact leg "Avila K Under 3.5" in 8/13.
3. **Top Pick was a +100 builder slip**, not the safest stack.

## Changes
**Optimizer (`pipeline/parlay_optimizer.py`):**
- Low gate (`low_risk_leg_eligible`): negative-odds only. ≤−150 needs ≥80% L10;
  −150..−105 needs ≥90% L10; near-even (−104..+100) is a documented fallback
  needing PERFECT 5/5 L5 (new `_l5_hit_rate`); **plus-money (>+100) is never Low**.
- `_select_diverse_sgp`: optional **shared cross-section counters** (player / pair
  / market / leg) + **hard caps** `_PUBLIC_MAX_PLAYER_EXPOSURE=4`,
  `_PUBLIC_MAX_LEG_EXPOSURE=3` with a least-negative thin-pool fallback.
- `generate_public_risk_sections`: threads one shared counter set per sport across
  low→medium→high→longshot.
- Candidate builder: **per-start cap** + higher ceiling (600→1500) so the pool
  contains slips that exclude the top leg (lets the caps avoid one-player boards).

**UI:** homepage "Featured slip" → **"Top Pick of the Day"**, selected by new
`selectBankBuilderSlip` (safest 2–3 leg all-negative stack, lowest combined
decimal). "Bank Builder" chip + "Most conservative stack · negative-odds
favorites" + "Conservative does not mean guaranteed."

**Validation (new):** `audit-parlay-exposure` (player/leg/market/game exposure +
odds bands + Low L5; FAIL >30% player / >25% leg / any Low plus-money) and
`audit-bank-builder` (a conservative all-negative Top Pick exists, fresh
metadata, no leakage).

## Before / after (June 6 displayed)
| | total | Low | Medium | High | Longshot |
|---|--:|--:|--:|--:|--:|
| before | 13 | 5 | 3 | 3 | 2 |
| after | 15 | 5 | 5 | 3 | 2 |

| metric | before | after |
|---|--|--|
| max player exposure | **Avila 8/13 (62%)** | **Eldridge 3/15 (20%)** |
| max exact-leg exposure | 8/13 (62%) | 3/15 (20%) |
| Low odds bands | 6 favorite, 1 mild, 1 heavy, **2 near-even** | 6 favorite, 5 heavy, 2 mild, **0 near-even, 0 plus-money** |
| Low plus-money legs | (Avila +100 present) | **0** |
| High plus-money | 0 | 2 |
| Longshot odds | mixed | **all plus-money** |

## Bank Builder / Top Pick (June 6)
2 legs · combined +165 · $10 → ~$26.52 — Donovan Walton Hits o0.5 @−135 (LAA) +
Matt Olson Hits o0.5 @−191 (ATL), both negative-odds favorites, different games.
(The optimizer's safest low stack is Zack Gelof 5/5 @−156 + William Contreras 5/5
@−147; the home card reflects the published snapshot.)

## Validation (all green)
- app **718/718**, tsc clean, build ✓
- pipeline **113** + `mlb_model_test` ✓ (incl. new L5/near-even + selector tests)
- June-6 audits: current-live-quality, low-risk (15 legs, **0 violations**),
  leakage (0), coverage, risk-section-display (5/5/3/2), leg-modal-metadata
  (225/225 rows date+opponent, 0 leakage), **parlay-exposure (max 20%)**,
  **bank-builder PASS** — all PASS
- browser QA: Top Pick = Bank Builder; all 4 sections render; modal metadata
  intact; **0 console errors; 0 overflow at 375/1280**

## Preserved (no regression)
Active 2026-06-06 pregame · latest settled 2026-06-05 · MLB-only badge · "No NBA
games scheduled today" · NBA/Mixed honestly empty · two-record Results · no
banned/V2 copy · V2 internal · no duplicate slips/legs · no target-game leakage.

## Limitations / follow-ups
- Exposure caps are per-sport-board; tuned for MLB-only. Mixed slates inherit the
  same caps (reasonable, untested live).
- The near-even Low fallback (perfect 5/5 L5) is a per-leg rule, not pool-aware.
- Section-description copy is largely unchanged (existing copy already accurate);
  reason-chip enrichment beyond the Top Pick is a future polish.

*Free re-derivation + optimizer/UI/validation code. No paid API, no projection/
grading-math change.*
