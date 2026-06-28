# Deployment — June 28 + June 29 Combined Slate (2026-06-28)

**Commit:** `c7de9a76` → `main` → Vercel production (`gametime-picks.vercel.app`)
**Money:** bankroll **$19,765.40** · crown **$20,465.40** · 15-7 · drawdown $700 — UNCHANGED, all 3 gates green (verify-money-integrity ✓ · forensic PERFECT ✓ · health 19/19 ✓). openExposure $200 (2× $100 BB seeds).

## What changed (product strategy)
June 28 had a single R32 match (South Africa/Canada), so the slate was widened into a **combined betting window** — June 28 **+** June 29 (Brazil/Japan, Germany/Paraguay, Netherlands/Morocco) = **4 fixtures**, all priced from REAL BetRivers odds (no fabrication). The behavior is permanent: a thin day auto-expands until it holds enough games for quality products.

### Pipeline (clean, not hacked)
- `build_odds_only_projections.py` — auto-expanding slate window (`choose_window`, `--min-matches`/`--window-days`/`--no-expand`), knockout-stage detection, `slateWindow` metadata. Labelled by start date; each match keeps true `kickoffUtc`/`matchDate`. Odds fetched only for windowed events (15 credits, 17,4xx remaining vs 2,000 floor).
- `build_player_props.py` — follows the team window (`slate_window_days` reads `slateWindow.days`) → 192 props across all 4 games (180 matched).

### Bank Builder
- Lane A = survival (safest card to rung goal): **+110**, $100→$210.07.
- Lane B = NEW value lane (+200..+700, survivability-first): **+206**, $100→$305.51.
- Both clear the same ladder rung goals (canonical money untouched). Cross-lane selector reserves distinct games so a 4-game slate still fields BOTH lanes (2+2 split).

### Other products (all from the ONE combined projection → internally consistent)
- WC Specials: **5 cards** (+1041..+2411).
- Suggested parlays: 2 double-chance cards across the window.
- Match pages: **all 4** game-detail pages populated (team markets + player props + real June-29 kickoffs).
- Moonshot: **AWAITING** (honest — a 4-game window can't field two independent 3-leg longshot lanes; no forced weak longshots).

## Production verification (independent)
- All flagship pages + all 4 game pages: HTTP 200.
- `/world-cup`: combined slate live (Brazil/Germany/Netherlands/Paraguay/Japan/Morocco all in-focus).
- `/bank-builder`: both lanes, $19,765.40 ×4, **no stale June-27 teams** (Argentina/Algeria/Austria = 0).
- `/world-cup-specials`: 5 cards live.
- smoke-test-production: **9/9 PASSED**.

## Known follow-up
- State-pinned unit tests (~47) assert the prior 15-5/$19,965.40 + June-24/26 fixture states — migration in progress (test-only, no prod/money impact; deploy gate is health-check, which is green).
