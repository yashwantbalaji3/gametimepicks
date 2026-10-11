# NFL odds budget — bounded cost proposal (2026-10-11)

**Status: PROPOSAL ONLY.** Founder decision D4 (2026-10-11):
- the 1,160-credit season ceiling is not raised;
- no credits are bought;
- the authorization receipt (`docs/receipts/ODDS_AUTHORIZATION_NFL_2026.md`) is not edited.

Every paid NFL odds request stays disabled until the founder approves a budget change. Nothing in this document changes that.

## 1. Where the budget stands
| | |
|---|---|
| Effective season ceiling (receipt amendment) | **1,160** credits |
| Spent (`data/internal/research/odds/nfl/p171-ledger.json`) | **1,160**, the last 68 at 2026-10-11T11:41:55Z |
| Remaining under the receipt | **0** |
| Provider account balance (response header, same run) | 18,664. This is the vendor balance, not an authorization. The receipt is the binding limit. |

**How paid requests are disabled now.**
- Every paid call passes `assertCallAllowed` first. At 1,160 of 1,160, the first paid call of any run (the 3-credit team bulk) is refused *before* the request is sent. The capture exits 5 and the prior capture stands.
- So additional spend is 0 by construction. No workflow or receipt change is needed to keep it at 0.
- Side effect: until a decision, each scheduled event window shows a failed odds step. The free steps (rosters, injuries, nflverse, forecasts, boards, grading) still run, because they are on `!cancelled()`.

## 2. Measured spend (from the ledger; weeks start Tuesday 2026-09-08)
| Week | Props (calls × 5) | Team bulk (× 3) | Total |
|---|---|---|---|
| Preseason | 0 | 69 | 69 |
| W1 | 0 | 24 | 24 |
| W2 | 0 | 39 | 39 |
| W3 | 345 (69) | 57 | 405 (the first week of full prop sweeps, plus 3 for an in-play probe) |
| W4 | 265 (53) | 45 | **310** |
| W5 | 280 (56) | 33 | **313** (stopped by the ceiling) |

Props are about 85–90% of the spend. One prop call is one event × 5 markets × 1 region = 5 credits, so a full-week sweep costs about 14–16 games × 5 = **70–80 credits**. The current cadence runs three scheduled sweeps (Fri, Sat and Sun 13:00Z), plus Sunday kickoff-refresh sweeps.

## 3. Coverage levels for the rest of the 2026 season
Scope: Weeks 6–18 (13 weeks, about 13–16 games each, with byes) plus 13 playoff games. These are estimates from the W4/W5 measurements, not quotes.

| Level | What is captured | Per week | Rest of season, incl. playoffs |
|---|---|---|---|
| **L0: leave exhausted** | nothing | 0 | **0** |
| **L1: minimum viable** | one week-window prop sweep (Saturday) + one team bulk per game day (Thu/Sun/Mon) | ≈ 70–80 + 9 ≈ **85** | ≈ **1,100 + ~100 ≈ 1,200** |
| **L2: reduced** | Saturday sweep + one Sunday-morning sweep of games within 18h + 2 team bulks per game day | ≈ **160** | ≈ **2,100 + ~200 ≈ 2,300** |
| **L3: full (current cadence)** | three scheduled sweeps + kickoff-refresh sweeps + team windows | ≈ **310** | ≈ **4,000 + ~300 ≈ 4,300** |

A ceiling raise should be a circuit breaker sized to the chosen level plus about 10% headroom. It should not be open-ended.

## 4. Options that cut requests without losing a coverage level
1. **Honour the 18-hour horizon on kickoff-refresh sweeps.**
   - `nfl-kickoff-refresh` dispatches `probe_props=all week_window=true lookahead_hours=18`, but `--week-window` overrides the horizon, so each dispatch re-probes the whole week. That's why the 11:41Z sweep reached for Monday night.
   - Probing only the games inside the horizon saves about 5 credits per late-week game per dispatch, with no loss.
2. **Drop the Friday sweep.** The Saturday sweep re-probes the same events. How much prices move between them is **not measured**; measure it before relying on this. Saving: about 70–80 per week.
3. **Probe only events with a published player board.** Today that is every eligible game, so there is no saving yet. It guards against waste when boards are withheld.
4. **Fewer markets.** All 5 prop markets are bought per event. A market family no surface publishes could be dropped. This needs a per-family usage check first.
5. **Partial-sweep carry (#1062).** A sweep cut short no longer erases earlier prices. That makes the cheaper levels (L1/L2) safer, because one missed sweep doesn't blank a game.

## 5. Consequences of leaving the budget exhausted (L0)
- **Pregame prices:** Weeks 6+ have no team moneyline, spread or total and no player-prop prices. Week 5 prices remain, each with its own `capturedAt`, and age into STALE. Market columns on the boards and game pages show the typed unavailable state, not invented prices.
- **NFL World Model V2 is not affected.** WM2 forecasts use no odds. The grader (`world-model-v2/grade.mjs`) settles against official box scores; its `NO_LINE` state means a player has no box-score line, not a missing market price. Grading continues unchanged.
- **Market-relative views are affected:** anything that sets a forecast beside a sportsbook price (prop-price columns, market comparisons) has no new-week price.
- **Products built from the capture:** the NFL risk ladder and any market comparison return typed refusals for new weeks.
- **Operations:** the odds step fails on each scheduled window until a decision. That is noise, not data loss, and the free steps continue.

## 6. Recommendation (the founder decides)
**L1 (≈ 1,200 credits for the rest of the season)**, together with option 1:
- it keeps one dated sportsbook price per game per week for the published market comparisons (WM2 grading does not need it);
- with #1062, a refused or missed sweep no longer erases what was captured;
- L2 or L3 are worth paying for only if a published surface needs the price fresher than Saturday morning.
