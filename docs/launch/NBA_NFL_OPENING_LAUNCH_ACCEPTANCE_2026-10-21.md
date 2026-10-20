# NBA + NFL Opening Launch — Acceptance Report

**State as of 2026-10-20 06:45Z (02:45 ET), before tonight's NBA slate.**
- Builder: the "GameTimePicks worktree isolation" session.
- Release owner: the "GameTimePicks launch readiness" session, the sole merger and deployer.
- Source: the founder directive `GameTimePicks_Overnight_NFL_NBA_Launch_Execution_Directive_2026-10-20.md`.
- Sections marked **PENDING (tonight)** are owned by the release owner and must be filled from Production evidence, not from this file.

> **Nothing from this sprint is publicly live yet.** No feature below has an external Production URL. Every result here is a local build, a draft PR or a local commit. Per §14, none of that counts as a launch.

## 1. Release scorecard

| Product | State | Where | Flag | Why |
|---|---|---|---|---|
| NFL Simulation Theater | **DRAFT READY** | #1140; local head `3fd94324d0` (PR head `57366ac0dd`) | `GTP_NFL_THEATER_PUBLIC` (OFF) | The release owner ruled the directive file is not sufficient for the standing "no Theater deployment" rule and asked the founder directly: "Merge #1140 with flag OFF?" There is no answer yet. |
| NFL projected box score | **DRAFT READY** | same branch | same flag | Team-level only: MODELED or DERIVED from the drive receipt. Player categories are NOT_MODELED; the drive engine has no player data and is not spliced with World Model V2. |
| NBA Simulation Theater | **PRIVATE SHADOW** (dev route only) | same branch, `/dev/simulation-theater/nba/*` | `NBA_THEATER_PUBLIC_ENABLED=false` + `GTP_NBA_THEATER_PUBLIC` | `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` keeps NBA `HISTORICAL_ONLY`, and every market is at n = 0 against the §6 minimums. The release owner ruled that a public preview needs an explicit founder amendment, recorded as a §12 look plus a registry change. The question has been put to the founder. |
| NBA projected box score | **PRIVATE SHADOW** | same | same | Same as above. The synthetic "demo" fallback was **declined** by both sessions as misleading on opening night. |
| NFL game boards (week 7) | **BLOCKED (data missing)** | — | — | No week-7 sim-v2 receipts, World Model V2 runs or weekly boards yet. The last markets capture is from 10-11 and covers rows through week 5. The release owner's producers own this. |
| NBA game/player boards (PTS/REB/AST/3PM) | **PRIVATE SHADOW / BLOCKED BY GOVERNANCE** | private research tree | `NBA_TOP_BOARD_PUBLIC_STATE="OFF"` | Same as the NBA Theater. Forecasts were due from 11:00Z via `nba-forecast-window` (release owner). |
| Bank Builder | **UNCHANGED** (public as before) | main | — | Cross-sport candidate schema is DRAFT READY on #1141. Under the real registry only MLB legs qualify today; NBA is always excluded. |
| Moonshot | **UNCHANGED** | main | — | Same as Bank Builder. |
| Parlay Lab V2 (four tiers) | **DRAFT READY** | #1141; local head `499a30d29f` (PR head `89f3ca2978`) | `NEXT_PUBLIC_PARLAY_LAB_V2` (OFF) | Stacked on #1130, which still needs the founder's exact-head approval. |
| Smart Betslip | **DRAFT READY** (compare-only) | #1141, `/dev/parlay-lab-fixture` (dev only) | same | Same as Parlay Lab V2. No operator handoff exists (SB-L2 is not started). |
| Live / Results | **UNCHANGED**; PENDING (tonight) | Production | — | The release owner runs the NBA capture and waiter trial. The finals-waiter variables were unset at 05:05Z. |

## 2. Proof of availability
- **No external Production URL exists for any sprint feature.**
- **Local evidence only** (`serve-export.mjs` on :4184 / :4183):
  - screenshots: `scratchpad/e2e/final-shots/{nfl-boxscore-1440, nfl-boxscore-sheet-390, nfl-final-sheet-390, nba-boxscore-1440, nba-boxscore-390}.png`
- **Export scans on a default build of `3fd94324d0`** (06:29Z):
  - NBA guard: "7656 exported files clean; no out/dev/".
  - NFL flag-OFF guard: "30 simulation pages clean", including the box-score markers.
  - An independent grep finds none of `nba-box-score@`, `data-nba-boxscore`, `PRIVATE CANDIDATE MODEL` or `nba-sim-v1-coherent` anywhere in the export.

## 3. Model truthfulness

**NFL box score.**
- Engine `nfl-drive-sim-v2`, using the receipt of record per event.
- **MODELED:** final score, points by quarter (OT column only when the run went to OT).
- **DERIVED:** TD/FG/safety/try composition, drives, plays, net yards, time of possession, punts, turnovers.
- **NOT_MODELED:** red-zone trips, first downs, the pass/rush split, sacks, and all player sections.
- Invariants pass on **895/895 runs across 179 receipts** (215 OT). Eleven mutation cases each throw.

**NBA box score.**
- Engine `nba-sim-v1-coherent` / `nba-sim-v1-profile-1`, inputs as of 2026-10-19T17:00Z, for 3 games × 5 representative runs.
- Columns are MIN, PTS, REB, AST, 3PM, 3PA, 2PM, FTM, all MODELED. FGA, OREB/DREB, STL, BLK, TOV, PF and ± are listed as not modeled, never derived.
- All 15 samples pass:
  - team minutes exactly 240, or 265 for the 3 OT runs
  - Σ player points = team score = Σ quarters
  - 3PM ≤ 3PA
- 55 DNP rows render as DNP, not 0.

**Pre-tip freeze, grading and valid/void counts:** PENDING (tonight), owned by the release owner. The NBA private shadow is graded nightly by #1137.

## 4. Testing

**#1140 local `3fd94324d0`:**
- Serial e2e against a flag-ON + dev-routes build of the exact tree (build `e2efix3`, 06:20Z):

  | Suite | Passed | Failed | Skipped |
  |---|---|---|---|
  | NFL dev | 47 | 0 | 6 (public-only) |
  | NFL public | 52 | 0 | 1 (dev-only zoomCap) |
  | NBA dev | 7 | 0 | 0 |

- Unit tests: 165 pass, 2 skipped (post-build only). Typecheck clean.
- **Real defects the e2e caught and fixed:**
  - Sticky score bar broken by `overflow-x-hidden`.
  - Sheets and dialogs drawn under the site's bottom nav.
  - Escape that closed the box score also dismissed the card behind it.
  - The FINAL sheet grew to 196–207 px; it is now 148 px.
  - Tabular numerals lost.
  - Sticky table head offset.

**#1141 local `499a30d29f`:**
- 608 Parlay, slip, Bank Builder and Moonshot unit tests pass. Typecheck clean.
- Default build post-build: no new failures; no `out/dev/`; no offshore book names under `/build`.
- Smart Betslip e2e: **13/13** at 320/390/768/1440 on a flag-ON build. It covers add, remove, reorder, snapshot invalidation, same-game withholding, 7 h expiry, the no-qualified state, no outbound links and the disabled handoff.

**Known red checks (owner: release owner):**
- Both branches predate #1139, so their default post-build shows the 2 NFL-hub slate failures that #1139 fixed.
- The PR CI runs for #1140 and #1141 failed on `ENOBUFS`, which main fixed (`append-release-history.mjs:54`, 256 MB maxBuffer).
- Both PRs need main merged in and fresh exact-head CI.

## 5. Profit/risk integrity
- **Four tiers on today's real data:** all `NO_QUALIFYING_PARLAY`.
  - Only 1 MLB game is priced.
  - The EPL legs are not cleared and have no book or capture time.
  - The allowlist is not connected until #1130.
- **Model joint probability is withheld** ("No validated correlation model"). Only the market-implied probability from recorded prices is shown.
- **Correlation caps:** PROPOSED and off (`CROSS_SPORT_CORRELATION_CAPS_ENABLED=false`).
- **Reduced-win payout defect:** fixed forward-only (`lib/parlays/settlement.mjs`). All 141 published cards rebuild byte-identical, and the receipt classifier refuses any payout rewrite.
  - Historical discrepancy: **7 MLB cards, 16.70 units overstated**. Win/loss is unaffected.
  - If restated: MLB ROI −10.6% → −26.0%; Longshot +11.6% → −4.8%.
  - **Not restated**; this is a founder decision.

## 6. Capture and settlement
- **Read-only snapshot (05:05Z):**
  - The capture, waiter-trial and :4181 processes are running detached (ppid 1).
  - `NBA_FINALS_WAITER_*` variables are unset.
  - `nba-results-refresh` and `nba-forecast-window` succeeded.
- **Tonight's tips:** BOS@DET 19:00Z, PHI@NYK 23:00Z, OKC@SA 01:30Z (10-21).
- **Per-game final latency and receipts:** PENDING (tonight), release owner.

## 7. Cost
- **Vercel deployments triggered by this session: 0.**
  - The pushed sprint heads (#1140–#1143) show 0 deployments and no Vercel status.
  - The #1142 merge `3ad1e660e8` was "Canceled by Ignored Build Step" (0 deployments).
- **Local builds:** 15 serialized builds under the shared lock, 138–214 s each. All of them ran before 18:30Z.
- **Spend:** no paid API calls. No billed CPU figures, because there is no Vercel token; the founder's 10-19 snapshot ($85.05 on-demand) is the only billed number.

## 8. Changed artifacts

**Push queue.** Nothing below is pushed: this session's pushes are blocked by the auto-mode classifier, and the founder must run them.

| Branch | Local head | Remote/PR head | PR |
|---|---|---|---|
| `claude/gtp-theater-integrate-20261019` | `3fd94324d0` | `57366ac0dd` | #1140 (draft) |
| `claude/gtp-parlay-smartbetslip-20261019` | `499a30d29f` | `89f3ca2978` | #1141 (draft) |
| `claude/gtp-nfl-boxscore-20261020` / `claude/gtp-nba-boxscore-20261020` | `9d0a927151` / `b96117e8d5` | not pushed | already folded into the theater branch; no PR needed |

- **Merged tonight by the release owner:** #1142 (cost audit, docs and tests).
- **Closed:** #1143 (superseded by #1116).
- **Production deployment SHA and time:** PENDING (release owner).

## 9. Outstanding non-waivable decisions (founder)
1. **"Merge #1140 with flag OFF?"**, then a separate go to switch `GTP_NFL_THEATER_PUBLIC` ON. Asked in the release owner's session.
2. **An NBA public-preview amendment** under V18 §12 (registry change and its own scorecard), or keep NBA private. Asked in the release owner's session.
3. **#1130 exact-head approval**, which unblocks #1141.
4. **Restate the 7 reduced-win cards**, or keep them with the note.
5. **Correlation caps** on or off, and their values.
6. **An inline 18+ / state notice** in the Lab (`minimumAge` is 18).

## 10. Next 24–72 h
- **Release owner, tonight:**
  - Keep the opening-night capture, waiter and finals untouched by builders.
  - Freeze NBA private forecasts before each tip.
  - Grade after official stats.
- **On founder yes to #1140:**
  - Merge main into the branch, then run exact-head CI.
  - Merge with the flag OFF, before 18:30Z or after 05:00Z.
  - Verify Production has no Theater artifacts.
  - Switch the flag ON only on a second go.
  - External smoke test; roll back via the flag.
- **NFL week 7:** the Theater replays only events with a receipt of record. TNF NE@CHI (10-23 00:15Z) needs `nfl-sim-v2-shadow` to produce a receipt first.
- **#1141:** after #1130, merge main, run CI, then a release. The flag stays OFF until founder sign-off on items 4–6.
- **NBA:** forward-only nightly grading continues under V18. No recalibration without a new version and preregistered acceptance.
