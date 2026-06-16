# June 16 — Curated Picks, Visuals & Bank Builder V2 Re-evaluation

_Branch `june16-curated-picks-visuals-bankbuilder-v2-relaunch` off main `c64712e`._

## Baseline
- Base SHA c64712e (new crimson logo). Run #1 completed ($100→$10,376.17, 5–0); Run #2 closed (0/2);
  UFC 250 settled — all preserved.
- June 16 slate: 3 WC fixtures (France/Senegal, Iraq/Norway, Argentina/Algeria), 15 MLB games,
  72 WC player props (36 anytime-goalscorer + 36 shots-on-target), suggested cards.
- Owner complaint: the World Cup player-props page "basically just listed out all the props."

## Phase 2 — Curated picks layer (DONE)
`app/src/lib/curated-picks.ts` (pure). Turns raw WC projections + player props into MODEL-RANKED
picks grouped by game: `loadWorldCupCuratedGames()` → `CuratedGame[]` with `topTeamPicks` +
`topPlayerPicks`, each carrying a `curatedScore`, eligibility flags
(suggestedCard/parlayLab/build/bankBuilder), portrait/flag, recent hit rate (team form) and `why`.
Player props are limited-data and **never** Bank Builder eligible. No fabrication.

## Phase 3 — World Cup curated UI (DONE)
`components/world-cup/curated-picks.tsx` + the World Cup "Player Picks" tab now lead with
**"Top model picks per game"** (per-fixture cards: Top Team Picks + Top Player Picks with
portraits/flags, BANK ELIGIBLE badges, model/market/edge/form, why, "View full game" + "Add to
Build"). The raw 72-prop list is demoted to a collapsed **"All available props · market inventory"**
section. The tab is renamed Player Props → **Player Picks**.

## Phase 9 — Bank Builder V2 re-evaluation (DONE → honest block) + futuristic meter
- Relaxed the launcher per the owner's rules: lanes may share a game (game-disjoint preferred &
  rewarded), each lane must carry **≥1 World Cup leg**, survival-first return band
  (decimal 1.12–2.60); a launch needs ≥4 eligible legs across **≥3 distinct games**. Survival
  threshold stays 80. 11 unit tests pass (launch with 3–4 games; block with 2 games).
- **June 16 verdict: `evaluating` (no launch).** France v Senegal kicked off at 19:00Z, leaving only
  **2 upcoming WC games** — two differentiated independent lanes cannot be formed (need ≥3). 4 legs
  cleared the survival bar (Norway-or-Draw 93, Argentina-or-Draw 92, Argentina-DNB 84, Norway-DNB
  81); all MLB single-player props rejected (volatility + DNP). Run #2 settled state untouched; no
  Run #3 written. This is the gate + the "no started games" rule working honestly.
- **Futuristic meter** `components/bank-builder/bank-builder-meter.tsx` on /bank-builder: glowing
  $100→$200→$500→$1.4K→$3.5K→$10K stepped circuit, three-run timeline (Run #1 crown · Run #2 closed ·
  Run #3 evaluating/active), dual-lane progress when live, reduced-motion aware.

## Verification
- `tsc` clean · **933/933 tests pass** (curated-picks + meter + V2 tests added) · build clean
  (195 pages). Browser: curated WC picks + meter render (desktop screenshots).

## Deferred (honest)
Player props inside pipeline-generated suggested cards; full Parlay Lab marketplace + Build leg-row
survival-score visuals; Results visuals; methodology rewrite. The curated layer + eligibility flags
are in place to drive these next.
