# June 16 — Bank Builder V2 + Homepage / Launch Polish

_Work log + audit for the June 16 product launch push. Branch
`june16-bankbuilder-v2-homepage-launch-polish` off main `37c64c0` (PR #495)._

## Baseline
- Base / production SHA: **37c64c0** (Settle Dual Bank Builder Run #2 + June 16 slate, PR #495).
- Run #1 completed ($100 → $10,376.17, 5–0). Run #2 closed (0/2, Lane A & B lost). UFC 250 settled.
  All preserved — not reopened, not hidden, not mutated.
- June 16 slate live: 3 WC fixtures (France/Senegal, Iraq/Norway, Argentina/Algeria), 15 MLB games,
  72 WC player props, MLB leans/cards, mixed cards.

## Current-state audit (Phase 1 findings)
- **Homepage = `/today`** (`app/src/app/page.tsx` just re-exports it). Section order today:
  WC focus → Dual Bank Builder teaser (settled Run #2, ~400–500px of prime space) → MLB parlays →
  UFC → Bank Builder status → quick-action tiles (buried at line 327) → sport cards → mixed cards
  → results → footer. **Owner wants action buttons FIRST, then WC, then a COMPACT Bank Builder
  status, then filterable parlays.** A `quick-action-rail.tsx` exists but is unused.
- **World Cup** has **8 tabs** (games, overview, projections, player-props, cards, markets, results,
  methodology) — too many; owner wants ~7 simpler. "Today's fixtures" are card links, not the
  richer accordions the homepage already has.
- **Game-detail** player props now join via matchId OR alias-normalized team fallback (shipped #495).
- **Parlay Lab (`/picks`)** has sport/risk/bank-builder filters; `SuggestedCard` renders leg photos
  but legs aren't clickable into the existing `PlayerRecentFormDrawer`, and last-5 hit-rate pills
  aren't shown on suggested-card legs.
- **Build (`/build`)** has sport/risk/market/game filters; legs lack portraits + recent form.
- Reusable visuals all exist: `PlayerAvatar` (NBA/MLB CDN + WC photo variant), `TeamLogo`,
  `FlagBadge`, `TeamMark`, `RecentFormSparkline`, `PlayerRecentFormDrawer`.

## Phase 2 — Bank Builder V2 (DONE)
- `docs/methodology/bank_builder_v2_eligibility.md` + `pipeline/daily/bank_builder_v2_eligibility.py`
  (pure survival score: base model 35 / market-type 25 / recent-form 15 / odds-band 10 /
  data-quality 15, minus volatility + DNP/lineup penalties; eligible ≥ 80). 10 unit tests pass.
- V1 selector (`build_dual_bank_builder.py`) is now **superseded** — it refuses to launch and points
  to the V2 runner; `--force-v1-launch` overrides. Settled artifact never touched on refuse.

## Phase 3 — June 16 V2 evaluation (DONE → no launch)
`decision: evaluating`. 91 candidates scored; **5 eligible** (WC double-chance/DNB favourites,
survival 80–93: Norway-or-Draw 93, Argentina-or-Draw 92, France-or-Draw 89, Argentina-DNB 84,
Norway-DNB 81) but spanning **only 3 distinct games** → cannot build two non-correlated lanes; the
eligible legs are also too short-priced (−850 to −3000) for a meaningful 2-leg return. **All 91 MLB
single-player props rejected** (volatility + unconfirmed-lineup DNP — the Run #2 lesson). →
**Run #3 NOT launched.** Artifact: `bank-builder/v2-evaluation-latest.json`. Run #2 preserved.

## Plan (remaining)
- Phase 4–5: homepage restructure (action buttons first → WC → compact Bank Builder status with
  Run #1/2/3 timeline + V2-evaluating state → filterable parlays); Bank Builder page run-timeline.
- Phase 6–10: WC game accordions with top picks + game parlays; tab trim; Parlay Lab/Build leg
  drawers + last-5 hit-rate pills; portraits/logos consistency.
- Phase 11–14: Results readiness; tests; tsc/build/audits; browser + mobile QA; PR + deploy.
