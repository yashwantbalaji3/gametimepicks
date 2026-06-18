# June 18 — World Cup parlays + per-game UX + mixed parlays + Step 2 re-optimization

_Branch `june18-worldcup-parlays-gamepages-step2-reopt` off main `b37bc381` (#515). ~11:45 AM ET._

## Baseline
- Active ladder: Step 1 WON both lanes; Step 2 (pre-reopt) Lane A Canada or Draw + Drohan U5.5 ($184.03→$325.59), Lane B Switzerland or Draw + Kim HRR U1.5 ($217→$380.16).
- All four Step-2 games still **pre-event** at re-opt time (earliest 18:11 UTC / 2:11 PM ET) → replacement allowed.

## Phase 1 — WC suggested-parlay visibility: root cause
- WC cards ARE generated. The engine (`loadTodaySlate`) produced WC suggested parlays {low 5, med 5, high 5, longshot 5} + game-specific; the WC native pipeline (`build_odds_only_projections`) wrote 2 cards to `world-cup/parlays/<date>.json`.
- **Why the user couldn't see them clearly:**
  1. On `/parlays`, the sport selector **defaulted to MLB** (first sport with legs) — WC was one tab click away and not obvious.
  2. **No "Mixed" tab existed at all** — the engine never generated cross-sport cards (each `generateDailyParlays` call gets a single-sport pool).
  3. Empty risk buckets were **hidden** (`cards.length===0 → null`), so a sport with only low/medium cards looked sparse with no explanation.
  4. The main nav's "Parlay Lab" points to `/picks` (a legacy data source), not the richer engine view at `/parlays`.
- Not a clobber bug today: `build_odds_only_projections` is the canonical WC card writer; `build_suggested_parlays` (strict 2-per-tier, 0 cards) is not run after it.

## Fixes shipped
- **Phase 3 — WC by risk:** `/parlays` now **defaults to the World Cup tab** when WC has cards; every risk bucket renders, with an **honest per-bucket empty state** ("No qualified high-risk card …") instead of vanishing.
- **Phase 4 — Mixed parlays:** new `generateMixedParlays` (daily-parlays.ts) builds cross-sport cards — each ≥1 World Cup leg + a non-soccer leg, distinct games, pairwise non-correlated, by risk. Surfaced as a **Mixed tab** in `ParlaysExplorer` (20 cards today: 5 per risk). `mixedByRisk` added to the engine slate view.
- **Phase 7 — consolidation:** `/parlay-lab` already redirects to `/picks`; added a prominent **"Methodology engine parlays →" CTA** on `/picks` linking to the canonical `/parlays` (WC + Mixed + by-risk + same-game + leg marketplace).
- **Phase 9 — Step 2 re-optimization (target-fit):** new `selectTargetFitDualBankBuilder` (dual-bank-builder.ts) picks two lanes (one WC leg + one non-soccer leg each, four distinct games, non-correlated) whose **combined odds fit a payout target** (default 3.3× ≈ +230; hard floor 2.25×, cap 4.2× — data-supported, not a moonshot). Re-ran via `build-step2-dual-bank-builder.mjs --target-fit`:
  - **Lane A:** Czech Republic ML (−141) + Matt Olson H+R+RBI Over 1.5 (+102) → **+231 · $184.03 → $609.14** (was $325.59).
  - **Lane B:** World Cup BTTS No (−157) + Pete Alonso H+R+RBI Over 1.5 (+102) → **+231 · $217.00 → $718.27** (was $380.16).
  - One soccer leg per lane, survival 80 each, game-disjoint, Step 1 preserved byte-for-byte.
- **Phase 10 — ladder UI:** pending Step block shows a **"Target rung ≈ $200 → $700 · this lane $X → $Y (payout-optimized)"** note.

## Deferred (honest)
- **Phase 5 — standalone per-game route:** not created (high-risk new dynamic route). Per-game content already lives on the tabbed `/world-cup` hub: "Top model picks per game" (4 team + 6 player picks/fixture), team projections, player props, suggested cards. Game-specific parlays are also on `/parlays` → Same-game tab.
- **Phase 7 — full `/picks` migration to the engine:** deferred (PicksExperience expects the legacy shape); a CTA to the canonical `/parlays` bridges it instead.

## Guards
- No fabrication — all odds from The Odds API; MLB via MLB Stats API; WC official finals via ESPN. Step 2 replacement used only pre-event, leakage-safe, odds-backed legs.
- Protected `public/data/bank-builder/*` untouched. Step 1 settlement preserved.
