# NBA minutes root-cause audit, 2026-11-02

Research only. Nothing here changes a forecast, lane, ledger, receipt, workflow or official number. No candidate is armed by this document.

Script: `app/scripts/nba/research/audit-nba-minutes-root-causes.mjs`. Every number below comes from its `report.md` output unless tagged INFERRED.

```
cd app && npx tsx scripts/nba/research/audit-nba-minutes-root-causes.mjs --out-dir <dir outside the repo> --bootstrap 2000
```

Tags: **MEASURED** is computed from committed data. **INFERRED** is my reading of measured numbers, or a design proposal.

## 1. Answer

**The short-pool hypothesis is true but small.** A short pool scaled to 240 does inflate survivors. It reaches 6 of 214 team-games (pools of 8 or 9 rows) and 5 graded games. The same rule deflates far more often: 160 of 214 sides had a factor below 0.95 (median 0.853). Pool size drives the factor in both directions (correlation −0.79). MEASURED.

**Minutes error is mostly not about scaling.** I split the distance between projected and actual team minutes, 132.3 minutes per team-game on 88 graded games, into the lines below. Scaling is 2.9% of it, though it owns most of the bias (section 5.3). MEASURED.

| Rank | Cause | Min per team-game | Share of error |
|---|---|---:|---:|
| 1 | Projected a player who was already not playing, visible pre-tip in this season's box scores | 18.2 | 13.8% |
| 2 | Rookies played with no projection | 16.3 | 12.3% |
| 3 | Role error left after the v0.3 rules, above the hindsight floor | 12.2 | 9.2% |
| 4 | Projected a player who was unlisted and played the last game, then did not play | 8.9 | 6.8% |
| 5 | Window: last 10 team games, thin samples, postseason | 6.1 | 4.6% |
| 6 | Projected a Day-To-Day player at full minutes, who then did not play | 5.5 | 4.2% |
| 7 | Projected with no current evidence (mostly the first games), did not play | 5.5 | 4.1% |
| 8 | 2025-26 absentees played with no projection | 4.6 | 3.4% |
| 9 | Uniform 240 normalisation | 3.9 | 2.9% |
| 10 | Out status wrong at freeze: Out by tip (2.0), or Out at freeze then played (1.3) | 3.3 | 2.5% |
| 11 | No 2026-27 data in the role estimate | 3.1 | 2.3% |
| 12 | Veteran with no corpus history | 0.6 | 0.5% |
| | Hindsight floor: a leave-one-out 2026-27 mean still misses this | 44.0 | 33.3% |
| | **Total** | **132.3** | |

Lines 1, 2, 8 and 11 share one architecture fact: v0.1 reads no 2026-27 box score. Together they are 42.2 minutes, 31.9% of the error and 48% of the part above the floor. The grouping is INFERRED; each line is MEASURED.

**Candidates.** v0.3 is the only candidate with forward receipts, and its minutes MAE is lower than v0.1's by 1.47 (−1.72, −1.21) on 74 games, on rows both families project. v0.4 adds nothing now. v0.5 is the only unarmed candidate ready to enter forward shadow, subject to founder approval of its constants. It has **not** established lower error than v0.3 out of sample: ΔMAE −0.15 (−0.40, +0.11) on 20 games.

**Recommended path.**
1. Publish a readiness layer that reads this season's box scores without changing any model number.
2. Arm v0.5 as forward shadow.
3. Preregister a new candidate with a lighter prior (section 6).
4. Take the rookie data decision.

## 2. Method and fidelity

**Population.** 14 lane dates, 2026-10-20 to 2026-11-02: 107 games, 214 team-games. 88 games are graded (176 team-games). The 4 games of 11-01 have no committed box score at this head, and the 15 games of 11-02 are not played.

**Fidelity, MEASURED.** Every receipt was rebuilt from its own roster and injury git blobs, located by sha256. The script refuses to continue on any mismatch.

| Check | Result |
|---|---|
| v0.1 sides: raw sum, factor, every player's minutes | 214 of 214 exact |
| v0.3 sides: every player's minutes | 186 of 186 exact |
| Lane rows against frozen receipts | 2,163 of 2,163 |

**Definitions.**
- err = forecast − actual. Positive means projected too high.
- Rows that played and have a projection: 1,749. Rows that played: 1,983.
- Intervals are 95% percentile bootstraps resampling games, 2,000 draws. Below 10 games the interval is labelled FEW_CLUSTERS and is not quoted as evidence.
- Resampling games does not account for one player repeating across games. v0.1's raw minutes never change, so its intervals are somewhat narrow.

**The error budget.** For each team-game, sum |projected − actual| over every player in the pool or the box score. A projected player who did not play counts his projection ("phantom"). A player who played with no projection counts his minutes ("uncovered"). Matched rows were split by Shapley value over three switches (window, current data, normalisation), and each switch combination was recomputed. The floor is a leave-one-out 2026-27 mean, with at least 3 other games; it uses hindsight, so it bounds role-only models and does not bound lineup-aware ones.

## 3. Corrections to the brief

| Brief said | Measured |
|---|---|
| Team sums run 193–240 | The **lane** sum runs 193.3–240 because rows under 10 minutes are not listed. The simulated pool sums to 236.04–240 |
| OKC 8 rows, 236 minutes | Correct. The 3.96 shortfall is SGA's cap, and it is not redistributed |
| 41 is p99 of 26,322 player-games | p99 = 41 holds on the 2025-26 regular season, but n is 26,565 there. 26,322 is not reproducible from the committed corpus. 2023-24 and 2024-25 give p99 = 42 |
| About 22 depth-chart starters have no projection | No NBA depth chart is committed, so this cannot be reproduced. See section 5.1 for the proxy: 8 starters and 3 sixth men |
| PR 1178 (v0.3) is unarmed | v0.3 merged and has frozen forward receipts since 10-22 |

Also: my prior note called the rescale the dominant cause. That holds for **bias**. For **MAE** the window is larger (section 5.3).

## 4. Pools, scaling and the named players

### 4.1 Pools by date (MEASURED)

| Date | Sides | Pool | Raw sum | Factor | Factor>1.05 | Factor<0.95 | Capped | Simulated sum | Lane sum | Out raw min | Departed raw min |
|---|---:|---|---|---|---:|---:|---:|---|---|---:|---:|
| 10-20 | 6 | 11–16 | 245–335 | 0.72–0.98 | 0 | 4 | 0 | 240 | 198.5–222.9 | 13.9 | 105.4 |
| 10-21 | 22 | 9–16 | 197–384 | 0.62–1.22 | 3 | 18 | 0 | 240 | 193.3–240 | 34.5 | 206.2 |
| 10-22 | 4 | 11–13 | 231–335 | 0.72–1.04 | 0 | 2 | 0 | 240 | 211.3–228.7 | 10.8 | 156.4 |
| 10-23 | 24 | 10–16 | 202–396 | 0.61–1.19 | 3 | 20 | 0 | 240 | 198.5–240 | 29.4 | 187.6 |
| 10-24 | 16 | 11–16 | 231–396 | 0.61–1.04 | 0 | 13 | 0 | 240 | 193.3–240 | 24.9 | 181.5 |
| 10-25 | 14 | 10–15 | 202–328 | 0.73–1.19 | 1 | 13 | 0 | 240 | 201.1–233.7 | 33.9 | 198.8 |
| 10-26 | 18 | 8–15 | 163–396 | 0.61–1.47 | 2 | 14 | 0 | 240 | 193.3–240 | 34.0 | 208.2 |
| 10-27 | 8 | 10–15 | 237–315 | 0.76–1.01 | 0 | 6 | 0 | 240 | 201.1–232.8 | 27.0 | 145.8 |
| 10-28 | 24 | 8–15 | 163–396 | 0.61–1.47 | 5 | 17 | 1 | 236.04–240 | 201.1–240 | 47.0 | 172.3 |
| 10-29 | 6 | 10–15 | 231–361 | 0.66–1.04 | 0 | 4 | 0 | 240 | 211.3–232.8 | 23.5 | 230.5 |
| 10-30 | 20 | 11–15 | 204–330 | 0.73–1.18 | 3 | 16 | 0 | 240 | 193.3–240 | 48.5 | 170.6 |
| 10-31 | 14 | 8–15 | 168–396 | 0.61–1.43 | 3 | 8 | 1 | 236.04–240 | 204–240 | 41.6 | 186.7 |
| 11-01 | 8 | 10–15 | 204–310 | 0.77–1.18 | 3 | 5 | 0 | 240 | 216.1–240 | 64.9 | 172.5 |
| 11-02 | 30 | 8–15 | 168–396 | 0.61–1.43 | 5 | 20 | 1 | 236.04–240 | 193.3–240 | 45.9 | 183.2 |

"Out raw min" is the raw minutes the injury feed removed, per side. "Departed raw min" is last-season team minutes for players no longer on the roster, per side. No side hit the 0.5 or 1.5 clamp. Every team-game is in appendix A.

### 4.2 Scaling test (MEASURED)

Rows that played. "Unscaled" is the v0.1 window mean before the factor.

| Factor | Rows | Games | Bias scaled | Bias unscaled | MAE scaled − unscaled |
|---|---:|---:|---|---|---|
| < 0.80 | 622 | 52 | −4.00 (−4.77, −3.26) | +2.79 (2.07, 3.52) | +0.65 (0.13, 1.18) |
| 0.80–0.95 | 749 | 55 | −1.71 (−2.48, −1.00) | +1.36 (0.62, 2.05) | −0.03 (−0.32, 0.26) |
| 0.95–1.05 | 194 | 18 | +0.50 (−0.59, 1.48) | +0.52 (−0.62, 1.53) | +0.05 (−0.09, 0.22) |
| 1.05–1.20 | 145 | 15 | +0.87 (−0.25, 1.98) | −1.40 (−2.53, −0.28) | +0.09 (−0.41, 0.62) |
| ≥ 1.20 | 39 | 5 | +6.17 FEW_CLUSTERS | −1.82 FEW_CLUSTERS | +3.02 FEW_CLUSTERS |

- **The factor overcorrects at both ends.** Before scaling the bias has the opposite sign, so the factor pushes in the right direction and goes too far.
- **Slope.** Regressing (actual − raw) on the implied shift (factor − 1)·raw, for rows with raw ≥ 20, gives 0.23 (0.14, 0.33). A correct factor would give 1, so on average it moves players about four times too far.
- **Real lift from injuries is small.** Per 10 raw team minutes Out, actual starters gain 0.29 minutes (0.14, 0.45); the bench shows nothing established, −0.12 (−0.38, 0.11). A 33-minute starter is scaled up about 1.4 minutes for the same 10 Out, so the factor is roughly five times the real lift for starters. INFERRED from those two numbers.
- **Short pools are injury-depleted.** Sides with factor > 1.05 average 4.6 players Out and 90.6 raw minutes removed. Sides under 0.95 average 1.7 and 27.9.
- **The cap is a symptom.** It fired on 3 team-games, always OKC, and it reduced the error on those rows.

Pools of 9 or fewer rows:

| Date | Team | Pool | Raw | Factor | Top rows, raw → projected (actual) |
|---|---|---:|---:|---:|---|
| 10-21 | DAL | 9 | 197.4 | 1.216 | Flagg 31.8→38.7 (33); Washington 29.3→35.7 (31); Marshall 27.8→33.8 (29) |
| 10-26 | DAL | 8 | 163.2 | 1.470 | Washington 29.3→43.1 (41); Christie 27.1→39.8 (26); Cisse 26→38.2 (0); Clayton 25.4→37.4 (17) |
| 10-28 | OKC | 8 | 168.1 | 1.428 | SGA 36.4→48 (28); Mitchell 28.7→40.9 (28); Hartenstein 23.2→33.1 (26); Peavy 23.1→33 (5) |
| 10-28 | LAC | 9 | 163.0 | 1.472 | Garland 31→45.6 (26); Lopez 28.8→42.4 (22); Dunn 25.6→37.7 (27) |
| 10-31 | OKC | 8 | 168.1 | 1.428 | SGA 36.4→48 (31); Mitchell 28.7→40.9 (26); Hartenstein 23.2→33.1 (25); Peavy 23.1→33 (14) |
| 11-02 | OKC | 8 | 168.1 | 1.428 | pending |

### 4.3 Named players (MEASURED)

The gap to the 2026-27 mean adds up exactly: stale role (2025-26 regular mean − 2026-27 mean) + window (raw − 2025-26 regular mean) + scale + cap. The 2026-27 mean uses games before 11-02.

| Player | Projected 11-02 | 2026-27 mean (n) | Gap | Stale role | Window | Scale | Cap | Named cause |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Gilgeous-Alexander | 48.0 | 32.7 (6) | +15.3 | +0.6 | +3.1 | +15.6 | −4.0 | **Scaling** on an injury-depleted pool of 8: 6 Out, 102.6 raw minutes removed. Window is 10 playoff games |
| Hachimura | 45.8 | 30.0 (4) | +15.8 | −1.7 | +10.6 | +6.9 | 0 | **Window**: 10 Lakers playoff games at 38.9 vs 28.3 in the regular season, carried across a trade. Then scaling |
| Young | 16.3 | 36.5 (6) | −20.2 | −11.0 | −4.9 | −4.3 | 0 | **Stale role**, then a **thin window**: 5 Washington games at 20.6 |
| D. Mitchell | 40.3 | 32.7 (6) | +7.6 | +0.8 | +3.8 | +3.1 | 0 | **Window** (playoffs at 37.2) and **scaling** about equally |
| Embiid | 23.9 | 35.0 (5) | −11.1 | −3.5 | +1.9 | −9.5 | 0 | **Scaling**: an over-full pool of 13 (raw 335.5), factor 0.715 |
| Cisse | 26.3 | 3.5 (4) | +22.8 | +10.8 | +11.7 | +0.3 | 0 | **Window** (4 end-of-season games at 26.0 vs 14.3) and **stale role**. 2 coach's DNPs in 6 graded games |
| Richards | 18.2 | 2.7 (3) | +15.6 | +12.3 | +7.4 | −4.1 | 0 | **Stale role**, traded: 20 games on the old team at 22.35. 3 coach's DNPs in 6 graded games |
| Risacher | 12.1 | 29.7 (6) | −17.6 | −7.3 | −10.4 | +0.1 | 0 | **Window** (6 end-of-stretch games at 12.0 including 3 playoff games at 7.3 vs 22.4), carried across a trade, then **stale role** |

Causes checked and not responsible for these eight:
- **Starter rate.** It sits on every row and is never used for minutes. Young and Embiid were 1.0 and still wrong; Risacher's 0.167 matches his 1 start in 6.
- **Back-to-back.** v0.1 has no rule at all (section 5.3).
- **Roster mapping.** No mapping error.
- **Injury adjustment.** The only adjustment is the factor, which is why it appears under Scale for SGA. Hachimura's Day-To-Day on 10-30 changed nothing.

Three of the eight (Hachimura, Richards, Risacher) carry another team's role. Rows with other-team history have MAE 8.95 (423 rows) against 6.34 for same-team (1,326 rows), descriptively.

## 5. Coverage, error and attribution

### 5.1 Coverage by cause (MEASURED)

Who played on graded games with no v0.1 projection:

| Population | Player-games | No projection | Unique players | Minutes uncovered |
|---|---:|---:|---:|---:|
| All who played | 1,983 | 234 (11.8%) | 68 | 4,015 of 42,483 |
| Starters | 880 | 61 (6.9%) | 18 | 1,891 of 26,102 |
| Sixth men (top bench minutes) | 176 | 14 (8.0%) | 8 | 363 of 4,546 |

| Cause, rule that did it | All: rows / unique / min | Starters: rows / unique | Sixth men: rows / unique |
|---|---|---|---|
| Rookie: no corpus row; `minutes-model.mjs` reads corpus only | 185 / 51 / 2,870 | 36 / 9 | 14 / 8 |
| 2025-26 absentee: newest-season window; `roster-gated-pool.mjs` looks up the same season | 33 / 7 / 803 | 20 / 5 | 0 |
| Listed Out at freeze, then played | 10 / 10 / 234 | 5 / 5 | 0 |
| Veteran with no corpus history (Hezonja) | 6 / 1 / 108 | 0 | 0 |
| Traded, id mapping, roster capture lag | 0 | 0 | 0 |

- **Traded players are covered**, and the defect there is role quality (section 4.3). No mapping or roster-capture error appeared in 234 rows.
- **Absentees:** Lyles, Haliburton, VanVleet, Irving, Niang, Lillard, Beekman.
- **Rookie starters:** Wilson, Boozer, Peterson, Lendeborg, Acuff, Ike, Hopkins, Brazile, Dybantsa.

**Slate of 11-02.** With no depth chart committed, I used the starters and top bench player of each team's last 2026-27 game as a proxy. Of 150 starters, 139 are projected, 3 are Out at freeze and 8 have no projection.
- 6 rookies: Dybantsa, Wilson, Acuff, Boozer, Peterson, Lendeborg.
- 2 absentees: Irving, Lillard.
- 3 sixth men, all rookies: Thomas, Mara, Wagler.

Across all rostered, not-Out players, 69 have no projection: 60 rookies, 6 absentees, 3 veterans.

**The cohort that needs a data decision is rookies.** Reading 2026-27 box scores closes most of the gap on its own: rows that played without a projection fall from 198 under v0.1 to 32 under v0.3 on the same 74 games, and starters projected rise from 688 to 735 of 740. The remaining need is a rookie's first game. If v0.1 stays official, the gap lasts all season. Absentees need no data decision once v0.3-style rules read the current season.

### 5.2 Expected against actual minutes (MEASURED)

1,749 rows, 88 games. MAE 6.97 (6.65, 7.29), bias −1.89 (−2.44, −1.36). On lane rows (1,483): MAE 6.85 (6.52, 7.16), bias −1.22 (−1.86, −0.58). Without the factor, the same rows have MAE 6.68 and bias +1.47.

| Expected band | Rows | Games | MAE | Bias |
|---|---:|---:|---|---|
| < 15 | 480 | 87 | 7.73 (7.18, 8.30) | −5.02 (−5.84, −4.13) |
| 15–24.9 | 706 | 88 | 6.96 (6.60, 7.30) | −1.70 (−2.37, −1.02) |
| 25–31.9 | 419 | 86 | 6.18 (5.66, 6.69) | −1.06 (−2.09, −0.07) |
| 32–37.9 | 110 | 59 | 6.16 (4.85, 7.56) | +4.07 (2.33, 5.90) |
| 38–40.9 | 25 | 13 | 6.50 (3.93, 9.56) | +6.43 (3.81, 9.46) |
| ≥ 41 | 9 | 8 | 15.97 FEW_CLUSTERS | +15.97 FEW_CLUSTERS |

| Pool size | Rows | Games | MAE | Bias |
|---|---:|---:|---|---|
| ≤ 10 | 122 | 13 | 10.01 (8.70, 11.48) | +4.00 (2.82, 5.18) |
| 11 | 192 | 20 | 6.55 (5.66, 7.45) | +0.04 (−0.93, 0.97) |
| 12 | 361 | 34 | 6.15 (5.61, 6.73) | −1.05 (−2.10, −0.11) |
| 13 | 304 | 26 | 6.85 (6.16, 7.63) | −1.76 (−2.91, −0.92) |
| 14 | 318 | 28 | 6.55 (5.86, 7.33) | −3.20 (−4.15, −2.34) |
| 15+ | 452 | 39 | 7.36 (6.82, 7.95) | −4.14 (−5.00, −3.36) |

Bias runs from +4.0 in short pools to −4.1 in long ones. That is the same rule read two ways.

**Dependent stats (MEASURED).** Frozen medians against what the frozen rate gives at true minutes:

| Stat | MAE frozen | MAE with true minutes | Share removed | Bias frozen | Bias with true minutes | Slope per minute of error |
|---|---|---|---|---|---|---|
| Pts | 5.07 (4.87, 5.29) | 4.02 (3.85, 4.19) | 20.6% (17.4, 23.5) | −1.01 (−1.35, −0.69) | +0.40 (0.17, 0.65) | 0.465 (0.437, 0.492) |
| Reb | 2.08 (1.99, 2.17) | 1.63 (1.57, 1.70) | 21.4% (18.2, 24.5) | −0.64 (−0.78, −0.50) | −0.05 (−0.16, 0.05) | 0.176 (0.162, 0.191) |
| Ast | 1.45 (1.39, 1.51) | 1.29 (1.23, 1.34) | 11.3% (9.0, 13.6) | −0.32 (−0.43, −0.21) | −0.03 (−0.13, 0.07) | 0.104 (0.095, 0.112) |

| Minutes error | Rows | Pts MAE | Reb MAE | Ast MAE |
|---|---:|---|---|---|
| < 3 | 477 | 3.68 (3.37, 4.01) | 1.56 (1.45, 1.66) | 1.21 (1.10, 1.31) |
| 3–6 | 419 | 4.03 (3.74, 4.36) | 1.83 (1.68, 2.00) | 1.21 (1.10, 1.32) |
| 6–10 | 427 | 5.10 (4.68, 5.52) | 2.03 (1.88, 2.20) | 1.54 (1.39, 1.70) |
| 10–15 | 272 | 6.86 (6.29, 7.42) | 2.45 (2.24, 2.67) | 1.67 (1.48, 1.89) |
| ≥ 15 | 154 | 8.95 (8.15, 9.80) | 3.84 (3.39, 4.30) | 2.24 (1.98, 2.51) |

True minutes remove most of the stat **bias** but only about a fifth of the stat **MAE**. Perfect minutes would not fix these markets; about 80% of point error sits in rates and game variance.

### 5.3 Attribution of matched-row error (MEASURED)

| Window | Current data | Normalisation | MAE | Bias |
|---|---|---|---:|---:|
| v0.1 last 10 | no | uniform 240 | 6.97 | −1.89 |
| v0.1 last 10 | no | water-fill | 6.97 | −0.25 |
| v0.1 last 10 | yes | uniform 240 | 6.70 | −3.09 |
| v0.1 last 10 | yes | water-fill | 6.37 | −1.47 |
| whole prior regular season | no | uniform 240 | 6.46 | −1.72 |
| whole prior regular season | no | water-fill | 6.02 | −0.03 |
| whole prior regular season | yes | uniform 240 | 6.44 | −2.96 |
| whole prior regular season (v0.3 rules) | yes | water-fill | 5.66 | −1.30 |

The first and last rows reproduce frozen v0.1 and the v0.3 replay on all 1,749 rows.

| Switch | Shapley on MAE | Min per team-game |
|---|---|---:|
| Window | −0.61 (−0.83, −0.41) | 6.1 |
| Normalisation | −0.39 (−0.55, −0.23) | 3.9 |
| Current season | −0.31 (−0.45, −0.18) | 3.1 |

- **Bias is a normalisation story.** Changing normalisation alone moves bias from −1.89 to −0.25, 87% of it. That is why medians sat below sportsbook lines in October. The earlier diagnosis stands for bias.
- **Current data under uniform scaling makes bias more negative** (−1.89 to −3.09). I did not isolate why.
- **Big misses.** 597 rows missed by 8 or more, and they are 64.1% of matched error. By the first fix that would bring each within 8 (hindsight): scaling 30.2%, window 23.8%, stale role 20.4%, game variance 16.0%, too few games to tell 9.6%.
- **Role flips.** Last season's bench player who now starts: bias −8.72, MAE 9.96 on 129 rows. Last season's starter now on the bench: bias +3.69 on 287 rows. Together 23.8% of rows and 26.8% of matched error. Nothing in v0.1 uses starter rate.
- **Hindsight floor.** On rows with enough games: v0.1 6.89, v0.3 rules 5.60, leave-one-out mean 4.38.

**Phantom minutes.** 40.2 per team-game, 30.4% of the error.

| What was knowable pre-tip | Rows | Min per team-game | Share |
|---|---:|---:|---:|
| Unlisted, already not playing (the eligibility state sees it) | 259 | 18.2 | 13.8% |
| Unlisted, played the last game | 115 | 8.9 | 6.8% |
| Listed, not Out (Day-To-Day and similar) | 53 | 5.5 | 4.2% |
| Unlisted, no current evidence | 82 | 5.5 | 4.1% |
| Out in the last feed before tip, after freeze | 17 | 2.0 | 1.5% |

The same rows by box-score reason: coach's decision 16.3%, not in the box 12.3%, injury or other 1.7%. The feed history has 69 committed snapshots, so "last feed before tip" is coarse and the 1.5% is a lower bound. Of 10 rows listed Out at freeze that played, 5 had left the Out list before tip.

**Back-to-back.** Not modelled. For players with raw ≥ 24, the chance of not playing is 19.1% on a back-to-back and 11.3% otherwise, a difference of +7.9 points (2.4, 13.9). For those who do play, bias differs by −2.7 (−4.4, −1.1). That second number is confounded by calendar and by teammates sitting, so I would not use it as an effect size. Its phantom minutes are already inside the phantom lines.

**Overtime.** 8 of 176 team-games. Bias is −6.07 in overtime and −1.71 in regulation. The effect on overall bias is small.

## 6. Candidates on the same games

**Status of each.**

| Family | Source | Forward evidence |
|---|---|---|
| v0.3 | Frozen forward receipts, 10-22 on | Forward, out-of-sample |
| v0.4 | PR 1180 at `3ff030b0b2`, frozen 10-23 13:44Z | Replay only. Games after that instant are out-of-sample for the code; no receipt exists |
| v0.5 | PR 1281 at `d5119832bf`, frozen 10-29 16:05Z | Replay only. Same condition |

Replays use each freeze's exact roster, injury and box-score inputs.

**Common rows, all 74 games with frozen v0.3 (MEASURED).** Rows with a projection from all families; 1,463 rows. MAE and bias on those rows.

| Family | MAE | Bias | Err ≥ 15 rows | Rows ≥ 41 | Starters projected | Sixth men projected | Played, no projection | Phantom min per team-game, weighted by play probability |
|---|---:|---:|---:|---:|---|---|---:|---:|
| v0.1 | 7.16 | −1.91 | 139 | 8 | 688/740 | 135/148 | 198 | 40.7 |
| v0.3 | 5.69 | −1.54 | 50 | 1 | 735/740 | 148/148 | 32 | 30.6 |
| v0.4 | 5.70 | −1.63 | 50 | 1 | 735/740 | 148/148 | 31 | 30.6 |
| v0.5 | 5.45 | +0.16 | 52 | 1 | 735/740 | 148/148 | 32 | 21.1 |

**Paired differences. Negative means the first family has lower error. Lower is better.**

| Pair | Window | ΔMAE | Δ rows err ≥ 15, per 100 | Δ starter coverage | Verdict |
|---|---|---|---|---|---|
| v0.3 − v0.1 | 74 games, forward | −1.47 (−1.72, −1.21) | −6.08 (−7.46, −4.74) | +6.4 pts (4.6, 8.1) | Established on minutes |
| v0.4 − v0.3 | 72 games after PR 1180 head | +0.013 (0.001, 0.026) | 0 | 0 | No gain; v0.4 is marginally higher, and only by 0.013 |
| v0.5 − v0.3 | 20 games after PR 1281 head | −0.15 (−0.40, +0.11) | +0.25 (−0.51, 1.02) | 0 | **Not established** |
| v0.5 − v0.1 | 20 games after PR 1281 head | −2.10 (−2.57, −1.63) | −6.98 (−10.37, −4.04) | +6.0 pts (2.5, 9.5) | Established, and essentially v0.3's gain |

v0.5 − v0.3 on all 74 games is −0.24 (−0.38, −0.10), but 54 of those games were seen when v0.5 was designed, so it is not forward evidence.

**Stats, v0.3 − v0.1, frozen medians, 74 games, same rows.** Pts −0.47 (−0.62, −0.32), reb −0.21 (−0.28, −0.15), ast −0.16 (−0.20, −0.12). These compare medians with box scores only; no market claim follows.

**Participation (lower Brier is better).** v0.5 against v0.3 on the 20 forward games: 0.116 vs 0.135, difference −0.019 (−0.043, +0.005), not established. Phantom minutes weighted by play probability do fall, by −9.2 (−11.9, −6.4) per team-game, but that follows directly from lowering play probability and is not independent evidence.

**v0.5's cells on the 20 forward games.** Share who played against mean q: MISSED_2PLUS_COACH 0.615 vs 0.266 (39 rows), MISSED_2PLUS_OTHER 0.389 vs 0.108 (18), NO_APPEARANCE 0.080 vs 0.017 (25), MISSED_1_COACH 0.394 vs 0.379 (33), MISSED_1_OTHER 0.667 vs 0.540 (12), LAST_PLAYED 0.918 vs 0.925 (378). Every gated cell runs under the observed rate. Small n, but all in one direction: the 2025-26 multipliers look harsh for this season.

**Why v0.4 has no value left.** v0.3 picks up a returner after his first game, so v0.4 only fills that one game. Over 74 games that is 1 row. The prior note that v0.4 fills a gap was right on 10-22 and no longer matters.

**A lighter prior (descriptive).** v0.3 and v0.5 both weight the prior at 10 games, which is why Young sits at 26 against a 36.5 season so far and Cisse at 9 against 3.5. On completed seasons only, first 20 team games, players with at least one current game:

| Prior worth | 2024-25 MAE (n 5,216) | Δ vs 10 | 2025-26 MAE (n 5,405) | Δ vs 10 |
|---|---:|---|---:|---|
| 0 (current only) | 4.746 | −0.34 (−0.43, −0.25) | 4.792 | −0.45 (−0.55, −0.35) |
| 2 games | 4.730 | −0.36 (−0.40, −0.31) | 4.797 | −0.44 (−0.50, −0.38) |
| 3 games | 4.787 | −0.30 (−0.34, −0.26) | 4.872 | −0.37 (−0.41, −0.32) |
| 5 games | 4.894 | −0.19 (−0.21, −0.17) | 5.004 | −0.24 (−0.26, −0.21) |
| 10 games | 5.087 | | 5.240 | |
| 20 games | 5.297 | +0.21 (0.19, 0.23) | 5.501 | +0.26 (0.24, 0.28) |

MEASURED, and strictly before 2026-27. A prior worth 3 games reuses the frozen `MIN_GAMES_FOR_RATES`, so it adds no new number.

Replayed on this season with the v0.3 engine, ΔMAE against v0.3 is −0.35 (−0.42, −0.26) on 74 games. With the v0.5 gate as well it is −0.61 (−0.78, −0.43) on 74 games and −0.54 (−0.88, −0.21) on the 20 forward games. **This is a replay with no receipts, and the idea came after seeing these games, so it is not forward evidence and I make no improvement claim from it.** It is a reason to preregister a candidate.

## 7. The 41-minute REVIEW trigger (MEASURED)

| Measure | Result |
|---|---|
| v0.1 rows at or above 41 | 12 rows across 14 slates (107 games), all on the lane: 0.86 per slate, 0 to 3 |
| On 11-02 | 2: SGA 48, Hachimura 45.8 |
| Trips on graded games | 9. Mean projected 45.7, mean actual 29.8. 1 reached 41 (Washington). 8 missed by 10 or more |
| Real rows at 41+ on graded games | 10, of which 5 in overtime. The trigger flagged 1. 1 had no projection. The other 8 averaged 30.8 projected |
| All rows with error ≥ 10 | 426. The trigger touches 8 (1.9%). 279 of them are under-projections, which a high trigger cannot see |
| v0.3 | 1 row at 41+ on graded games, 0 real high-minute games flagged |

**Verdict.** 41 works as an alarm for impossible highs (8 of 9 trips were wrong by 10+). It does not detect real high-minute games: it found 1 of 10. It misses most of the error by construction, so it should be one rule among several. A two-sided gap rule does the real work, as section 8 shows. Trips also disappear as candidates improve, which is the desired behaviour for an alarm.

## 8. PASS, REVIEW, BLOCKED contract

**INFERRED, proposal.** Rules were written after seeing these games, so the table in 8.3 is descriptive. Nothing here changes a frozen number.

### 8.1 Unit and inheritance

The unit is player × market, for one event, at the freeze instant. Markets: minutes, pts, reb, ast, 3pm, pra, pts+reb, pts+ast.

- A row's minutes tier is computed first. **Every dependent market inherits at least that tier.** No market can rank above its minutes.
- A market may be worse than its minutes tier. A row using the team-pool fallback rate, not its own rate, is at most REVIEW for that market.
- REVIEW means reassess: show the reviewer the frozen median beside rate × 2026-27 mean minutes, and the slope (pts 0.47, reb 0.18, ast 0.10 per minute). The reassessment never replaces the frozen number.
- A player with no projection is **NO_PROJECTION** with a reason code, never 0 and never a PASS.
- Results keeps grading every row at every tier, and reports results by tier, so the record cannot be improved by filtering.

### 8.2 Rules (the highest tier wins; a row carries every reason that fires)

`n` and `cur` are the player's 2026-27 regular-season appearances and mean minutes in box scores captured by the freeze. `mu` is the official projected minutes.

| Tier | Code | Rule | Data needed |
|---|---|---|---|
| BLOCKED | B_CAP | mu ≥ 48 | Lane row |
| BLOCKED | B_GAP | n ≥ 3 and abs(mu − cur) ≥ 14.3 | Lane row, box scores at the cutoff |
| BLOCKED | B_ELIG | State NO_APPEARANCE or MISSED_2PLUS | Box scores, team game log |
| REVIEW | R_41 | mu ≥ 41 | Lane row |
| REVIEW | R_GAP | n ≥ 3 and abs(mu − cur) ≥ 8.4 | Lane row, box scores |
| REVIEW | R_THIN | n < 3 and the team has played ≥ 3 | Box scores |
| REVIEW | R_NO_CURRENT | Team has played < 3 | Box scores |
| REVIEW | R_MISSED_1 | Missed the team's last game | Box scores |
| REVIEW | R_INJ | Any injury status short of Out | Injury feed at freeze |
| REVIEW | R_TEAM_COVERAGE | Unprojected, not-Out players took ≥ 15% of the team's minutes over its last 3 games | Roster, box scores, lane |
| PASS | | None of the above | |
| NO_PROJECTION | reason code | Rostered, not Out, no official row | Roster, corpus history |

**Sources for constants.**
- 14.3 and 8.4 are p95 and p80 of |game minutes − own prior season mean| in the 2025-26 regular season (n 23,719). No 2026-27 outcome went into them.
- 41 is p99 of 2025-26 regular-season minutes.
- 15% reuses preregistration §9's availability rule.
- 3 is the frozen `MIN_GAMES_FOR_RATES`.

The script recomputes all but the §9 value.

### 8.3 What the tiers separate

Graded games from 10-24, when teams have at least 3 games. Lane rows, 1,210.

| Tier | Rows | Did not play | Minutes MAE | Pts MAE | Reb MAE | Ast MAE | Share of misses ≥ 10 |
|---|---:|---:|---|---|---|---|---:|
| PASS | 403 (33.3%) | 2.5% | 5.58 (5.08, 6.11) | 5.13 (4.65, 5.67) | 2.10 (1.96, 2.25) | 1.53 (1.39, 1.67) | 21.2% |
| REVIEW | 659 (54.5%) | 16.8% | 7.54 (7.01, 8.12) | 5.48 (5.08, 5.91) | 2.11 (1.96, 2.27) | 1.57 (1.47, 1.67) | 63.9% |
| BLOCKED | 148 (12.2%) | 61.5% | 13.05 (10.87, 15.13) | 6.92 (5.57, 8.11) | 2.68 (2.22, 3.10) | 1.83 (1.46, 2.18) | 14.9% |

- **Minutes separate cleanly** and the did-not-play rate drops from 61.5% to 2.5%.
- **Stats separate less.** Point estimates rise by tier, but the intervals overlap on all three stats, even PASS against BLOCKED. This matches section 5.2. A tier is a minutes statement, not evidence that a market's median is wrong.
- **PASS still has bias.** It runs −1.96, because v0.1's deflation is not a rule the contract removes.

**On the 11-02 slate.** Lane rows: 141 PASS, 112 REVIEW, 43 BLOCKED.

| Player | Tier | Reasons |
|---|---|---|
| Gilgeous-Alexander | BLOCKED | Cap, gap, 41, team coverage |
| Hachimura | BLOCKED | Gap, 41, team coverage |
| Young | BLOCKED | Gap |
| Cisse | BLOCKED | Gap, missed last, team coverage |
| Richards | BLOCKED | Gap |
| Risacher | BLOCKED | Gap, team coverage |
| Embiid | REVIEW | Gap (11.1), missed last, Day-To-Day |
| D. Mitchell | **PASS** | Gap 7.6 is under 8.4 and 40.3 is under 41 |

Mitchell passes under these constants. His last-3 mean is 29.3, so the 10-game-style gap understates him. Adjusting a constant to catch him would be tuning to a named case; that choice is the founder's.

Teams with at least 15% unprojected recent minutes on 11-02: OKC 28.6%, SAC 28.6%, GS 28.2%, CHI 21.1%, DAL 20.6%, LAC 15.8%, MIL 15.6%, DEN 15.6%.

### 8.4 Where the accessor belongs

**INFERRED, from the current readers.**

Today there are three read paths. The first is `loadCurrentLane` and `loadLaneForDate` in `components/nba/experimental-lane`, used by `/nba`, the projections pages and `lib/social/nba-social-data.ts`. The second is `nbaOfficialSnapshot` in `lib/consistency/official-snapshot.mjs`, used by Theater through `simulation-theater/official-representative.mjs`. The third is direct file reads in `lib/results/nba-official-record-reader.mjs`, `lib/results/nba-forecast-vs-actual.mjs`, `lib/simulate/day-view.ts`, `lib/products/daily-candidates/load.mjs` and `lib/sports/nba/lane-top-boards.mjs`.

Proposal:

1. **One pure, dependency-free module:** `app/src/lib/sports/nba/player-readiness.mjs`, exporting `nbaPlayerMarketReadiness(readinessDoc, { eventId, providerAthleteId, market })` and returning `{ tier, reasons, reassess }`. Dependency-free because board producers run under plain node. It is a sibling of `experimental-public-lane.mjs`, which already owns lane rules.
2. **One sidecar per slate:** `app/public/data/nba/player-readiness/<date>.json`, written at lane publish by `publish-nba-experimental-lane.mjs`. The lane itself is untouched, so frozen files and receipts stay byte-identical. It must be a declared BUILD_INPUT, because internal research paths are not. Its committed form carries tiers and reason codes, not new numbers.
3. **Same information cutoff as the lane.** It is write-once per freeze. A later pre-tip refresh may only tighten a tier, never loosen one.
4. **Fail closed.** A missing sidecar means no surface may show the row as PASS.
5. **Consumers:** the lane loader and `nbaOfficialSnapshot` both attach the accessor's result, so hub, projections, game surfaces, Top Boards, Theater and social get it once. Results reads it through the same accessor for tier reporting. The direct readers in the third path move onto it. A source guard test should fail any new direct read of the sidecar.

Display policy per surface (for example, BLOCKED kept out of Top Boards, social and picks, and labelled on the lane) is a founder decision.

## 9. Fix path

1. **Readiness layer now.** It reads 2026-27 box scores without changing a model number, and it addresses the largest line in section 1. Its only inputs are committed data. Founder approval needed first.
2. **Keep v0.1 frozen and keep v0.3 forward.** Do not edit v0.1. v0.3's evidence is the most valuable thing here; any change to it is a new candidate.
3. **Arm v0.5 as forward shadow**, if the founder approves its five multipliers. Readiness to shadow is the only claim: it attacks line 1 and no other candidate does, but it has not established lower error than v0.3.
4. **Preregister a new candidate:** v0.3 rules with the prior worth 3 games, with the eligibility gate, multipliers refit or reviewed. Bind the 2-season backtest as its source. Same cutoff rule. Do this before any further look at 2026-27 outcomes for it.
5. **Rookies:** take the data decision (draft slot, or a mapped preseason prior per PR 1180 §12). Its value under v0.3 rules is a rookie's first game.
6. **Close PR 1180's v0.4** unless a long-absence return later in the season shows a need. INFERRED.
7. **Separate work:** role flips (26.8% of matched error) and starter awareness; a capped injury-redistribution rule, sized from the 0.29 lift rather than the factor; back-to-back rest in the play probability. Each would be its own candidate. Stat rates hold about 80% of stat error and deserve their own audit.

## 10. Founder decisions

| # | Decision | Constant or policy |
|---|---|---|
| 1 | Approve the readiness contract | 14.3, 8.4, 41, 15%, 3 |
| 2 | Display policy per tier and surface | Includes Mitchell-type edge cases: keep p80, or set a tighter gap |
| 3 | Arm v0.5 as forward shadow | Multipliers 0.025, 0.574, 0.578, 0.429, 0.157. On the 20 forward games every gated cell ran under the observed rate |
| 4 | Preregister the lighter-prior candidate | The approved v0.3 value is 10; moving to 3 means a new candidate under an amendment |
| 5 | Rookie data | Draft-slot capture (D-series) or preseason role prior (§3 amendment) |
| 6 | Retire v0.4 | Keeps `MAX_PRIOR_LAG` unapproved and unused |

Promotion of any family stays under the preregistration and the promotion record. Rows at E ≥ 20 were still under the §6 minimum at PR 1281's count, and this audit does not re-rule that.

## 11. Limits

- 88 graded games; v0.5's forward window is 20.
- All of it is October and early November, when role uncertainty is highest and most injured stars are returning. Shares may shift by midseason. INFERRED.
- The floor uses hindsight and is not a true irreducible error.
- Shapley shares depend on the three switches chosen. Phantom and uncovered lines are not independent of matched error: removing a phantom moves minutes to someone else.
- v0.4 and v0.5 are replays. Only v0.3 has receipts.
- Matched-row comparisons exclude players a family does not project, so MAE alone flatters low coverage. Use it with the coverage and phantom columns.

## Appendix A. Every team-game

"Out raw" and "departed raw" are raw minutes. "No hist" is rostered, not Out, no projection.

| date | team | pool | raw | factor | scaled | lane | capped | out | out raw | no hist | departed raw | other-team |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10-20 | DET | 16 | 308.82 | 0.7772 | 240 | 204.9 | 0 | 0 | 0 | 2 | 115.4 | 4 |
| 10-20 | BOS | 14 | 287.53 | 0.8347 | 240 | 219.6 | 0 | 1 | 28.7 | 2 | 144.7 | 4 |
| 10-20 | NY | 15 | 279.86 | 0.8576 | 240 | 198.5 | 0 | 0 | 0 | 2 | 46.2 | 2 |
| 10-20 | PHI | 13 | 335.48 | 0.7154 | 240 | 221.7 | 0 | 3 | 17.5 | 1 | 206.8 | 8 |
| 10-20 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 10-20 | OKC | 11 | 244.91 | 0.98 | 240 | 222.9 | 0 | 3 | 2.7 | 3 | 83.3 | 0 |
| 10-21 | ORL | 13 | 264.58 | 0.9071 | 240 | 214.1 | 0 | 4 | 49 | 0 | 40.7 | 1 |
| 10-21 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-21 | WSH | 13 | 327.04 | 0.7339 | 240 | 236.7 | 0 | 3 | 40.4 | 2 | 277.7 | 3 |
| 10-21 | MIL | 14 | 368.29 | 0.6517 | 240 | 240 | 0 | 0 | 0 | 3 | 232.5 | 6 |
| 10-21 | MIA | 15 | 294.13 | 0.816 | 240 | 220.3 | 0 | 0 | 0 | 2 | 129.5 | 5 |
| 10-21 | MIN | 13 | 281.25 | 0.8533 | 240 | 214.6 | 0 | 1 | 30.2 | 2 | 122.1 | 3 |
| 10-21 | BKN | 15 | 315.25 | 0.7613 | 240 | 224.8 | 0 | 1 | 0 | 2 | 237.6 | 3 |
| 10-21 | CHA | 11 | 222.53 | 1.0785 | 240 | 232.5 | 0 | 4 | 70 | 2 | 151 | 4 |
| 10-21 | TOR | 13 | 294.84 | 0.814 | 240 | 218.7 | 0 | 1 | 0 | 2 | 99.4 | 3 |
| 10-21 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 10-21 | MEM | 15 | 324.81 | 0.7389 | 240 | 223.5 | 0 | 0 | 0 | 3 | 509.2 | 4 |
| 10-21 | UTAH | 13 | 296.97 | 0.8082 | 240 | 228.2 | 0 | 4 | 75.2 | 1 | 357.2 | 6 |
| 10-21 | NO | 16 | 384.31 | 0.6245 | 240 | 228.8 | 0 | 0 | 0 | 2 | 139.8 | 4 |
| 10-21 | IND | 12 | 291.93 | 0.8221 | 240 | 240 | 0 | 3 | 62.9 | 2 | 247.4 | 2 |
| 10-21 | HOU | 14 | 343.21 | 0.6993 | 240 | 219 | 0 | 0 | 0 | 3 | 79.5 | 4 |
| 10-21 | DAL | 9 | 197.4 | 1.2158 | 240 | 240 | 0 | 4 | 59.1 | 4 | 276.5 | 4 |
| 10-21 | LAL | 14 | 284.81 | 0.8427 | 240 | 222 | 0 | 2 | 5.5 | 2 | 238.9 | 8 |
| 10-21 | GS | 11 | 245.02 | 0.9795 | 240 | 240 | 0 | 4 | 112.4 | 3 | 142.4 | 1 |
| 10-21 | POR | 13 | 254.2 | 0.9441 | 240 | 217.8 | 0 | 3 | 32.3 | 1 | 97.9 | 4 |
| 10-21 | PHX | 15 | 322.77 | 0.7436 | 240 | 193.3 | 0 | 1 | 23.3 | 1 | 108.5 | 5 |
| 10-21 | LAC | 10 | 201.91 | 1.1886 | 240 | 230.3 | 0 | 5 | 113.2 | 3 | 228.9 | 5 |
| 10-21 | SAC | 10 | 269.52 | 0.8905 | 240 | 235.7 | 0 | 3 | 52.7 | 3 | 242.2 | 2 |
| 10-22 | PHI | 13 | 335.48 | 0.7154 | 240 | 221.7 | 0 | 3 | 17.5 | 1 | 206.8 | 8 |
| 10-22 | CLE | 12 | 231.36 | 1.0374 | 240 | 211.3 | 0 | 2 | 2.8 | 3 | 187.8 | 1 |
| 10-22 | OKC | 11 | 244.91 | 0.98 | 240 | 222.9 | 0 | 3 | 2.7 | 3 | 83.3 | 0 |
| 10-22 | DEN | 13 | 309.94 | 0.7744 | 240 | 228.7 | 0 | 1 | 20 | 3 | 147.5 | 4 |
| 10-23 | MIL | 15 | 396.42 | 0.6054 | 240 | 240 | 0 | 0 | 0 | 3 | 204.3 | 6 |
| 10-23 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 10-23 | BOS | 14 | 287.53 | 0.8347 | 240 | 219.6 | 0 | 1 | 28.7 | 2 | 144.7 | 4 |
| 10-23 | NY | 15 | 279.86 | 0.8576 | 240 | 198.5 | 0 | 0 | 0 | 2 | 46.2 | 2 |
| 10-23 | CHA | 11 | 222.53 | 1.0785 | 240 | 232.5 | 0 | 4 | 70 | 2 | 151 | 4 |
| 10-23 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-23 | IND | 13 | 321.57 | 0.7463 | 240 | 230.8 | 0 | 2 | 33.3 | 2 | 247.4 | 2 |
| 10-23 | DAL | 10 | 222.83 | 1.077 | 240 | 240 | 0 | 4 | 59.1 | 4 | 276.5 | 5 |
| 10-23 | ORL | 13 | 264.58 | 0.9071 | 240 | 214.1 | 0 | 4 | 49 | 0 | 40.7 | 1 |
| 10-23 | MIN | 13 | 281.25 | 0.8533 | 240 | 214.6 | 0 | 1 | 30.2 | 2 | 122.1 | 3 |
| 10-23 | WSH | 13 | 327.04 | 0.7339 | 240 | 236.7 | 0 | 3 | 40.4 | 2 | 277.7 | 3 |
| 10-23 | TOR | 13 | 294.84 | 0.814 | 240 | 218.7 | 0 | 1 | 0 | 2 | 99.4 | 3 |
| 10-23 | MIA | 15 | 294.13 | 0.816 | 240 | 220.3 | 0 | 0 | 0 | 2 | 129.5 | 5 |
| 10-23 | DET | 16 | 308.82 | 0.7772 | 240 | 204.9 | 0 | 0 | 0 | 2 | 115.4 | 4 |
| 10-23 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 10-23 | HOU | 14 | 343.21 | 0.6993 | 240 | 219 | 0 | 0 | 0 | 3 | 79.5 | 4 |
| 10-23 | UTAH | 15 | 328.43 | 0.7307 | 240 | 221.5 | 0 | 2 | 43.7 | 1 | 357.2 | 6 |
| 10-23 | NO | 16 | 384.31 | 0.6245 | 240 | 228.8 | 0 | 0 | 0 | 2 | 139.8 | 4 |
| 10-23 | GS | 12 | 275.82 | 0.8701 | 240 | 240 | 0 | 3 | 81.6 | 3 | 142.4 | 1 |
| 10-23 | MEM | 15 | 324.81 | 0.7389 | 240 | 223.5 | 0 | 0 | 0 | 3 | 509.2 | 4 |
| 10-23 | LAL | 14 | 284.81 | 0.8427 | 240 | 222 | 0 | 2 | 5.5 | 2 | 238.9 | 8 |
| 10-23 | LAC | 10 | 201.91 | 1.1886 | 240 | 230.3 | 0 | 5 | 113.2 | 3 | 228.9 | 5 |
| 10-23 | SAC | 10 | 269.52 | 0.8905 | 240 | 235.7 | 0 | 3 | 52.7 | 3 | 242.2 | 2 |
| 10-23 | POR | 13 | 254.2 | 0.9441 | 240 | 217.8 | 0 | 3 | 32.3 | 1 | 97.9 | 4 |
| 10-24 | CHA | 14 | 292.57 | 0.8203 | 240 | 234.3 | 0 | 1 | 0 | 2 | 151 | 4 |
| 10-24 | MIA | 15 | 294.13 | 0.816 | 240 | 220.3 | 0 | 0 | 0 | 2 | 129.5 | 5 |
| 10-24 | CLE | 12 | 231.36 | 1.0374 | 240 | 211.3 | 0 | 0 | 0 | 2 | 190.6 | 1 |
| 10-24 | BKN | 15 | 315.25 | 0.7613 | 240 | 224.8 | 0 | 1 | 0 | 2 | 237.6 | 3 |
| 10-24 | PHI | 13 | 335.48 | 0.7154 | 240 | 221.7 | 0 | 3 | 17.5 | 1 | 206.8 | 8 |
| 10-24 | MIL | 15 | 396.42 | 0.6054 | 240 | 240 | 0 | 0 | 0 | 3 | 204.3 | 6 |
| 10-24 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 10-24 | WSH | 13 | 327.04 | 0.7339 | 240 | 236.7 | 0 | 2 | 40.4 | 3 | 277.7 | 3 |
| 10-24 | DAL | 11 | 233.7 | 1.027 | 240 | 240 | 0 | 2 | 48.2 | 5 | 276.5 | 5 |
| 10-24 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 10-24 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-24 | HOU | 13 | 315.51 | 0.7607 | 240 | 217.1 | 0 | 1 | 27.7 | 3 | 79.5 | 4 |
| 10-24 | DEN | 11 | 254.19 | 0.9442 | 240 | 237.5 | 0 | 3 | 75.8 | 3 | 147.5 | 4 |
| 10-24 | NO | 16 | 384.31 | 0.6245 | 240 | 228.8 | 0 | 0 | 0 | 2 | 139.8 | 4 |
| 10-24 | PHX | 15 | 322.77 | 0.7436 | 240 | 193.3 | 0 | 1 | 23.3 | 1 | 108.5 | 5 |
| 10-24 | GS | 11 | 258.82 | 0.9273 | 240 | 240 | 0 | 4 | 98.6 | 3 | 142.4 | 1 |
| 10-25 | UTAH | 15 | 328.43 | 0.7307 | 240 | 221.5 | 0 | 2 | 43.7 | 1 | 357.2 | 6 |
| 10-25 | LAL | 14 | 284.81 | 0.8427 | 240 | 222 | 0 | 2 | 5.5 | 2 | 238.9 | 8 |
| 10-25 | BKN | 15 | 315.25 | 0.7613 | 240 | 224.8 | 0 | 2 | 0 | 1 | 237.6 | 3 |
| 10-25 | IND | 12 | 300.17 | 0.7995 | 240 | 230.2 | 0 | 3 | 54.7 | 2 | 247.4 | 2 |
| 10-25 | NY | 15 | 276.08 | 0.8693 | 240 | 201.2 | 0 | 0 | 0 | 2 | 53.6 | 3 |
| 10-25 | ORL | 13 | 252.98 | 0.9487 | 240 | 223.1 | 0 | 4 | 60.6 | 0 | 40.7 | 1 |
| 10-25 | MIN | 13 | 281.25 | 0.8533 | 240 | 214.6 | 0 | 1 | 30.2 | 2 | 122.1 | 3 |
| 10-25 | TOR | 13 | 294.84 | 0.814 | 240 | 218.7 | 0 | 1 | 0 | 2 | 99.4 | 3 |
| 10-25 | OKC | 12 | 268.02 | 0.8955 | 240 | 224.4 | 0 | 3 | 2.7 | 3 | 83.3 | 1 |
| 10-25 | LAC | 10 | 201.91 | 1.1886 | 240 | 230.3 | 0 | 5 | 113.2 | 3 | 228.9 | 5 |
| 10-25 | PHI | 12 | 297.28 | 0.8073 | 240 | 219.3 | 0 | 4 | 55.7 | 1 | 206.8 | 8 |
| 10-25 | DET | 15 | 278.92 | 0.8605 | 240 | 201.1 | 0 | 1 | 29.9 | 2 | 115.4 | 4 |
| 10-25 | SAC | 11 | 271.86 | 0.8828 | 240 | 233.7 | 0 | 3 | 52.7 | 3 | 242.2 | 3 |
| 10-25 | MEM | 14 | 298.99 | 0.8027 | 240 | 222.1 | 0 | 1 | 25.8 | 3 | 509.2 | 4 |
| 10-26 | CHA | 11 | 222.53 | 1.0785 | 240 | 232.5 | 0 | 4 | 70 | 2 | 151 | 4 |
| 10-26 | WSH | 13 | 327.04 | 0.7339 | 240 | 236.7 | 0 | 3 | 40.4 | 2 | 277.7 | 3 |
| 10-26 | CLE | 12 | 231.36 | 1.0374 | 240 | 211.3 | 0 | 0 | 0 | 2 | 190.6 | 1 |
| 10-26 | MIN | 13 | 281.25 | 0.8533 | 240 | 214.6 | 0 | 1 | 30.2 | 2 | 122.1 | 3 |
| 10-26 | BOS | 14 | 287.53 | 0.8347 | 240 | 219.6 | 0 | 1 | 28.7 | 2 | 144.7 | 4 |
| 10-26 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 10-26 | MIA | 15 | 294.13 | 0.816 | 240 | 220.3 | 0 | 0 | 0 | 2 | 129.5 | 5 |
| 10-26 | DAL | 8 | 163.23 | 1.4703 | 240 | 240 | 0 | 6 | 118.7 | 4 | 276.5 | 5 |
| 10-26 | MIL | 15 | 396.42 | 0.6054 | 240 | 240 | 0 | 0 | 0 | 3 | 204.3 | 6 |
| 10-26 | IND | 12 | 300.17 | 0.7995 | 240 | 230.2 | 0 | 3 | 54.7 | 2 | 247.4 | 2 |
| 10-26 | OKC | 11 | 250.02 | 0.9599 | 240 | 223.3 | 0 | 4 | 20.7 | 3 | 83.3 | 1 |
| 10-26 | PHX | 15 | 322.77 | 0.7436 | 240 | 193.3 | 0 | 1 | 23.3 | 1 | 108.5 | 5 |
| 10-26 | HOU | 13 | 320.4 | 0.7491 | 240 | 217.5 | 0 | 1 | 22.8 | 3 | 79.5 | 4 |
| 10-26 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-26 | UTAH | 15 | 328.43 | 0.7307 | 240 | 221.5 | 0 | 2 | 43.7 | 1 | 357.2 | 6 |
| 10-26 | MEM | 15 | 324.81 | 0.7389 | 240 | 223.5 | 0 | 0 | 0 | 3 | 509.2 | 4 |
| 10-26 | DEN | 12 | 285.94 | 0.8394 | 240 | 237.8 | 0 | 2 | 44 | 3 | 147.5 | 4 |
| 10-26 | GS | 12 | 275.82 | 0.8701 | 240 | 240 | 0 | 3 | 81.6 | 3 | 142.4 | 1 |
| 10-27 | BOS | 14 | 287.53 | 0.8347 | 240 | 219.6 | 0 | 1 | 28.7 | 2 | 144.7 | 4 |
| 10-27 | BKN | 15 | 315.25 | 0.7613 | 240 | 224.8 | 0 | 1 | 0 | 2 | 237.6 | 3 |
| 10-27 | NY | 14 | 266.18 | 0.9016 | 240 | 208.7 | 0 | 1 | 9.9 | 2 | 53.6 | 3 |
| 10-27 | DET | 15 | 278.92 | 0.8605 | 240 | 201.1 | 0 | 1 | 29.9 | 2 | 115.4 | 4 |
| 10-27 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 10-27 | SAC | 10 | 237.29 | 1.0114 | 240 | 232.8 | 0 | 4 | 87.3 | 3 | 242.2 | 3 |
| 10-27 | LAL | 14 | 284.81 | 0.8427 | 240 | 222 | 0 | 1 | 5.5 | 3 | 238.9 | 8 |
| 10-27 | POR | 14 | 265.89 | 0.9026 | 240 | 218.8 | 0 | 2 | 20.6 | 1 | 97.9 | 4 |
| 10-28 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-28 | MIA | 14 | 282.7 | 0.849 | 240 | 229.2 | 0 | 1 | 11.4 | 2 | 129.5 | 5 |
| 10-28 | CLE | 12 | 231.36 | 1.0374 | 240 | 211.3 | 0 | 0 | 0 | 2 | 190.6 | 1 |
| 10-28 | WSH | 12 | 302.42 | 0.7936 | 240 | 236.5 | 0 | 4 | 65 | 2 | 277.7 | 3 |
| 10-28 | DET | 15 | 278.92 | 0.8605 | 240 | 201.1 | 0 | 1 | 29.9 | 2 | 115.4 | 4 |
| 10-28 | CHA | 11 | 222.53 | 1.0785 | 240 | 232.5 | 0 | 4 | 70 | 2 | 151 | 4 |
| 10-28 | IND | 11 | 276.57 | 0.8678 | 240 | 240 | 0 | 4 | 78.3 | 2 | 247.4 | 2 |
| 10-28 | PHI | 12 | 330.48 | 0.7262 | 240 | 225 | 0 | 4 | 22.5 | 1 | 206.8 | 8 |
| 10-28 | TOR | 12 | 262.29 | 0.915 | 240 | 216.1 | 0 | 2 | 32.6 | 2 | 99.4 | 3 |
| 10-28 | ORL | 12 | 218.58 | 1.098 | 240 | 220.4 | 0 | 5 | 95 | 0 | 40.7 | 1 |
| 10-28 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 10-28 | NY | 15 | 276.08 | 0.8693 | 240 | 201.2 | 0 | 0 | 0 | 2 | 53.6 | 3 |
| 10-28 | MIL | 15 | 396.42 | 0.6054 | 240 | 240 | 0 | 0 | 0 | 3 | 204.3 | 6 |
| 10-28 | HOU | 12 | 284.62 | 0.8432 | 240 | 214.6 | 0 | 2 | 58.6 | 3 | 79.5 | 4 |
| 10-28 | MIN | 13 | 259.62 | 0.9244 | 240 | 204 | 0 | 2 | 61 | 2 | 112.8 | 3 |
| 10-28 | GS | 12 | 275.82 | 0.8701 | 240 | 240 | 0 | 3 | 81.6 | 3 | 142.4 | 1 |
| 10-28 | NO | 15 | 361.02 | 0.6648 | 240 | 228 | 0 | 1 | 23.3 | 2 | 139.8 | 4 |
| 10-28 | DEN | 12 | 285.94 | 0.8394 | 240 | 237.8 | 0 | 3 | 44 | 2 | 147.5 | 4 |
| 10-28 | UTAH | 14 | 304.43 | 0.7884 | 240 | 220 | 0 | 3 | 67.7 | 1 | 357.2 | 6 |
| 10-28 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 10-28 | DAL | 10 | 222.83 | 1.077 | 240 | 240 | 0 | 5 | 59.1 | 3 | 276.5 | 5 |
| 10-28 | OKC | 8 | 168.12 | 1.4276 | 236.04 | 236 | 1 | 7 | 102.6 | 3 | 83.3 | 1 |
| 10-28 | LAC | 9 | 163.01 | 1.4723 | 240 | 228 | 0 | 6 | 152.1 | 3 | 228.9 | 5 |
| 10-28 | LAL | 14 | 284.81 | 0.8427 | 240 | 222 | 0 | 2 | 5.5 | 2 | 238.9 | 8 |
| 10-29 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-29 | CLE | 12 | 231.36 | 1.0374 | 240 | 211.3 | 0 | 0 | 0 | 2 | 190.6 | 1 |
| 10-29 | NO | 15 | 361.02 | 0.6648 | 240 | 228 | 0 | 1 | 23.3 | 2 | 139.8 | 4 |
| 10-29 | SAC | 10 | 237.29 | 1.0114 | 240 | 232.8 | 0 | 4 | 87.3 | 3 | 242.2 | 3 |
| 10-29 | POR | 14 | 265.89 | 0.9026 | 240 | 218.8 | 0 | 2 | 20.6 | 1 | 97.9 | 4 |
| 10-29 | MEM | 15 | 324.81 | 0.7389 | 240 | 223.5 | 0 | 0 | 0 | 3 | 509.2 | 4 |
| 10-30 | WSH | 12 | 302.42 | 0.7936 | 240 | 236.5 | 0 | 3 | 65 | 3 | 277.7 | 3 |
| 10-30 | CHA | 11 | 222.53 | 1.0785 | 240 | 232.5 | 0 | 4 | 70 | 2 | 151 | 4 |
| 10-30 | BOS | 14 | 287.53 | 0.8347 | 240 | 219.6 | 0 | 1 | 28.7 | 2 | 144.7 | 4 |
| 10-30 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 10-30 | BKN | 14 | 290.15 | 0.8272 | 240 | 223.5 | 0 | 2 | 25.1 | 2 | 237.6 | 3 |
| 10-30 | DET | 15 | 278.92 | 0.8605 | 240 | 201.1 | 0 | 1 | 29.9 | 2 | 115.4 | 4 |
| 10-30 | PHI | 12 | 330.48 | 0.7262 | 240 | 225 | 0 | 4 | 22.5 | 1 | 206.8 | 8 |
| 10-30 | NY | 14 | 266.18 | 0.9016 | 240 | 208.7 | 0 | 1 | 9.9 | 2 | 53.6 | 3 |
| 10-30 | TOR | 12 | 262.29 | 0.915 | 240 | 216.1 | 0 | 2 | 32.6 | 2 | 99.4 | 3 |
| 10-30 | ORL | 12 | 218.58 | 1.098 | 240 | 220.4 | 0 | 5 | 95 | 0 | 40.7 | 1 |
| 10-30 | MIA | 15 | 294.13 | 0.816 | 240 | 220.3 | 0 | 0 | 0 | 2 | 129.5 | 5 |
| 10-30 | IND | 11 | 276.57 | 0.8678 | 240 | 240 | 0 | 5 | 78.3 | 1 | 247.4 | 2 |
| 10-30 | DAL | 11 | 237.66 | 1.0098 | 240 | 240 | 0 | 4 | 44.3 | 3 | 276.5 | 5 |
| 10-30 | HOU | 11 | 258.2 | 0.9295 | 240 | 212 | 0 | 3 | 85 | 3 | 79.5 | 4 |
| 10-30 | MIN | 13 | 259.62 | 0.9244 | 240 | 204 | 0 | 2 | 61 | 2 | 112.8 | 3 |
| 10-30 | LAC | 11 | 203.77 | 1.1778 | 240 | 228.2 | 0 | 5 | 113.2 | 3 | 228.9 | 6 |
| 10-30 | GS | 12 | 275.82 | 0.8701 | 240 | 240 | 0 | 3 | 81.6 | 3 | 142.4 | 1 |
| 10-30 | LAL | 15 | 309.81 | 0.7747 | 240 | 223.5 | 0 | 2 | 5.5 | 2 | 238.9 | 9 |
| 10-30 | PHX | 15 | 322.77 | 0.7436 | 240 | 193.3 | 0 | 1 | 23.3 | 1 | 108.5 | 5 |
| 10-30 | DEN | 11 | 254.19 | 0.9442 | 240 | 237.5 | 0 | 4 | 75.8 | 2 | 147.5 | 4 |
| 10-31 | UTAH | 14 | 304.43 | 0.7884 | 240 | 220 | 0 | 3 | 67.7 | 1 | 357.2 | 6 |
| 10-31 | POR | 13 | 237.49 | 1.0106 | 240 | 216.3 | 0 | 3 | 49 | 1 | 97.9 | 4 |
| 10-31 | CHA | 11 | 222.53 | 1.0785 | 240 | 232.5 | 0 | 4 | 70 | 2 | 151 | 4 |
| 10-31 | PHI | 12 | 330.48 | 0.7262 | 240 | 225 | 0 | 4 | 22.5 | 1 | 206.8 | 8 |
| 10-31 | NO | 14 | 338.52 | 0.709 | 240 | 227.2 | 0 | 2 | 45.8 | 2 | 139.8 | 4 |
| 10-31 | ATL | 14 | 311.61 | 0.7702 | 240 | 218.1 | 0 | 2 | 9.8 | 2 | 203.4 | 4 |
| 10-31 | MEM | 15 | 324.81 | 0.7389 | 240 | 223.5 | 0 | 0 | 0 | 3 | 509.2 | 4 |
| 10-31 | SAC | 10 | 237.29 | 1.0114 | 240 | 232.8 | 0 | 4 | 87.3 | 3 | 242.2 | 3 |
| 10-31 | MIL | 15 | 396.42 | 0.6054 | 240 | 240 | 0 | 0 | 0 | 3 | 204.3 | 6 |
| 10-31 | CLE | 11 | 221.58 | 1.0831 | 240 | 220.4 | 0 | 1 | 9.8 | 3 | 190.6 | 1 |
| 10-31 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 10-31 | MIN | 13 | 259.62 | 0.9244 | 240 | 204 | 0 | 2 | 61 | 2 | 112.8 | 3 |
| 10-31 | HOU | 13 | 320.4 | 0.7491 | 240 | 217.5 | 0 | 1 | 22.8 | 3 | 79.5 | 4 |
| 10-31 | OKC | 8 | 168.12 | 1.4276 | 236.04 | 236 | 1 | 6 | 102.6 | 3 | 83.3 | 1 |
| 11-01 | ORL | 12 | 218.58 | 1.098 | 240 | 220.4 | 0 | 5 | 95 | 0 | 40.7 | 1 |
| 11-01 | BOS | 14 | 287.53 | 0.8347 | 240 | 219.6 | 0 | 1 | 28.7 | 2 | 144.7 | 4 |
| 11-01 | IND | 11 | 276.57 | 0.8678 | 240 | 240 | 0 | 5 | 78.3 | 1 | 247.4 | 2 |
| 11-01 | BKN | 14 | 290.15 | 0.8272 | 240 | 223.5 | 0 | 3 | 25.1 | 1 | 237.6 | 3 |
| 11-01 | GS | 10 | 216.66 | 1.1077 | 240 | 240 | 0 | 5 | 140.7 | 3 | 142.4 | 1 |
| 11-01 | LAC | 11 | 203.77 | 1.1778 | 240 | 228.2 | 0 | 5 | 113.2 | 3 | 228.9 | 6 |
| 11-01 | LAL | 15 | 309.81 | 0.7747 | 240 | 223.5 | 0 | 1 | 5.5 | 3 | 238.9 | 9 |
| 11-01 | TOR | 12 | 262.29 | 0.915 | 240 | 216.1 | 0 | 2 | 32.6 | 2 | 99.4 | 3 |
| 11-02 | CLE | 11 | 221.58 | 1.0831 | 240 | 220.4 | 0 | 1 | 9.8 | 3 | 190.6 | 1 |
| 11-02 | OKC | 8 | 168.12 | 1.4276 | 236.04 | 236 | 1 | 6 | 102.6 | 3 | 83.3 | 1 |
| 11-02 | CHA | 12 | 241.42 | 0.9941 | 240 | 233 | 0 | 2 | 51.1 | 3 | 151 | 4 |
| 11-02 | DET | 14 | 268.92 | 0.8925 | 240 | 208.6 | 0 | 2 | 39.9 | 2 | 115.4 | 4 |
| 11-02 | IND | 11 | 276.57 | 0.8678 | 240 | 240 | 0 | 5 | 78.3 | 1 | 247.4 | 2 |
| 11-02 | ATL | 13 | 292.18 | 0.8214 | 240 | 226.8 | 0 | 3 | 29.2 | 2 | 203.4 | 4 |
| 11-02 | NY | 14 | 266.18 | 0.9016 | 240 | 208.7 | 0 | 1 | 9.9 | 2 | 53.6 | 3 |
| 11-02 | BKN | 14 | 290.15 | 0.8272 | 240 | 223.5 | 0 | 2 | 25.1 | 2 | 237.6 | 3 |
| 11-02 | ORL | 12 | 218.58 | 1.098 | 240 | 220.4 | 0 | 5 | 95 | 0 | 40.7 | 1 |
| 11-02 | WSH | 12 | 302.42 | 0.7936 | 240 | 236.5 | 0 | 3 | 65 | 3 | 277.7 | 3 |
| 11-02 | PHI | 13 | 335.48 | 0.7154 | 240 | 221.7 | 0 | 2 | 17.5 | 2 | 206.8 | 8 |
| 11-02 | CHI | 12 | 266.32 | 0.9012 | 240 | 237.3 | 0 | 1 | 22.6 | 4 | 373.5 | 4 |
| 11-02 | DAL | 11 | 237.66 | 1.0098 | 240 | 240 | 0 | 4 | 44.3 | 3 | 276.5 | 5 |
| 11-02 | SAC | 10 | 237.29 | 1.0114 | 240 | 232.8 | 0 | 4 | 87.3 | 3 | 242.2 | 3 |
| 11-02 | MEM | 15 | 324.81 | 0.7389 | 240 | 223.5 | 0 | 0 | 0 | 3 | 509.2 | 4 |
| 11-02 | NO | 14 | 338.52 | 0.709 | 240 | 227.2 | 0 | 2 | 45.8 | 2 | 139.8 | 4 |
| 11-02 | MIN | 13 | 259.62 | 0.9244 | 240 | 204 | 0 | 2 | 61 | 2 | 112.8 | 3 |
| 11-02 | MIL | 15 | 396.42 | 0.6054 | 240 | 240 | 0 | 0 | 0 | 3 | 204.3 | 6 |
| 11-02 | HOU | 13 | 320.4 | 0.7491 | 240 | 217.5 | 0 | 1 | 22.8 | 3 | 79.5 | 4 |
| 11-02 | BOS | 13 | 273.93 | 0.8761 | 240 | 218.6 | 0 | 2 | 42.3 | 2 | 144.7 | 4 |
| 11-02 | SA | 12 | 246.71 | 0.9728 | 240 | 207.9 | 0 | 2 | 34.3 | 3 | 35.8 | 1 |
| 11-02 | UTAH | 14 | 291.12 | 0.8244 | 240 | 213 | 0 | 3 | 67.7 | 1 | 378 | 7 |
| 11-02 | DEN | 12 | 285.94 | 0.8394 | 240 | 237.8 | 0 | 3 | 44 | 2 | 147.5 | 4 |
| 11-02 | POR | 14 | 242.99 | 0.9877 | 240 | 211.4 | 0 | 2 | 43.5 | 1 | 97.9 | 4 |
| 11-02 | GS | 10 | 216.66 | 1.1077 | 240 | 240 | 0 | 5 | 140.7 | 3 | 142.4 | 1 |
| 11-02 | PHX | 15 | 322.77 | 0.7436 | 240 | 193.3 | 0 | 1 | 23.3 | 1 | 108.5 | 5 |
| 11-02 | LAC | 11 | 203.77 | 1.1778 | 240 | 228.2 | 0 | 5 | 113.2 | 3 | 228.9 | 6 |
| 11-02 | TOR | 12 | 262.29 | 0.915 | 240 | 216.1 | 0 | 2 | 32.6 | 2 | 99.4 | 3 |
| 11-02 | LAL | 14 | 286.31 | 0.8383 | 240 | 222.1 | 0 | 2 | 29 | 3 | 238.9 | 9 |
| 11-02 | MIA | 15 | 294.13 | 0.816 | 240 | 220.3 | 0 | 0 | 0 | 2 | 129.5 | 5 |
