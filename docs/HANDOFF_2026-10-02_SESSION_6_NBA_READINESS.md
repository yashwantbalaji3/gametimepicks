# Handoff: 2026-10-02, Session 6 — NBA readiness, soccer settlement core, Live V2 audit

Point-in-time record. Current truth = live repo + canonical docs + Production. Ownership: COMMON / UNASSIGNED.

**Start state (verified 07:11Z):** main `9728359203` (bot `[skip ci]` on top of `9b60b601`), Production `9b60b601`, only open PR #716 (intentional HOLD, untouched).

## 0. Session 5 runtime closeout — PIT @ CLE (401872964)

| Step | State at writing |
|---|---|
| Official final | ✔ ESPN `STATUS_FINAL`, **CLE 27 – PIT 24** |
| Frozen pregame board | ✔ present (4 families), unchanged |
| Live artifact | ⚠ `nfl/live-props/401872964.json` frozen at Q2 (`observedAt 00:57:06Z`, `phase IN_PROGRESS`) |
| Nightly settle / event-window grade | **runtime-pending** — no run since the final; nightly-settle slots 05:17/06:43/08:11/09:37Z (start late), event-window settle pass 14:30Z |
| Results / Ask parity | pending on the grade |

`nfl-lifecycle-trace --date 2026-10-01` → `FINAL_PROVISIONAL ✗ · RESULTS ✗` (expected before settle).

⚠ **Props settlement depends on the free producer seeing FINAL.** `settle-nfl-live-props.mjs` copies settlements only out of `live-props/<id>.json`, and the producer targets games within 8h of kickoff (`live-prop-state.mjs` `LIVE_WINDOW_MS`) — for PIT @ CLE the window closed **08:15Z 2026-10-02**. A zero-credit `nfl-live-props-free.yml` dispatch (event 401872964) was attempted at 07:32Z and **refused by the session's permission classifier**; the founder was notified. If it was not run before 08:15Z, PIT @ CLE props cannot settle through the producer path and need a decision (re-run with a widened window, or grade from the box score through the canonical settler).

**Session 5 regression spot-check — all pass:** decision tests 62/62 (`card-gates-d4-d5`, `record-population-labels`, `public-risk-taxonomy-d2`, `no-game-day-reason`, `mlb-input-verdict`, `ladder-capability-gate`, `ask-results`); Production `/results/` shows **21–88**; MLB 2026-10-02 has 0 games (statsapi) — the off-day `/today` copy is provable after today's daily-products run (the 04:50Z failure was on `e4bf2e83`, before D3 #909).

## 1. NBA — inventory (traced, not inferred)

| Capability | Owner | Status | Notes |
|---|---|---|---|
| Schedule | `scripts/nba/capture-nba-schedule.mjs` → `public/data/nba/schedule/latest.json` (sport-schedules daily) | **CURRENT** | 397 rows (67 preseason 10-03→10-17, 330 regular 10-20→12-08), rolling 70-day window; 5 `TBD @ TBD` placeholders; commits only on content change (last 09-29). ESPN month query is capped at 100 events without `&limit` — the owner passes `limit=1000` ✔ |
| Team identity | `roster-contract.ESPN_NBA_TEAMS` (ESPN id ↔ ESPN abbr ↔ canonical tricode, from `boxscore-parse`); legacy TS `nba/identity-contract.ts` | **CURRENT** | now cross-checked: all 30 agree (#912 test) |
| Player identity | ESPN athlete id in rosters / injuries / box scores | PARTIAL | no NBA rows in `data/internal/platform/v1` or `research-projection/v1` |
| Rosters | `capture-nba-rosters.mjs` → `data/internal/research/nba/rosters/` | CURRENT (private) | 30/30, 605 players (10-01); daily snapshots, no transactions feed, no two-way status |
| Availability | `capture-injuries.mjs` → `injuries/nba/latest.json` | CURRENT (private) | 60 entries (14 Out, 46 Day-To-Day); vocabulary `Day-To-Day`/`Out` only — any other status quarantines (fail-closed; watch the regular season) |
| Historical box scores | `build-nba-boxscore-corpus.mjs` | RESEARCH | 4,179 games 2023-24→2025-26, static |
| Forward finals | `capture-nba-results.mjs` → `results/latest.json` (rolling **9-day** window) → **`finals-<season>.json` (new, #912)** | CURRENT | first final expected 10-03 23:00Z MIA @ TOR, folded by the 10-04 run |
| Forward box scores | only `grade-nba-experimental-forecasts --fetch` (its own games) | PARTIAL | no general capture — needed only when a player family nears publication |
| Live | none (`SUPPORTED_SPORTS = ["nfl","mlb"]`) | MISSING | |
| Settlement | `settlement-contract.mjs` (ML/spread/total, tie = VOID) + finals record `finalFor` (#912) | READY (contract + finals) | no NBA pick ledger by design |
| Results | legacy May–June archive `/results/nba` (49.1%, 3,635) | HISTORICAL | NBA finals now durable for a future grader |
| Ask | `ASK_SPORTS` excludes NBA; help says "historical archive" | EXCLUDED | factual NBA grounding = next unit (needs eval + projection regen) |
| Public routes | `/nba` → **factual hub (#913)**; `/results/nba` archive; `/sports` NBA list | — | navigation unchanged (nav charter) |
| Legacy pipeline (nba_api) | gated off by `vars.NBA_LEGACY_REFRESH` | DEPRECATED | stale public files: `nba/market-probe-latest.json`, `game-markets/2026-06-10.json`, `team_projections/2026-05-2*.json` |

## 2. NBA — launch matrix (Oct 20, by evidence)

| Capability | State | Why |
|---|---|---|
| Schedule | **PUBLIC** (#913) | free ESPN capture, canonical identity |
| Game pages | **PUBLIC as hub rows** (no per-game route) | facts only |
| Live state | WITHHELD | no adapter |
| Game win probability | **SHADOW** | see §3 |
| Projected score | SHADOW (point estimates only) | pace baseline MAE 11.98 / 15.52 on dev seasons; no intervals |
| Points / rebounds / assists | WITHHELD | no evaluation on the current stack; minutes model unvalidated |
| Simulation | RESEARCH | v0 fails dispersion bars |
| Results | READY (finals) / NOT READY (forecast grading — nothing to grade) | |
| Ask | LIMITED (archive only) | |

**Under the frozen preregistration nothing NBA-predictive can be PUBLIC on Oct 20**: every family needs n ≥ 300 forward regular-season games (≈ 3 weeks) on top of historical passes. Changing that is a methodology decision (founder gate F-NBA-1 below).

## 3. NBA — model evidence

- **Families present:** shadow Elo (K20/HA70/25% regression), pace point estimates, v0 sim (`nba-preseason-experimental-v0`), minutes model v0, roster-gated pool v0.1, legacy June props (retired).
- **Look 2 run tonight** (development season 2024-25, 1,005 games, recorded in the preregistration §12): v0 sim winner Brier **0.267** vs shadow Elo **0.215** (bar ≤ 0.240); margin coverage 0.88 (bar 0.76–0.84); |margin bias| 1.42 (bar ≤ 1.0); total SD ≈ margin SD (needs shared pace). **v0 cannot pass winner/margin/total.** Assessment season 2025-26 untouched.
- **Viable candidates:** shadow Elo winner probability (Brier 0.215 dev; earlier model-card Elo LL 0.616 vs coin 0.693, but overrates home teams in every bin, ECE ≈ 0.04) — the preregistration grades the *sim's* winner, so promoting the Elo itself is a methodology decision; pace margin/total point estimates.
- **Stale / reject:** v0 sim as a probability or interval source; legacy PTS/AST props (worse than market); 3PM/PRA/STL/BLK (unsettleable); nba_api pipeline.
- **Blockers:** C1–C5 dispersion plan unbuilt (no v1 code); grader lacks coverage/ECE; no historical player-prop walk-forward harness; no authorized NBA price receipt.

## 4. Soccer core (#914)

`lib/sports/soccer/settlement-contract.mjs` — `gradeSoccerLeg` / `settleSoccerSlate` keyed by competition, format from `leagues.mjs` (extra-time competitions grade only a declared 90-minute score). EPL contract = thin binding, **byte-identical over a 1,680-row golden grid**. Ligue 1 graded from the registry alone. No stage/route/page moved (`soccerLeaguePages()` = `["ligue-1"]`). Model (`epl/strength-state`, already used by Ligue 1) and simulation (EPL player data only) stay EPL-named — next candidate: rename-free `soccer/match-model` facade.

Registry stages at writing: EPL LIVE · Ligue 1 ACCEPTED_V1 · LaLiga / Serie A / Bundesliga REJECTED_V1 · Championship / MLS / Eredivisie / Primeira PLANNED · UCL / UEL HOLD · World Cup ARCHIVE.

## 5. Live V2 — capability matrix

| Row | Owner | Public | State / blocker | Cost |
|---|---|---|---|---|
| NFL score, quarter/clock | `adapters/espn-nfl.mjs` via `/api/live` | ✔ | reliable | 0 |
| Rushing / receiving yds / receptions | gateway (`MARKET_BY_GROUP_LABEL`), join `${event}:${nfl-athlete-<espnId>}:${family}` | ✔ | reliable since #878; receptions ≠ receiving keys ✔ | 0 |
| Passing yds | producer only | ✗ | ESTIMATE family (P318 STOP) | 0 |
| Anytime TD | producer only (`touchdownsScored`) | frozen prob ✔ / live state only when the producer file exists | "Live tracking temporarily unavailable" on Sundays unless the free producer is dispatched; **exact TD is derivable by athlete id from the ESPN box score** (rushing/receiving/returns `TD` columns; defensive/INT overlap only matters for counts, not ≥1; offensive fumble-recovery TD is the one gap) — not "prose only" as Session 5 §B9 said | 0 |
| MLB live | `mlb-statsapi.mjs` | ✔ | reliable | 0 |
| UFC live | `espn-mma.mjs`, `ufc-tracked.mjs` (tests only) | ✗ | founder publication call | 0 |
| EPL live | none | ✗ | adapter + founder | 0 |
| Live sportsbook team market | `probe-/capture-nfl-live-odds.mjs`, `nfl-live-props.yml` (disabled) | ✗ | ⚠ **Phase H is stuck, not armed:** the 3-credit probe is RECONCILED in the ledger (2026-09-27T17:23:49Z) so the probe exits "ALREADY PROBED", and `phase-h-live-probe.json` does not exist so the pilot exits "NOT STARTED" — needs a new authorization | 3 credits/bulk call |
| Live sportsbook player props | none | ✗ | refused by receipt Amendment 3 | ~5 credits/event/call (≈ 490/Sunday) |
| Market timestamps | frozen pregame `capturedAt` | ✔ (model detail) | pinned-`--now` quarantine follow-up unverified | — |

**Shipped:** #915 — "No TD recorded" only from a measurement taken at the final (typed `tdFinal`: SCORED / NONE_AT_FINAL / NONE_AT_LAST_READ / NOT_MEASURED drives status and row).

**Future live-parlay contract (research only, nothing built):** a live card must carry four separately-owned layers and never merge them — (1) frozen pregame GTP forecast (immutable, `frozenAt`), (2) current factual state (provider, `observedAt`, phase), (3) current live market (book, line, price, `capturedAt`, suspended flag), (4) a conditional live model **only if validated** (none exists → the layer is absent, not estimated). No live edge or probability without (4).

## 6. PRs this session

| PR | What | Merge order |
|---|---|---|
| #912 | NBA write-once per-season finals record + sport-schedules fold step + commit-step fix (stamp-only reset no longer discards a new final) | 1 |
| #913 | `/nba` factual schedule + finals hub (no forecast); registry reason refreshed (state unchanged); route guards + e2e table | 2 (stacked on #912) |
| #914 | Soccer competition-neutral settlement contract | independent |
| #915 | Live TD "not measured" truth fix | independent |
| (this) | handoff + preregistration look 2 | last |

**Merge state at the first writing (superseded by §10): none merged.** All four code PRs were exact-head green (`quality`, `python`, Vercel) with `git merge-tree origin/main <head>` == the tested head tree (main had not moved from `9728359203`). The session's permission classifier refused `gh pr merge`, so merging — and therefore Production verification of `/nba` — is the founder's. Merge #912 **before** #913, and #912 before 2026-10-04 ~14Z so the first preseason final (MIA @ TOR, 10-03 23:00Z) is folded by that day's sport-schedules run. Tested heads: #912 `8667a1059f` · #913 `2cc4092b3a` · #914 `d8e2868807` · #915 `523a9db830`.

## 7. Founder gates / decisions

1. **PIT @ CLE props**: if the free producer was not dispatched before 08:15Z, choose re-run with a widened window or a box-score grade through the canonical settler.
2. **F-NBA-1**: launch NBA with schedule/finals only (current evidence), or authorize a methodology change (e.g. publish the shadow Elo winner after a recalibration + assessment-season look) — the frozen preregistration otherwise blocks every family until ≈ 3 weeks after Oct 20.
3. **Nav charter**: whether `/nba` enters navigation (route guards keep it out today).
4. **Live TD gateway family** (B9): publish "No TD yet / TD scored" live from the box score by athlete id — removes the Sunday producer dependency.
5. **Free producer cadence**: `nfl-live-props-free.yml` is dispatch-only by design; without a schedule (or a gateway TD + gateway settlement path) props grading depends on a human every game day.
6. **Phase H**: new authorization needed (probe spent, pilot not started).
7. Carried: UFC live publication, EPL live adapter, NBA price receipt.

## 8. Known risks

- NBA injuries vocabulary may meet `Questionable/Doubtful/Probable` in the regular season → rows quarantine (fail-closed, visible in `quarantined`).
- The finals record depends on daily sport-schedules runs inside the 9-day results window.
- `/nba` hub freshness = the schedule capture, which only commits on content change (can read days old while correct).

## 9. Backlog (by value)

1. Ask NBA factual grounding (schedule, start time, final from the finals record) behind `ASK_SPORTS`, with eval + projection regen.
2. General NBA forward box-score capture for finals (needed before any player family's forward shadow can grade).
3. NBA v1 sim candidate per C1–C5 (separate version string, own forward shadow).
4. Gateway TD family (after gate 4).
5. Retire stale public NBA files (§1 legacy row).
6. Soccer: shared match-model facade.

## Next recommended fresh session

1. Read PIT @ CLE settlement (§0) and the first NBA preseason final in `finals-2026-27.json` (10-04 sport-schedules run) and `/nba` on Production.
2. Founder gates 1, 2, 4, 5.
3. Ask NBA factual grounding → forward box-score capture → NBA v1 candidate.

## 10. Closeout (same session, after founder decisions — 2026-10-02 ~08:10–08:40Z)

### Founder decisions recorded
1. **PIT @ CLE props** — grade from the official final box score through the normal canonical settler; the expired live-props window is **not** widened retroactively; frozen pregame forecasts preserved. ✔ done (below).
2. **F-NBA-1** — no methodology change to publish NBA predictions by Oct 20. NBA launches factual (schedule / finals / hub); Game Win + Projected Score **SHADOW**, player props **WITHHELD**, simulation **RESEARCH**. Validation continues in a dedicated NBA session.
3. **NBA navigation** — add `/nba` to the product navigation after Production verification, as a factual hub that does not imply predictions. ✔ PR #917.
4. **Live TD** — APPROVED: factual TD state derived from the canonical box-score / player-id path; UNMEASURED stays distinct from NO TD; no updated live TD probabilities. **Not implemented this session** (no new implementation phase) — carried as the next Live unit.
5. **Free live-props schedule** — APPROVED: schedule the zero-credit factual workflow with event-aware pregame / live / post-final coverage so a legitimate final capture is never lost to the 8h kickoff window. No paid odds. **Carried** to the next Live unit.
6. **Phase H** — no spend or re-authorization this session; a dedicated live-market capability/cost pilot is carried into the next roadmap phase.

### Merges (exact head + tree reconfirmed immediately before each)
| PR | Merged | Merge commit | Tree check |
|---|---|---|---|
| #912 finals record | 08:12:39Z | `c6b5b1e70b` | merge-tree == tested head tree (`f60a49ba`) |
| #913 /nba hub | 08:12:56Z | `20af4ab19a` | merge-tree == tested head tree (`3513339b`) |
| #914 soccer core | 08:34:59Z | `f8e18dbee7` | refreshed with `merge origin/main` (never rebase) → re-tested head `0c0f20688a`; the remaining merge gap = exactly 9 `gtp-bot` data commits (identical patch-id, only `app/public/data/` + `data/`, zero overlap with PR files) |
| #915 live TD truth | 08:35:03Z | `703203b4b8` | re-tested head `57edbcc407`; same bot-only gap proof as #914 |
| #917 NBA nav | 08:58:09Z | `d648590714` | opened after `/nba` Production verification; refreshed after #914/#915 → re-tested head `4c5e7998a6`, merge-tree == head tree |

### Production verification — `/nba`
Production `4798cf0a` (contains #913): `/nba` 200, title "NBA — Schedule & Finals", one `<h1>`, "Schedule only — no public forecast", 23 games, freshness "updated Oct 2, 4:15 AM ET", no percentage, no undefined/NaN/null; 390 px and 1280 px no horizontal overflow; 46 crests, 0 broken; 0 console errors.

### PIT @ CLE (401872964) — canonical settlement evidence
Chain run through the normal workflows, zero credits: `sport-schedules` (dispatch 08:14Z) committed `auto: nfl results capture` (`c651b9e129`, PIT @ CLE `STATUS_FINAL` CLE 27 – PIT 24); `nfl-event-window` (08:16Z, `skip_odds`) committed `auto: nfl settlement receipts` (`d16ca2c15a`). (A second `skip_odds` dispatch at 08:16:57Z lost a rebase race to that run and wrote nothing — duplicate, harmless; settlement is idempotent.)

| Owner | Result |
|---|---|
| Official final | `data/internal/nfl/official-stats/401872964.json` — `FINAL`, ESPN official box score, captured 08:17:08Z |
| Market paper record (`settlement/2026-10-01.json`) | PIT @ CLE moneyline LOSS · spread WIN · total WIN → 2–1; 1 settled, 15 pending, `reconciles: true`; pending never a loss |
| Forecast record (`experimental-settlement/2026-10-01.json`) | receipt `401872964-rev-2230Z.json` (frozen 22:30:25Z, revision chain intact); winner 0/1 · margin MAE 5 · total MAE 12 · both 80% intervals covered · Brier 0.3302 vs market 0.33 (one game — no claim) |
| Week 4 reconciliation (`reconciliation/2-04.json`, public) | 1 final / 15 pending; 33/39 checks: receptions 12/13 · receiving yds 11/13 · rushing yds 6/7 (2 void) · passing yds 2/2 · total range 1/1 · margin range 1/1 · winner 0/1 · likeliest TD scorer 0/1 |
| Frozen Top-5 board (`results/top-boards/2026-10-01.json`) | unchanged since its single write (2026-10-01T00:33:59Z); Results overlays the reconciliation owner at build — no browser settlement |
| Live-props ledger (`settle-nfl-live-props`) | stays PENDING for this game by decision 1 — the producer never observed FINAL and its window is not widened; the authoritative grade is the reconciliation above |
| No duplicate grade | settlers are exactly-once by canonicalEventId; the losing duplicate run committed nothing |
| Results parity (Production `d16ca2c1`) | ✔ `/results/nfl` reads "Week 4: 84.6% of our predictions came true — 33 of 39 checks across 1 final game", the 15 unfinished games listed as not final — identical to the owner |
| **Ask parity (Production)** | ✗ **not achieved** — "How did GameTimePicks do on PIT at CLE?" resolved PIT to the Pittsburgh **Pirates** (MLB) and answered "no data"; "How did the NFL Week 4 predictions do for Steelers at Browns?" answered a season aggregate ("43–33 with 2 void from 76 decided, EMERGING") that does not tie to one owner population I could confirm (owner: regular season 33 settled; preseason 43). Ask has no per-game NFL result tool. Also the static `/ask` capability panel still says "NFL live state is not available", contradicting #894. **Backlog P1** (Ask NFL per-game results tool + NFL team-abbreviation disambiguation + panel copy) — not fixed this session by instruction |

### Final state
- **Main:** `d648590714` (#917) + this docs PR (#916, merged last). **Production:** see the PR #916 description for the verified SHA and the nav check.
- **Carried to the next sessions (approved, not started here):** Live TD factual gateway family (decision 4) · event-aware schedule for the free live-props workflow with post-final coverage beyond the 8h kickoff window (decision 5) · Ask NFL per-game results + team-abbreviation disambiguation + `/ask` panel copy (P1) · dedicated NBA validation session (decision 2) · live-market capability/cost pilot (decision 6, no spend now).

