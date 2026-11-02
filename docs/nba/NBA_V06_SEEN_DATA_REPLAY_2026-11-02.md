# NBA v0.6 candidate: seen-data replay, 2026-11-02

**Label: SEEN-DATA REPLAY. Not forward evidence.** The audit read these games before v0.6 existed, and its findings shaped the rules. Lower differences below describe a replay. They do not validate the candidate. v0.6 is unarmed and nothing here changes a forecast, lane, receipt, ledger, workflow or reader.

**Verdict under the preregistration: v0.6 does not go to shadow as written.** It met 6 of 8 replay bars. It missed R3 (minutes bias) and R6 (starter coverage).

Rules, constants and bars: `docs/nba/NBA_V06_MINUTES_CANDIDATE_PREREGISTRATION_2026-11-02.md`, frozen and pushed at `ce3b046941` before any outcome was joined. The replay script and the rules were not changed after that commit, and no amendment was made. The one later code edit is test-only: the roster reconciliation test now skips a team the capture marks as missing.

```
cd app && npx tsx scripts/nba/research/replay-nba-v06-candidate.mjs --out-dir <dir outside the repo> --bootstrap 2000 --simulations 10000
```

## 1. Bars (MEASURED)

| Bar | Rule | Result | Met |
|---|---|---|---|
| R1 | Minutes ΔMAE v0.6 − v0.3, interval below 0 | −0.72 (−0.92, −0.51) | Yes |
| R2 | Unconditional minutes Δ v0.6 − v0.3, interval below 0 | −18.4 (−21.9, −15.0) per team-game | Yes |
| R3 | abs(bias) ≤ 1.0 with an interval covering 0 | +0.57 (+0.11, +1.03) | **No** |
| R4 | Participation Brier Δ v0.6 − v0.3, interval below 0 | −0.037 (−0.049, −0.025) | Yes |
| R5 | Rows ≥ 41 no more than v0.3 | 0 vs 1 | Yes |
| R6 | Starters and sixth men projected no fewer than v0.3 | Starters 733 vs 735; sixth men 148 vs 148 | **No** |
| R7 | Pts, reb, ast interval upper end ≤ +0.05 | −0.07 (−0.15, +0.02); −0.07 (−0.10, −0.03); 0.00 (−0.02, +0.02) | Yes |
| R8 | Team minutes reconcile within 0.02 | 214 of 214 sides at 240 | Yes |

**R3.** Bias moved from −1.59 under v0.3 to +0.57, so the sign flipped. It is largest on rows projected at 34 or more minutes (+2.8, 120 rows, no interval computed) and on actual bench players (+1.63, interval +1.19 to +2.08).

**R6.** Two starters were excluded and then started:
- Podziemski, 10-23: state `NO_APPEARANCE`, listed Day-To-Day, played 33.
- Smart, 10-31: state `MISSED_2PLUS_OTHER`, played 36.

Both are returners. The exclusion rule cannot see a return coming from box scores alone.

## 2. Results (MEASURED)

**Fidelity.** v0.1 214 of 214 sides and v0.3 186 of 186 sides re-derive their frozen minutes. 74 graded games with frozen v0.3, 88 graded in all.

Intervals are game-clustered, 2,000 draws. Lower is better for every error and Brier column. 1,442 played rows are projected by all four families, on 74 games.

| Metric | v0.1 frozen | v0.3 frozen | v0.5 replay (context) | v0.6 replay |
|---|---|---|---|---|
| Minutes MAE | 7.17 (6.83, 7.52) | 5.70 (5.42, 5.99) | 5.44 (5.17, 5.71) | 4.98 (4.70, 5.26) |
| Minutes bias | −1.99 (−2.60, −1.37) | −1.59 (−2.08, −1.11) | +0.09 (−0.41, +0.57) | +0.57 (+0.11, +1.03) |
| Unconditional error, per team-game | 134.9 (127.8, 142.2) | 96.8 (91.9, 102.3) | 84.5 (79.7, 89.9) | 78.4 (73.7, 83.5) |
| Participation Brier | 0.285 (0.266, 0.303) | 0.159 (0.145, 0.173) | 0.128 (0.115, 0.141) | 0.122 (0.111, 0.133) |
| Rows with abs(err) ≥ 15, per 100 | 9.50 (7.98, 11.13) | 3.40 (2.42, 4.48) | 3.54 (2.54, 4.65) | 3.47 (2.42, 4.60) |
| Projected rows ≥ 41 (reached 41) | 8 (1) | 1 (0) | 1 (0) | 0 (0) |
| Starters projected, of 740 | 688 | 735 | 735 | 733 |
| Sixth men projected, of 148 | 135 | 148 | 148 | 148 |
| All who played projected, of 1,661 | 1,463 | 1,629 | 1,629 | 1,608 |
| Pts median MAE | 5.09 (4.85, 5.34) | 4.62 (4.41, 4.85) | not simulated | 4.55 (4.36, 4.75) |
| Reb median MAE | 2.12 (2.03, 2.21) | 1.90 (1.81, 1.99) | not simulated | 1.84 (1.75, 1.92) |
| Ast median MAE | 1.47 (1.40, 1.54) | 1.31 (1.26, 1.37) | not simulated | 1.31 (1.25, 1.36) |

**Paired differences. Negative means v0.6 has the lower error, on seen data.**

| Pair | Minutes ΔMAE | Unconditional Δ | Brier Δ | Pts Δ | Reb Δ | Ast Δ |
|---|---|---|---|---|---|---|
| v0.6 − v0.3 | −0.72 (−0.92, −0.51) | −18.4 (−21.9, −15.0) | −0.037 (−0.049, −0.025) | −0.07 (−0.15, +0.02) | −0.07 (−0.10, −0.03) | 0.00 (−0.02, +0.02) |
| v0.6 − v0.1 | −2.19 (−2.50, −1.87) | −56.5 (−62.3, −50.4) | −0.163 (−0.182, −0.144) | −0.54 (−0.72, −0.37) | −0.28 (−0.35, −0.21) | −0.16 (−0.21, −0.11) |
| v0.6 − v0.5 | −0.46 (−0.60, −0.32) | −6.1 (−7.8, −4.5) | −0.006 (−0.010, −0.003) | not simulated | not simulated | not simulated |

On the wider 88-game set, v0.6 − v0.1 minutes ΔMAE is −1.90 (−2.20, −1.58), 1,728 rows.

- **No improvement claim follows.** Where an interval excludes 0, that is replay evidence only. Pts and ast against v0.3 are not established even on this replay.
- **Rows with big misses did not fall.** v0.6 − v0.3 is +0.07 per 100 (−0.84, +0.91).
- **Matched-row MAE flatters any model that drops rows.** v0.6 excluded 21 rows that played, averaging 13.5 minutes, and those are outside the MAE. The unconditional line counts them.

**By population.**

| Rows | n | Bias v0.3 | Bias v0.6 | ΔMAE v0.6 − v0.3 |
|---|---:|---|---|---|
| Actual starters | 686 | −3.59 (−4.36, −2.80) | −0.59 (−1.36, +0.20) | −1.27 (−1.60, −0.93) |
| Bench | 756 | +0.22 (−0.26, +0.71) | +1.63 (+1.19, +2.08) | −0.22 (−0.43, 0.00) |
| Moved team | 352 | −1.21 (−2.23, −0.18) | +0.84 (−0.02, +1.69) | −1.12 (−1.50, −0.72) |
| Same team | 1,090 | −1.72 (−2.17, −1.26) | +0.49 (+0.03, +0.95) | −0.59 (−0.80, −0.36) |

**Exclusion.** 156 rows on the 88 games. 21 played, which is 13.5%, against a pooled 2025-26 rate of 0.021 to 0.135 for those states. `NO_APPEARANCE` 12 of 116, `MISSED_2PLUS_OTHER` 9 of 40. The rule carried little accuracy: with no exclusion, the unconditional Δ against v0.3 is −18.2 against −18.4.

**Day-To-Day.** After the fit window, 14 of 22 listed rows played (0.64) against a mean q of 0.51. That is 20 games and a small n, so I draw no conclusion, but it is in the same direction as the v0.5 cells: under the observed rate.

**After the Day-To-Day fit window (20 games, still audit-seen).** Minutes ΔMAE v0.6 − v0.3 −0.57 (−0.90, −0.24). Brier Δ −0.024 (−0.050, +0.002), not established.

**Who played with no v0.6 projection, 53 rows.** 21 excluded (12 `NO_APPEARANCE`, 9 `MISSED_2PLUS_OTHER`), 20 rookies, 10 listed Out at freeze, 2 veterans with no recent box score. The last 32 match v0.3's misses.

**Sensitivities, fixed in advance, on the same rows.**

| Variant | Minutes ΔMAE vs v0.3 | Unconditional Δ vs v0.3 | Bias | Starters |
|---|---|---|---|---|
| v0.6 as frozen | −0.72 (−0.92, −0.51) | −18.4 (−21.9, −15.0) | +0.57 (+0.11, +1.03) | 733 |
| Day-To-Day multiplier 1 | −0.72 (−0.90, −0.52) | −17.8 (−20.8, −14.7) | +0.21 (−0.25, +0.66) | 733 |
| No exclusion | −0.73 (−0.92, −0.52) | −18.2 (−21.6, −14.9) | +0.52 (+0.07, +0.96) | 735 |
| Transfer prior 3 | −0.61 (−0.81, −0.41) | −17.2 (−20.5, −14.0) | +0.55 (+0.09, +1.00) | 733 |

Bias and starter counts for the variants were computed from the replay's rows after the bars were read. **INFERRED:** dropping the Day-To-Day multiplier and the exclusion together might meet R3 and R6, since each misses one bar alone. I did not run that pairing. Choosing it now would be tuning on seen data, so it could only ship as a new version under its own preregistration.

## 3. The 2026-11-02 slate, side by side (MEASURED; not played at this head)

Frozen v0.1 and v0.3 minutes, v0.6 from the same freeze inputs. q is v0.6's play probability. Minutes are conditional on playing. This slate is never scored in this protocol.

| Player | Team | v0.1 | v0.3 | v0.6 | q | State | 2026-27 mean (n) | Pts v0.1 | Pts v0.3 | Pts v0.6 |
|---|---|---:|---:|---:|---:|---|---|---:|---:|---:|
| Gilgeous-Alexander | OKC | 48.0 | 39.8 | 36.6 | 1.00 | Played last | 32.7 (6) | 31.6 | 34.9 | 32.2 |
| Hachimura | LAC | 45.8 | 30.1 | 31.1 | 0.99 | Played last | 30.0 (4) | 20.0 | 11.4 | 12.0 |
| Young | WSH | 16.3 | 25.6 | 32.8 | 1.00 | Played last | 36.5 (6) | 12.0 | 15.6 | 20.3 |
| D. Mitchell | CLE | 40.3 | 34.6 | 34.7 | 1.00 | Played last | 32.7 (6) | 30.5 | 26.8 | 26.9 |
| Embiid | PHI | 23.9 | 27.1 | 32.4 | 0.58 | Missed last, Day-To-Day | 35.0 (5) | 17.0 | 19.7 | 23.5 |
| Cisse | DAL | 26.3 | 8.3 | 8.4 | 0.42 | Missed last, coach | 3.5 (4) | 10.6 | 1.5 | 1.0 |
| Richards | MIA | 18.2 | 9.0 | 4.2 | 0.62 | Played last | 2.7 (3) | 7.2 | 2.5 | 1.0 |
| Risacher | DAL | 12.1 | 22.7 | 29.5 | 0.99 | Played last | 29.7 (6) | 3.9 | 8.2 | 10.9 |

Across the slate, v0.6 has 0 rows at 41 or more (v0.1 has 2). All 150 last-game starters are projected or Out (147 and 3), and all 30 sixth men are projected. 13 rostered players have no projection: 11 rookies and 2 veterans, each with a reason code. 35 players are excluded. No side leaves more than 5 minutes unallocated.

## 4. What remains before any shadow arming

1. A founder decision on the two missed bars. As written, v0.6 does not go to shadow.
2. If a revision is wanted, a new version with its own preregistration, committed before it is scored.
3. Founder approval of every constant in preregistration section 3 and the reused ones.
4. PR 1281's gate merged, or re-homed. It is carried here byte for byte, unregistered.
5. Build work: a family entry, builder branch, receipts, aligned cutoff, grader and ledger directory, workflow lines, each behind review. A team-score path would stay withheld.
6. The rookie data decision. v0.6 leaves that gap open.
7. Tests on this branch cover the v0.6 files and the NBA test sets. The full `run-suite` unit phase was not run.

## 5. Limits

- Seen data, 74 games, all October. Game-clustered intervals do not account for one player repeating across games.
- `DAY_TO_DAY_MULTIPLIER` is in-sample on 54 of the 74 games.
- v0.5 and v0.6 are replays. Only v0.1 and v0.3 have receipts.
- v0.6's medians come from a simulation, with v0.3's rates and seed.
- Injury status comes from the feed at each freeze, so a change between freeze and tip is invisible to all families.
