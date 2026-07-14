# MLB Full-Game — Public Readiness Audit (2026-07-14)

Validated the internal MLB full-game simulation against the de-vigged **closing market** and settled final scores.
**Verdict: the sim MIRRORS the market and is NOT public-ready.** It stays internal (`public:false`); no public
win probability / projected runs / distributions / scoreline buckets. Money untouched (md5 `affe6b21`).

## The engine (audit)
`data/internal/mlb/full-game-sim/<date>.json` — `modelMode: market_anchored_simulation`, 10,000-run, per game:
`winProbability`, `projectedScore` (means), `distributions` (totalRuns / margin), `marketCoverage`. The sim is
**market-anchored** by construction: e.g. ATL@PIT sim home-win 0.5029 vs market 0.4983, sim total 9.5 vs line 9.9.
It re-derives the book's own probabilities with small "hybrid_shadow" adjustments.

**Coverage (expanded 2026-07-14):** originally only 07-09 had both a sim and finals (N=12). We then generated
sim artifacts for **07-04..07-08** with the **same engine** (`buildFullGameSimArtifact` + `DEFAULT_SIM_OPTIONS`),
anchored to the historical **closing** odds (the de-vigged market we have for those dates) — nothing new modeled.
`build-mlb-full-game-sim-from-closing.mjs`. The sim comparison is now **81 games across 6 dates**.

## Data
- **Closing market:** The Odds API `/v4/historical` `baseball_mlb` (h2h + totals + spreads), de-vigged consensus
  (~8–14 US books), snapshot ~6 min before first pitch (0 lookahead violations) →
  `data/internal/mlb/reference/mlb-closing-odds.json`, **82 settled games across 6 dates** (07-04..07-09).
- **Final scores:** StatsAPI linescores. **Sim:** `full-game-sim/2026-07-09.json` (join by gamePk).

## Market baseline (82 games — how good the market itself is)
| Brier ↓ | log loss ↓ | winner acc | total-runs MAE | O/U acc | run-line cover acc |
|---|---|---|---|---|---|
| 0.2403 | 0.6738 | 59.8% | 4.20 | 52% | 46% |

Total-runs MAE ~4.2 reflects MLB's inherent scoring variance (the line is a good central estimate but games
scatter widely). Moneyline calibration is roughly on the line given the small sample (0.5–0.6 bucket: 43 games,
predicted 0.544 vs empirical 0.512).

## Sim vs market — PAIRED on 81 games (6 dates, 07-04..07-09)
| | Brier ↓ | log loss ↓ | winner acc | total MAE | margin MAE | O/U acc | run-line acc |
|---|---|---|---|---|---|---|---|
| **Sim** | 0.2401 | 0.6735 | 61.7% | 4.25 | 3.78 | 59% | 52% |
| **Market** | 0.2406 | 0.6745 | 59.3% | 4.24 | — | — | — |
| Δ (sim−market) | **−0.0005** | −0.0010 | +2.4pp | +0.01 | — | — | — |

## Verdict: MIRRORS the market — CONFIRMED AT SCALE
- **Moneyline Brier/log loss are indistinguishable from the market** (ΔBrier −0.0005, well within noise). The sim
  reproduces the book's probabilities because it is anchored to them. It does **not** beat the market; it mirrors it.
- The small winner-accuracy (+2.4pp) and O/U differences are **shadow-adjustment noise** on 81 games, not a real
  edge — the proper scoring rules (Brier, log loss), which reward probability quality, show **no** improvement.
  Total MAE is identical (4.25 vs 4.24). A market-anchored engine cannot beat the market it re-derives.
- N=81 across 6 dates is now a real sample, and the mirror result is stable — this is not a small-sample artifact.
- (The earlier N=12/07-09-only run showed the same ΔBrier ≈ 0; scale did not change the conclusion.)

## Public gate — NOT cleared
The public MLB report stays exactly as it is: a **10,000-run player-prop simulation + a market-anchored full-game
snapshot** (moneyline / run line / total shown as de-vigged lines, market-anchored). The report's "Full-game
simulation · validating" section already says no projected score / win probability is shown — this audit
**confirms that is correct**. To surface public full-game numbers we would need, in order:
1. **Sim artifacts over a real sample** — generate full-game sims for many settled dates (needs the sim inputs
   per date), so the comparison isn't N=1.
2. **Independent signal** — the sim must beat the closing market out-of-sample, which a *market-anchored* sim
   cannot by construction. That requires real features the market doesn't fully price (pitcher form, bullpen
   fatigue, lineup, park/weather) — a modeling build, not a re-anchoring.
3. **Founder approval** — only after 1 + 2 clear.
Until all three: internal-only, `public:false`, no public win-prob / projected runs / distributions.

## Honesty note
This mirrors the soccer finding: a market-anchored / rating model **mirrors or loses to the market**. Beating the
market needs information the market doesn't already price. We have not built that for MLB, and we do not pretend
we have.
