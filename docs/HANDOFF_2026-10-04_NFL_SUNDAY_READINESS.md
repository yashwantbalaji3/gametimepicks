# Handoff: 2026-10-04 — NFL Sunday readiness (Session 11)

Point-in-time; the repo and Production are current truth. Process: one code PR at a time; merge `main`, never
rebase; exact-head CI; merge; verify on `main` and Production before the next. Founder authorized in session
(~14:18Z): agent merges of exact-head-green PRs in this scope, and ONE standard NFL pre-kickoff capture under
the existing authorization.

## 1. State

| | |
|---|---|
| Session start main | `2c8ee64c9c` (Production `8a4271a1`) |
| PRs merged | **#946** public-board availability gate + NBA page-weight fix · merged 2026-10-04T14:19:07Z · `1c5b57436b` · **#947** rush-pool conservation `nfl-share-conservation-v1` · 14:41:05Z · `330844596f` · **#948** `/nfl` carries the reconciliation statement + practice-squad moves accounted in the coverage receipt (unblocked main's LIVE integrity test on today's data: Lil'Jordan Humphrey, DEN, moved to the PS) · 15:33:12Z · `9eea168817` |
| Main after rebuild + capture | `fb30463783` (`auto: nfl settlement receipts` after the 15:02:50Z event window `137f407f20`) |
| Production | `9eea168817`, built 15:34:22Z — contains #946, #947, #948, the 14:42Z rebuild and the 15:02Z capture |
| Long-term HOLD | #716 (untouched) |

### 1a. Final SHAs
**FINAL MAIN SHA `9eea168817`** (#948 merge; this docs PR merges on top) · **FINAL PRODUCTION SHA `9eea168817`** (`/data/build-info.json`, built 2026-10-04T15:34:22Z).

Merge note: #947's exact head (`19c796a075`) was refreshed against main at 14:19Z; main then gained one bot
commit (`c6687e1676`, `[skip ci]` Ligue 1 forecast data, no shared file). Merged on the green exact head rather
than restart a 20-minute CI ahead of the 15:00Z capture window. #946 and #948 were merged under the same condition (only `[skip ci]` bot data commits after the refresh).

## 2. Overnight Oct-3 closeout — CLOSED

| | |
|---|---|
| MLB games final | **4 / 4** (StatsAPI): CWS 3 @ CLE 0 · ATL 3 @ LAD 5 · NYY 0 @ TB 1 · SD 2 @ MIL 3 |
| Settlement | scheduled `nightly-settle` (11:05Z, 12:51Z, 13:53Z, 14:57Z); no manual action |
| Official receipts (canonical, Production `/results/date/2026-10-03/`) | BB lane A step 1 **Won** (LAD ML ✓ 3-5, MIL ML ✓) · BB lane B step 3 **Lost** (CLE ML ✗ 3-0; Under 7 ✓) · MS lane A step 1 **Lost** (Over 7 ✗ total 3) · MS lane B step 2 **Lost** (NYY +1.5 ✓ 0-1, SD ML ✗) |
| Pending | 0 |
| Mr. Dub (`npm run money:audit`) | **$15,090.40** · peak $20,465.40 (06-24 crown) · **−$5,375.00** · open exposure **$0** · folded through **10-03** · 131 movements · ✓ RECONCILED |
| Oct-3 movements | BB-A $0 (rung advanced) · BB-B −$100 seed · MS-A −$25 · MS-B −$25 → **−$150** |
| C1 | **0 banked** — no ladder completed; C1 unchanged |
| MLB frozen pregame (#943) | **PROVEN at runtime** on the one game that started after deploy: SD @ MIL kept `frozenPregame` (forecast 23:58:50Z) through later refreshes. CWS@CLE, ATL@LAD, NYY@TB started before the fix → `unavailable` (restoration remains a founder decision) |
| UFC 332 | **14 / 14** final (ESPN); public lane graded by scheduled `ufc-post-card` (`dfd3879e73`). No official UFC product exists — nothing settled or created |

## 3. NFL public availability gate (#946)

Defect: weekly boards ranked **Zay Flowers (BAL, Questionable — hamstring, stated 10-02T20:16Z; unchanged at
source on 10-04)** #2 Receiving / #7 Receptions; the one ranking rule excluded only `INACTIVE` (12 rankable
QUESTIONABLE rows incl. 3 Doubtful).

Fix: `PUBLIC_BOARD_CLEARED` allowlist (`AVAILABLE_ROLE_UNCERTAIN`, `ACTIVE_PROJECTED`) in
`app/src/lib/sports/nfl/board-ranking.mjs`; blocks QUESTIONABLE/DOUBTFUL/INACTIVE (Out, IR, suspension)/practice
squad/missing/unknown; missing, stale (> 24 h or not FRESH) or conflicting availability fails closed; applied
inside `rankFamily` BEFORE ranking; removals named (`excludedForAvailability`). Covers all five families (weekly +
frozen daily Top-5), game-page top lists, per-game default view (questionable/out behind the toggle), End Zone
Vault. Availability ≠ ROLE_CONFIRMED ≠ product eligibility (unchanged). 11 mutation probes caught.

**Zay Flowers now:** canonical status Questionable → **excluded** from ATD, Receptions and Receiving
(`excludedForAvailability` reason QUESTIONABLE); 0 prop rows priced for him in the 15:02Z capture.

Also in #946: `/nba` exceeded its 200 KB budget on the calendar (10-day window, ~4 KB/game) → compact row at the
render owner. Production `/nba` **130 KB** (was 222 KB).

## 4. Opportunity conservation (#947)

Semantics: a share-level `share` is the player's decayed fraction of team rush attempts; expected carries =
share × team carries → one finite budget per team. Over-allocation came from conditional-on-playing shares
(players returning with full prior shares; prior-club usage), not identity/roster duplication.

Rule `nfl-share-conservation-v1` (forward-only, versioned): per team pool over CLEARED players (availability
first) — S ≤ 1 + EPS untouched (OTHER = 1 − S kept); S > 1 + EPS → × 1/S. Mean exact; quantiles rescaled by the
same factor (approximation, stated per pool). Unjoinable/NaN/negative ⇒ still withheld. `auditBoard` re-derives
every reconciliation. Freezer refuses a family with a withheld team pool. 12 mutation probes caught (a first
zsh pass was vacuous — `$T` not word-split — rerun under bash).

Audit on current main, 14 unstarted games: **failing before 16 · reconciled 16 · failing after 0** (28 carries
pools evaluated, 0 > 1 in the published boards). Largest deltas: Love (ARI) 47.8→25.6 · Conner (ARI) 35.2→18.9 ·
Jacobs (GB) 43.6→28.4 · Javonte Williams (DAL) 54.9→42.4 · Aaron Jones Sr. (MIN) 55.8→43.7 · Benson (ARI)
24.0→12.9. Passing pools all ≤ 1 (QB1 rule); receiving/receptions from the allocating v1 engine; ATD not a pool.

## 5. Board rebuilds (started games never touched)

| Run | What | Result |
|---|---|---|
| `37210188558` (14:41Z, `workflow_dispatch`, `skip_odds=true`, zero credit) | free rebuild after #946 + #947 | commit `cd888e58c7` (14:42:21Z): 14 boards; IND @ WSH (13:30Z) board + the frozen 10-04 Top-5 byte-identical (git diff empty) |
| `37211371349` → `37211437205` (15:00Z, owner `nfl-kickoff-refresh`, decider DISPATCH) | the authorized pre-kickoff capture + chain | commit `137f407f20` (15:02:50Z): rosters 32/32, injuries, role evidence, boards, prices |

## 6. NFL five-family boards (Production, 15:02:50Z generation)

| Family | Status | Top rows (median / probability) | Blocked rows |
|---|---|---|---|
| PASSING YARDS | **GO (ESTIMATE label, unchanged)** | Purdy 251 · Stafford 250 · Goff 245 · L. Jackson 240 · Mahomes 239 · Shough 238 · Allen 237 · Young 233 · Burrow 231 · Keenum 230 | 0 |
| RUSHING YARDS | **GO** (16 pools reconciled) | K. Walker III 83 · J. Cook III 79 · B. Robinson 75 · Gibbs 75 · Henry 72 · C. Brown 60 · Pollard 57 · Swift 55 · K. Williams 55 · Irving 54 | 0 |
| RECEIVING YARDS | **GO** | Smith-Njigba 87 · London 71 · Olave 65 · Nacua 62 · P. Washington 62 · Lamb 61 · St. Brown 60 · Bowers 57 · Adams 56 · G. Wilson 54 | 0 (Zay excluded) |
| RECEPTIONS | **GO** | Smith-Njigba 7 · St. Brown 6 · Olave 6 · Bowers / McBride / London / Nacua / P. Washington / G. Wilson / Chase 5 | 0 (Zay excluded) |
| ANYTIME TD | **GO** (public board; product gate unchanged) | Henry .789 · Gibbs .771 · Smith-Njigba .673 · McCaffrey .647 · J. Cook III .647 | 0 |

Full scan of the 45 public weekly rows: QUESTIONABLE 0 · DOUBTFUL 0 · OUT 0 · INACTIVE 0 · practice squad 0 ·
unknown 0 · stale availability 0 · prices not from the 15:02Z capture 0 · NaN/undefined 0. Healthy players
removed: 0. Per-game availability read: injuries + rosters FRESH at 15:02:50Z.

Passing validation: exactly one passer per team (QB1 rule APPLIED on 11 teams). CHI → Case Keenum (Caleb Williams
**Out**). **TB has no passing row**: Baker Mayfield designated **Out at 12:41Z today**, caught by the 15:02Z
injuries capture; the backup has no share-level row, so nothing is projected rather than something invented.

ATD: ordered by the GTP ATD model probability; forward n 524/1,000, level 1.18, ECE 0.043 — still GATED for
products; no bar or grant changed.

## 7. NFL odds — ≤ 12 h capture OBTAINED (one authorized capture)

| | |
|---|---|
| Why it was late | 0 `nfl-kickoff-refresh` runs 00:22Z→15:00Z: every Sunday `*/30 9-22` slot dropped by GitHub; `publication-watchdog` dropped since 00:22Z; the 13:00Z `nfl-event-window` sweep dropped; `daily-products` ran but sits 4 deep in a `workflow_run` chain (nightly-settle → morning-projections → mlb-daily-production → daily-products) — GitHub does not fire `workflow_run` past 3 levels |
| Dispatch | 15:00:07Z decider `DISPATCH · STALE_BEFORE_KICKOFF` (8 events at T-120) → `nfl-kickoff-refresh` dispatched (`dry_run=false`) → owner dispatched `nfl-event-window` (`probe_props=all`, `week_window=true` — the owner's normal scope) |
| Capture | `capture-20261004T1502` · The Odds API · **capturedAt 2026-10-04T15:02:50Z** · **844 prop rows** · **14 events** · 5 families (ATD 385, receptions 174, receiving yds 174, rush yds 83, pass yds 28) · DraftKings 826 / FanDuel 7 / BetOnline 5 / BetMGM 3 / Fanatics 2 / BetRivers 1 · props PROBED, absent none |
| Credits | **73** this run · ledger **787 / 1,160** · **373 remaining** (re-read before dispatch: 714 / 446) |
| Freshness | 1 PM (17:00Z) **2.0 h** ✓ · 4 PM (20:05Z / 20:25Z) **5.0 / 5.4 h** ✓ · SNF (00:20Z) **9.3 h** ✓ · MNF (Oct 6 00:15Z) 33.2 h ✗ — MNF rows ride along inside the owner's week-window scope; no separate Monday spend; MNF needs its own refresh Monday |
| Not done | no stale reuse, no threshold change, no −110, no consensus fabrication, no post-kickoff price, no second spend |

## 8. Product Engine V2 (read-only, 15:05Z, not written)

NFL **826 candidates · 0 eligible · 0 MARKET_IMPLIED-eligible**; MODEL-backed: 265 ATD rows carry a GTP
probability, all SPORT_GATED. Exclusions (all sports, NFL-dominated): SPORT_GATED 826 · ROLE_UNCERTAIN 716 ·
NO_PROBABILITY 535 · MARKET_MISSING 206 · ODDS_OUT_OF_RANGE 107 · AVAILABILITY_BLOCKED 96 · FAMILY_NOT_CLEARED
79 · MODEL_DEMOTED 64 · EVENT_STARTED 45 · MODEL_NOT_PUBLIC 26 · **ODDS_STALE 23** (was 552 at 06:15Z; the
remainder is MNF). MLB: 12 eligible market-implied team legs. No gate loosened.

## 9. T-55 / healthy scratches — RESIDUAL RISK

The authorized chain captures injuries inside the event window before role evidence and boards — the 15:02Z run
carried every designation published by then (it caught Mayfield's 12:41Z Out). Official inactives are declared
~T-90 (≈15:30Z for 17:00Z games, ≈18:35Z for 4 PM, ≈22:50Z for SNF), AFTER this run, and no Sunday free T-55
pass exists (`nfl-pregame-free-refresh` is Thursday/Monday only; not added — its event-window dispatch would share
`gtp-generated-artifacts` with the paid capture). Questionable/Doubtful are already excluded; a healthy scratch
can still appear on a board until the next event-window run.

## 10. Production acceptance (`fb30463783`; #948 re-checked on `9eea168817`)

390 px and 1280 px (iframes at exact width) on `/nfl`, `/nfl/game/401872973` (TEN@BAL), `/nfl/game/401872978`
(DET@CAR), `/today`, `/build`, `/ask`, `/results`: **0 horizontal overflow · 0 NaN/undefined/[object Object] · 0
console errors**. Rendered `/nfl`: all five weekly boards, Rushing Top 10 published, no Zay Flowers, no
Questionable/Doubtful row, prices "Captured Sun 11:02 AM ET", no Rushing-withheld copy. Game pages for TEN@BAL,
NE@BUF, LAR@PHI, DEN@SF, DET@CAR: 200, clean. `/results/date/2026-10-03` matches §2 leg by leg. On `9eea168817` the Rushing Top 10 renders "On 16 teams the players' modelled shares added up to more than the team's opportunity, so they were scaled down proportionally to fit before ranking." (the boards mount on scroll — `DeferUntilVisible`; measure after a real scroll).

## 11. Sunday status

PASSING YARDS GO (ESTIMATE) · RUSHING YARDS GO · RECEIVING YARDS GO · RECEPTIONS GO · ANYTIME TD GO (public
board; product-gated) → **SUNDAY STATUS: CONDITIONAL GO** for the 1 PM / 4 PM / SNF blocks — conditions: the
§9 healthy-scratch risk and the §12 items. The London game (IND @ WSH, 13:30Z) started on Saturday's boards and
20.6-h prices and was not touched.

## 12. Known risks / post-Sunday

- **P1** Kickoff-refresh triggers: Sunday crons dropped wholesale; `daily-products` is beyond the `workflow_run` depth limit — needs a trigger GitHub delivers.
- **P1** No append-only withdrawal mechanism for a frozen Top-5 row whose player becomes unavailable (the frozen 10-04 Top-5 lists Zay Flowers; bytes preserved; settles VOID if he does not play).
- **P1** Sunday T-55 inactives pass (§9).
- Conservation quantiles rescaled by the mean's factor (approximation); ARI/GB shifts large because players with no 2026 games keep full prior shares.
- Weekly board `scope` says FULL_WEEK after IND @ WSH started (the started game drops out of `forecasts/latest.json`, so the builder never counts it as dropped) — label only.
- Game-page footnote "questionable players carry their state above" is outdated (they are behind the toggle by default).
- `/nfl` hub hand-copies weekly-board fields (a second, invisible schema — #948 fixed the `conservation` drop; the pattern remains).
- Local suite: 15 built-export tests read a stale local `out/`.

## 13. What was NOT changed

Model methodology beyond the founder-authorized conservation, calibration bars, ATD forward target/ECE/grant,
family grants, ranking metrics, stake/risk policy, C1, frozen forecasts, the frozen 10-04 Top-5, settled rows, the
forward forecast, started-game boards, odds authorization, Supabase, NBA/soccer models.

## 14. Next post-Sunday session

1. Fix the kickoff-refresh trigger (§12 P1). 2. MNF capture Monday via the owner. 3. Week-4 ATD forward receipt
after MNF (report, do not promote). 4. Frozen-receipt withdrawal design. 5. Sunday T-55 design without competing
writers.
