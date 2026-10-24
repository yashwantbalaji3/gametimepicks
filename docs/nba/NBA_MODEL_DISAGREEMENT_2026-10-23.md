# NBA model disagreement: 2026-10-22 and 2026-10-23 slates

**Status:** RESEARCH, EVIDENCE ONLY. `dataClass PRIVATE_RESEARCH`, `productEligible: false`. Nothing here is armed, merged into a product path, or written to a forecast, receipt, ledger or public lane. No official value changes.

**Official composition (unchanged):** the Elo-favoured side is the official game call; v0.1 player medians are official; team scores are WITHHELD publicly. v1 (supporting) and v0.3 (challenger) are research heads.

**Repro** (reads committed files only; no network; deterministic, byte-identical across runs):

```
cd app && npx tsx scripts/nba/research/report-nba-model-disagreement.mjs --dates 2026-10-22,2026-10-23 [--json <path outside the repo>]
```

Any date list works. For the 10-24 slate, once it freezes (around 2026-10-24 14:00Z), re-run with `--dates 2026-10-22,2026-10-23,2026-10-24`. `--json` refuses any path inside this checkout or the main checkout. Test: `cd app && npx tsx --test scripts/nba/research/report-nba-model-disagreement.test.mjs`.

Inputs: the v0.1, v1 and v0.3 receipts for each date, the public lane, `finals-2026-27.json`, and fetched box scores where they exist. The generated section below lists each input's sha256. Every receipt passes `receiptIntegrity` (OK on 14/14 v0.1, 14/14 v1 and 14/14 v0.3).

## Reading notes

n is small everywhere: 14 games (2 on 10-22, 12 on 10-23), 3 finals and 2 box scores. Read every number below as a description of these games, not as an estimate of anything.

1. **Side contradictions (a sim favouring the other side from the official Elo).**
   - v0.1 sim: 0/2 on 10-22 and 9/12 on 10-23, so 9/14 pooled.
   - v0.3 sim: 1/2 (CLE@PHI) and 7/12, so 8/14 pooled.
   - v1 sim: 0/2 and 1/12 (MIN@ORL, 0.474 against Elo 0.547), so 1/14 pooled.
   - Mean |sim − Elo| pooled: v0.1 0.241, v0.3 0.157, v1 0.046.
   - The v1 sim sits below the official Elo pHome on all 14 games, and 0.031 to 0.053 below its own Elo on all 14. That is a consistent home-side shrink in v1's engine. It is a fact about the engine, not an accuracy claim.
   - v1's own Elo (it refolds 2026-27 games) flips two near-coin-flip games: NY@BOS (official 0.497) and NO@UTAH (official 0.496). It is not the official rating.
   - The official side is self-consistent: `publishedSide` equals the Elo side on 14/14, and the public lane's favoured team equals it on 14/14.
2. **Team scores.** v0.1's median margin points to the other side from Elo on 9/14 games; v0.3's on 7/14, v1's on 1/14.
   - The mean |margin p50| difference between v0.1 and v1 is 13.9 pts (n=14).
   - This is why the public lane withholds v0.1's team score. It is a sum of each team's player simulations, it never conditions on the opponent, and it can contradict the official side.
   - On the 3 finals, every sim's medians missed the actual totals by 12 to 70 points. The 10-22 games were low-scoring (96–84 and 114–106). That is n=3.
3. **Player sums against team sims.** The expected mechanism does not appear in the form expected.
   - **Internally the official v0.1 players agree exactly with the v0.1 sim.** Σ expected minutes is 240.0 on all 28 team-sides: the uniform rescale pins it there. Σ player pts **mean** − sim mean is 0.0 on every team-side, because the team score is the sum of the player draws.
   - **Σ player pts p50 is 7.5 pts below the sim's team p50** (pooled, n=28 team-sides, range −2.9 to −12.8). This is an aggregation effect: player point distributions are right-skewed, so the sum of medians sits below the median of the sum. It is not a minutes effect. v1 shows −0.2 here and v0.3 −2.3.
   - **Against the other sims**, Σ v0.1 pts p50 is 9.3 below v1's team p50 and 11.3 below v0.3's (n=28). Only part of that is level: v0.1's team **means** sit 1.2 below v1 and 4.0 below v0.3. The rest is the median-sum effect above.
   - **The public lane** shows only rows with ≥ 10 expected minutes. Summing the displayed medians gives 11.7 below v0.1's withheld team p50 on average (n=28). A reader who adds up the shown medians gets a number below the model's own team median.
   - **The 240-minute rescale diagnosis (PR 1178) is visible in the minutes.**
     - 24 of 28 team-sides have a rescale factor below 1 (range ×0.605 for MIL to ×1.189).
     - On the two 10-22 box scores, v0.1 under-projected starters by 2.8 min per starter (20 starters).
     - v1 under-projected them by 2.2 and v0.3 by 2.4.
     - At 2 games these three are not distinguishable. The rescale moves minutes inside a team. It does not shrink the team's total points, which stays 240 minutes × pool rate.
4. **Descriptive scores on finals (n=3: CLE@PHI, DEN@OKC, CHI@MIL).** Lower log loss is better.
   - The official Elo side was right on 2/3.
   - Mean log loss: Elo 0.651, v0.1 sim 0.575, v1 sim 0.630, v0.3 sim 0.636, v1 own Elo 0.624.
   - The v0.1 and v0.3 sims "look" better only because of CHI@MIL. There they favoured CHI (the winner) against Elo's MIL: per-game log-loss difference vs Elo −0.59 and −0.53. On the two 10-22 games they were worse (+0.01 to +0.37).
   - Per-game spreads straddle 0 for every sim head. **Every head-vs-Elo difference is not distinguishable at this n.** No interval is computed below 30 paired games, and none is claimed.

## What this means for the products

The official game call stays the Elo-favoured side, and the official player numbers stay v0.1's medians. Nothing in this report changes either, or any receipt, ledger row, Theater anchor or public-lane value.

The large side contradictions come from the v0.1 and v0.3 *team-score* sims, which ignore the opponent. They are the documented reason team scores are withheld, not a signal to flip a published side. v1's single contradiction and v0.3's disagreements are supporting and challenger research signals. They can be tracked forward, but they cannot become official through this report. Any change goes through the founder and the promotion record.

Two product-facing notes come out of this, neither of which needs action now:
- the public player medians do not sum to a team score, and should never be presented as if they did;
- the consistency gate for one official forecast across products (Theater included) should keep anchoring on the Elo side, never on a sim's team score.

## Caveats

- Only 3 finals and 2 box scores. All scoring and minutes comparisons are descriptive. The CHI@MIL final was the only 10-23 game recorded when this was generated; re-run as finals land.
- "Σ player p50" is a sum of medians. It is not the median of the team total, and the gap between them is a property of skewed distributions.
- The v1 and v0.3 player distributions are conditional on playing, so their sums use mean × playRate. v0.1 has no playRate.
- v1 froze at different instants from v0.1 (often hours later, with more box scores folded), so v1-vs-Elo gaps mix model and information-time differences. v0.3 is aligned to v0.1's instant and inputs, and its Elo equals the official Elo on every game.
- Box scores come from `data/internal/research/nba/experimental/boxscores/`. "Starter" is the box score's starter flag. That flag is an outcome-side label, but it does not select on minutes played.

---

## Generated report (verbatim script output)

<!-- generated by app/scripts/nba/research/report-nba-model-disagreement.mjs --dates 2026-10-22,2026-10-23 · nba-model-disagreement@1 · deterministic -->
RESEARCH_NOT_PUBLISHED · dataClass PRIVATE_RESEARCH · productEligible false · changes no official value

Inputs (sha256 of the committed bytes read):

- `data/internal/research/nba/experimental-v0.1/forecasts/2026-10-22.json`: 54d182c5443d4f548e2bb64385488f90c6ebc427169c9854e8e8aa5d9278daee
- `data/internal/research/nba/experimental-v1/forecasts/2026-10-22.json`: 4b83a1208d1376808dea7ed3d48780240848f19095eb3c14e1d3ba8386678b48
- `data/internal/research/nba/experimental-v0.3/forecasts/2026-10-22.json`: 883b0e899556f3f408709c674d981b3d79d1da51532544d9602527304d2ac00a
- `app/public/data/nba/experimental-public/2026-10-22.json`: e07a7a4ade5dd6591c18fa627af1b1c5f5288d257ae48b30a0673dc66af5f074
- `data/internal/research/nba/experimental-v0.1/forecasts/2026-10-23.json`: ec2d9ca8520229aaf16541cca9caec633f9d8f23979c977124e6ba6cb4321195
- `data/internal/research/nba/experimental-v1/forecasts/2026-10-23.json`: b56210d7481a60e4ea93191efca95a92ee0be9d51c38c16961edafca011f6c1d
- `data/internal/research/nba/experimental-v0.3/forecasts/2026-10-23.json`: 74e5a88d6d013f937711ec4a4121eefa52599f7520120d3378eb92bddbc769a0
- `app/public/data/nba/experimental-public/2026-10-23.json`: 54880313e53b0d25f16f443479afbe13430ad7c55e8d34c1dcbe3ad006712f50
- `app/public/data/nba/results/finals-2026-27.json`: 76d6a15f469030d521b6c073e8c95d72bfdf48b079ba74d36566670038d85df7
- `data/internal/research/nba/experimental/boxscores/401909093.json`: e782378cdcb708d0006704b9e48c921868334f9a400e4bee672193d237239f9c
- `data/internal/research/nba/experimental/boxscores/401909094.json`: be30c08c0337a836ca3d7d3e243abee44a321cbc2da7ce88bbea7a9a041c94d3

## 2026-10-22

n: 2 games · v0.1 sim 2 · v1 sim 2 · v0.3 sim 2 · finals 2 · box scores 2

Official consistency: publishedSide = Elo side on 2/2; public lane favoured = Elo side on 2/2 checked; receipts not OK: none.

### 1. Winner side vs the official Elo side

| game | Elo pHome (side) | v0.1 sim | v1 sim | v0.3 sim | v1 own Elo | contradictions |
| --- | --- | --- | --- | --- | --- | --- |
| CLE@PHI | 0.533 (PHI) | 0.526 (-0.007) | 0.505 (-0.028) | 0.472 (-0.061) **≠** | 0.555 (+0.022) | v0.3 sim |
| DEN@OKC | 0.726 (OKC) | 0.514 (-0.211) | 0.704 (-0.021) | 0.504 (-0.222) | 0.738 (+0.012) | none |

Cells: head pHome (head − Elo). **≠** = the head favours the other side from the official Elo.

| head | n | side contradictions | mean |head − Elo| | mean (head − Elo) | max |head − Elo| | games contradicting |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 sim | 2 | 0/2 | 0.1091 | -0.1090 | 0.2113 | none |
| v1 sim | 2 | 0/2 | 0.0248 | -0.0247 | 0.0283 | none |
| v0.3 sim | 2 | 1/2 | 0.1414 | -0.1414 | 0.2219 | CLE@PHI |
| v1 own Elo | 2 | 0/2 | 0.0173 | +0.0173 | 0.0222 | none |

### 2. Team scores (medians; v0.1's are WITHHELD publicly)

| game | v0.1 sim H–A (margin) | v1 sim H–A (margin) | v0.3 sim H–A (margin) | final H–A (margin) |
| --- | --- | --- | --- | --- |
| CLE@PHI | 124.0–122.0 (+2.0) | 132.0–132.0 (+1.0) | 135.0–137.0 (-2.0) **≠** | 114–106 (+8) |
| DEN@OKC | 119.0–118.0 (+1.0) | 125.0–117.0 (+8.0) | 125.0–125.0 (0.0) | 96–84 (+12) |

**≠** = the sim's median margin favours the other side from the official Elo.

| head | n | mean total p50 | mean home margin p50 | median margin contradicts Elo |
| --- | --- | --- | --- | --- |
| v0.1 sim | 2 | 241.5 | +1.5 | 0/2 |
| v1 sim | 2 | 253.0 | +4.5 | 0/2 |
| v0.3 sim | 2 | 261.5 | -1.0 | 1/2 |

| pair | n | mean |margin p50 diff| | mean total p50 diff (first − second) |
| --- | --- | --- | --- |
| v01Sim vs v1Sim | 2 | 4.0 | -11.5 |
| v01Sim vs v03Sim | 2 | 2.5 | -20.0 |
| v1Sim vs v03Sim | 2 | 5.5 | -8.5 |

### 3. Player sums vs team sims

| game · side | v0.1 rows / Σ exp min | v0.1 raw pool min → rescale | Σ v0.1 pts p50 | Σ v0.1 pts mean | v0.1 sim p50 / mean | Σp50 − sim p50 | v1 sim p50 | v0.3 sim p50 | public rows / Σ shown p50 | final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CLE@PHI · home PHI | 13 / 240.0 | 335.5 → ×0.715 | 117.7 | 124.1 | 124.0 / 124.2 | -6.3 | 132.0 | 135.0 | 10 / 114.9 | 114 |
| CLE@PHI · away CLE | 12 / 240.0 | 231.4 → ×1.037 | 114.0 | 122.7 | 122.0 / 122.7 | -8.0 | 132.0 | 137.0 | 7 / 104.9 | 106 |
| DEN@OKC · home OKC | 11 / 240.0 | 244.9 → ×0.980 | 107.4 | 120.1 | 119.0 / 120.1 | -11.6 | 125.0 | 125.0 | 9 / 104.3 | 96 |
| DEN@OKC · away DEN | 13 / 240.0 | 309.9 → ×0.774 | 111.1 | 118.3 | 118.0 / 118.3 | -6.9 | 117.0 | 125.0 | 11 / 108.0 | 84 |

| family | n team-sides | mean Σ expected minutes | mean (Σ pts p50 − sim p50) | mean (Σ pts mean×playRate − sim mean) |
| --- | --- | --- | --- | --- |
| v0.1 (official players) | 4 | 240.0 | -8.2 | 0.0 |
| v1 | 4 | 258.7 | -1.0 | 0.0 |
| v0.3 | 4 | 249.4 | -2.5 | -0.1 |

Σ official v0.1 player pts p50 − v1 sim team p50: -13.9 (n=4 team-sides); − v0.3 sim team p50: -17.9 (n=4).

Projected vs actual minutes (box scores; players who played and had a projection; descriptive, n=2 games):

| family | n games | n team-sides | players played & projected | mean (projected − actual) min | starters: n · mean (proj − actual) | bench: n · mean (proj − actual) | played, not projected (min) | projected, did not play |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 2 | 4 | 39 | -1.3 | 20 · -2.8 | 19 · +0.2 | 6 (76.0) | 10 |
| v1 | 2 | 4 | 41 | +0.1 | 20 · -2.2 | 21 · +2.3 | 4 (61.0) | 10 |
| v0.3 | 2 | 4 | 41 | -0.4 | 20 · -2.4 | 21 · +1.5 | 4 (61.0) | 10 |

Starter = the box score's starter flag. v1 / v0.3 expected minutes are conditional on playing; v0.1's are not.

### 4. Finals: descriptive scores (n=2 games; lower log loss is better)

Official Elo side correct: 2/2.

| game | winner | Elo (official side) p · LL · Brier | v0.1 sim p · LL · Brier | v1 sim p · LL · Brier | v0.3 sim p · LL · Brier | v1 own Elo p · LL · Brier |
| --- | --- | --- | --- | --- | --- | --- |
| CLE@PHI | HOME 114–106 | 0.533 · 0.6292 · 0.2181 | 0.526 · 0.6421 · 0.2245 | 0.505 · 0.6838 · 0.2453 | 0.472 · 0.7506 · 0.2787 | 0.555 · 0.5884 · 0.1978 |
| DEN@OKC | HOME 96–84 | 0.726 · 0.3208 · 0.0753 | 0.514 · 0.6649 · 0.2359 | 0.704 · 0.3504 · 0.0874 | 0.504 · 0.6858 · 0.2463 | 0.738 · 0.3039 · 0.0687 |

| head | n | mean log loss | mean Brier | per-game LL diff vs Elo: mean [min, max] | verdict |
| --- | --- | --- | --- | --- | --- |
| Elo (official side) | 2 | 0.4750 | 0.1467 | reference | — |
| v0.1 sim | 2 | 0.6535 | 0.2302 | +0.1785 [+0.0129, +0.3441] (n=2) | not distinguishable at this n |
| v1 sim | 2 | 0.5171 | 0.1664 | +0.0421 [+0.0296, +0.0546] (n=2) | not distinguishable at this n |
| v0.3 sim | 2 | 0.7182 | 0.2625 | +0.2432 [+0.1214, +0.3650] (n=2) | not distinguishable at this n |
| v1 own Elo | 2 | 0.4462 | 0.1333 | -0.0288 [-0.0408, -0.0169] (n=2) | not distinguishable at this n |

No interval is computed below n=30 games; every head-vs-Elo difference here is not distinguishable at this n.

## 2026-10-23

n: 12 games · v0.1 sim 12 · v1 sim 12 · v0.3 sim 12 · finals 1 · box scores 0

Official consistency: publishedSide = Elo side on 12/12; public lane favoured = Elo side on 12/12 checked; receipts not OK: none.

### 1. Winner side vs the official Elo side

| game | Elo pHome (side) | v0.1 sim | v1 sim | v0.3 sim | v1 own Elo | contradictions |
| --- | --- | --- | --- | --- | --- | --- |
| CHI@MIL | 0.634 (MIL) | 0.342 (-0.292) **≠** | 0.576 (-0.058) | 0.376 (-0.258) **≠** | 0.625 (-0.009) | v0.1 sim, v0.3 sim |
| NY@BOS | 0.497 (NY) | 0.352 (-0.145) | 0.467 (-0.031) | 0.395 (-0.103) | 0.508 (+0.011) **≠** | v1 own Elo |
| ATL@CHA | 0.608 (CHA) | 0.326 (-0.282) **≠** | 0.554 (-0.054) | 0.360 (-0.248) **≠** | 0.600 (-0.008) | v0.1 sim, v0.3 sim |
| DAL@IND | 0.571 (IND) | 0.433 (-0.138) **≠** | 0.542 (-0.029) | 0.556 (-0.015) | 0.595 (+0.024) | v0.1 sim |
| MIN@ORL | 0.547 (ORL) | 0.209 (-0.338) **≠** | 0.474 (-0.073) **≠** | 0.431 (-0.116) **≠** | 0.516 (-0.031) | v0.1 sim, v1 sim, v0.3 sim |
| TOR@WSH | 0.296 (TOR) | 0.588 (+0.291) **≠** | 0.261 (-0.035) | 0.507 (+0.211) **≠** | 0.304 (+0.008) | v0.1 sim, v0.3 sim |
| DET@MIA | 0.454 (DET) | 0.831 (+0.377) **≠** | 0.383 (-0.071) | 0.613 (+0.158) **≠** | 0.429 (-0.025) | v0.1 sim, v0.3 sim |
| HOU@SA | 0.717 (SA) | 0.426 (-0.291) **≠** | 0.661 (-0.056) | 0.620 (-0.097) | 0.699 (-0.018) | v0.1 sim |
| NO@UTAH | 0.496 (NO) | 0.873 (+0.377) **≠** | 0.456 (-0.040) | 0.627 (+0.131) **≠** | 0.504 (+0.008) **≠** | v0.1 sim, v0.3 sim, v1 own Elo |
| MEM@GS | 0.723 (GS) | 0.225 (-0.498) **≠** | 0.677 (-0.045) | 0.473 (-0.249) **≠** | 0.708 (-0.015) | v0.1 sim, v0.3 sim |
| LAC@LAL | 0.675 (LAL) | 0.741 (+0.065) | 0.631 (-0.044) | 0.867 (+0.192) | 0.675 (+0.000) | none |
| POR@SAC | 0.412 (POR) | 0.350 (-0.063) | 0.350 (-0.062) | 0.281 (-0.131) | 0.396 (-0.017) | none |

Cells: head pHome (head − Elo). **≠** = the head favours the other side from the official Elo.

| head | n | side contradictions | mean |head − Elo| | mean (head − Elo) | max |head − Elo| | games contradicting |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 sim | 12 | 9/12 | 0.2630 | -0.0779 | 0.4980 | CHI@MIL, ATL@CHA, DAL@IND, MIN@ORL, TOR@WSH, DET@MIA, HOU@SA, NO@UTAH, MEM@GS |
| v1 sim | 12 | 1/12 | 0.0498 | -0.0498 | 0.0727 | MIN@ORL |
| v0.3 sim | 12 | 7/12 | 0.1590 | -0.0438 | 0.2577 | CHI@MIL, ATL@CHA, MIN@ORL, TOR@WSH, DET@MIA, NO@UTAH, MEM@GS |
| v1 own Elo | 12 | 2/12 | 0.0144 | -0.0060 | 0.0311 | NY@BOS, NO@UTAH |

### 2. Team scores (medians; v0.1's are WITHHELD publicly)

| game | v0.1 sim H–A (margin) | v1 sim H–A (margin) | v0.3 sim H–A (margin) | final H–A (margin) |
| --- | --- | --- | --- | --- |
| CHI@MIL | 117.0–127.0 (-10.0) **≠** | 118.0–115.0 (+3.0) | 112.0–120.0 (-9.0) **≠** | 125–132 (-7) |
| NY@BOS | 104.0–114.0 (-10.0) | 104.0–105.0 (-2.0) | 109.0–116.0 (-7.0) | pending |
| ATL@CHA | 93.0–103.0 (-10.0) **≠** | 107.0–105.0 (+2.0) | 106.0–115.0 (-9.0) **≠** | pending |
| DAL@IND | 115.0–121.0 (-5.0) **≠** | 120.0–118.0 (+2.0) | 116.0–112.0 (+4.0) | pending |
| MIN@ORL | 102.0–123.0 (-21.0) **≠** | 123.0–124.0 (-1.0) **≠** | 126.0–132.0 (-5.0) **≠** | pending |
| TOR@WSH | 125.0–120.0 (+5.0) **≠** | 115.0–124.0 (-9.0) | 123.0–122.0 (0.0) | pending |
| DET@MIA | 130.0–105.0 (+25.0) **≠** | 119.0–123.0 (-4.0) | 127.0–119.0 (+8.0) **≠** | pending |
| HOU@SA | 108.0–112.0 (-4.0) **≠** | 117.0–111.0 (+6.0) | 123.0–115.0 (+8.0) | pending |
| NO@UTAH | 144.0–115.0 (+29.0) **≠** | 128.0–129.0 (-2.0) | 129.0–120.0 (+9.0) **≠** | pending |
| MEM@GS | 113.0–132.0 (-19.0) **≠** | 124.0–117.0 (+7.0) | 119.0–121.0 (-2.0) **≠** | pending |
| LAC@LAL | 118.0–102.0 (+17.0) | 115.0–110.0 (+5.0) | 132.0–100.0 (+32.0) | pending |
| POR@SAC | 110.0–120.0 (-10.0) | 113.0–118.0 (-5.0) | 107.0–122.0 (-16.0) | pending |

**≠** = the sim's median margin favours the other side from the official Elo.

| head | n | mean total p50 | mean home margin p50 | median margin contradicts Elo |
| --- | --- | --- | --- | --- |
| v0.1 sim | 12 | 231.8 | -1.1 | 9/12 |
| v1 sim | 12 | 233.5 | +0.2 | 1/12 |
| v0.3 sim | 12 | 237.8 | +1.1 | 6/12 |

| pair | n | mean |margin p50 diff| | mean total p50 diff (first − second) |
| --- | --- | --- | --- |
| v01Sim vs v1Sim | 12 | 15.6 | -1.7 |
| v01Sim vs v03Sim | 12 | 10.2 | -5.9 |
| v1Sim vs v03Sim | 12 | 9.6 | -4.3 |

### 3. Player sums vs team sims

| game · side | v0.1 rows / Σ exp min | v0.1 raw pool min → rescale | Σ v0.1 pts p50 | Σ v0.1 pts mean | v0.1 sim p50 / mean | Σp50 − sim p50 | v1 sim p50 | v0.3 sim p50 | public rows / Σ shown p50 | final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CHI@MIL · home MIL | 15 / 240.0 | 396.4 → ×0.605 | 110.7 | 117.6 | 117.0 / 117.6 | -6.3 | 118.0 | 112.0 | 15 / 110.7 | 125 |
| CHI@MIL · away CHI | 12 / 240.0 | 266.3 → ×0.901 | 121.6 | 128.1 | 127.0 / 128.1 | -5.4 | 115.0 | 120.0 | 11 / 120.3 | 132 |
| NY@BOS · home BOS | 14 / 240.0 | 287.5 → ×0.835 | 95.1 | 105.2 | 104.0 / 105.2 | -8.9 | 104.0 | 109.0 | 11 / 90.9 | — |
| NY@BOS · away NY | 15 / 240.0 | 279.9 → ×0.858 | 101.6 | 114.7 | 114.0 / 114.7 | -12.4 | 105.0 | 116.0 | 9 / 89.2 | — |
| ATL@CHA · home CHA | 11 / 240.0 | 222.5 → ×1.079 | 88.5 | 93.0 | 93.0 / 93.0 | -4.5 | 107.0 | 106.0 | 10 / 84.9 | — |
| ATL@CHA · away ATL | 14 / 240.0 | 311.6 → ×0.770 | 93.8 | 103.2 | 103.0 / 103.2 | -9.2 | 105.0 | 115.0 | 11 / 88.9 | — |
| DAL@IND · home IND | 13 / 240.0 | 321.6 → ×0.746 | 109.1 | 115.9 | 115.0 / 115.9 | -5.9 | 120.0 | 116.0 | 12 / 107.3 | — |
| DAL@IND · away DAL | 10 / 240.0 | 222.8 → ×1.077 | 109.7 | 122.3 | 121.0 / 122.3 | -11.3 | 118.0 | 112.0 | 10 / 109.8 | — |
| MIN@ORL · home ORL | 13 / 240.0 | 264.6 → ×0.907 | 94.9 | 102.7 | 102.0 / 102.7 | -7.2 | 123.0 | 126.0 | 9 / 90.1 | — |
| MIN@ORL · away MIN | 13 / 240.0 | 281.3 → ×0.853 | 113.5 | 123.9 | 123.0 / 123.8 | -9.5 | 124.0 | 132.0 | 9 / 106.2 | — |
| TOR@WSH · home WSH | 13 / 240.0 | 327.0 → ×0.734 | 122.1 | 126.0 | 125.0 / 126.0 | -2.9 | 115.0 | 123.0 | 12 / 120.8 | — |
| TOR@WSH · away TOR | 13 / 240.0 | 294.8 → ×0.814 | 112.6 | 120.9 | 120.0 / 120.9 | -7.4 | 124.0 | 122.0 | 9 / 107.4 | — |
| DET@MIA · home MIA | 15 / 240.0 | 294.1 → ×0.816 | 117.2 | 131.2 | 130.0 / 131.2 | -12.8 | 119.0 | 127.0 | 11 / 109.6 | — |
| DET@MIA · away DET | 16 / 240.0 | 308.8 → ×0.777 | 96.0 | 105.6 | 105.0 / 105.6 | -9.0 | 123.0 | 119.0 | 9 / 84.7 | — |
| HOU@SA · home SA | 12 / 240.0 | 246.7 → ×0.973 | 102.1 | 108.0 | 108.0 / 108.0 | -5.9 | 117.0 | 123.0 | 7 / 94.7 | — |
| HOU@SA · away HOU | 14 / 240.0 | 343.2 → ×0.699 | 106.2 | 111.9 | 112.0 / 111.9 | -5.8 | 111.0 | 115.0 | 10 / 100.4 | — |
| NO@UTAH · home UTAH | 15 / 240.0 | 328.4 → ×0.731 | 137.2 | 145.6 | 144.0 / 145.6 | -6.8 | 128.0 | 129.0 | 12 / 133.7 | — |
| NO@UTAH · away NO | 16 / 240.0 | 384.3 → ×0.625 | 107.8 | 116.4 | 115.0 / 116.4 | -7.2 | 129.0 | 120.0 | 14 / 104.3 | — |
| MEM@GS · home GS | 12 / 240.0 | 275.8 → ×0.870 | 107.0 | 113.1 | 113.0 / 113.1 | -6.0 | 124.0 | 119.0 | 12 / 106.9 | — |
| MEM@GS · away MEM | 15 / 240.0 | 324.8 → ×0.739 | 125.5 | 131.8 | 132.0 / 131.8 | -6.5 | 117.0 | 121.0 | 13 / 121.9 | — |
| LAC@LAL · home LAL | 14 / 240.0 | 284.8 → ×0.843 | 113.1 | 119.1 | 118.0 / 119.1 | -4.9 | 115.0 | 132.0 | 11 / 109.9 | — |
| LAC@LAL · away LAC | 10 / 240.0 | 201.9 → ×1.189 | 94.1 | 103.0 | 102.0 / 103.0 | -7.9 | 110.0 | 100.0 | 8 / 92.2 | — |
| POR@SAC · home SAC | 10 / 240.0 | 269.5 → ×0.890 | 104.6 | 110.7 | 110.0 / 110.7 | -5.4 | 113.0 | 107.0 | 9 / 103.6 | — |
| POR@SAC · away POR | 13 / 240.0 | 254.2 → ×0.944 | 113.0 | 120.5 | 120.0 / 120.5 | -7.0 | 118.0 | 122.0 | 8 / 109.0 | — |

| family | n team-sides | mean Σ expected minutes | mean (Σ pts p50 − sim p50) | mean (Σ pts mean×playRate − sim mean) |
| --- | --- | --- | --- | --- |
| v0.1 (official players) | 24 | 240.0 | -7.3 | 0.0 |
| v1 | 24 | 262.3 | -0.0 | 0.0 |
| v0.3 | 24 | 254.8 | -2.2 | -0.0 |

Σ official v0.1 player pts p50 − v1 sim team p50: -8.5 (n=24 team-sides); − v0.3 sim team p50: -10.3 (n=24).

Projected vs actual minutes (box scores; players who played and had a projection; descriptive, n=0 games):

| family | n games | n team-sides | players played & projected | mean (projected − actual) min | starters: n · mean (proj − actual) | bench: n · mean (proj − actual) | played, not projected (min) | projected, did not play |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 0 | 0 | 0 | — | 0 · — | 0 · — | 0 (0.0) | 0 |
| v1 | 0 | 0 | 0 | — | 0 · — | 0 · — | 0 (0.0) | 0 |
| v0.3 | 0 | 0 | 0 | — | 0 · — | 0 · — | 0 (0.0) | 0 |

Starter = the box score's starter flag. v1 / v0.3 expected minutes are conditional on playing; v0.1's are not.

### 4. Finals: descriptive scores (n=1 games; lower log loss is better)

Official Elo side correct: 0/1.

| game | winner | Elo (official side) p · LL · Brier | v0.1 sim p · LL · Brier | v1 sim p · LL · Brier | v0.3 sim p · LL · Brier | v1 own Elo p · LL · Brier |
| --- | --- | --- | --- | --- | --- | --- |
| CHI@MIL | AWAY 125–132 | 0.634 · 1.0043 · 0.4016 | 0.342 · 0.4187 · 0.1170 | 0.576 · 0.8568 · 0.3312 | 0.376 · 0.4716 · 0.1414 | 0.625 · 0.9806 · 0.3905 |

| head | n | mean log loss | mean Brier | per-game LL diff vs Elo: mean [min, max] | verdict |
| --- | --- | --- | --- | --- | --- |
| Elo (official side) | 1 | 1.0043 | 0.4016 | reference | — |
| v0.1 sim | 1 | 0.4187 | 0.1170 | -0.5856 [-0.5856, -0.5856] (n=1) | not distinguishable at this n |
| v1 sim | 1 | 0.8568 | 0.3312 | -0.1475 [-0.1475, -0.1475] (n=1) | not distinguishable at this n |
| v0.3 sim | 1 | 0.4716 | 0.1414 | -0.5327 [-0.5327, -0.5327] (n=1) | not distinguishable at this n |
| v1 own Elo | 1 | 0.9806 | 0.3905 | -0.0237 [-0.0237, -0.0237] (n=1) | not distinguishable at this n |

No interval is computed below n=30 games; every head-vs-Elo difference here is not distinguishable at this n.

## POOLED 2026-10-22 + 2026-10-23

n: 14 games · v0.1 sim 14 · v1 sim 14 · v0.3 sim 14 · finals 3 · box scores 2

Official consistency: publishedSide = Elo side on 14/14; public lane favoured = Elo side on 14/14 checked; receipts not OK: none.

### 1. Winner side vs the official Elo side

| head | n | side contradictions | mean |head − Elo| | mean (head − Elo) | max |head − Elo| | games contradicting |
| --- | --- | --- | --- | --- | --- | --- |
| v0.1 sim | 14 | 9/14 | 0.2410 | -0.0823 | 0.4980 | CHI@MIL, ATL@CHA, DAL@IND, MIN@ORL, TOR@WSH, DET@MIA, HOU@SA, NO@UTAH, MEM@GS |
| v1 sim | 14 | 1/14 | 0.0463 | -0.0463 | 0.0727 | MIN@ORL |
| v0.3 sim | 14 | 8/14 | 0.1565 | -0.0577 | 0.2577 | CLE@PHI, CHI@MIL, ATL@CHA, MIN@ORL, TOR@WSH, DET@MIA, NO@UTAH, MEM@GS |
| v1 own Elo | 14 | 2/14 | 0.0148 | -0.0026 | 0.0311 | NY@BOS, NO@UTAH |

### 2. Team scores (medians; v0.1's are WITHHELD publicly)

| head | n | mean total p50 | mean home margin p50 | median margin contradicts Elo |
| --- | --- | --- | --- | --- |
| v0.1 sim | 14 | 233.2 | -0.7 | 9/14 |
| v1 sim | 14 | 236.3 | +0.8 | 1/14 |
| v0.3 sim | 14 | 241.1 | +0.8 | 7/14 |

| pair | n | mean |margin p50 diff| | mean total p50 diff (first − second) |
| --- | --- | --- | --- |
| v01Sim vs v1Sim | 14 | 13.9 | -3.1 |
| v01Sim vs v03Sim | 14 | 9.1 | -7.9 |
| v1Sim vs v03Sim | 14 | 9.0 | -4.9 |

### 3. Player sums vs team sims

| family | n team-sides | mean Σ expected minutes | mean (Σ pts p50 − sim p50) | mean (Σ pts mean×playRate − sim mean) |
| --- | --- | --- | --- | --- |
| v0.1 (official players) | 28 | 240.0 | -7.5 | 0.0 |
| v1 | 28 | 261.8 | -0.2 | 0.0 |
| v0.3 | 28 | 254.1 | -2.3 | -0.0 |

Σ official v0.1 player pts p50 − v1 sim team p50: -9.3 (n=28 team-sides); − v0.3 sim team p50: -11.3 (n=28).

Projected vs actual minutes (box scores; players who played and had a projection; descriptive, n=2 games):

| family | n games | n team-sides | players played & projected | mean (projected − actual) min | starters: n · mean (proj − actual) | bench: n · mean (proj − actual) | played, not projected (min) | projected, did not play |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.1 | 2 | 4 | 39 | -1.3 | 20 · -2.8 | 19 · +0.2 | 6 (76.0) | 10 |
| v1 | 2 | 4 | 41 | +0.1 | 20 · -2.2 | 21 · +2.3 | 4 (61.0) | 10 |
| v0.3 | 2 | 4 | 41 | -0.4 | 20 · -2.4 | 21 · +1.5 | 4 (61.0) | 10 |

Starter = the box score's starter flag. v1 / v0.3 expected minutes are conditional on playing; v0.1's are not.

### 4. Finals: descriptive scores (n=3 games; lower log loss is better)

Official Elo side correct: 2/3.

| head | n | mean log loss | mean Brier | per-game LL diff vs Elo: mean [min, max] | verdict |
| --- | --- | --- | --- | --- | --- |
| Elo (official side) | 3 | 0.6514 | 0.2317 | reference | — |
| v0.1 sim | 3 | 0.5752 | 0.1925 | -0.0762 [-0.5856, +0.3441] (n=3) | not distinguishable at this n |
| v1 sim | 3 | 0.6303 | 0.2213 | -0.0211 [-0.1475, +0.0546] (n=3) | not distinguishable at this n |
| v0.3 sim | 3 | 0.6360 | 0.2221 | -0.0154 [-0.5327, +0.3650] (n=3) | not distinguishable at this n |
| v1 own Elo | 3 | 0.6243 | 0.2190 | -0.0271 [-0.0408, -0.0169] (n=3) | not distinguishable at this n |

No interval is computed below n=30 games; every head-vs-Elo difference here is not distinguishable at this n.

## What this means for the products

The official game call is the Elo-favoured side, and nothing in this report changes it, a v0.1 player median, a receipt, a ledger row or the public lane. Where a sim favours the other side, that is a research signal about the sim (v0.1's team score ignores the opponent, which is why team scores are withheld publicly), not a reason to flip a published side. v1 and v0.3 disagreements stay supporting / challenger evidence; any change to an official value goes through the founder and the promotion record, never through this report. The descriptive scores cover a handful of games and cannot rank the heads.
