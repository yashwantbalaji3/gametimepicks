# NBA official source reconciliation (2026-10-21)

**Status:** IMPLEMENTED LOCALLY · draft PR · nothing public changes · release owner gates the merge.
**Branch:** `claude/nba-canonical-official-snapshot`
**Founder rule served:** one game → one official frozen forecast → one set of numbers on every surface (Cross-Product Prediction Consistency, 2026-10-20).

## 1. The defect

Two NBA "official" sources existed on `main` (`0894582617`):

| Consumer | Source it read | Model |
|---|---|---|
| Public `/nba` experimental lane (#1146, live since 19:53Z 10-20) | `experimental-v0.1/forecasts/<date>.json` | Elo favoured side + **v0.1** player medians (founder N1/N2) |
| `nbaOfficialSnapshot` (#1144): Theater default run, Theater box-score expectations, consistency audit, shared market evaluator | `experimental-v1/forecasts/<date>.json` | **v1** `nba-sim-v1-coherent` |

On the opening-night slate the two disagree:

- Player points medians differ by a mean of 1.6–2.9 points per game, and by up to 7.9 for one player.
- Example: Cade Cunningham, v0.1 mean 21.4 vs v1 15.7 conditional on playing.

No gate compared the lane with the snapshot. A public Theater would have contradicted `/nba`.

## 2. What this change does

`nbaOfficialSnapshot(eventId, { official, supporting })` now builds one named composition, `nba-official-composition@1`:

| Field | Official value | Why |
|---|---|---|
| Winner side | Elo favoured side (`publishedSide`, rule `nba-winner-side@1`, head `elo`) from the v0.1 receipt | Founder N2; this is what `/nba` prints |
| `game.pHome` | That Elo head's pHome | It is the head that sets the side. `pHomePublished: null`: never published (prereg §13) |
| Home / away / margin / total | **null, `projectedScore.state: WITHHELD`** | The v0.1 team score ignores the opponent and contradicts Elo in 2/3 games. v1 is not anchored to Elo (§4). Nothing is filled from a supporting simulation, and nothing is adjusted to agree with Elo |
| Players | v0.1 `pts reb ast threePm pra ptsReb ptsAst minutes` (mean, sd, quantiles, exact) | Founder N1 (player champion); the lane's source |
| `publicDisplay` | `MEDIAN_1DP` on exactly the (player, family) pairs the lane prints: not Out, ≥ 10 expected minutes, pts/reb/ast/3PM | Makes the lane's display rule part of the contract |
| v1 | `SUPPORTING_SIMULATION` source with its own version. `alignedWithOfficial` = same injury + roster input hashes | The Theater replays its runs; its numbers are never merged in |
| Not modelled | `rebAst`, `stl`, `blk`, `tov` | No family produces them; never derived from marginals |

**Refusals:**
- v1 passed as official → `NOT_OFFICIAL_FAMILY`.
- Broken or post-tip receipt → `RECEIPT_INTEGRITY`. A `NOT_PRE_TIP` guard backs up the `preTip` flag.
- Missing Elo head → `NO_WINNER_HEAD`.

The official family constant is `LANE.sourceFamily`, so the lane and the snapshot cannot drift apart.

**Counting-stat support.** v0's draws are not whole numbers (for example a points median of 21.38). Counts therefore use the evaluator's existing continuity rule (`support: "integer"`), the same convention as NFL yards. Minutes are `continuous`.

**Shared selector `official-representative@2`.** When the official snapshot has no team expectations, only runs won by the official side can be the official representative. Otherwise an upset run with close player lines could be labelled "official". NFL, which has team terms, selects exactly as under @1 (pinned by a test).

**Theater loader.** It replays v1 runs and measures them against the official v0.1 snapshot. If the v0.1 file is missing, the runs still play, every one a labelled what-if.

**Audit.**
- **New public-lane check (`nba-public-lane`).** It compares every lane row with the snapshot by `providerAthleteId`:
  - median to 1 dp and expected minutes;
  - side, and rows missing from the lane;
  - favoured team;
  - freeze instant and payload hash.
- **Result on the real 2026-10-20 slate: 0 findings.** The lane prints exactly the official snapshot.
- **New `nbaSimAnchorCheck`:**
  - v1 favourite = Elo side;
  - |Δ pHome| ≤ 0.02;
  - per-player |v1 unconditional mean − v0.1 mean| / v0.1 sd ≤ 0.25;
  - input alignment, reported.
- **`theaterActivationGate('nba', id)`** now blocks with `NO_SUPPORTING_SIMULATION`, `SIM_NOT_ANCHORED` and `ANCHOR_TOLERANCE_UNAPPROVED`.

## 3. Evidence: opening night 2026-10-20 (committed, frozen pre-tip receipts)

| Game | Elo pHome (official) | v1 sim pHome | Δ | v1 side = Elo | Player pairs within z ≤ 0.25 | Same inputs |
|---|---|---|---|---|---|---|
| BOS @ DET 401909088 | 0.5955 | 0.5489 | −0.047 | yes | 41 / 112 | yes |
| PHI @ NY 401909089 | 0.7781 | 0.7408 | −0.037 | yes | 46 / 108 | no (v1 frozen 15:05Z, v0.1 14:17Z) |
| OKC @ SA 401909090 | 0.5465 | 0.5043 | −0.042 | yes | 27 / 90 | no (v1 17:49Z, v0.1 14:17Z) |

**Win probability.** v1 is below Elo in 3 of 3 games, by 0.04 on average. That is consistent with v1 giving less home advantage than Elo's 70 rating points, but n = 3 shows no significance. It is a diagnostic for the grading workstream, not a conclusion.

**Players.** The largest player gaps are bench players:
- 4683771: v0.1 points mean 1.35 vs v1 5.45.
- 6578: assists 0.19 vs 1.50.

v1 plays low-minute players much more than v0.1. That is a minutes-allocation disagreement for the evaluation workstream.

**Official representative.** The closest stored v1 run sits 1.32–1.53 normalised units from the official v0.1 projections. The selector's tolerance is 0.5, so `withinTolerance` is false on all 3. Five stored runs cannot represent a different model's forecast well.

### Which head is off? (research PR #1152)

On the 2024-25 development season (n = 1,005, paired bootstrap), v1 has lower log loss than Elo: −0.0059 [95% −0.0110, −0.0009]. Brier is also lower: −0.0026 [−0.0049, −0.0004].

Elo's mean pHome is 0.584 against a realized home win rate of 0.530, so **Elo overstates the home side**. v1 sits below Elo in 98.4% of games (mean −0.037), the same gap seen on opening night.

So the anchor's pHome term does not mean v1 is wrong. It measures that the replayed simulation and the official head disagree. Which head is official is founder decision N6. Development-season evidence promotes nothing (prereg §8).

## 4. What stays gated, and why

- **NBA Theater public flag:** stays OFF. The gate is closed on all 3 games: `SIM_NOT_ANCHORED` (pHome and players), `ANCHOR_TOLERANCE_UNAPPROVED`, and `MODEL_VERSION_MIX` from the private v1 board.
- **Official NBA team scores, margins and totals:** WITHHELD. No model is reconciled with the Elo side yet.
- **Everything already withheld by prereg §13 stays withheld:** win %, ranges, odds, picks and products. The registry is unchanged (`HISTORICAL_ONLY`).

## 5. Consistency baseline

Only NBA entries were re-pinned. Non-NBA entries are byte-for-byte main's, because NFL data drift since the pin is not this change's to absorb. The class diff:

- **Resolved:**
  - `MODEL_VERSION_MIX nba-top-board.default-family`
  - `MODEL_VERSION_MIX nba-top-board.v0.1` and the 8 `PROJECTION_MISMATCH nba-top-board.v0.1|{pts,reb,ast,threePm}|{p50,mean}` classes (the v0.1 board now IS the official family)
  - `PROJECTION_MISMATCH nba-forecast-receipt.winner-head` (the official head is now the head that sets the side)
- **New, pinned:**
  - `MODEL_VERSION_MIX nba-top-board.v1` and 8 `PROJECTION_MISMATCH nba-top-board.v1|…` classes: the private v1 board ranks a non-official model. Owner decision: retire it, or keep it explicitly as a candidate-shadow board.
  - `PROJECTION_MISMATCH simulation-theater.default` for 401909090: the engine's own "typical" run (#450) is not the official representative (#642). The Theater already opens on #642; the class mirrors the NFL `MEDIAN_LIKE` check.

## 6. Decisions needed (founder / release owner)

1. **Approve or amend NBA anchor tolerances, after N6 (which winner head is official).** The tolerances are: pHome 0.02, reusing the NFL founder value, and player z ≤ 0.25 (proposed). Until approved, the NBA Theater gate stays closed even if every term passes.
2. **NBA official team scores.** Keep WITHHELD (the default here), or name a reconciliation path. If N6 made the v1 sim head the official winner head, v1's team scores would be coherent with the official side by construction. They would still have to pass the §7 margin/total bars on forward rows: on the 2024-25 development season v1 fails total bias (−2.98 vs |bias| ≤ 2).
3. **The private v1 top board:** retire, or relabel as a candidate shadow.
4. **Unchanged open items:** `decision-nba-markets-authorization`, N4 / N6, the v0.2 cold-start bug.

## 7. Verification

```
cd app && npx tsx --test src/lib/consistency/*.test.mjs src/lib/simulation-theater/*.test.mjs src/lib/simulation-theater/nba/*.test.mjs src/lib/sports/nba/*.test.mjs
# 415 pass · 0 fail · 3 skipped (pre-existing skips)
npx tsx scripts/consistency/audit-prediction-consistency.mjs --gate NBA:401909088   # closed: ANCHOR_TOLERANCE_UNAPPROVED, SIM_NOT_ANCHORED (pHome, players), MODEL_VERSION_MIX ×3 (private v1 board)
```

No `next build` was run, because of the protected window to 05:00Z 10-21. The change touches no route, page, component or public data file. The full post-build export-boundary suite is owed after 05:00Z under the shared build lock.

## 8. Alternative Theater gate (prepared, NOT in force)

**Background.** A founder architecture decision, relayed by the release owner on 2026-10-20 (roadmap `NBA-CC`): the Theater may run a different engine from the official forecast; the best engine is decided by forward, market-by-market evidence; there is one canonical public prediction everywhere.

That conflicts with this PR's anchor gate, which requires v1 to agree with the official forecast. As directed, the anchor gate stays **in force**. The alternative is prepared for the founder to decide:

| | `ANCHORED` (in force) | `LABELLED_SUPPORTING_RUNS` (prepared) |
|---|---|---|
| v1 must agree with the official forecast | yes (`nbaSimAnchorCheck`, approved tolerance) | no |
| What the official panel shows | the canonical snapshot | the canonical snapshot, unchanged by any run |
| How replayed runs are labelled | the closest run is the "Official Representative Simulation" | every run is an individual `nba-sim-v1-coherent` run; none is called official |
| Is the default-run selection (`simulation-theater.default`) a gate? | yes | no |
| Still required | supporting game, box-score consistency, no scenario leak, no model-version mix | same, plus the founder adopting the policy |

**Evaluation on the committed 2026-10-20 slate:**

| Game | ANCHORED | LABELLED_SUPPORTING_RUNS |
|---|---|---|
| 401909088 BOS @ DET | closed: ANCHOR_TOLERANCE_UNAPPROVED, SIM_NOT_ANCHORED, MODEL_VERSION_MIX ×3 (private v1 board) | closed: GATE_POLICY_NOT_IN_FORCE, MODEL_VERSION_MIX ×3 |
| 401909089 PHI @ NY | closed: same, MODEL_VERSION_MIX ×2 | closed: GATE_POLICY_NOT_IN_FORCE, MODEL_VERSION_MIX ×2 |
| 401909090 OKC @ SA | closed: same + the default-run mismatch, MODEL_VERSION_MIX ×1 | closed: GATE_POLICY_NOT_IN_FORCE, MODEL_VERSION_MIX ×1 |

**To open the gate under the alternative, the founder would need to:**
1. Adopt it: edit `NBA_THEATER_GATE_POLICY_IN_FORCE` in a reviewed PR.
2. Retire or relabel the private v1 top board (the `MODEL_VERSION_MIX` blocker).
3. Clear everything §13 and the activation checklist in #1153 require.

**UI work (not done here).** The Theater copy would have to drop "Official Representative Simulation" under the alternative. #1153's tests that the official layer never changes with the selected run stay the overwrite guarantee.

## 9. The v1 board is relabelled "NBA v1 Challenger — Research Only" (founder decision, 2026-10-20)

**The decision:** "Retain the v1 Top 10 research board, but relabel it clearly as an NBA v1 Challenger — Research Only. Remove any possibility that its numbers appear as official predictions, Top Picks or product recommendations."

**What changed:**
- `NBA_BOARD_ROLES` in `official-snapshot.mjs`: `v0.1` is `OFFICIAL`; `v1` is `CHALLENGER_RESEARCH_ONLY`, labelled as above.
- The audit inventories a research-only board in `researchBoards[]`. It is not compared with the official numbers and is not a version mix.
- A board of any family *without* a role is still an ERROR.
- Public and product isolation stays enforced by `top-board-route-gating.test.mjs` (no public route imports a board) and by the export pruning of `/preview/**`.

**Baseline (NBA entries only re-pinned):**
- `MODEL_VERSION_MIX nba-top-board.v1` (6 → 0) and the 8 `PROJECTION_MISMATCH nba-top-board.v1|…` classes (3 → 0 each) are resolved.
- NBA keeps one pinned entry: `PROJECTION_MISMATCH simulation-theater.default` on 401909090.
- The Theater gate no longer carries `MODEL_VERSION_MIX` on any 10-20 game.
