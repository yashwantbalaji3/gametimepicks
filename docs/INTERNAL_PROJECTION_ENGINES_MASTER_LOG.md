# Internal Projection Engines — Master Log (2026-07-14)

Building GameTime's own internal soccer + MLB projection engines toward SimTheGame-level depth — **internal-first,
nothing public until validated**. Money untouched: portfolio md5 `affe6b21`, record 19-14, bankroll $19,065.40,
exposure $0.

## Phase 0 — Precheck ✓
ET Tue Jul 14 11:16 EDT. HEAD `914eb710` == origin/main == origin/june30-reset (no drift). Money md5 `affe6b21`,
forensic PERFECT, health HEALTHY. Clean tree.

## Phase 1 — Asset audit ✓ → `PROJECTION_ENGINE_ASSET_AUDIT.md`
Soccer had FIFA points (110/110) + a market anchor but **no internal model** — projections were de-vig only.
Committed finished-match data is tiny (settlement is knockout-only → ~5 unique). MLB already had an internal
full-game Monte Carlo (prior slice), honest + not web-served.

## Phase 2 — Engine contracts ✓ → `PROJECTION_ENGINE_CONTRACTS.md`
Strict schemas for both artifacts. Honesty enforced by structure: `public:false`, honest `modelMode`, no
`"independent"/"validated"` substring, distributions only when actually computed.

## Phase 3 — Internal soccer projection engine V1 ✓ (INTERNAL-ONLY)
- `app/src/lib/world-cup/internal-soccer-projection-engine.ts` — pure, deterministic **bivariate-Poisson**;
  FIFA-points supremacy + WC/market total anchor → 1X2 / total / BTTS / DC / DNB / correct-score. 9 unit tests.
- `app/scripts/build-internal-soccer-projections.mjs` → `data/internal/world-cup/projection-engine/2026-07-14.json`
  (France v Spain, England v Argentina; `public:false`, market comparison joined).
- `app/scripts/backtest-internal-soccer-projections.mjs` → backtest artifact + `SOCCER_PROJECTION_ENGINE_V1_BACKTEST.md`.
  **N=5, `insufficient_sample`.** Model Brier 0.342 vs uniform 0.667, top-pick 5/5 — but 4/5 were heavy
  favorites, so it only ties the trivial FIFA-favorite baseline. **Not a pass.** Stays internal.
- Notable: the model leans to the higher-rated side vs the book (Spain +7.4pp, Argentina +9.9pp). A hypothesis,
  not an edge. Not traded, not shown.

## Phase 4 — MLB full-game engine ✓ (already built; verified, no rebuild)
`data/internal/mlb/full-game-sim/<date>.json`, `modelMode: market_anchored_simulation` (never "independent"),
`public:false`, 10k runs, winProbability + projectedScore + distributions. Verified not web-served; honesty tests
20/20. Documented in `MLB_FULL_GAME_MONTE_CARLO_PROTOTYPE.md`.

## Phase 8 — Product eligibility ✓
`market-coverage.ts` gates settlement-blocked soccer markets (goalscorer/shots/correct-score/corners) as
product-ineligible. New test `internal-projection-product-eligibility.test.mjs` (4) locks: settlement-blocked ⇒
ineligible; unsupported/pending settlement ⇒ never eligible; **no product/proposal/portfolio builder imports the
internal engines**; internal artifact is `public:false`.

## Phase 9 — Provider & modeling roadmap ✓ → `PROVIDER_AND_MODELING_ROADMAP.md`
Cheapest high-value unlock = the **2022 WC backtest** (free, validates or kills soccer V1). Then MLB rolling
backtest + pitcher signal; then paid API-Football; then xG/event data for a true independent soccer model.

## Phase 3.1 — Tuning + 2022 validation follow-up (2026-07-14) ✓
- **2022 WC (N=64) validation** (commit 6cea93e1): beats uniform on all proper scores (Brier 0.593/RPS 0.208/
  logLoss 1.002), draws + totals well-calibrated, but **ties the FIFA-favorite top-pick baseline** and has **no
  market baseline** (2022 closing odds not on the free plan). `publicReady:false`.
- **Tuning** (`tune-soccer-engine-2022-wc.mjs`): grid + 1-D supremacy sweep, log-loss objective, 5-fold CV +
  bootstrap. **Overfits** — CV makes the tuned config worse (1.039 vs 1.001), bootstrap gain CI straddles 0,
  top-pick stuck at 56.3% for all supremacy values. **Defaults unchanged; engine still internal.** Docs:
  `SOCCER_ENGINE_TUNING_{REPRODUCTION,RESULTS}.md`.
- **Odds-history scope** (`SOCCER_ODDS_HISTORY_PROVIDER_SCOPE.md`): The Odds API `/historical` (paid add-on) is
  the path to a 2022 closing-odds baseline; API-Football free confirmed empty. This is THE unlock.
- Internal semis diagnostic (market vs untuned vs reference-only tuned) — `notForProducts:true`.

## Deferred (honest — gated on validation, NOT skipped carelessly)
- **Phase 5 (Simulation Report Shell V2)** and **Phases 6–7 (public WC/MLB report enhancements)** — deliberately
  NOT shipped. Both engines are `insufficient_sample`/internal, so the internal-first rule says **nothing new
  surfaces publicly yet**. Surfacing an unvalidated engine is exactly what this mission forbids. The public
  reports remain honest and unchanged (WC market-implied probability center from the prior mission; MLB
  player-prop sim + market-anchored lines). When a backtest passes + founder approves, the report shell work
  wires the *validated* numbers.

## Gates
tsc clean · new tests 13/13 (engine 9 + eligibility 4) · full suite green · build green · forensic PERFECT · money
md5 `affe6b21` · health HEALTHY. Internal artifacts NOT web-served (verified).

## Bottom line (blunt)
- Soccer engine is **real but internal-only** — validated on N=5, which is not validation. Needs the 2022 WC set.
- MLB full-game sim is **market-anchored, not independent**, and stays internal.
- Neither engine beats the market yet; neither is public; neither touches money.
- The product moved from UI polish to **actual modeling infrastructure** — with an honest gate in front of it.
