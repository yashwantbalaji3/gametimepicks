# NBA player-points odds pilot — results report (2026-10-21 slate)

**Scope (founder-approved 2026-10-21):** 10-21 only · `player_points` · the 9 eligible-operators@1 books · at most one
pre-tip capture per game · 11 credits total · private only. Receipt:
`docs/receipts/ODDS_AUTHORIZATION_NBA_POINTS_PILOT_2026-10-21.md` (expired 23:59 ET). Pilot switched off and the
workflow disabled at 02:15Z by the release owner.

**Source of every number below:** the committed files only, read offline (no network) at main `70a8e07017`:
`data/internal/research/odds/nba/authorization-ledger.json`, `data/internal/research/odds/nba/props/*.json` (14 run
files), the frozen official v0.1 forecast `data/internal/research/nba/experimental-v0.1/forecasts/2026-10-21.json`.
Nothing here is a pick, a recommendation, or a published price.

> ⚠ **"Private" here means "not on the website", not "not public".** This repository is PUBLIC on GitHub, so the
> committed price records (book names, lines, American prices) are readable by anyone. That matches existing
> practice for other sports' odds files, but whether The Odds API's terms allow redistributing its data in a public
> repository is a **founder / counsel question** to settle before any larger pilot. This report therefore carries
> aggregates only — no per-book price table.

## 1. Games captured — 11 of 11, each exactly once, all pre-tip

| ESPN id | Game | Tip (UTC) | Fetched (UTC) | Lead | Records |
|---|---|---|---|---|---|
| 401909835 | MIL @ WSH | 23:00 | 22:20:25 | T-40 | 84 |
| 401909834 | ATL @ ORL | 23:00 | 22:20:25 | T-40 | 88 |
| 401909836 | CHA @ BKN | 23:30 | 23:05:03 | T-25 | 79 |
| 401909837 | CHI @ TOR | 23:30 | 23:05:03 | T-25 | 99 |
| 401909091 | MIN @ MIA | 23:30 | 23:06:31 | T-23 | 103 |
| 401909838 | UTAH @ MEM | 00:00 | 23:06:31 | T-53 | 85 |
| 401909839 | IND @ NO | 00:00 | 23:08:35 | T-51 | 93 |
| 401909840 | DAL @ HOU | 00:30 | 23:23:33 | T-66 | 96 |
| 401909092 | GS @ LAL | 02:00 | 00:53:11 | T-67 | 76 |
| 401909841 | PHX @ POR | 02:00 | 00:53:11 | T-67 | 88 |
| 401909842 | SAC @ LAC | 02:30 | 01:23:21 | T-67 | 68 |

- **Every game was priced before tip and inside the 20–75 min window.** Five landed at T-23…T-40 rather than T-60
  because GitHub's scheduler did not fire the 22:35 and 22:50 slots. The once-per-game rule then held (22
  `ALREADY_CAPTURED` skips) and the per-run cap held (7 `MAX_EVENTS_PER_RUN` deferrals, each priced by a later run).
- Price age at fetch: median 0.7 min, max 3.0 min. No price was stale, future-stamped or after tip.

## 2. Players and valid `player_points` markets

- **959** valid two-way records (one Over + one Under at one line, American prices, eligible book).
- **149** distinct player-games priced; lines 5.5–32.5; **no integer lines** (a push was impossible tonight).
- Cross-book line disagreement: 65 player-games on one line everywhere; 84 with a 1.0-point spread between books.

## 3. Books represented — 8 of the 9 allowlisted keys

| Book key | Records | Median two-way implied sum |
|---|---|---|
| draftkings | 149 | 1.0607 |
| williamhill_us (Caesars) | 147 | 1.0726 |
| espnbet | 146 | 1.0678 |
| fanduel | 144 | 1.0605 |
| betparx | 134 | 1.0719 |
| betrivers | 134 | 1.0774 |
| betmgm | 94 | 1.0698 |
| fanatics | 11 | 1.0693 |
| caesars | 0 | (the provider serves Caesars as `williamhill_us`) |

No offshore or unknown book appeared (`refusedNotEligible` empty in every run).

## 4. Valid vs rejected mappings

| Level | Result | Reason |
|---|---|---|
| Events | 11 / 11 joined (both teams, ±45 min, ALIGNED) | 0 refused |
| Players | 17 offers refused | `PLAYER_UNRESOLVED`: 3 players only — the provider writes **Herb Jones**, **Derrick Jones**, **Robert Williams**; our roster names them with full name / suffix. The reviewed alias table is empty by design, so nothing was guessed. |
| Outcomes | 21 offers refused | `ONE_SIDED` (a book posted only one side) |
| Listing | 561 `UNMATCHED` skips | games outside the run's window (later dates), **not** join failures — the label is fixed to `OUT_OF_WINDOW` in the housekeeping PR |

## 5. Lines and prices (summary)

- American prices −182 … +133; 74% within −125…−105.
- Two-way implied sum (the books' margin): median 1.069 (p10 1.060, p90 1.076). DraftKings and FanDuel were the
  tightest (~1.061), BetRivers the widest (1.077).

## 6. Credits by call

- **11 paid event-odds calls × 1 credit = 11 credits** (provider `x-requests-last` = 1 on every call, the documented
  1 market × 1 region-equivalent). **14 free `/events` listings, 0 credits.** No failed, retried or empty paid call.
- Provider balance 18,190 → **18,173**. The 3 other credits consumed in the same window were the separate
  `mlb-pregame-capture` program (~23:48Z), not this pilot. Floor 2,000 never approached; ceiling 11 reached exactly.

## 7. Evaluation readiness — the shared evaluator, under the closed gates

- All **959** records went through `evaluatePriceRecord` → the one shared `evaluateMarket`, against the official v0.1
  snapshot for each game (all 11 snapshots built; frozen 2026-10-21T14:28:31Z).
- **959 evaluated · 0 qualified · 0 refused.** Every result is withheld with `FAMILY_NOT_PUBLISHED`,
  `PUBLICATION_PRIVATE`, `SPORT_NOT_PRODUCT_ELIGIBLE` (plus `BELOW_LEAN_THRESHOLD` where applicable) — exactly as gated.
- The evaluator's lean, had the gates been open: **598 UNDER · 156 OVER · 205 NONE**. That skew is the model-vs-market
  gap below, not a betting signal.

## 8. Model vs market — descriptive, one night, and closer to the market is not better accuracy

- For the **138** priced players with an official projection, v0.1 median − consensus line (median of the books'
  lines): **median −2.08 points; 105 of 138 below the line; 47 at least 4 points away** (either side).
  - Largest below: Anthony Edwards 16.8 vs 28.5, Tyler Herro 11.7 vs 22.5, Zion Williamson 11.3 vs 21, Trey Murphy
    III 9.9 vs 19.5, Trae Young 11.0 vs 19.5. Largest above: Tre Jones 17.8 vs 8.5, Cooper Flagg 29.1 vs 21.5.
  - (Correction to my interim note: on the first 2 games it was 22 of 25 below, not 23.)
- **Cause — #1178's diagnosis, ACCEPTED:** primarily the uniform 240-minute rescale (`game-sim.mjs`); secondarily a
  trailing window holding last season's final 10 games, playoffs and play-in included (`minutes-model.mjs`). **Not
  preseason** (my interim guess was wrong). v0.1 stays official and its frozen forecasts are unchanged; v0.3 is a
  forward-shadow challenger only.
- **Coverage gap:** **11 priced players have no official projection at all** — 7 rookies (Cameron Boozer, Keaton
  Wagler, Darius Acuff Jr., Yaxel Lendeborg, Darryn Peterson, Caleb Wilson, Mikel Brown Jr.) and 4 players returning
  from long absences (Kyrie Irving, Fred VanVleet, Damian Lillard, Tyrese Haliburton). The model has no prior for a
  player without recent NBA minutes; the market prices them all.
- **Moving closer to sportsbook lines does NOT establish better accuracy.** A line is a price, not an outcome. Which of
  line or median was closer is measured only against real finals (§9), per market, over a preregistered sample — and
  even then the line carries the books' information and margin, so agreement with it is not a model-quality bar.

## 9. Shadow grading of these priced lines — can start when finals and box scores land (~14Z)

- Already verified tonight: every one of the 959 lines runs through `gradeNbaPlayerProp` today and correctly **holds**
  (`NOT_FINAL`, or `NO_FINAL_BOXSCORE` where the finals record has the score but the box score is not yet stored —
  e.g. 401909835). Nothing graded early, nothing guessed.
- **How it runs:** once `nba-results-refresh` / the finals waiter commit the finals record and the stored FINAL box
  scores, each priced line grades OVER and UNDER at the book's real line through the #1169 grader (DNP / 0 min →
  NO_MEASUREMENT, never a loss; D4-style conflicts → held). The same offline report then gives, descriptively per
  market: hit/lose/push at real lines, consensus-line MAE vs v0.1-median MAE, and coverage.
- **What is still needed for it to be evidence, not a one-off read:** an append-only *priced* prop-grade ledger with a
  single writer (the #1169 ledger grades synthetic median lines only, by design). That writer is a small offline PR
  (no network, no build-time read); until it lands, grading is descriptive.

## 10. Exact blockers for Bank Builder / Moonshot / Parlay Lab using these markets

Each refuses on its own; all must clear:
1. **Registry:** NBA is `HISTORICAL_ONLY` → `canEnterPredictionProducts("nba") === false` (eligible-leg contract,
   engine-v2, Parlay Lab V2 leg gate).
2. **Snapshot publication:** v0.1 player families are `PRIVATE_SHADOW` → the evaluator withholds every result
   (`FAMILY_NOT_PUBLISHED` / `PUBLICATION_PRIVATE`).
3. **Prop-settlement gate:** needs forward-graded ledger evidence **and** a founder-approved PROMOTION in the #1154
   promotion record (empty) — closed.
4. **Preregistered §7 bar:** ≥ 500 *priced* rows per family with a hit rate at or above break-even at the market
   line, on the forward shadow — today 0 graded priced rows (tonight adds ~138 points rows once final).
5. **Model quality:** the systematic under-projection (§8) — handled only through the v0.3 forward challenger and the
   preregistered promotion rules; no ad-hoc change.
6. **Coverage:** no projection for rookies / returning players (§8) — those markets cannot be evaluated at all.
7. **Price authorization:** the pilot receipt has expired; products need a standing, dated, ceiling-bound NBA receipt.
8. **Operator seam:** Parlay Lab V2's `isVerifiedOperator` is still hard `false` (plan step 3, after #1130).
9. **Product policy:** bank-builder@1 admits no NBA player leg (`bank-builder-nba-player@0-proposed` is inactive);
   moonshot is team-markets-only for NBA; `NEXT_PUBLIC_PARLAY_LAB_V2` is off.
10. **Same-game:** two NBA legs from one game are refused (no validated correlation model); cross-sport correlation
    caps are PROPOSED and disabled.
11. **Terms:** the public-repository data question in the header.

## 11. Is a larger pilot technically justified?

**Mechanically, yes.** The capture path did exactly what it was built to do: 11/11 games, one call each, 1 credit each,
8 books, 0 provider errors, 0 stale or after-tip prices, 0 offshore books, identity refusals confined to 3 named
players. The cost model is confirmed by the provider's own header on every call.

**Purpose of a larger pilot:** reach the §7 sample (≥ 500 priced points rows) for the forward comparison of v0.1 and
the v0.3 challenger against real lines and real results. Tonight yields ~138 graded points rows; ~4–5 comparable
nights reach 500.

**Proposal for the founder to decide (no spend):**

| Item | Proposed |
|---|---|
| Scope | `player_points` only, regular season, the 9 eligible-operators@1 keys |
| Window | 7 slates, 2026-10-22 → 2026-10-28 (54 scheduled games) |
| Cadence | one pre-tip snapshot per game (lead 20–75 min), as tonight |
| Cost | 1 credit per game → **54 credits expected**; proposed ceiling **60** (headroom for reschedules) |
| Floor | ODDS_API_MIN_CREDITS_REMAINING 2,000 (balance 18,173 now) |
| Receipt | one DATED receipt, expiry 2026-10-28 23:59 ET; same kill switch (`NBA_PROPS_PILOT=off`) |
| Still OFF | every public surface, products, gates, registry — unchanged |

**Before it runs (engineering, no spend):**
1. The append-only priced prop-grade ledger writer (§9).
2. Reviewed aliases for the 3 unresolved players (Herb Jones, Derrick Jones, Robert Williams), each verified by
   ESPN athlete id — never by surname.
3. A more reliable trigger than GitHub cron at 15-min granularity (two slots were skipped tonight): add 10-minute
   cron offsets or a dispatcher; the once-per-game and lead-window rules already make extra triggers safe.
4. The terms question settled (or price records kept out of the public repository).

A longer full-month pilot (10-22 → 11-20, 221 games, ~221 credits at one snapshot per game) is not needed to answer
the current question and should wait for the 7-slate read.
