# June 10 — NBA Finals Game 4 Prep: Current-State Audit

## NBA projections (board 2026-06-10, provider `espn_scoreboard`)
- **201 actionable leans**, 1 game (Spurs @ Knicks, gameId 401859966).
- By market: PTS 36 · REB 31 · PRA 32 · AST 29 · 3PM 28 · STL 25 · BLK 20.
- Confidence (leg pool): High 94 · Medium 60 · Low 30.
- recentGames: 10 per player where available; latest recent date **2026-06-09**
  (Game 3) — **no June 10 post-game data** (leakage-safe).
- Player images: ESPN CDN (`a.espncdn.com/.../{playerId}.png`); initials fallback when absent.

## NBA game outlook
- h2h ✅, spread ✅, total ✅, team totals ✅ (derived total ± spread).
- Displayed on `/nba` (Market Outlook cards) and `/projections` game header
  ("Market outlook · implied by sportsbook prices — not a model pick").
- Labeled market-implied, never a model pick. ✅

## Parlay Lab
- Optimizer: 120 generated combinations; `publicRiskSections` (cap 6/bucket):
  - **Low**: NBA 6 · MLB 6 · Mixed 6
  - **Medium / High / Longshot**: NBA **0** · MLB 6 · Mixed 6
- **The "6 vs 5" mismatch (root cause):** the summary count read
  `publicRiskSections.low.nba` (6 genuine, distinct leg-sets), but the rendered
  cards used a *different* bucketing — the lane system (Conservative/Balanced/
  Star Power) capped at ~2 visible per lane + a cross-slip diversity selector —
  so only ~5 surfaced. Two different bucketings + a display cap. (Fixed by the
  coverage-grid count source + the new NBA Finals section showing all cards.)
- **Why NBA had cards only in Low:** the *global* risk sections couple tier to
  **leg count** — Low 2-3, Medium 3-4, High 4-5, Longshot 5-6 legs. A
  correlation-safe single-game NBA parlay is 2-3 legs, so it can NEVER populate
  High/Longshot under the global rules — by design, not a bug. Not a filter/paging issue.

## Solution shipped (Phase 4): NBA Finals Same-Game Cards (explicit mode)
A **separate, clearly-labeled** surface that builds single-game NBA cards tiered by
**combined odds only** (legs stay 2-3), leaving the global multi-game optimizer
untouched. From the real 184-leg NBA pool (18 distinct players, real book odds):
- **Low 5 · Medium 5 · High 5 · Longshot 5** (20 cards) — target 3-5/tier ✅.
- Real market variety (PTS/REB/AST/3PM/PRA/BLK/STL) via a diversity-ranking bonus.
- Distinct players per card; ≤1 volatile BLK/STL leg in Low/Medium; exact-set dedup;
  player recurrence capped (≤2/tier). No padding, no duplicate leg-sets.
- Every card labeled "Single-game card" + a correlation note. Combined odds are the
  exact product of per-leg decimals (nothing fabricated).

## Bank Builder
- Canonical paper ladder; June 9 settled win is preserved (untouched).
- Current step 2, bankroll ~$211.85; next slip currently MLB.
- A qualifying NBA Finals 2-leg same-game card in the target odds window exists in
  the pool → an NBA Finals **featured** Builder spotlight is feasible honestly
  (Phase 5), without altering the settled ledger. See the Phase 5 policy doc.
