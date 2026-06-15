# UFC Freedom 250 — Official Settlement + Model-Learning Audit

**Settled:** June 15, 2026 · **Source:** ESPN MMA scoreboard (`site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard`, event **600058854**, `STATUS_FINAL`). Bank Builder untouched ($10,376.17 / 5–0 / completed).

**Source limitation (honest):** the ESPN MMA feed gives official winner + ending round/time + scheduled rounds. It does **not** expose the specific finish method (KO/TKO vs submission), so method grading is at the **finish-vs-decision** level only; KO-vs-submission is `needs_review`.

## Official fight results
| Fight | Winner | Result |
|---|---|---|
| Steve Garcia Jr. vs Diego Lopes | **Diego Lopes** | finish R2 2:42 |
| Kyle Daukaus vs Bo Nickal | **Bo Nickal** | finish R1 4:34 |
| Michael Chandler vs Mauricio Ruffy | **Mauricio Ruffy** | finish R1 4:29 |
| Derrick Lewis vs Josh Hokit | **Josh Hokit** | finish R2 4:09 |
| Aiemann Zahabi vs Sean O'Malley | **Sean O'Malley** | finish R2 4:02 |
| Alex Pereira vs Ciryl Gane | **Ciryl Gane** | finish R2 1:27 |
| Justin Gaethje vs Ilia Topuria | **Justin Gaethje** | finish R4 5:00 |

**All 7 fights ended by finish — zero decisions.**

## Moneyline — 6–1 (86%)
| Model pick | Prob | Odds | Winner | Result |
|---|---|---|---|---|
| Diego Lopes | 59% | −162 | Diego Lopes | ✅ |
| Bo Nickal | 74% | −345 | Bo Nickal | ✅ |
| Mauricio Ruffy | 84% | −700 | Mauricio Ruffy | ✅ |
| **Josh Hokit** | **77%** | **+320** | Josh Hokit | ✅ **(underdog edge call hit)** |
| Sean O'Malley | 78% | −440 | Sean O'Malley | ✅ |
| Ciryl Gane | 50% | −110 | Ciryl Gane | ✅ |
| **Ilia Topuria** | **80%** | **−520** | **Justin Gaethje** | ❌ **(main-event upset)** |

**Calibration buckets:** 50–59% → 2/2 · 70–79% → 3/3 · 80%+ → **1/2**.

## Expanded model-only (learning only — no betting P&L)
- **Goes-the-distance: 5/6.** Model leaned "finish" on 5 of 6 graded fights → all correct (the card was finish-heavy). The miss: O'Malley (leaned "distance"; was a R2 finish). Ruffy/Chandler withheld (limited data).
- **Finish-vs-decision (method top): 5/6.** Same pattern — model's top method was a finish on 5/6; O'Malley's "Decision" lean was the miss. KO-vs-submission split: `needs_review` (not in feed).

## Suggested cards — 0–4 (every card lost)
| Card | Legs | Result | Busted by |
|---|---|---|---|
| Conservative | Ruffy ✓ · Topuria ✕ | LOST | Topuria |
| Balanced | Topuria ✕ · O'Malley ✓ | LOST | Topuria |
| High-risk (4) | Ruffy ✓ · Topuria ✕ · O'Malley ✓ · Hokit ✓ | LOST | Topuria |
| Longshot (5) | Ruffy ✓ · Topuria ✕ · O'Malley ✓ · Hokit ✓ · Nickal ✓ | LOST | Topuria |

**Every other leg across all four cards won.** A single upset (Topuria) — present in all four cards — busted the entire slate. The longshot was 4/5.

## Model-learning

### What worked
- **86% straight-up accuracy** (6/7) on the first UFC slate.
- **The underdog edge call hit:** the model disagreed with the market on Lewis/Hokit (Hokit +320, model 77%) and was right — the one fight where the model had a real, market-contrarian read.
- **Finish-lean accuracy:** on a finish-heavy card, the expanded model correctly leaned "finish" 5/6 — the fighter finish-rate features carried real signal.
- **Coin-flip discipline:** Gane (50%) resolved correctly; the model didn't overstate a true pick-em.

### What failed
- **The 80%+ tier went 1/2** — the single highest-confidence favorite (Topuria −520) lost. One data point, but it's the textbook risk of heavy chalk.
- **Card construction concentrated risk:** Topuria appeared in **all four** cards, so one upset = 0/4. No diversification across the favorite pool.
- **O'Malley distance lean** was the lone expanded miss (predicted it goes long; R2 finish).

### Calibration observations
- 50–59% (2/2) and 70–79% (3/3) behaved at or above expectation; 80%+ underperformed (1/2) on a tiny sample. Too early to claim favorites are systematically overrated, but heavy chalk (−520) is exactly where one loss erases many small wins — and where parlay concentration hurts most.

### Data limitations
- No fighter-image source (initials only). No detailed bout-by-bout history (W-L summary only). No MMA prop-odds feed (totals/method/distance stay model-only). Finish method (KO vs sub) not in the ESPN feed → finish/decision-level grading only.

### Recommended improvements
1. **Diversify card construction** — cap any single fighter's appearance across the card set so one upset can't sink every lane.
2. **Closing-line value tracking** — compare model edges to closing odds to measure true edge vs noise.
3. **Backtest the moneyline model** to a threshold before flipping `moneylineValidated` (still false — correct).
4. Connect a **prop-odds feed** (totals/method/distance) to make expanded markets odds-backed/parlay-eligible.
5. **UFCStats bout-history enrichment** (opponent/method/date) for real last-5 detail.
6. Train a **method/round model** now that the expanded signals show calibration promise.

## Integrity
Settled only from the official ESPN MMA feed. No fabricated winners/methods/records. Expanded props graded for learning only (no P&L). Cards marked won only if every leg officially hit (none did). Bank Builder untouched.
