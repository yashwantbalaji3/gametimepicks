# Methodology Upgrade Audit — Hybrid Market + Model + Calibration (2026-07-09)

**Status: AUDIT + DESIGN + SAFE SCAFFOLDING. No public recommendation formula changed.**

This documents the current GameTime Picks methodology, compares it to a FreeSim / SimTheGame–style
market-implied approach, and proposes a hybrid **Market baseline + Model signal + learned Calibration**
framework. Two low-risk artifacts ship with it (both money-safe, neither wired into public picks):

- `app/scripts/audit-mlb-calibration.mjs` — read-only calibration analysis over the committed grading
  ledger.
- `app/src/lib/calibration/*` — pure, tested, **unwired** calibration blend scaffolding.

Guardrails held throughout: money md5 `affe6b21071f2b3be96bb2774eb347c3`, record 19-14, bankroll
$19,065.40, exposure $0 — all unchanged. No fabricated markets/probabilities/backtests. The raw
model-performance ledger stays separate from the official 19-14 product-card record.

---

## B1 · Current methodology source audit

Real code paths and thresholds (file:line where quoted):

### MLB projection → edge → confidence
- **Projection** — `pipeline/score_model.py` `project_stat()`: weighted recency blend
  **0.45·last5 + 0.35·last10 + 0.20·season**, plus a **0.30** home/away blend. Over probability
  `P(over) = 1 − Φ((line − projection)/σ)`, default **σ = 5.0**.
- **Edge** — `edgePct = (modelProbability − impliedProbability)·100`, where `impliedProbability` is the
  de-vigged two-way market (overround stripped proportionally so Over+Under = 1.0).
- **Confidence tiers** — `pipeline/config.py`: `EDGE_THRESHOLD_HIGH = 5.0pp`, `EDGE_THRESHOLD_MEDIUM =
  2.5pp`; High also needs games-in-window ≥ 8, Medium ≥ 5; edge < 2.5pp ⇒ **No Play**.
  Post-score guardrails (`confidence_guardrails.py`) can downgrade on volatility / thin recent windows.

### MLB simulation
- `app/src/lib/game-simulations/mlb-generator.ts`: `RUN_COUNT = 10000`, `MODEL_VERSION = "mlb-2026.07"`.
  `sampleLean()` draws 10,000 seeded `N(projection, σ)` samples, clamps at 0 (count stats), and reports
  empirical over/under rates + a 10-bin histogram. **It is independent of the market** — it re-expresses
  the *projection's* Gaussian as a distribution; it is NOT a market-blended or market-seeded sim. This
  is the crux: the "10,000-run" number is a faithful re-expression of one projection, not extra signal.

### Market-implied Game Centers (the de-vig layer)
- MLB — `app/src/lib/mlb-team-markets.ts` `buildMlbGameCenter()`: de-vig moneyline / total / run line;
  a lean is only surfaced at a **≥ 2.5pp** no-vig spread.
- Soccer/WC — `app/src/lib/wc-game-center.ts` `buildWcGameCenter()`: **de-vig only, no independent
  model**. 3-way / double chance / draw-no-bet / total / BTTS, 90-minute regulation only, lean at
  **≥ 2.5pp**. Corners / cards / xG / scorers explicitly honest-unavailable.
- No-vig helpers — `app/src/lib/projection-framework.ts`: `americanToImpliedRaw()`, `noVigTwoWay()`
  (normalize both raw implieds to sum to 1), `edgePoints()`, probabilities clamped to **[0.5%, 99.5%]**.

### Existing confidence composite (important — the upgrade already has a foothold)
- `projection-framework.ts` `compositeConfidenceScore()`: base = edge component (saturates ~**12pp**) +
  prob component, times gates `completeness · freshness · sampleConf · (1 − uncertainty)` (sampleConf
  0.15 at N=0 → 1.0 at N≥10), times a **0.85×** contrarian discount when the model disagrees with the
  market. `confidenceBucket()` maps to strong ≥ 0.6 / standard / lean / watchlist. `dataQualityTier()`
  grades A/B/C/D/unavailable.
  → GTP **already** blends edge + probability + data-quality gates. What's missing is a **learned,
  per-market/per-tier historical reliability** term fed back from settled results.

### Selection engines (money products)
- Bank Builder — `app/src/lib/parlays/dual-bank-builder.ts` `survivalScore()` (floor **70**; low-variance
  credit `min(0.45, modelProb−0.5)·40`; −30 stale, −8 small sample). WC lane weighting in
  `world-cup/bank-builder-proposal.ts`: BTTS volatility penalty **+0.25**, totals penalty **+0.15** when
  the 90-min draw prob ≥ **26%**. Lane A: odds ≥ −600 & modelProb ≥ 0.55; Lane B: −200..+300.
- Moonshot — `app/src/lib/moonshot/moonshot-lane.ts`: separate high-volatility paper lane, two distinct
  games (never SGP), real-odds candidates, never framed as lower-risk.

### Calibration / model-performance (today)
- `pipeline/calibration_report.py` (Python) + committed grading ledger
  `app/public/data/mlb/results/comparison_report_*.json` + `lifetime_summary.json`. Graded vs official
  box scores; **money-independent** (separate from the 19-14 record).
- Public methodology surfaces: `app/src/app/methodology/page.tsx`, `app/src/lib/methodology/mlb.ts`
  (feature registry: implemented/partial/planned), `app/src/lib/methodology/data-quality.ts`.

---

## B2 · Comparison matrix — GameTime vs FreeSim/SimTheGame-style

| Category | GameTime current | FreeSim / SimTheGame style | GameTime proposed upgrade | Data/artifact needed | Impl risk | Ship now? |
|---|---|---|---|---|---|---|
| Market baseline | de-vig no-vig two-way (MLB + WC) | market-implied core | keep — it's the anchor | none | — | already |
| No-vig handling | proportional two-way; clamp [0.5%,99.5%] | proportional / Shin | keep; optionally Shin for long tails | none | low | doc only |
| Team-market support | MLB ML/RL/Total; WC 3-way/DC/DNB/Total/BTTS/AH/TT | broad | keep | none | — | already |
| Alt-line ladders | none (deferred, tail-bin trap) | full ladders | explicit tail bins + thin guard | per-book alt lines | med | deferred (own audit) |
| Player-prop model | projection Gaussian → sim (market-independent) | varies | keep, but **weight by proven reliability** | settled ledger | med | plan |
| Market-vs-model edge | `edgePct` = model − market | market-implied edge | keep; **calibrate before trusting edge** | reliability table | med | scaffold shipped |
| Calibration / backtest | Python report + committed ledger | continuous | JS-native audit + reliability weights → blend | committed reports | low | script shipped |
| Confidence tiers | edge+games thresholds; composite score | learned | **learn from settled tiers** (they're inverted today) | ledger | med | plan (proven need) |
| Sport-specific formulas | MLB Gaussian; WC de-vig only | per-sport | keep; soccer stays market-implied | — | — | already |
| Settlement feedback loop | manual Python; separate ledger | automated | automate audit post-settlement; founder-gated weights | cron | med | plan |
| Transparency/reporting | game-detail dashboards + docs | varies | add calibration provenance to methodology page | — | low | doc only |
| User-facing clarity | good; some overclaim risk | varies | market-implied vs simulation split, no beating-market claims | — | low | doc only |

---

## B3 · Proposed hybrid framework

```text
marketProbability   = noVig(odds)                     # the anchor (always present)
modelProbability    = model / simulation output       # only when it exists
reliabilityWeight   = f(marketType, modelHistory, sampleSize, dataQuality, recency)  # learned, [0,1]
calibratedProbability = market·(1 − w) + model·w       # convex blend, clamped [0,1]
edge                = calibratedProbability − marketProbability
confidence          = f(edgeMagnitude, reliabilityWeight, historicalCalibration, dataQuality)
recommendationTier  = f(edge, confidence, marketRisk)
```

Principles (non-negotiable):
- **The market is the baseline, not the enemy.** With zero reliability the output *is* the market.
- **The model only matters where it has proven signal** — reliability is learned from settled data, not
  assumed. A missing model earns weight 0 (never a phantom blend).
- **Bigger edge ≠ better pick.** Edge is only trustworthy after calibration.
- **Confidence must be learned.** Today's tiers are *inverted* (§B4) — a hard proof that assumed
  confidence is unsafe.
- **Market- and sport-specific calibration matters.** batter_hits ≠ batter_total_bases; MLB ≠ soccer.
- **No-play is a valid output.**

The blend above is implemented as pure, unwired scaffolding in `app/src/lib/calibration/` (see §B6).

---

## B4 · MLB methodology upgrade plan

**Settled findings** (read-only `scripts/audit-mlb-calibration.mjs` over 44 dates / 18,227 decisive
props — money-independent):

| Market | n | hit rate | read |
|---|---:|---:|---|
| batter_hits | 7,313 | **53.8%** | model adds signal |
| batter_hits_runs_rbis | 6,031 | 50.1% | ≈ coin flip — lean market |
| pitcher_strikeouts | 886 | **47.5%** | net-negative — defer to market |
| batter_total_bases | 3,369 | **44.4%** | net-negative — avoid |

| Confidence tier | n | hit rate |
|---|---:|---:|
| High | 7,894 | **49.6%** |
| Medium | 2,499 | 50.9% |
| Low | 7,206 | **51.2%** |

**Headline: the confidence tiers are inverted / non-monotonic** — "High" (49.6%) does NOT out-hit "Low"
(51.2%). This matches the 2026-05-22 snapshot (High 48.3%) — it's persistent, not noise. And market
reliability varies ~9pp between the best and worst markets. Two concrete, *proven* upgrades:

1. **Reliability-weight by market.** Down-weight total_bases (0.28) and strikeouts (0.40); trust
   batter_hits (0.65). Feeds `reliabilityWeight` in the hybrid blend.
2. **Stop treating the tier label as an up-weight.** Until a re-derived confidence out-hits monotonically
   on a holdout, tier must not raise a pick's weight. Rebuild confidence from calibrated edge +
   reliability + data quality, then re-validate on settled data.

Also account for (documented, not yet modeled): pitcher form, opponent K/contact profile, handedness,
park, weather, lineup strength, bullpen fatigue, market movement, projection-vs-line gap.

**Data gap:** the committed reports persist per-prop edge only for the per-date top hits + biggest
misses (an extremes subsample), so a *true* by-edge-bucket calibration isn't possible from committed
artifacts. **Action:** persist per-prop `(edgePct, outcome)` in the grading pipeline. Until then the
script emits the extremes bucket **explicitly flagged as non-representative**.

**No MLB recommendation weights were changed.** The reliability numbers are *candidate* inputs for a
future, founder-approved, backtested rollout.

---

## B5 · Soccer methodology upgrade plan

Soccer is **market-implied only** today (de-vig, no independent model). Markets, classified:

- **Market-implied now:** 3-way result, double chance, draw-no-bet, BTTS, match total, Asian handicap,
  team totals. Keep as-is; these are the honest core.
- **Model-supported later (needs a soccer model + settled sample):** team attack/defense strength,
  pace/possession, knockout game-state effects, finishing variance, BTTS tendency, team-total pressure,
  starter/minutes confidence, set-piece role, scorer-anytime from odds + lineups + minutes.
- **New-provider needed:** corners, cards, exact score, xG, shots/SOT/assists.

Design ideas to document (not fake): a Poisson/bivariate-Poisson goals model calibrated to the de-vigged
3-way + total would let us *compare* a model probability to the market and compute a real edge — but it
must be validated on settled 90-minute results before any "model says" language. **Until such a model
exists and is backtested, soccer stays labelled market-implied / de-vigged / 90-minute regulation read —
never "10,000-run", "Monte Carlo", or "independent model".**

---

## B6 · Calibration layer architecture (shipped as unwired scaffolding)

`app/src/lib/calibration/` — pure, side-effect-free, **not imported by any public recommendation**
(enforced by a test that walks `src/` for offenders):

- `types.ts` — `MarketProbability`, `CalibrationInput`, `CalibratedResult`, `DataQuality`.
- `reliability.ts` — `reliabilityWeight(input)` = learned reliability × data-quality factor
  (high 1.0 / medium 0.7 / thin 0.35 / unavailable 0); **no model ⇒ weight 0**.
- `market-blend.ts` — `blendProbabilities()` (convex, clamped) + `calibrate(input)`.

Tested invariants (`calibration.test.mjs`): probabilities clamp to [0,1]; no model ⇒ result == market
(edge 0, no fake blend); thin/unavailable data discounts/kills the model; lower reliability ⇒ smaller
edge, nearer the market; and **nothing under `src/` outside the folder imports it** (so merely adding it
changes no public pick).

Wiring path (future, founder-gated): compute `historicalReliability` per market from
`audit-mlb-calibration.mjs`, feed `calibrate()` in a *shadow* column alongside today's picks, backtest
the shadow on settled data, and only promote if it beats the current output on a holdout.

---

## B7 · Public methodology page plan (documented — not changed this pass)

Proposed safe edits to `app/src/app/methodology/page.tsx` (deferred to keep this pass zero-risk):
- State the **market-implied baseline** explicitly, then the GameTime model/simulation signal, then that
  calibration/backtesting is learned from settled results.
- Separate the **official paper-card record (19-14)** from the **raw model-performance ledger**.
- Sport split: MLB has a 10,000-run player-prop simulation + team-market Game Center; **soccer is a
  market-implied dashboard, not a 10,000-run simulation**; unsupported markets are not fabricated.
- Never say "we beat the market", "guaranteed", "locks", "safe picks", or an unscoped hit-rate.

Recommend implementing in a dedicated copy pass (touches banned-copy/overclaim tests) with founder review.

---

## B8 · Backtest / settlement feedback loop plan

1. **Generate** predictions/artifacts (8am ET) — market + model + (future) calibrated shadow column.
2. **Settle** official finals (2am ET) — no grading for unfinished games; API credit guards; **money
   md5 guard** before any publish.
3. **Update** sport-specific model-performance ledgers (separate from the 19-14 record).
4. **Analyze** calibration by market / tier / edge bucket (post-settlement run of
   `audit-mlb-calibration.mjs`; persist per-prop edge to unlock true edge buckets).
5. **Propose** reliability-weight changes (candidate weights, not applied).
6. **Founder approval required** before any public recommendation formula changes.
7. **Keep** the official product-card record strictly separate from raw model ledgers.

Automation is currently manual/dormant (needs `ODDS_API_KEY` / `API_FOOTBALL_KEY` /
`BALLDONTLIE_API_KEY` secrets + a deploy hook); the loop above is the target once those exist.

---

## Did any public recommendation formula change?

**No.** This pass ships an audit, a read-only analysis script, and pure unwired scaffolding. No
projection, edge, confidence, selection, or product-card formula was modified; money md5, record,
bankroll, and exposure are unchanged.
