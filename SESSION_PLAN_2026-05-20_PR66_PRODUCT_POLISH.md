# SESSION PLAN · PR #66 · Product polish

Branch: `feature/product-polish-team-view-parlay-power` off `96403fe`.

Goal: ship a focused, end-to-end polish PR that makes the site feel
like a premium product without changing scoring/model logic and
without paid API spend.

## Scope decisions

**In scope (ship this PR):**

1. **Team-attribution fix** — `pipeline/team_rosters.py` static map for
   the 4 active playoff teams (SA, OKC, CLE, NY) used as a post-hoc
   enrichment in `pipeline/team_projection.py`. This fixes May 20
   team view without touching `generate_daily_board.py` (which is
   the core scoring path) and without spending credits. Documented as
   a transitional fix.
2. **Team badge component** — abbreviation + color-coded monogram
   when no logo asset exists. Used on `/nba/board` team-view card +
   homepage sport cards.
3. **Team-view placement** — already directly under the date rail +
   banner from PR #65; verify on `/nba/board` and add a clearer
   "Matchup" header above it.
4. **Power Board reframe** — `/nba/power` is missing entirely;
   `/mlb/power` is a 2KB stub. Rename + reframe as **"Volatility
   Watch · coming soon"** with planned-inputs chips. No fake picks.
5. **Parlay Lab investigation** — locate the 3-slip limit; if it's
   a soft cap and there are enough valid leans, raise to 6–8. If
   it's correlation-constrained, keep 3 and surface the rationale
   honestly.
6. **Language polish** — replace "Audit" with "Results" in `nav.tsx`,
   homepage sport cards, and `QuickActionRail` CTAs. Keep "Model
   audit" on `/results/model-audit` itself (the technical page).

**Deferred to a future PR:**

- Homepage layout changes (PR #63 already shipped the cinematic
  command center; further changes need fresh user testing).
- Results page language pass beyond the nav-level rename.
- Star spotlight redesign on `/nba/board`.
- Player headshots / real team logo assets (no licensed assets).
- Upstream `generate_daily_board.py` attribution fix — risky, would
  re-cost credits to regenerate.

## Honesty rules carried forward

* No paid API calls.
* No fabricated projections / odds / picks.
* No "learning" claims.
* No parlay hit-rate claims.
* Pushes / pending excluded.
* `public_copy_test` must stay PASS.
