# Soccer Projection Engine V1 — Backtest

The internal FIFA-Poisson soccer engine, evaluated against finished World Cup matches. **Status: internal-only,
not public-ready.** Two datasets: the real validation is the **2022 World Cup (N=64)**; the live-tournament
committed data (N=5) is a footnote.

## The engine (what's being tested)
Rating-driven **bivariate Poisson** (`app/src/lib/world-cup/internal-soccer-projection-engine.ts`): supremacy
from the FIFA-points gap (~0.35 goals per 100 points, capped ±2.6), scoring volume anchored to a WC base (2.6)
or the market total when present, scoreline matrix → 1X2 / total / BTTS / DC / DNB / correct score. It uses
ratings, **not** the book's price — but it is labelled `internal_soccer_projection_v1`, never
"independent/validated", because those are earned by *this* document, and this document does not clear the bar.

---

## 2022 World Cup — full 64-match validation (the real test)
Source: API-Football (league=1, season=2022), all 64 matches, saved to
`data/internal/world-cup/reference/wc-2022-results.json`. Strength: **FIFA ranking of 6 Oct 2022** (pre-tournament
— `fifa-points-2022.json`), so it is leakage-clean and identical across matches. **Graded on the 90-minute
fulltime score** (the engine predicts regulation; the 2 knockouts with extra-time goals are graded at 90').

### Headline metrics (N=64)
| | Brier ↓ | RPS ↓ | log loss ↓ | top-pick acc |
|---|---|---|---|---|
| **Model (FIFA-Poisson)** | **0.593** | **0.208** | **1.002** | 56.3% |
| Baseline: uniform 1/3 | 0.667 | 0.239 | 1.099 | — |
| Baseline: FIFA favorite | — | — | — | 56.3% |

### What's genuinely good
- **Beats uniform on all three proper scoring rules** (Brier, RPS, log loss). The probabilities carry real
  information — this is not noise.
- **Draw calibration is excellent:** predicted draw rate 25.0% vs actual 23.4%. Draws are the hardest thing to
  get right in soccer, and the model nails the rate.
- **Total goals nearly unbiased:** model mean expected 2.60 vs actual mean 2.63 (bias −0.03). MAE 1.48 goals is
  essentially irreducible match-to-match variance.
- **Reliability diagram is monotonic** (predicted ↑ ⇒ empirical ↑) across populated buckets.

### What's blunt and disqualifying (for public use)
- **Top-pick accuracy (56.3%) EXACTLY TIES the trivial "pick the FIFA favorite" baseline.** The model's
  *directional* calls add nothing over "back the higher-ranked team." Its value is in probability quality, not
  in picking winners.
- **No market baseline exists for 2022.** API-Football's free plan does not serve historical closing odds
  (probed: results 0). So we **cannot** show the engine beats or competes with the market — which is the exact
  bar the mission set for going public. Bar not cleared ⇒ stays internal.
- **The model is under-confident on favorites:** among 42 matches with a ≥45% favorite, that favorite won 61.9%
  vs the 53.6% the model assigned. Reliability buckets agree (0.5–0.6 bucket: predicted 0.55, empirical 0.63).
  A higher supremacy coefficient would likely improve this — a tuning item, not a validated change.
- **BTTS accuracy is 53%** — barely better than a coin flip.

### Reliability diagram (all 3×64 = 192 outcome predictions)
| predicted bucket | n | mean predicted | empirical |
|---|---|---|---|
| 0.1–0.2 | 13 | 0.162 | 0.308 |
| 0.2–0.3 | 98 | 0.251 | 0.214 |
| 0.3–0.4 | 23 | 0.342 | 0.261 |
| 0.4–0.5 | 32 | 0.455 | 0.500 |
| 0.5–0.6 | 19 | 0.546 | 0.632 |
| 0.6–0.7 | 7 | 0.639 | 0.714 |

### The shocks it missed (as any rating model would)
5 high-confidence misses, all the defining upsets of 2022: **Argentina 1-2 Saudi Arabia** (model 66% Argentina),
**Belgium 0-2 Morocco**, **Cameroon 1-0 Brazil**, **Tunisia 1-0 France**, Netherlands 1-1 Ecuador. No
rating-based model predicts these; that's the point of the tournament.

### Verdict (2022)
The engine is a **competent, well-calibrated rating-Poisson model** — it beats uniform, calibrates draws and
totals honestly, and is monotone. But it **ties the trivial favorite baseline on winner-picking** and, decisively,
**has no market to prove itself against**. `publicReady: false`. It stays internal.

### Tuning attempt (2026-07-14) — did not help, defaults kept
We grid-searched the supremacy coefficient (+ base total + draw inflation) against this harness, optimizing log
loss, guarded by 5-fold CV and bootstrap. **It overfits:** the full-sample "best" improves log loss by a trivial
0.0022, but out-of-sample CV makes it *worse* (1.039 vs 1.001 untuned) and the bootstrap gain CI [−0.018, +0.021]
straddles 0. Top-pick is 56.3% at *every* supremacy value (scaling confidence never changes the argmax favorite),
so tuning this parameter **cannot** beat the FIFA-favorite baseline. **Engine defaults unchanged.** Full detail:
`SOCCER_ENGINE_TUNING_RESULTS.md`.

---

## Live 2026 tournament (committed data) — N=5, insufficient
Committed settlement is knockout-only (re-fetched daily) → 5 unique finished matches: Mexico 2-0 South Africa,
South Korea 2-1 Czechia, France 3-1 Senegal, Iraq 1-4 Norway, Argentina 3-0 Algeria. Model Brier 0.342 (all heavy
favorites), top-pick 5/5. This is an anecdote, not a backtest (`2026-07-14.json`, `insufficient_sample`).

On the live semifinals the model leans to the higher-rated side vs the book (Spain +7.4pp, Argentina +9.9pp) —
now contextualized by 2022: the model is generally *under*-confident on favorites, so "lean to the favorite" is a
plausible tilt, but 2022 also showed it can't beat the market it hasn't been tested against. Not traded, not shown.

---

## Gate to go public (unchanged)
1. A **market baseline** to compare against (odds-history provider — the current blocker).
2. Model Brier/RPS **beats the closing-market baseline** out-of-sample, not just uniform.
3. Winner-picking or calibration edge **over the trivial FIFA-favorite baseline**, not just a tie.
4. Founder approval.
Until all four: `public:false`, and the public WC report stays market-implied.
