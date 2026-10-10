# MLB-005 · evaluation and promotion design for coherent-world outputs (2026-10-10; design, nothing promoted)

**Principle:** one simulated population produces every number. Each number is still **qualified separately**, and no family inherits another's evidence. Coherence (0 invariant violations) is a **precondition**, never evidence of accuracy.

## Families and their gates

**All family gates share:**
- forward only (tests B / B2 / B-GAMES, or option A);
- one look;
- a bootstrap that resamples **dates**;
- a calibration slope in [0.7, 1.3];
- the market always reported, never used to pass.

| Family | Primary metric against | Minimum n | Status |
|---|---|---|---|
| Winner | Log loss vs the published game model of record | 300 regular-season games | Forward B-GAMES open |
| Total runs | Log score and CRPS vs the published total distribution, plus O/U log loss at the graded line | 300 games | Reported in B-GAMES; a separate registration is needed before it can pass |
| Run line | Cover log loss at the posted signed line (`homeCoverProbability`) | 300 games with a posted line | Not registered |
| Team totals | Log score at the posted team-total line | 300 | Not registered; sparse lines |
| Batter hits / TB / H+R+RBI | P(over posted line) log loss vs the published prop model | 2,000 / 1,000 / 1,000 | Forward B and B2 open |
| Pitcher K | Same | 300 starts | Forward B and B2 open |
| Runs, RBI | Count log score only (no posted lines on the board) | — | **Withheld from publication**: no line-level evidence possible today |
| HR | — | — | **Withheld**: v2 failed its retrospective bar; needs its own mechanism (park, batted ball) and registration |
| Pitcher outs | — | — | Not captured on the board; withheld |

## Dependence (the same worlds, the same games)

- **Within a game:** player rows share the simulated game, and the game shares the slate's inputs. So every interval resamples whole **dates**: all of a date's games and players move together. That is conservative against within-game and within-slate correlation.
- **Family evidence:** no family's pass is evidence for another, and no joint "model accuracy" number is published.
- **Joint products** (parlays and same-game combinations): P(all legs) is a count over the same worlds. It needs its **own** joint calibration test, scored against the outcomes of real multi-leg combinations (PARLAY-001). Marginal passes do not qualify joint probabilities.

## Sparse markets

- A family whose posted lines cannot reach its n within the 2027 regular season is reported as **"not enough data"** and stays withheld.
- Extending the window is a new registration.

## Promotion path (per family)

1. Forward pass, one look.
2. Founder decision on eligibility.
3. A versioned artifact field for that family's distribution (CONTRACT-001; additive).
4. Production wiring through its own PR and exact-head approval.
5. A rollback rule: the old model stays reproducible (as LEGACY_RULES is for the engine).

**Results and the ledger:** they record the model version per row (LEDGER-001). No historical row is rescored.
