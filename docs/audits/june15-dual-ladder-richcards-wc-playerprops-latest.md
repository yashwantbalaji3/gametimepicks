# Dual Bank Builder rich cards + WC player props (owner feedback)

Branch `june15-dual-ladder-richcards-wc-playerprops` off main. Addresses the live-site feedback.

## Changes
1. **Removed "Coming Soon"** on /bank-builder — the Dual Bank Builder (Run #2) is LIVE, so the
   old next-ladder teaser was contradictory. Test updated to assert the live Dual section instead.
2. **Rich, clickable Lane cards** (the main complaint — "weak graphic, cuts out info"):
   - Each leg now shows the **player portrait** (PlayerAvatar, MLB CDN + initials fallback) +
     **team logo** (MLB) or **both flags** (World Cup) — no broken images.
   - Explicit prop + **model prediction** ("77% to clear 0.5 hits").
   - Each leg is **clickable** (`<details>`) → drawer with **recent-5 games** (hit/miss pills vs
     the line for MLB; 3-way + both teams' form for WC) + **why** (model reason bullets:
     recent form, season) + official-source note.
   - `enrich_dual_legs.py` attaches playerId / recentGames / reasonBullets / model-predict to the
     ALREADY-LAUNCHED legs WITHOUT re-selecting (a launched leg is locked, now pending settlement).
     The lanes stay exactly as launched: Lane A = Iran or Draw + Troy Johnston Over 0.5 ($188),
     Lane B = Mike Trout Under 1.5 + Samad Taylor Over 0.5 ($215).
   - Per-lane step ladder ($100 → ~$200 → Step 2-4 → 👑 $10K) + lava-glow orbs (reduced-motion-safe).
3. **World Cup player props for Iran vs New Zealand** (`build_player_props.py`): odds-backed
   anytime-goalscorer + shots-on-target from The Odds API, matched to API-Football squads for
   **real player photos + positions** (24 props, 24/24 matched). Market-implied / limited-data,
   **not parlay/Bank-Builder eligible**. Surfaces on /world-cup + the game-detail player-props tab.
   `build_odds_only_projections` no longer writes a placeholder player-projections file (so it can't
   clobber the real props). Methodology + homepage notes updated to the live reality.

## Integrity / tests / build
- No fabrication: real odds (Odds API) + real photos/squads (API-Football); unmatched players fall
  back to initials (no broken images, no invented stats); player props NOT parlay-eligible.
- Completed Run #1 ($100 → $10,376.17 / 5–0) + UFC 250 settlement untouched; launched lanes
  preserved (enriched in place); `.env` gitignored + not staged.
- 917 tests pass (player-props + Dual tests updated), tsc clean, build clean (186 pages).

## E2E browser verification (desktop + mobile)
All 13 routes 200; nav (top + mobile bottom) works; lane leg drawers open with portrait + model
read + last-5 + why; /world-cup player props render with real photos (goalscorer + shots);
no console errors; no horizontal overflow.

## Honest limitations
WC player props are market-implied (no independent per-player model — WC-season per-player stats
are thin this early), clearly labelled limited-data. The dual-ladder graphic uses lava-glow +
step-ladder + portraits; a heavier bespoke animation could follow if desired.
