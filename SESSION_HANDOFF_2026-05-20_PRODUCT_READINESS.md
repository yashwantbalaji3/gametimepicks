# SESSION HANDOFF · 2026-05-20 · PRODUCT READINESS

> **Audience:** the next Claude Code session.
> **Working directory:** `~/Downloads/gametimepicks`.
> **Date written:** Wednesday, May 20, 2026, late afternoon ET.
> **Status:** mid-session. A consolidated branch is live with PR #66 + PR #67 cherry-picked. Paid market-line wiring + hit-rate sparkline + new PR are NOT yet done. The user explicitly authorized a **one-time floor of 240** for paid runs this session (60 credits available; balance currently 300, used 200).

This file is exhaustive on purpose. **§9 (current active work)** and **§15 (resume instructions)** are the fastest path to picking up where the prior session left off.

---

## 1. Executive summary

### What GameTimePicks is

GameTimePicks is an educational sports player-prop analytics web app. It compares model projections to real sportsbook lines and publishes a public audit of every settled lean — wins, losses, pushes, edge, confidence. Next.js 14 static-export site, deployed to Vercel; backed by a Python pipeline that fetches schedules + odds, runs a projection model, and grades the model after settlement.

The site is intentionally:
- **Educational, not betting advice.** Every public surface carries that disclaimer.
- **Honest about sample size.** A 60-pick claim never looks like a 1000-pick claim.
- **Transparent about its math.** Pushes excluded, pending excluded, parlay hit rate refused until candidate slips are persisted before games.

### Product vision

A polished sportsbook/casino-style "command center" where casual users can immediately see today's games, market context, model projections, build candidate parlays, and review honest performance. The eventual model goal is 80%+ accuracy, but the site **must never claim that** — it shows only what real settled results support.

### Current production status

- Live URL: `https://gametimepicks.yashwantbalaji.com` (200)
- main HEAD: `96403fea09370c1b64dadf8c6a020b386c901ef2` (`96403fe`) — this is PR #65's squash
- Most recent paid-pipeline result: PR #64 generated May 20 NBA board (86 leans for SA @ OKC, 6 credits spent)
- May 21 NBA board exists and has 71 usable leans (CLE @ NY ECF G2) — `attach_recent10` was run during PR #65's session
- May 20 MLB board exists as a 15-game **shell only** — props NOT fetched (lines pending)
- Nightly automation (PR #60) **is operating correctly** — the morning-projections workflow refused today's run because the credit guard blocked at the 300 floor

### Current user goals (latest message)

1. **Tonight's MLB projections live** — currently blocked by credit floor.
2. **Real moneyline/spread/total visible** — none on disk yet.
3. **Team view should be useful** — currently withheld for May 20 (attribution bug) and could be misleading for May 21 (no market reference).
4. **Sport tabs should be today-first** — verified mostly OK after PR #63 + #66.
5. **Polished casino/sportsbook product feel** — incremental, no big redesign.
6. **Hit-rate trend charts** — not yet built.
7. **Single mergeable PR** that combines #66 + #67 + new work; close the others.

### Current highest priorities

1. Finish the consolidated PR on the active branch `feature/product-readiness-combined`.
2. Decide what to do with the 60-credit budget (the user authorized a one-time floor of 240).
3. Add the NBA game-markets fetcher + persistence + UI display.
4. Add hit-rate sparkline on `/results`.
5. Open one PR that supersedes #66 + #67.

---

## 2. Full production timeline / PR history

| PR | Squash SHA | Title | Branch | Status |
|---|---|---|---|---|
| #55 | `054de7d` | feat(ui): NBA projection-card 3-tile LINE/PROJECTION/EDGE hero | merged | merged |
| #56 | `5753f75` | feat(ui): homepage + Parlay Lab casino redesign | merged | merged |
| #57 | `1fe0552` | fix(active-slate): MLB defaults to today, not pre-generated future date | merged | merged |
| #58 | `75311eb` | data: generate May 18 NBA + MLB projection boards | merged | merged |
| #59 | `f317e91` | results: settle May 18 + Results UX upgrade | merged | merged |
| #60 | `eba9564` | ci: automate nightly settlement + morning projection refresh | merged | merged |
| #61 | `3c6f001` | feat(results): honest model audit notes + settled-state banner | merged | merged |
| #62 | `9c0b073` | feat(audit): model audit framework + `/results/model-audit` + May 19 settled | merged | merged |
| #63 | `81d08c9` | feat(ui): rebuild casino command center + projection navigation | merged | merged |
| #64 | `3d3d536` | data: generate May 20 NBA projection board (86 leans, 6 credits) | merged | merged |
| #65 | `96403fe` | feat(nba): playoff-context layer + team-game projection view | **merged · current main** |
| **#66** | (open) | feat(product): polish matchup experience, badges, parlay lab, language | branch `feature/product-polish-team-view-parlay-power` HEAD `5e534cef` | **OPEN — to be superseded** |
| **#67** | (open) | fix(nba): show real playoff context + withhold team projection without market line | branch `feature/fix-game-context-market-lines-trends` HEAD `42a53b5` | **OPEN — to be superseded** |
| **(active)** | (none yet) | feat(product): combined polish + market lines + trends | branch `feature/product-readiness-combined` HEAD `c8955467` | **active branch, not yet pushed / no PR opened** |

### Per-PR detail notes

**PR #60 — automation (still in production):**
- `.github/workflows/nightly-settle.yml` cron `0 7 * * *` UTC = 3 AM EDT
- `.github/workflows/morning-projections.yml` cron `30 13 * * *` UTC = 9:30 AM EDT
- Credit guard: max 75/run, floor 300
- Last successful nightly-settle: 2026-05-20T10:15:40Z (commit `6f9c484`)
- Last morning-projections run: 2026-05-20T16:33Z — **refused at floor** (balance was 306, projected 243 < 300 → STOP)

**PR #62 — model audit framework:**
- `pipeline/model_audit.py` (777 lines) + 68 assertions
- `pipeline/game_context.py` (133 lines) + 19 assertions
- `app/public/data/audit/model_audit.json` artifact
- `/results/model-audit` deep-dive page
- Settled May 19 NBA via ESPN summary path (gameId `401873341` → 50-98 on 148 · 33.8%)

**PR #63 — casino command center UI:**
- 6 shared components: `StatusPill`, `SportOverviewHero`, `BoardDateRail`, `QuickActionRail`, `HomepageCommandHero`, `SectionHeader`
- Cinematic CSS primitives in `globals.css`: `gtp-cinematic-bg`, `gtp-premium-tile`, `gtp-btn-primary`, `gtp-text-gradient-gold`, `gtp-hero-halo`, `gtp-neon-rule`, `gtp-stat-tile`, `gtp-cinematic-rise`, `gtp-status-live-glow`
- Homepage compressed 1427 → 506 lines
- All animations gated on `prefers-reduced-motion`

**PR #64 — May 20 NBA generation:**
- 86 leans for SA @ OKC (gameId `401873198`, WCF Game 2)
- Confidence: 39 High / 13 Medium / 34 Low / 16 R5-anomaly-capped
- Spent 6 credits (also produced a 71-lean shell for May 21)
- Balance went 306 → 300

**PR #65 — playoff context + team view:**
- `pipeline/playoff_context.py` + override file `pipeline/overrides/playoff_series.json`
- `pipeline/team_projection.py` + tests (50→65 assertions across iterations)
- `app/src/components/team-game-projection-card.tsx`
- `app/src/lib/data-team-projection.ts`
- Surfaced May 20 team view with `dataQualityFlag=team_attribution_partial` because SAS players have empty `team` field in players.json

**PR #66 (OPEN, to be superseded by active branch):**
- `app/src/components/team-badge.tsx` — color-coded team monograms
- `pipeline/team_rosters.py` + 38-assertion test — static roster fallback for SA/OKC/CLE/NY
- `pipeline/team_projection.py` — extended with `derive_public_display_mode()` returning `"full"` or `"withheld"`; static-roster rescue; `dataQualityFlag` field; tests now 73/73
- Language polish: "Audit" → "Results" in nav + QuickActionRail
- Parlay Lab slip count: 3 → 6
- Regenerated May 20 + May 21 team_projection artifacts (May 20 now shows OKC 101 / SA 117 / SA favored by 16.1 — which the user flagged as unrealistic)

**PR #67 (OPEN, to be superseded by active branch):**
- `app/src/lib/playoff-series-overrides.ts` — static TS mirror of `pipeline/overrides/playoff_series.json` (had to inline data because `node:fs` breaks client-component bundle)
- `app/src/components/playoff-context.ts` — adds ESPN-gameId fallback via override lookup → fixes the "regular season" bug for May 20 SA @ OKC (gameId `401873198` is 9 digits, doesn't match the 10-digit NBA-stats regex)
- `app/src/components/team-game-projection-card.tsx` — adds `noMarketLine = marketSpread === null` withhold trigger; new withheld reason "Team view pending market line"

**Active branch `feature/product-readiness-combined`:**
- Cherry-picked PR #67 → commit `45c8961`
- Cherry-picked PR #66 → commit `c895546` (auto-merge resolved cleanly on `team-game-projection-card.tsx`)
- HEAD is `c895467b3da92e26eec3d55cde3e556cf71134f`
- 73/73 team_projection tests pass · 38/38 team_rosters tests pass · `tsc --noEmit` clean
- **Not yet pushed to remote · no PR opened**
- Still to do: market-line fetcher + paid run + UI display + hit-rate sparkline + full test sweep + push + open PR

---

## 3. Current repo state

```
current branch  : feature/product-readiness-combined
current HEAD    : c8955467b3da92e26eec3d55cde3e556cf71134f
main SHA        : 96403fea09370c1b64dadf8c6a020b386c901ef2 (== PR #65 squash)
origin/main SHA : 96403fea09370c1b64dadf8c6a020b386c901ef2
git status      : clean — no uncommitted changes
production deploy URL : https://gametimepicks.yashwantbalaji.com (200)
canonical Vercel project: gametime-picks (yashwantbalaji33-7164s-projects)
duplicate project: gametimepicks (operator-side cleanup pending per old handoff)
```

### Open PRs

| # | Branch | HEAD | Title | Recommendation |
|---|---|---|---|---|
| 66 | `feature/product-polish-team-view-parlay-power` | `5e534cef` | feat(product): polish matchup … badges, parlay lab, language | **Close on merge of combined PR** |
| 67 | `feature/fix-game-context-market-lines-trends` | `42a53b5` | fix(nba): show real playoff context + market-line gate | **Close on merge of combined PR** |
| 5 | `fix/dry-run-clobber-guard` | legacy | dry-run clobber guard | Pre-existing legacy, leave alone |
| 4 | `fix/public-status-leaks` | legacy | public status leaks | Pre-existing legacy, leave alone |
| 2 | `fix/auto-refresh-yaml` | legacy | YAML syntax fix | Pre-existing legacy, leave alone |
| 1 | `fix/hide-admin-status-on-board` | legacy | hide admin operator status | Pre-existing legacy, leave alone |

### Closed/superseded by current work

- PR #66 + #67 will be superseded the moment the new combined PR opens — recommend the operator closes them manually after the combined PR merges (gh closes branches via `gh pr close --delete-branch`).

---

## 4. Current live data state

### NBA May 20 (SA @ OKC · WCF Game 2)

- Board: `app/public/data/boards/2026-05-20.json`
- Game ID: `401873198` (9-digit ESPN format)
- Tipoff: 8:30 PM ET
- Usable leans: **86** (Over/Under)
- Confidence breakdown: **39 High · 13 Medium · 34 Low**
- R5-anomaly-capped: **16** (Wembanyama PTS Over 25.5 → proj 31.14 / +26.08pp; Keldon Johnson PTS / Hartenstein REB / Castle AST etc.)
- `attach_recent10`: 100% match (15/15 players)
- **Team-attribution bug:** all SAS-side leans have `team=""` and `homeAway="Home"` (the pipeline default when name→team lookup fails). PR #66's `pipeline/team_rosters.py` static map rescues this on the active branch.
- Team projection artifact: `app/public/data/nba/team_projections/2026-05-20.json` — currently shows OKC 218.2 / SA 0.0 (pre-rescue) on main; the active branch's regenerated artifact would show OKC 101.0 / SA 117.2 with `publicDisplayMode=full`.
- Market lines (h2h/spreads/totals): **NONE on disk** — only player_props markets are fetched today.

### NBA May 21 (CLE @ NY · ECF Game 2)

- Board: `app/public/data/boards/2026-05-21.json`
- Game ID: `401873342` (9-digit ESPN format)
- Tipoff: 8:00 PM ET
- Usable leans: **71** (Over/Under)
- Confidence breakdown: **57 High · 4 Medium · 10 Low**
- `attach_recent10`: 100% match
- Team-attribution: clean (CLE + NY rosters both populated correctly)
- Team projection artifact: NY 108.7 / CLE 107.9 · margin +0.8 · NY favored · medium confidence · `publicDisplayMode=full`
- Market lines: NONE on disk
- Notable: McBride PTS Over 5.5 @ proj 9.38 / +23.5pp **High** — same player who blew up May 19 (0 actual vs 9.4 proj). R5 cap is NOT loosened; the +23.5pp edge stays under the 25pp R5 threshold so it comes through as High. Will be measured after May 21 settlement.

### MLB May 20

- Schedule: 15 games on `app/public/data/mlb/schedule/2026-05-20.json` (real, from MLB Stats API)
- Board: `app/public/data/mlb/boards/2026-05-20.json` — **shell only**, `propsAvailable=false`, 0 leans
- **Lines pending** — paid run blocked by credit guard
- No market lines (h2h/spreads/totals/etc.) on disk

### NHL / IPL

- NHL May 20 schedule: `app/public/data/nhl/schedule/2026-05-20.json` (free NHL api-web.nhle.com)
- IPL May 20 schedule: `app/public/data/ipl/schedule/2026-05-20.json` (ESPN free cricket scoreboard)
- **No projection pipeline exists** for either. Pages honestly show "Provider pending" via `SportOverviewHero` from PR #63.

### Parlay Lab

- `/parlay-lab` exists with 86 NBA leans available for May 20.
- Default candidate count: **3** on main, **6** on the active branch (PR #66 raised it).
- No persistence — no parlay hit rate can be claimed.

### Power Board

- `/nba/power` and `/mlb/power` exist as polished "coming soon / volatility watch" shells via `PowerBoardShell` component.
- No real power-board data pipeline yet.
- Does NOT feel broken — designed as a "what's planned" surface.

---

## 5. Current results / model audit state

### Lifetime (after May 19 settlement)

| Sport | W | L | P | Decisive | Hit rate | Newest |
|---|---|---|---|---|---|---|
| NBA | 279 | 241 | 0 | 520 | **53.65%** | 2026-05-19 |
| MLB | 293 | 289 | 0 | 582 | **50.34%** | 2026-05-18 |
| **Combined** | **572** | **530** | **0** | **1102** | **51.90%** | 2026-05-19 |

### Per-date breakdown

| Date | Sport | Record | Decisive | Hit | Notes |
|---|---|---|---|---|---|
| 2026-05-15 | NBA | 80–65 | 145 | 55.2% | mixed slate |
| 2026-05-16 | MLB | 144–128 | 272 | 52.9% | |
| 2026-05-17 | NBA | 41–20 | 61 | 67.2% | small slate |
| 2026-05-18 | NBA | 108–58 | 166 | 65.1% | SA @ OKC WCF G1 |
| 2026-05-18 | MLB | 149–161 | 310 | 48.1% | |
| 2026-05-19 | NBA | 50–98 | 148 | **33.8%** | NY 115 OT — Brunson 38 PTS · the collapse |

### Hit-rate trend status

**Not yet a UI surface.** The data exists in `app/public/data/results/lifetime_summary.json`, `app/public/data/results/comparison_report_<date>.json`, and `app/public/data/audit/model_audit.json`. A sparkline component is on the to-do list for the active branch.

### Model audit findings (from PR #62 + later analysis)

- Per-game NBA hit-rate stdev: **12.5pp** (33.8% worst, 67.2% best on 5 settled games)
- NBA confidence tiers don't differentiate: High 54.3% · Medium 57.1% · Low 48.4%
- Edge magnitude is non-monotonic: Q3 (11–19pp) is the worst quartile at 45.4%; Q4 (high edge 19+) does best at 60.8%
- REB Over is the only durable strong cohort: 62.3% on 114
- AST Over is broken: 41.8% on 110
- MLB confidence tiers entirely non-differentiating; MLB Q4 high-edge is anti-signal (44.1%)
- May 19 collapse traces to missing inputs: game leverage / playoff round / star usage spike / projected minutes / OT pace
- `pipeline/playoff_context.py` (PR #65) and `pipeline/team_projection.py` (PR #65) added observability infrastructure but **no scoring changes**

### What is intentionally NOT claimed

- No future-accuracy claim ("80%" or otherwise)
- No "trend line improvement" claim on the 4-date NBA sample
- No parlay hit rate
- No "the model is learning" claim
- No retroactive tuning of past settled rows

---

## 6. Paid API / credit state

### `ODDS_API_KEY`

- Stored in: `.env` file at repo root (untracked, owner-readable)
- GitHub Actions: secret `ODDS_API_KEY` configured at repo level
- **Never echoed to logs.** Always loaded with `set -a; source .env; set +a` or via workflow `env:` block.

### Balance ledger (most recent first)

| When | Event | Spent | Balance after | Floor in effect |
|---|---|---|---|---|
| 2026-05-20 (this session) | NBA game-markets paid run (not yet executed) | 0 | 300 | 240 (one-time, authorized this session) |
| 2026-05-20 16:33Z | morning-projections workflow refused | 0 | 306→300 (auto-settle credits returned) | 300 (standing) |
| 2026-05-20 (PR #64 session) | NBA generate_daily_board May 20 + May 21 multi-day | 6 | 306→300 | 300 |
| Earlier sessions | various paid runs | (cumulative) | (used) | 300 |
| Lifetime used | (the API counter) | — | **200 used** | — |

### Authorized override for this session ONLY

The user explicitly authorized: **"Approve a one-time floor of 240 for tonight only"** → up to 60 credits may be spent this session. Balance must NOT drop below **240** at any point.

### Planned paid runs (not yet executed on the active branch)

| Target | Markets | Est. cost | Floor check | Status |
|---|---|---|---|---|
| NBA May 20 game markets | `h2h`, `spreads`, `totals` × 1 game | 3 credits | 300→297 (above 240) | PENDING — recommended |
| NBA May 21 game markets | `h2h`, `spreads`, `totals` × 1 game | 3 credits | 297→294 (above 240) | PENDING — recommended |
| MLB May 20 props | 15 games × 4 markets | ~60 credits | 294→234 (**below 240**) → would REFUSE | SKIP — would breach |
| MLB May 20 partial props (top 5 games) | 5 × 4 | ~20 credits | 294→274 (above 240) | OPTIONAL |

**Recommendation:** spend the 6 credits on NBA game markets for May 20+21 (the high-value moneyline/spread/total visible-to-users data). Skip MLB tonight — full slate would breach the new floor, and partial MLB is awkward (which 5 games?).

### Skipped / blocked paid calls

- MLB full slate props: 60 credits would drop balance to 234 — below the 240 floor.
- MLB game markets (15 × 3): another 45 credits — also too much.

### Free / non-paid commands run this session

- `attach_recent10` (free) for May 21 NBA → unlocked 71 leans
- `model_audit` (free) regenerations

---

## 7. Automation state

### Workflows on `main`

```yaml
# .github/workflows/nightly-settle.yml
cron: "0 7 * * *"      # 7 UTC = 3 AM EDT
runs:
  - python -m pipeline.settle_results --date <yesterday-ET>
  - python -m pipeline.mlb.settle_mlb_results --date <yesterday-ET>
  - python -m pipeline.export_results
  - python -m pipeline.mlb.export_mlb_results
  - python -m pipeline.model_audit                       # PR #62 hook
  - commit if diff
```

```yaml
# .github/workflows/morning-projections.yml
cron: "30 13 * * *"    # 13:30 UTC = 9:30 AM EDT
runs:
  - estimate cost (NBA events × markets + MLB events × markets)
  - python -m pipeline.credit_guard --estimate <total>
  - if ok: run pipelines via pipeline/.venv/bin/python
  - commit if diff
required secrets: ODDS_API_KEY
optional vars:     MAX_PER_RUN (default 75), MIN_REMAINING (default 300), ODDS_MAX_EVENTS_PER_RUN (default 8)
```

### Last successful runs

- nightly-settle: 2026-05-20T10:15:40Z (commit `6f9c484` on main: "auto: nightly settle 2026-05-20 06:16 ET")
- morning-projections: 2026-05-20T16:33Z — exit 0, but credit guard refused the paid call

### Manual trigger

```bash
gh workflow run nightly-settle --ref main
gh workflow run nightly-settle --ref main -f settle_date=2026-05-20
gh workflow run nightly-settle --ref main -f dry_run=true

gh workflow run morning-projections --ref main
gh workflow run morning-projections --ref main -f dry_run=true
gh workflow run morning-projections --ref main -f min_remaining=240   # one-time floor
```

### Known automation caveats

- `gh workflow run` returns immediately; check status with `gh run list --workflow=<name> --limit 1`.
- Schedules can fire 1–3 minutes late on GitHub Actions cron.
- Failure logs upload as 7-day-retention artifacts (`settle-log-<run_id>` / `projections-log-<run_id>`).

---

## 8. Pipeline architecture

### NBA generation flow

```
pipeline.generate_daily_board --date YYYY-MM-DD
  → fetch schedule (nba_api preferred → ESPN scoreboard fallback)
  → fetch event odds via The Odds API /odds (PAID — markets × events × regions)
  → fetch rosters (nba_api commonteamroster, cached)
  → fetch player game logs (nba_api playergamelog → balldontlie fallback)
  → score_model.score_prop (0.45·last5 + 0.35·last10 + 0.20·season + home/away nudge)
  → news_signals.json overlay (manual, optional)
  → confidence_guardrails.downgrade_lean (R1..R5)
  → write app/public/data/boards/<date>.json + leans_log.jsonl

pipeline.attach_recent10 --date YYYY-MM-DD     (FREE)
  → fetch recent10 logs via nba_api / balldontlie
  → rescue R1-suppressed leans when logs available
  → write recent10 back to board JSON
```

### MLB generation flow

```
pipeline.mlb.generate_mlb_board --date YYYY-MM-DD --min-credits-remaining N
  → MLB schedule (free MLB Stats API)
  → Odds API /events (free)
  → cost gate + per-event /odds (PAID — ~4 credits per event with 4 markets)
  → roster + probable pitcher (MLB Stats API)
  → game logs (free)
  → mlb_model.score_prop
  → R5 anomaly cap (edges > 20pp → Low)
  → write app/public/data/mlb/boards/<date>.json
```

### Settlement flow

```
pipeline.settle_results --date YYYY-MM-DD                (NBA)
pipeline.mlb.settle_mlb_results --date YYYY-MM-DD        (MLB)
  → load leans for date
  → resolve final stat per (player, market)
       NBA: manual_override > nba_api boxscore > ESPN summary
       MLB: MLB Stats API per-player game stats
  → settle_lean → win/loss/push
  → write pipeline/validation/{,mlb_}settled_leans.jsonl
  → write pipeline/validation/{,mlb_}comparison_report_<date>.json
  → re-aggregate lifetime_summary.json
pipeline.export_results / pipeline.mlb.export_mlb_results
  → sanitize internal-only fields
  → write to app/public/data/{results,mlb/results}/
pipeline.model_audit                                     (FREE)
  → produce app/public/data/audit/model_audit.json
```

### ESPN settlement source (PR #59)

`pipeline/settle_results.py::fetch_final_stats_via_espn(game_id)`:
- Fires only for 9-digit ESPN event IDs (e.g. `401873197`, `401873198`, `401873341`)
- Refuses in-progress games via `header.competitions[0].status.type.completed === true`
- Drops `didNotPlay: true` athletes (no fake zeros)
- Keys by lowercased player name (ESPN doesn't expose NBA.com player IDs)

### Playoff-context module (PR #65 + #67)

```
pipeline/playoff_context.py
  + pipeline/overrides/playoff_series.json — operator-curated mapping
  read fields: round, gameNumber, seriesShort, eliminationFlag, homeTeam, awayTeam,
               priorGameInSeries, notes
```

Mapped today (4 games):
- `401873197` → WCF Game 1 (SA-OKC, May 18, settled in PR #59)
- `401873198` → WCF Game 2 (SA-OKC, May 20, live)
- `401873341` → ECF Game 1 (CLE-NY, May 19, settled in PR #62)
- `401873342` → ECF Game 2 (CLE-NY, May 21, live)

### Team-projection module (PR #65 + PR #66 enhancements)

`pipeline/team_projection.py`:
- Aggregates per-player PTS projections to team-level scoring sum
- Joins to `pipeline/overrides/playoff_series.json` for round/game/home/away
- `dataQualityFlag = "team_attribution_partial"` when one side has <3 contributors
- `publicDisplayMode = "full" | "withheld"` (PR #66 addition)
- Static-roster rescue via `pipeline/team_rosters.py` (PR #66 addition) — rescues empty-team-field leans
- Writes `app/public/data/nba/team_projections/<date>.json`
- Reads `players.json` via `load_player_team_map` helper

### Active slate helpers

- NBA: `selectActiveSlate(allBoardDates, todayEt, boardsByDate)` in `app/src/lib/active-slate.ts`
- MLB: `activeMlbDate()` in `app/src/lib/data-mlb.ts` — ET-anchored
- NHL: `activeNhlDate()`
- IPL: `activeIplDate()`

All use `currentEtDate()` from `app/src/lib/freshness.ts`.

### Key data paths

```
app/public/data/
  board.json                                 NBA active-day mirror
  boards/<date>.json                         NBA per-date boards
  meta.json                                  pipeline metadata
  schedule.json                              NBA schedule
  slate.json                                 NBA multi-day slate
  odds_props.json                            NBA odds snapshot
  players.json                               NBA roster cache
  trends.json                                NBA trends snapshot
  audit/model_audit.json                     PR #62 audit artifact
  results/                                   NBA sanitized export
    settled_leans.jsonl
    comparison_report_<date>.json
    lifetime_summary.json
    available_dates.json
  nba/team_projections/<date>.json           PR #65 team-game artifact
  mlb/boards/<date>.json
  mlb/schedule/<date>.json
  mlb/power/<date>.json
  mlb/results/
  nhl/schedule/<date>.json
  ipl/schedule/<date>.json

pipeline/
  validation/leans_log.jsonl                 append-only audit
  validation/settled_leans.jsonl             NBA internal
  validation/mlb_settled_leans.jsonl         MLB internal
  validation/comparison_report_<date>.json   internal NBA per-date
  validation/mlb_comparison_report_<date>.json
  overrides/results_overrides.json           manual final-stat overrides
  overrides/news_signals.json                manual injury/news (currently empty)
  overrides/schedule_overrides.json
  overrides/playoff_series.json              PR #65 manual playoff mapping
  cache/                                     free-tier API caches (not committed)
```

---

## 9. Current active work details

### Branch: `feature/product-readiness-combined`

Goal: ship a single consolidated PR that supersedes #66 + #67 and adds the next layer of product readiness.

### Files changed (commits already on branch)

```
Commit 45c8961  (cherry-pick of PR #67)
  + app/src/lib/playoff-series-overrides.ts
  M app/src/components/playoff-context.ts
  M app/src/components/team-game-projection-card.tsx

Commit c895546  (cherry-pick of PR #66, auto-merged team-game card)
  + app/src/components/team-badge.tsx
  + pipeline/team_rosters.py
  + pipeline/team_rosters_test.py
  M app/public/data/nba/team_projections/2026-05-20.json
  M app/public/data/nba/team_projections/2026-05-21.json
  M app/src/app/mlb/page.tsx
  M app/src/app/nba/page.tsx
  M app/src/app/page.tsx
  M app/src/components/parlay-builder-client.tsx
  M app/src/components/quick-action-rail.tsx
  M app/src/components/team-game-projection-card.tsx
  M pipeline/team_projection.py
  M pipeline/team_projection_test.py
```

### Commands run on the active branch

```bash
# already done:
git checkout -b feature/product-readiness-combined            # off main 96403fe
git cherry-pick origin/feature/fix-game-context-market-lines-trends   # PR #67
git cherry-pick origin/feature/product-polish-team-view-parlay-power  # PR #66

# verification:
python3 -m pipeline.team_projection_test            → 73/73 PASS
python3 -m pipeline.team_rosters_test               → 38/38 PASS
cd app && npx tsc --noEmit                          → clean
```

### Tests run

- `pipeline.team_projection_test`: 73/73
- `pipeline.team_rosters_test`: 38/38
- `tsc --noEmit`: clean
- **Full pipeline test sweep NOT yet run on this branch.** Should run before opening PR.
- **`next build` NOT yet run on this branch.** Should run.

### Preview URL

**No preview yet** — branch not pushed.

### What is done

- PR #67's changes fully merged onto active branch (playoff-context override + market-line withhold gate)
- PR #66's changes fully merged onto active branch (team-badge, team-rosters, language polish, parlay 3→6, static-roster rescue, regenerated team-projection artifacts)
- Auto-merge of `team-game-projection-card.tsx` succeeded — both PRs' changes co-exist (TeamBadge + market-line gate)
- 73/73 + 38/38 tests pass; typecheck clean

### What is mid-progress (NOT done)

- **NBA game-markets fetcher script** — not started. Plan: add `pipeline/fetch_game_markets.py` that calls Odds API `/events/<id>/odds?markets=h2h,spreads,totals` and persists to `app/public/data/nba/game-markets/<date>.json`.
- **Paid run** — 0 credits spent on this branch. Plan: 6 credits total (NBA May 20 + May 21).
- **UI display of market lines** — `team-game-projection-card.tsx` already has slots for `marketSpread` + `marketMoneyline`; the team-projection artifact needs to be enriched with these fields by re-running `pipeline.team_projection` against the new game-markets file.
- **Hit-rate sparkline component** — not started. Plan: tiny SVG-based component reading `byDate` from `model_audit.json`; render on `/results` and `/results/model-audit`.
- **Full pipeline test sweep** — 13 other test files need running.
- **Static build verification** — `next build` not yet run on this branch.
- **PR push + open** — branch not yet pushed; no PR opened.

### What needs verification

- After paid run lands market lines, regenerate `team_projection` artifacts and confirm `marketSpread !== null` so the UI gate releases.
- May 20 team view should show real market spread/total + the model PTS sum as a "scoring rate" comparison — NOT as a fake margin.
- May 21 team view should also show market context + drop the +0.8 derived margin in favor of model-vs-market differential.

### What should be merged (after this PR)

- This combined PR supersedes #66 + #67. After merge, close those two PRs with `gh pr close 66 --delete-branch` and `gh pr close 67 --delete-branch`.

### What should be closed/superseded

- PR #66, PR #67 (after combined PR merges).

### What should NOT be touched

- **Scoring code** (`pipeline/score_model.py`, `pipeline/confidence_guardrails.py`, `pipeline/build_features.py`): no model changes
- **Settlement code** (`pipeline/settle_results.py`, `pipeline/mlb/settle_mlb_results.py`): risk of audit data corruption
- **Automation workflows** (`.github/workflows/nightly-settle.yml`, `morning-projections.yml`): producing reliable data
- **Package files** (`package.json`, `package-lock.json`): rule of the project
- The `pipeline/overrides/playoff_series.json` file is the source of truth for the pipeline AND must stay in sync with `app/src/lib/playoff-series-overrides.ts` (both files carry the same 4-game mapping today)

---

## 10. UI/UX state

### Homepage `/`
- HomepageCommandHero with status pill + 51.9% audit headline tile
- "Today on the floor" SportsbookStatusBoard
- Sport grid (HomepageSportsRail)
- QuickActionRail (Model Board / Results / Audit deep-dive / Parlay Lab)
- 3-step explainer · Newsletter
- **Active branch:** language polished — "Audit" → "Results" in QuickActionRail

### `/nba`
- SportOverviewHero with status pill (Live tonight · 86 leans) + matchup line + 3 scoreboard stats + CTAs
- Active slate strip with per-game cards
- QuickActionRail
- **Active branch:** "Latest results" CTA wording (instead of "Latest audit")
- **Known fix (PR #67):** Western Conference Finals · Game 2 now displays correctly via ESPN gameId override fallback

### `/nba/board`
- BoardDateStatusBanner + BoardDateRail
- TeamGameProjectionCard (above player props) — **active branch:** with TeamBadge + market-line withhold gate
- BoardWithTabs (date tab strip + per-game projection cards)
- "How to read these projections" disclosure

**Team view current behavior on active branch:**
- May 20 SA @ OKC: would show "Team view pending market line" (because `marketSpread === null`) once the game-markets fetcher runs and the artifact is regenerated. Before that: full rendering with OKC 101 / SA 117 / SA favored by 16.1 — which is exactly what the user flagged as unrealistic. **The new market-line gate is the fix.**
- May 21 CLE @ NY: same — would show "Team view pending market line" until market data lands.

### `/mlb`, `/mlb/board`
- SportOverviewHero · MlbSummaryStrip · per-game slate strip · UpcomingSlateStrip
- Active branch: "Latest results" CTA wording
- Currently shows 15 games + "Lines pending"

### `/nhl`, `/ipl`
- SportOverviewHero in `providerPending` state
- Schedule pulled from free APIs
- Honest "model board pending" framing

### `/parlay-lab`
- Active branch: candidate slip count raised 3 → 6
- Ticket-style demo state when slate is cold
- Educational framing throughout; no hit-rate claims

### `/results`
- Hero with 51.9% / 1102 decisive
- Cross-sport audit notes block (PR #61 + #62)
- ModelLessonsCard, CalibrationTrendTile
- Active branch: language polished

### `/results/model-audit` (PR #62)
- Cross-sport summary tiles
- Per-sport strong/weak cohorts, per-game dispersion, per-market, per-side × market, per-confidence, edge bands, edge quartiles, per-date timeline with playoff context

### `/results/date/2026-05-19`
- AtAGlanceCard (Hit/Miss/Push/Pending)
- BigCallsRow (best hits + biggest misses)
- 50–98 on 148 · 33.8%

### `/methodology`, `/responsible-use`
- Polished heroes via SportOverviewHero (PR #63)

### Mobile state
- All 16 audited routes were verified at 390px in PR #63
- Cinematic CSS gates animations on `prefers-reduced-motion`

### Known visual weaknesses (per user feedback)

1. **Power Board** — current "coming soon" shell is intentional but still feels half-built to users
2. **Parlay Lab** — even at 6 slips, lacks mode selector + ticket-style polish
3. **Hit-rate trend graphs** — not yet built; data ready
4. **Sport-page above-fold density** — still some long copy
5. **Team logos** — currently color-monogram TeamBadge fallback; no licensed assets

---

## 11. Known bugs / limitations

### Team-attribution bug (upstream)

- **Root cause:** `pipeline/generate_daily_board.py:867-879`. When `name_to_team.get(p.player_name, "")` returns `""`, the fallback sets `home_away = "Home"` and `opponent_abbr = ""`. So SAS-side leans on May 20 all came through with `team=""` and `homeAway="Home"`.
- **Why:** the nba_api `commonteamroster` call silently dropped the SAS roster (or returned an unexpected shape). The pipeline doesn't validate.
- **Workaround on active branch:** `pipeline/team_rosters.py` static map rescues by player name during team_projection aggregation. Tested with 38/38 assertions.
- **Real fix:** belongs in `generate_daily_board.py` — out of scope for the current PR.

### Market-line gaps

- Odds API provider only requests `player_points` / `player_rebounds` / `player_assists` markets.
- No `h2h` / `spreads` / `totals` ever fetched.
- The team-projection card has slots for `marketSpread` + `marketMoneyline` ready to populate.
- **Plan:** new `pipeline/fetch_game_markets.py` module + paid run (6 credits for May 20+21).

### MLB lines pending

- 15-game slate on disk · 0 leans
- Full props run requires 60 credits → would breach 240 floor
- Partial run (~20 credits for top 5 games) is possible but awkward

### NHL / IPL provider pending

- No projection pipeline for either
- Schedules render correctly; pages honestly say "model board pending"

### No injury feed wired

- `pipeline/overrides/news_signals.json` exists but is empty
- No live ESPN / rotowire scraper

### No projected-minutes data source

- Highest-ROI missing input (would address May 19's McBride rotation-collapse failure)
- No source identified

### No expert / news source

- Not wired; user explicitly said no fake sources

### No parlay persistence

- `/results/parlays` correctly stays in pending state
- `/parlay-lab` honestly refuses hit-rate claims

### Model accuracy limitations

- 6 unique settled slates (4 NBA + 2 MLB)
- Cross-sport hit rate 51.9% — barely above coin flip
- NBA per-game stdev 12.5pp — high variance
- Audit notes correctly weight every cohort with sample-size labels

### Context limit / session limitations

- This handoff is being written near the end of a session with significant context already consumed
- The active branch is NOT pushed; the next session must `git push -u origin feature/product-readiness-combined` first

### Vercel CDN caveats

- After a merge, each Vercel edge invalidates independently
- The canonical Vercel preview URL refreshes immediately; the custom domain may lag 3–5 min on specific routes
- Poll for a specific marker string with 20–30s interval

### Anaconda / numpy / bottleneck caveat

- System Python (anaconda) has numpy 2.x + bottleneck compiled for numpy 1.x
- Pandas crashes during nba_api with `AttributeError: _ARRAY_API not found`
- **Always use `pipeline/.venv/bin/python` for pipeline commands that touch nba_api.**

### Other operational gotchas

- `gh pr merge --delete-branch` deletes remote but local feature branch persists; clean with `git branch -d <name>`
- The morning-projections workflow exits 0 even when credit guard refuses — check log for `! credit guard refused the run`

---

## 12. Hard operating rules

### Data integrity
- **No fabricated data.** Never invent schedules, odds, stats, projections, injuries, results, parlays, hit rates, moneylines, spreads, totals, or expert picks.
- **Pending games never count as losses.** Pending is a separate state from loss everywhere.
- **Pushes excluded from hit-rate denominator.**
- **No fake parlay record.** No parlay hit rate may be claimed until candidate slips are persisted before games and graded after settlement.
- **No "the model is learning"/"improved" claims** unless metrics prove it from real settled data.
- **No 80% accuracy promise** anywhere on the site.

### Paid API budget
- **Standing per-run cap:** 75 credits (`MAX_PER_RUN`).
- **Standing balance floor:** 300 credits (`MIN_REMAINING`).
- **This session only:** floor lowered to **240** by explicit operator authorization. Up to 60 credits may be spent.
- **No paid run** unless cost is estimated first and projected post-run balance ≥ effective floor.
- `pipeline.credit_guard` is the single source of truth.

### Forbidden public copy (enforced by `pipeline/public_copy_test.py`)
- "safe bet"
- "lock"
- "guaranteed"
- "best bet"
- "free money"
- "can't miss" / "cant miss"
- "no room for error"

### Approved public copy
- "clean leans"
- "lower-variance"
- "risk-aware"
- "educational candidates"
- "candidate slips"
- "model audit" (technical pages)
- "Results" / "Model Performance" (casual surfaces)
- "Power Board" / "Volatility Watch"
- "high-variance watch"
- "lower-correlation construction"
- "lines pending"
- "projections arriving soon"
- "live slate"
- "model edge"
- "projection card"
- "calibration trend"
- "Market line pending"

### Engineering rules
- **Do not touch `app/package.json` or `app/package-lock.json`** unless absolutely necessary, and explain why.
- **Do not commit** `SESSION_*.md` / `.claude/` / root `gametime-picks-logo.png` / pipeline cache files. These stay untracked.
- **Do not expose `ODDS_API_KEY`** — no echo, no commit, no PR description.
- **Preserve the centralized Results architecture.** Results is the audit hub. Hit-rate numbers should not be scattered across sport boards.
- **No broad unrelated redesigns** within a single PR.
- **Use `pipeline/.venv/bin/python`** for any pipeline command that touches nba_api.
- **No stale active games** must appear as LIVE TONIGHT — banner must reflect honest slate state.

---

## 13. Exact commands cheatsheet

### Verification

```bash
cd ~/Downloads/gametimepicks

git status --short
git branch --show-current
git log --oneline -10
git rev-parse HEAD
git rev-parse origin/main

gh pr list --state open --json number,title,headRefName,mergeStateStatus,statusCheckRollup
gh pr view <N> --json state,mergeStateStatus,mergeable,headRefOid,url
gh pr checks <N>

# Free balance probe — 0 credits
set -a; source .env; set +a
curl -sI "https://api.the-odds-api.com/v4/sports/?apiKey=$ODDS_API_KEY" | grep -iE '^(x-requests|http)'
```

### Tests (15 files)

```bash
python3 pipeline/public_copy_test.py
python3 -m pipeline.parlay_builder_test
python3 -m pipeline.settle_test
python3 -m pipeline.export_results_test
python3 -m pipeline.mlb.settle_mlb_results_test
python3 -m pipeline.mlb.export_mlb_results_test
python3 -m pipeline.context_tag_test
python3 -m pipeline.mlb.mlb_model_test
python3 -m pipeline.active_slate_test
python3 -m unittest pipeline.attach_recent10_test
python3 -m pipeline.credit_guard_test
python3 -m pipeline.model_audit_test
python3 -m pipeline.game_context_test
python3 -m pipeline.playoff_context_test
python3 -m pipeline.team_projection_test
# add when present:
python3 -m pipeline.team_rosters_test
```

### TS / build

```bash
cd app
npm run typecheck     # tsc --noEmit
npm run build         # next build (static export)
cd ..
```

### Projection generation (PAID — use venv)

```bash
# NBA — ~3 credits/event/markets
ODDS_API_KEY=<key> ODDS_DRY_RUN=false ODDS_MAX_EVENTS_PER_RUN=4 \
  pipeline/.venv/bin/python -m pipeline.generate_daily_board --date 2026-05-20
pipeline/.venv/bin/python -m pipeline.attach_recent10 --date 2026-05-20

# MLB — ~56 credits for 14 games × 4 markets
ODDS_API_KEY=<key> ODDS_DRY_RUN=false \
  pipeline/.venv/bin/python -m pipeline.mlb.generate_mlb_board --date 2026-05-20 \
  --min-credits-remaining 240   # one-time floor this session only
```

### Settlement (FREE)

```bash
pipeline/.venv/bin/python -m pipeline.settle_results --date 2026-05-20
pipeline/.venv/bin/python -m pipeline.mlb.settle_mlb_results --date 2026-05-20
pipeline/.venv/bin/python -m pipeline.export_results
pipeline/.venv/bin/python -m pipeline.mlb.export_mlb_results
pipeline/.venv/bin/python -m pipeline.model_audit
```

### Team-projection artifact

```bash
pipeline/.venv/bin/python -m pipeline.team_projection --date 2026-05-20
pipeline/.venv/bin/python -m pipeline.team_projection --date 2026-05-21
```

### Automation dry-runs

```bash
DRY_RUN_SETTLE=1 bash scripts/automation_settle.sh
DRY_RUN_PROJECTIONS=1 ODDS_API_KEY=<key> bash scripts/automation_projections.sh

gh workflow run nightly-settle --ref main -f dry_run=true
gh workflow run morning-projections --ref main -f dry_run=true
```

### Production deploy verification

```bash
# Vercel preview URL discovery
HEAD=$(git rev-parse HEAD)
gh api "repos/yashwantbalaji3/gametimepicks/deployments" --jq \
  ".[] | select(.sha==\"$HEAD\") | .id" | while read D; do
    gh api "repos/yashwantbalaji3/gametimepicks/deployments/$D/statuses" \
      --jq '.[] | select(.state=="success") | .environment + " -> " + .target_url'
  done

# Custom domain check
curl -sI https://gametimepicks.yashwantbalaji.com/ | head -3
curl -s https://gametimepicks.yashwantbalaji.com/results/ | grep -oE '51\.9%|1102'
```

### Rollback

```bash
cd ~/Downloads/gametimepicks
git checkout main && git pull origin main
git revert --no-edit <squash-sha>
git push origin main
# Vercel redeploy ≈ 1 min · custom-domain ≈ 1–3 min
```

---

## 14. Recommended next steps

### Immediate next action (next session)

1. `cd ~/Downloads/gametimepicks` and verify branch state (§15)
2. Decide whether to push branch as-is for review OR finish the market-line work first
3. If finishing: write `pipeline/fetch_game_markets.py` (next subsection)
4. Run paid call for NBA May 20 + May 21 game markets (~6 credits)
5. Regenerate team_projection artifacts (now with market lines)
6. Add hit-rate sparkline component
7. Full test sweep + build + push + open PR

### What to merge

- The consolidated combined PR (when opened).

### What to close

- PR #66, PR #67 once the combined PR merges. Use `gh pr close <N> --delete-branch`.

### What to verify before merging combined PR

- May 20 team view renders honestly (either real market lines OR "pending market line" — never the +16 fake margin)
- "Regular season" label is gone from all surfaces
- Player props still render (86 May 20 + 71 May 21)
- 0 forbidden copy / 0 fake-learning / 0 parlay-claim across hero routes
- Balance stays ≥ 240 after any paid spend this session

### Next PR after combined PR

**`feat(parlays): persist candidate slips before lock`** — the unlock for `/results/parlays` real hit rate. Requires:
- `pipeline/snapshot_parlays.py` — write candidate slips to disk before game start
- `pipeline/grade_parlays.py` — grade them after settlement
- New `app/public/data/parlays/<sport>/<date>.json` shape

### Roadmap items (deferred)

- **Moneyline/spread/total full coverage** — extend Odds API provider to request `h2h`/`spreads`/`totals` as standard markets; not just one-off script
- **MLB tonight** — needs a top-up so 60-credit run fits under the 300 standing floor; or temporary 240 floor again
- **Parlay persistence** — see above
- **Injury / projected-minutes data** — research ESPN injury API or rotowire feed; user said no fake sources
- **Model improvement** — once persistence + injury data lands, real calibration + cohort retraining possible

---

## 15. Resume instructions for new Claude Code session

### Copy-paste "start here" block

```bash
# 1. Set context
cd ~/Downloads/gametimepicks

# 2. Read this handoff (skim §9 first if pressed)
cat SESSION_HANDOFF_2026-05-20_PRODUCT_READINESS.md | head -200

# 3. Sync repo
git fetch --prune origin
git checkout feature/product-readiness-combined   # the active combined branch
git log --oneline -3
# Expected top: c895546 feat(product): polish matchup... [PR #66 cherry-pick]
#               45c8961 fix(nba): show real playoff context... [PR #67 cherry-pick]
#               96403fe feat(nba): playoff-context + team-game view (#65) [main]

# 4. Verify production health
curl -sI https://gametimepicks.yashwantbalaji.com/ | head -3

# 5. Verify open PRs
gh pr list --state open --json number,title,headRefName

# 6. Verify balance (without printing key)
set -a; source .env; set +a
curl -sI "https://api.the-odds-api.com/v4/sports/?apiKey=$ODDS_API_KEY" | \
  grep -iE '^x-requests'
# Expected: x-requests-remaining: 300 (or higher if user topped up)

# 7. Run sanity tests on active branch
python3 -m pipeline.team_projection_test    # expect 73/73
python3 -m pipeline.team_rosters_test       # expect 38/38
cd app && npx tsc --noEmit && cd ..

# 8. Decide:
#    a) push branch + open PR as-is (no paid run)
#    b) finish market-line work first (paid up to 60 credits, floor 240)
#    See §9 "What is mid-progress" for the open items.
```

### Files to read first

1. `SESSION_HANDOFF_2026-05-20_PRODUCT_READINESS.md` (this file)
2. `app/src/components/team-game-projection-card.tsx` — the active branch has both PR #66 + #67 changes merged
3. `pipeline/team_projection.py` — has the static-roster rescue
4. `pipeline/overrides/playoff_series.json` — playoff context source of truth
5. `app/src/lib/playoff-series-overrides.ts` — TS mirror of the above

### PRs to inspect

- PR #66: `gh pr view 66 --json title,body,files`
- PR #67: `gh pr view 67 --json title,body,files`

### Branch to continue

`feature/product-readiness-combined` (currently at `c8955467b3da92e26eec3d55cde3e556cf71134f`)

### What to verify

- Tests still pass (73/73 team_projection, 38/38 team_rosters)
- `tsc --noEmit` clean
- Balance unchanged at 300 (no paid spend yet on this branch)

### What NOT to break

- The audit math: NBA 53.7% on 520, MLB 50.3% on 582, cross 51.9% on 1102
- The R5 anomaly cap (don't loosen)
- Settlement pipeline
- `homeAway` / team attribution downstream consumers
- The credit-guard 240 floor (this session only)
- The standing 300 floor (after this session — no override)
- Forbidden copy guard
- Public copy test
- Existing automation cron times

### Final report format

Use the format the user specified in their last message:

```
FINAL PRODUCT READINESS REPORT

PR:
- Number:
- HEAD:
- Preview:
- PRs superseded/incorporated:

Paid API:
- key:
- estimate:
- before/after:
- spent:
- run decision:

Projection coverage:
- NBA May 20:
- NBA May 21:
- MLB May 20:
- NHL/IPL:

Market lines:
- NBA:
- MLB:
- unavailable markets:

UX fixes:
- Regular season label:
- Today-first sport tabs:
- Team/game view:
- Moneyline/spread/total cards:
- Parlay Lab:
- Power Board:
- Team badges:
- Hit-rate graphs:
- Homepage/sport pages:

Data integrity:
- No fake odds:
- No fake projections:
- No fake parlay record:
- No stale active games:
- Results/trends from real data:

Tests:
- Pipeline:
- Typecheck/build:
- Route walk:

Remaining limitations:
- Credit budget:
- Market data:
- Model accuracy:
- Injuries/projected minutes:
- Parlay persistence:
- NHL/IPL:

Merge recommendation:
Do not merge without approval.
```

---

## 16. Final status snapshot

| Field | Value |
|---|---|
| Current branch | `feature/product-readiness-combined` |
| Current HEAD | `c8955467b3da92e26eec3d55cde3e556cf71134f` (`c895546`) |
| Main SHA | `96403fea09370c1b64dadf8c6a020b386c901ef2` (`96403fe`) — PR #65 squash |
| Current PR | **none yet** (PR #66 + PR #67 are OPEN but will be superseded) |
| Production status | ✅ live · 200 · serving NBA May 20 86 leans / NBA May 21 71 leans / MLB lines pending |
| Paid balance | **300 / 1000** (live probe) · used 200 |
| Session-only floor | **240** (operator-authorized one-time override; up to 60 credits spendable this session) |
| Projection status | NBA May 20+21 live; MLB May 20 shell only; NHL/IPL provider-pending |
| Market lines status | **NONE on disk for any sport** — `marketSpread` / `marketMoneyline` are `null` on every team-projection artifact |
| Tests status (on active branch) | 73/73 team_projection · 38/38 team_rosters · `tsc --noEmit` clean · full 15-file sweep NOT yet run |
| Build status | `next build` NOT yet run on active branch |
| Push status | branch NOT yet pushed to origin |
| Next recommended action | Either (a) push branch + open consolidated PR as-is (no paid spend), or (b) finish market-line fetcher + 6-credit paid run + sparkline + then push. Both are valid. (b) lands more user value. |

---

*End of handoff. If anything here conflicts with the live state, trust the live state and re-verify via the §15 commands.*
