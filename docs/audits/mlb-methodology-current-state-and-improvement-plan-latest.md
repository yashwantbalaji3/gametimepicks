# MLB methodology — current state + hit-rate improvement plan (June 9)

Brutally honest, evidence-backed. Projection accuracy is separated from
published-card hit rate; leg-level from card/parlay; generated pool from public
cards. Settled outcomes only (latest settled 2026-06-08; June 9 generated, not yet
settled). No production logic changed by this report.

## 1. Executive summary
- The MLB model is **deliberately simple**: free MLB-Stats-API season game logs →
  a weighted recent/season average → a Normal-CDF probability vs the book line →
  edge. **No** park, weather, handedness, lineup, opposing-pitcher, or PA-weight
  inputs are used (all explicitly absent in code).
- The recent gate work (#306/#307/restricted/#324) **worked at the leg level**:
  June-8 published legs hit **56%** (Low **64%**) vs a **49%** settled universe and
  vs ~44% pre-gate. The model now selects better-than-random legs.
- The product still loses at the **card** level — parlay math at 56% legs — which
  the new **Low=2-leg cap + edge cap** (#324) and the **daily learning loop**
  (#322/#325/#326) address. Those land on the **June-10+** generation (June 9 was
  generated before they merged — it still shows edge≥15 HRR in Low).
- **No bugs** found in the core math (line comparison, push handling, odds
  conversion, L5/L10, player-ID mapping all correct).

## 2. What the MLB methodology currently does (the real formula)
**Data sources.** Odds/lines: **The Odds API** — markets `batter_hits`,
`batter_total_bases`, `batter_hits_runs_rbis` (HRR), `pitcher_strikeouts`
(American odds → implied prob). Stats: **MLB Stats API (free)** — full-season
per-game logs (batter: hits, totalBases, runs, rbi, PA, AB; pitcher: strikeOuts;
+ date/opponent/home). No paid stat source; no external signals.

**Projection (`pipeline/mlb/mlb_model.py`).**
- Batters (min 5 appeared games): `modelProjection = 0.5·last10Mean + 0.5·seasonMean`.
- Pitcher Ks (min 3 starts): `modelProjection = 0.55·last3Mean + 0.45·seasonMean`.
- `sigma = max(stdev(season), floor)` — floors: hits 0.85, total_bases 1.10, HRR
  1.20, Ks 1.6 (prevents small-sample over-confidence).
- `P(Over) = 1 − Φ((line − projection)/sigma)` (standard normal CDF).
- `edgePct = (P(side) − impliedProb(side))·100`; lean = larger-edge side.
- `confidence`: High ≥5pp, Medium ≥2.5pp, Low <2.5pp; edge ≥20pp → forced Low +
  `r5_model_anomaly` flag; <3 games → `insufficient_data`.

**What is NOT used (verified in code, stated honestly):** opposing-pitcher
quality, batter/pitcher handedness & platoon splits, ballpark/park factor,
weather/wind/temp, confirmed starting lineup, batting-order slot, projected plate
appearances (PA is only a games-played gate, never a weight), rest days, bullpen,
umpire, line movement / book consensus, team implied run total. The "power board"
(Baseball Savant, park/weather) is flagged in code as **pending**.

**Recent form (L5/L10).** Computed per-lean from `recentSeries` vs the line:
last-10 (and last-5) values, `value==line` excluded (push, fail-closed), over/under
respected. Freshness via `recentGames` dates.

## 3. How projections flow into Suggested Parlays + Bank Builder
1. `market_suggested_status` (per market, from `market-reliability.json` Wilson
   lower bound): wilsonLo <0.35 → `disabled`, <0.50 → `restricted` (needs
   per-player consistency), ≥0.50 → `allowed`.
2. Restricted-market consistency gate: publish a restricted leg only if that
   player's exact-market **L10≥80% and L5≥80%**, sample ≥5, fresh.
3. Leg scoring (`leg_score`/`_sgp_leg_quality`): reliability (settled Wilson) +
   recent form + recent10 count − **edge overprojection penalty (edge>10pp)** −
   downweight penalty. **Confidence is NOT rewarded** (it's non-predictive); edge
   is clipped/penalized, never a promoter.
4. Public sections by **combined-odds band** (Low <+300, Med +300–600, High
   +600–1000, Longshot +1000+) with leg caps. **Low = 2 legs (#324)**; **edge cap
   excludes ≥20pp everywhere, ≥15pp from Low/Med (#324)**. Same-game / same-team /
   volatile-market / player-market recurrence penalties spread exposure.
5. **Bank Builder** (`is_bank_builder_eligible`): heavy favorite ≤ −150, low
   volatility (≤0.5), **L10≥85% / L5≥80%**, sample ≥8, fresh, no anomaly — else
   honestly empty.
6. **Learned overlay (#326)**: generation reads `selection-policy-latest.json`
   and can only **tighten** market statuses; fail-closed on
   missing/corrupt/noLiveWire/thin/stale/leakage.

## 4. Performance after the changes (settled, MLB)
Universe (all settled MLB legs, Jun 1–8): **48.5%** — props are priced near
coin-flip. Published vs universe:
- **June 8 (post-gates): published legs 56%** (Low 64%/Med 58%/High 54%/Long 53%) —
  **+8pts above universe**, correct lane gradient.
- June 5–7 (pre/partial gates): published ~44% — *below* universe (anti-selection).
- **By market (universe):** batter_hits 53% (only >50%), HRR 48%, Ks 46%,
  total_bases 42%. Published cuts harsher for bad markets (total_bases 29%, Ks tiny).
- **Edge inverted:** 0–10% ≈50%, 15–20% 42%, **≥20% 40%**. **Confidence flat:**
  High 48 ≈ Low 48 ≈ Med 51. **Odds predict:** heavy-fav 60% vs plus-money 35%.
- **Card hit rate** (Jun 1–8): Low 26% (2.2 legs), Med 13%, High 0% (4 legs),
  Longshot 0% (5 legs) — parlay math, not leg quality.
- **Simulator (#323):** Low→2 legs lifts overall card 10%→22% (Low 26%→37%);
  proposed-combined gives Low leg 68% / card 36% with far cleaner exposure.

See `mlb-performance-after-methodology-changes-latest.md` for full tables.

## 5. What's still weak (see weaknesses doc for all 20 answers)
Projections are **recent-form + season-average only** — no matchup/context. Top
gaps: no opposing-pitcher/handedness/park/weather/lineup; total_bases & HRR remain
volatile even gated; pitcher Ks weak without K-rate/pitch-count data; **batter_hits
carries nearly all the signal**; High/Longshot are structurally low-hit
odds-band lanes by design. Edge is no longer harmful (capped); confidence is no
longer used to rank.

## 6. How to improve (see improvement-plan doc for the ranked, backtest-gated list)
A) Selection-only (no new data): exposure caps, no-plus-money Low/Bank,
reliability-reranking, fewer/empty tiers. B) Feature engineering on existing data:
shrink recent form to season baseline, Wilson player-consistency, miss-margin
calibration, opposing-pitcher proxy from probable-pitcher logs, team run total
from odds. C) New data: confirmed lineups + batting order, handedness/platoon
splits, K/contact/ISO rates, park factor, weather. D) Modeling: per-market
calibrated probability (logistic/quantile), Bayesian shrinkage, simulation-based
prob instead of projection gap, Brier/calibration + walk-forward backtest.
E) Learning loop: apply learned exposure caps + odds bands + cooldowns, drift
alerts, human-approved upgrades only.

## 7. Next PR roadmap (ranked)
- **PR A (this):** docs only — methodology + improvement plan.
- **PR B (selection-only):** MLB exposure caps + no-plus-money Low/Bank +
  reliability-reranking. Files: `parlay_optimizer.py(+test)`. Backtest: simulator
  `proposed-combined` vs baseline. Low risk; rollback = revert constants.
- **PR C (feature eng):** opposing-pitcher proxy + recent-form shrinkage in
  `mlb_model.py(+test)`. Backtest: walk-forward projection accuracy + leg-rate.
- **PR D (calibration):** per-market probability calibration replacing raw gap.
  Research-heavy; needs a calibration/backtest harness first.
- **PR E (data):** confirmed lineups + handedness + park/weather ingestion
  (`mlb_stats.py`/new provider). Largest; data-availability dependent.

## 8. Risks + guardrails + rollback
All model changes require simulator/backtest before merge (the rule that caught
over-permissive tiers earlier). Learning is fail-closed + tightening-only.
Rollback: delete/blank `selection-policy-latest.json` (→ static), revert the
edge/length constants, or restore a dated policy snapshot. No NBA without a stats
provider; UFC schedule-only; V2 internal; Results settled-only; no odds-only
projections; no guarantee/lock/safe copy.
