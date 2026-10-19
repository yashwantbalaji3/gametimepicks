# NBA opening night — overnight engineering report (2026-10-19)

**Opening night is Tue 2026-10-20.** Schedule confirmed against ESPN's public scoreboard (season 2027, type 2, regular season):

| Game | ESPN id | Tip-off |
|---|---|---|
| BOS @ DET | `401909088` | 19:00Z (3:00 PM ET) |
| PHI @ NY | `401909089` | 23:00Z (7:00 PM ET) |
| OKC @ SA | `401909090` | 01:30Z on 10-21 (9:30 PM ET) |

**Governing boundary (unchanged):** `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`.
- NBA is `HISTORICAL_ONLY` in the capability registry, and tests keep it that way.
- No public NBA forecast, probability, pick or projection until each market's forward-shadow bars hold:
  - winner, margin and total: n ≥ 300 games;
  - points, rebounds and assists: 1,500 player-games;
  - 3PM: 800 player-games.
- On opening night every n is 0.
- Everything built overnight is private (internal research artifacts, internal preview routes, localhost dev routes) or public-neutral (workflow reliability). Nothing was made public.

## A. Executive summary

| Product | State on 10-20 | Change overnight |
|---|---|---|
| Schedule, `/nba` hub, finals | LIVE (public; schedule and finals only, "No public forecast — model in validation") | Unchanged; verified |
| Rosters (2026-27) | LIVE (private input): 30/30 teams, 539 players, 10-18 capture | **#1133 merged:** the forecast window re-captures the roster when it is over 30 h old, so opening night cannot hit `ROSTER_STALE` |
| Pre-tip forecasts v0 / v0.1 / v0.2 | LIVE (private shadow) | Unchanged |
| **v1 coherent engine** (`nba-sim-v1-coherent`) | READY FOR RELEASE (#1134), private candidate shadow | New. Fixes v0's structural failures; dev season 2024-25 below. Armed before the 11:00Z window so it shadows from game 1 |
| **Top 10 boards** (pts / reb / ast / 3PM) | TESTED, private (frozen pre-tip, graded, daily report); `/preview/nba/boards` internal preview | New. No market lines, so no edge or confidence; never padded to 10 |
| **NBA Simulation Theater** | IMPLEMENTED LOCALLY (dev route, localhost:4181) | New. Real v1 samples, quarter checkpoints only |
| **NBA live tracking** | IMPLEMENTED LOCALLY (adapter, not public) | New. Opening-night capture kit running outside Claude; it wakes at 18:45Z 10-20 |
| Finals publishing reliability | AT RISK overnight (cron-only 00–12Z) | NBA finals waiter built inert; activation is a founder decision |
| Parlay Lab, Bank Builder, Moonshot, Ask, Betslip | BLOCKED by design (registry) | Unchanged; needs bars plus an NBA odds authorization |

**What is not ready, and why:**
- **Public forecasts and boards:** blocked by the preregistration (n = 0). This is the honest state, not an engineering gap.
- **Market lines:** there is no NBA odds authorization; `nba-market-probe` is paid and manual.
- **Live player tracking (public):** needs the opening-night capture evidence first.
- **Possession-level simulation:** P2 research.

## B. Projections (private shadow — not published)

v1 dry run, built `--now 2026-10-19T05:40Z` from committed rosters and injuries. The window rebuilds these pre-tip on 10-20; these are illustrations of the pipeline, not the forecast of record.

| Game | v1 P(home) (Elo) | Median score | Total p10 / p50 / p90 | OT |
|---|---|---|---|---|
| BOS @ DET | 0.548 (0.596) | 106–107 | 191 / 213 / 236 | 2.9% |
| PHI @ NY | 0.740 (0.778) | 114–124 | 215 / 237 / 261 | 2.2% |
| OKC @ SA | 0.505 (0.547) | 118–118 | 212 / 235 / 259 | 2.7% |

Top 3 on the private board for each category (model median; v0.1 champion | v1 candidate):

| Category | v0.1 | v1 |
|---|---|---|
| Points | Gilgeous-Alexander 24.7 · Brunson 24.1 · Wembanyama 21.8 | Gilgeous-Alexander 28 · Brunson 24 · Wembanyama 20 |
| Rebounds | Towns 8.6 · Tatum 8.2 · Hartenstein 7.7 | Towns 9 · Wembanyama 9 · Duren 8 |
| Assists | Gilgeous-Alexander 7.6 · Cunningham 5.9 · Tatum 5.3 | Brunson 6 · Cunningham 6 · Gilgeous-Alexander 6 |
| 3PM | Prince 2.8 · D. Robinson 2.6 · George 2.5 | Tatum 2 · Brunson 2 · Pritchard 2 |

- **Source:** private forecast artifacts. Model versions are `nba-preseason-experimental-v0.1` and `nba-sim-v1-coherent`.
- **Validation status:** SHADOW, n = 0.
- **Board composition:** about 32 players eligible and about 72 withheld (injury designation, under 20 expected minutes, insufficient history, uncertain minutes, low play rate).
- **Known gap:** v1 medians are integers (every draw is an integer box score), so its 3PM board ties at 2. Ranking or display by mean for discrete stats is a follow-up.

## C. Simulation Theater (NBA)

- **Branch:** `claude/sim-theater-nba-prototype`, local only, renders the real v1 artifact (sha256 verified).
- **Local preview:** http://localhost:4181/dev/simulation-theater/nba/401909088/ (also …089, …090).
- **Components:**
  - court (NBA dimensions, SVG);
  - SIMULATED scoreboard;
  - quarter checkpoints, with interpolated score and clock labelled illustrative;
  - outcome selector (typical, close, high, low, upset — real draws, replayable by run index);
  - total-points histogram with this sample's percentile;
  - stat leaders with play rate;
  - halftime and final cards (dismissible; a compact sheet on phones);
  - playback controls (the shared NFL transport).
- **Not shown, because it is not modelled:** possessions, shots, player movement, ball, per-quarter player stats.
- **Tests:** 43 new, plus the 70 existing NFL theater tests, all passing. Every invariant has a mutation probe.
- **Screenshots:** 26 PNGs at 320 / 390 / 768 / 1440 px.
- **Gaps:**
  - team colours come from one unofficial source (UTA looks stale);
  - 170 of 870 team pairings use the clash stripe;
  - no e2e spec yet.

## D. Results and daily improvement

- **Capture and freeze:**
  - `nba-forecast-window` builds each family at one pre-tip instant (write-once receipts with input hashes) and freezes the Top Boards at that same instant.
  - `verify-nba-forecast-receipts --against HEAD` refuses any change to a committed forecast.
- **Grade:**
  - Shadow ledgers (v0, v0.1): Brier, log loss, MAE and coverage.
  - Board ledger: settlement statuses WIN, LOSS, PUSH, VOID, PENDING, UNGRADABLE. With no recorded line, every played row is UNGRADABLE for bets; projection error is still measured. DNP is VOID. A missing box score is PENDING, never a loss.
- **Daily report:** a private markdown/JSON report per date. No hit-rate claim is made below the preregistered sample minimums.
- **Improvement:** only by the preregistered bars on the forward shadow. New engines are new version strings (as v1 is); no retraining after single games; leakage rule: strictly before the forecast instant.

## E. Go / no-go for 10-20

| Item | Status |
|---|---|
| Schedule, finals, `/nba` hub | Ready for Production (already live) |
| Private forecasts v0 / v0.1 / v0.2 | Ready (live shadow) |
| v1 candidate shadow | Live in Production as a private shadow (#1134) |
| Private boards, ledger, daily report | Live in Production, private (#1135) |
| NBA Theater | Local implementation complete; not for Production |
| NBA live (public) | Needs the opening-night capture evidence |
| Public forecasts or boards | Requires a founder decision; blocked by the preregistration bars |
| Market lines, edges, NBA in parlay products | Blocked: missing dependency (NBA odds authorization) and bars |
| Finals waiter | Merged inert (#1135); requires founder approval to activate |
| Possession-level simulation | Not realistically achievable before tip-off |

## F. GitHub and Vercel

| PR | Merge commit | Head | CI | Production build |
|---|---|---|---|---|
| #1133 roster backstop | `877a687556` (05:49Z) | `1fec32aadd` | quality + python green | 0 (Vercel ignored it: workflow and test only) |
| #1134 v1 engine | `77d9430944` (06:22Z) | `29722959e1` | quality + python green | 1 (served 06:27Z) |
| #1135 boards, ledger, report, acceptance checker, finals waiter (inert) | `473a7bfa7a` (06:52Z) | `54f527b8aa` | quality + python green | 1 |

- **Two bugs found in review and fixed before #1134 merged:**
  - The window's `git add` with a not-yet-existing `experimental-v1/` would have staged nothing, dropping every family's forecasts. A real-git regression test now covers it, mutation-probed.
  - Sample minutes drifted to 239.98–240.02. They now use largest-remainder rounding, exact on 30/30 sides.
- **Paid API usage:** none. All NBA inputs are free ESPN endpoints.
- **Rollback:** each PR reverts cleanly. Committed private forecasts and boards stay as write-once history.
- **Cost comparison 10-19:** see `docs/cost/VERCEL_BUILDS_MEASURED_2026-10-18.md` §10.
  - #1088 saves about 8–9 builds a day.
  - #1101 cuts files per settle commit by 89%; builds are unchanged.
  - #1124 adds about 1–2 builds a day (flagged for a weekday re-measure).
  - Whole system: 55 → 66 builds a day on an NFL Sunday, while builds per commit fell 12%.
- **Branches not merged (local by design):**
  - `claude/sim-theater-nba-prototype`
  - `claude/nba-live-adapter`

## G. Recommended next 24 hours
1. Done: #1134 and #1135 are merged, so v1 and both boards freeze from game 1 (the first window is about 11:00Z 10-20).
2. Run `node app/scripts/nba/opening-night-acceptance.mjs` at about 12Z, 16Z, 19:30Z and 23:30Z on 10-20, and after the last final.
3. **Founder decision:** activate the NBA finals waiter for one night (10-20). Without it, the PHI @ NY and OKC @ SA finals can publish hours late.
4. **Founder decision:** v0.2 cold-start bug. 35 of 54 preseason forecasts have a 0 team score, and the same will hit each team's 2nd and 3rd regular-season games. Retire v0.2 in favour of v1, or fix it under a new version string.
5. **Founder decision:** whether any experimental public NBA display (clearly labelled, no probabilities) is wanted before the bars are met. Default: no.
6. After 10-21: review the live capture report, then decide on public NBA live scores.
