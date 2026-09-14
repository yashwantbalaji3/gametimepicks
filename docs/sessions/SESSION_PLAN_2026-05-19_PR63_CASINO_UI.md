# SESSION PLAN · PR #63 · Casino command center + projection navigation

Branch: `feature/casino-command-center-ui` (off `9c0b073`).
Scope: UI / UX only. **No** model logic, **no** settlement logic, **no**
paid APIs, **no** package files, **no** fabrication.

## Visual system (new components)

* `SportOverviewHero` — single shared hero used by `/nba`, `/mlb`, `/nhl`,
  `/ipl`. Slots: eyebrow, sport label, status pill, matchup/preview tile,
  3 scoreboard stats, primary + secondary CTA. Replaces 4 divergent hero
  blocks in those pages.
* `StatusPill` — small named state chip (`LIVE`, `SETTLED`, `LINES PENDING`,
  `UPCOMING`, `PROVIDER PENDING`). Already used inline; consolidated so
  every surface speaks the same language.
* `BoardDateRail` — horizontal date-pill strip used on `/nba/board`,
  `/mlb/board`, `/mlb/board/[date]`. Each pill: date label + status pill
  + click target. Settled dates deep-link to `/results/date/<date>`.
* `QuickActionRail` — 4 large action cards used on homepage + sport
  pages: Model Board · Model Audit · Parlay Lab · Results.
* `HomepageCommandHero` — projection-first hero replacing the long
  homepage paragraph.

All animations gated by `@media (prefers-reduced-motion: reduce)`.

## Page changes

* **`/` homepage:** compress from 10 sections to 6. New order:
  CommandHero → Today's projections spotlight (uses
  `SportsbookStatusBoard` already exists) → Sport grid (uses existing
  `HomepageSportsRail`) → Latest audit strip (existing `NeonStatPanel`
  KPIs, trimmed) → QuickActionRail → How it works (3 short tiles).
  Drop trending tabs (moved to `/nba/board`), drop anatomy callout
  (moved to `/methodology`), drop 3-step house rules (moved to
  `/methodology`).
* **`/nba` `/mlb` `/nhl` `/ipl`:** SportOverviewHero + QuickActionRail.
  NBA/MLB keep their existing per-game scorecard sections. NHL/IPL get
  an EmptyProviderPanel above-the-fold ("schedule live · projections
  pending") and a roadmap card. No fabricated projections.
* **`/nba/board` `/mlb/board` `/mlb/board/[date]`:** add BoardDateRail
  immediately under `BoardDateStatusBanner`. The existing tab strip
  (BoardWithTabs) stays.
* **`/results` `/results/model-audit` `/results/date/2026-05-19`:** keep
  the PR #62 component graph; add the new `StatusPill` where the
  banner+audit-note headers currently roll their own pill styles.
* **`/methodology` `/responsible-use`:** apply the new section header
  pattern + compress dense paragraph blocks above the fold.

## Out of scope

* No Parlay Lab redesign (existing demo state is acceptable).
* No NHL/IPL projection pipeline.
* No new model code.
* No new dependencies.

## Verification

13 pipeline tests + new active-slate behaviour assertions (none added —
helper unchanged). `tsc --noEmit` + `next build` + route walk.
