# Launch-readiness matrix: GameTimePicks public launch, Tue 2026-10-20

**Prepared:** Fri 2026-10-16, 20:05–20:45Z (afternoon ET), by a read-only Claude Code session. Docs only; nothing was built, merged, deployed or paid for.
**Repository state:** `origin/main` = `934055d613` at 20:11Z (bot data commits only since the last code merge, #1091 → `39df089d02`).
**Production state:** `/data/build-info.json` read once at 20:10Z: commit `d6de0ceb47`, built 2026-10-16T20:02:53Z. That is the `main` HEAD from 20:01Z (a bot data commit on top of every merged code change).
**Planning authority:** `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` §16 (UX System V2 plan, schedule: freeze Oct 17, UAT Oct 18–19, launch Oct 20), plus the unmerged session logs on #1083 (`de18142118`).
**Companion:** `docs/launch/UAT_OCT18_19_PLAN.md` (test scripts, rehearsal and go/no-go rubric).

## How to read this

**Status values (founder taxonomy, converted 2026-10-17 ~07:20Z).** Each row uses exactly one of these:

| Status | Meaning |
|---|---|
| **VERIFIED** | Checked and passing. Always followed by its verification level (below) |
| **PENDING** | Work exists or is scheduled with a clear path, but the evidence is not complete. This includes every PR that is green but **unreleased**: a green PR is never VERIFIED in Production |
| **BLOCKED** | It cannot progress without a named founder decision, console action, credential, counsel or engineering fix |
| **DEFERRED** | Out of launch scope by recorded decision or plan |

**Verification levels for VERIFIED rows:**

| Level | Meaning |
|---|---|
| **LOCAL** | A local or offline check (for example on the served commit) |
| **CI** | GitHub Actions on `main` |
| **PRODUCTION-DEPLOYED** | Observed on the live Production deployment, or a recorded Production acceptance |
| **REAL-EVENT ACCEPTANCE** | Observed through a real game or event lifecycle in Production |

**Conversion from the 10-16 values:**
- PRODUCTION VERIFIED → VERIFIED with a level.
- IMPLEMENTED — NOT RELEASED → PENDING.
- TESTING IN PROGRESS → PENDING. Exceptions: P-04 → DEFERRED; O-07 → BLOCKED (FD-9); L-07 → BLOCKED.
- BLOCKED — FOUNDER DECISION → BLOCKED.
- BLOCKED — ENGINEERING → DEFERRED, because both rows are listed post-launch in UAT §4.
- FAILED (O-03) → VERIFIED · CI, now that it is fixed.
- Rows whose status changed for a new reason carry a **10-17** note in Evidence.

**Evidence collected in this pass, 2026-10-16:**
- One HEAD request per route, sequential, 20:10:16–20:10:49Z (25 routes).
- One GET each of `/`, `/account/` and `/data/build-info.json`.
- `gh run list` for every run since 2026-10-16T00:00Z: 178 runs.
- GitHub `Vercel` commit statuses on the 114 `main` commits since 2026-10-15T15:00Z.
- `node scripts/internal-alpha-day.mjs` on `d6de0ceb47`.
- `gh pr view` for each of the 37 open PRs.

No request was challenged by Vercel.

**Earlier evidence.** Production acceptances cited as "recorded" come from the roadmap session logs (main, §25 2026-10-13) or from #1083. They were not re-run in this pass.

**Owners:**
- **Founder:** decisions, console actions, merges and Vercel dashboard.
- **Eng:** the single primary engineering session.
- **Live:** the Live Hub capture session.
- **Counsel:** a qualified legal reviewer. Not yet engaged on record.
- **Automation:** scheduled workflows.

**Launch blocker = Yes:** launch should not proceed until the row is resolved, explicitly accepted by the founder, or removed from scope (for example, accounts disabled).

---

## 1. Product experience

All routes come from the source route table `app/src/lib/audits/route-inventory.mjs`: 93 `page.tsx` routes, all classified.

Release history behind these rows (all recorded):
- UX System V2 Release 1: #1072 → `ab9ad4059d`, Production-verified 2026-10-13, 19 routes × 3 widths.
- P0 + Release 2A: #1080 → `d4bc2a1def`, verified 2026-10-14. 18 affected routes at 1440/390, plus a 91-page phone sweep with 0 failed pages, 0 console errors and 0 CSP violations.
- Release 2B + LIVE-F: #1081 → `5917475b53`, verified 2026-10-14. 36-view sweep at 1440/390.

| ID | Requirement | Status | Evidence | Owner | Launch blocker |
|---|---|---|---|---|---|
| P-01 | **Home** `/`: truthful hero, featured simulations, live strip, results recap | VERIFIED · PRODUCTION-DEPLOYED | 200 at 20:10Z on `d6de0ceb47`. GTP-02/10/27/33 fixed in #1080, Release 1 fold in #1072. Footer carries "Contact support · We reply within 2 business days" (GET 20:10Z) | Eng | No |
| P-02 | **Today** `/today`: Live first, folded deeper sections, correct event count | VERIFIED · PRODUCTION-DEPLOYED | 200 at 20:10Z. Header reads "Today · Oct 16 · 13 events" in the `/account/` HTML fetched 20:10Z. #1072 fold, #1073 count | Eng | No |
| P-03 | **Live Hub** `/live` (LIVE-F): one card layout, LIVE/UPCOMING/FINAL badges, "Forecast locked pregame", report link; untracked sports never shown as live | VERIFIED · REAL-EVENT ACCEPTANCE | 200 at 20:10Z. LIVE-F shipped in #1081. SEA@DEN capture 10-15/16 (`docs/live/LIVE_V2_SEA_DEN_ACCEPTANCE.md` on #1082): 312 requests, 0 non-200; checks 1–4, 6, 8, 10–12, 16, 18, 22–23 PASS. `/live` states "NBA, Premier League and UFC are not tracked live yet" | Eng / Live | No |
| P-04 | **Live Hub V2** (prop rails, Live/Upcoming/Final grouping) | DEFERRED | Preview only: #1082 `c52d426125`; #1108/#1111 stacked, with red `quality`. Promotion needs NFL Sun 10/18 plus one MLB postseason game. Roadmap §16 puts it in P2. **10-17:** DEFERRED from launch scope (roadmap P2; not a launch route). Sunday capture and an MLB postseason game continue toward promotion | Live | No (not in launch scope) |
| P-05 | **Game-page live panel**: label after final | PENDING | The SEA@DEN capture showed "LIVE NOW" above "Final/OT" (cosmetic). Fixed by #1112 `65855730e8` (CI green), which is in the consolidated UX release | Eng | No |
| P-06 | **NFL** `/nfl`, `/nfl/game/[eventId]`, `/nfl/week/[key]`, `/nfl/simulation/[eventId]`; redirects `/nfl/world-model*` | VERIFIED · PRODUCTION-DEPLOYED | `/nfl` 200 at 20:10Z. Hub folded 24,232 → 15,651 px on a phone (#1081). Week 6: 13 events. The game page shows "Forecast frozen at Oct 15, 8:09 PM ET" for SEA@DEN | Eng | No |
| P-07 | **NBA** `/nba` (schedule and finals, no forecast); opening night Oct 20 | VERIFIED · PRODUCTION-DEPLOYED | 200 at 20:10Z. Nav label "NBA · schedule + final scores · no forecast". GTP-11 date list fixed (#1080). "Regular season opens October 20, 2026" (#1067). The first regular-season slate is checked in UAT F-07 on Oct 20 | Eng | No |
| P-08 | **MLB** `/mlb`, `/mlb/board`, `/mlb/board/[date]`, `/mlb/power`, `/mlb/results`, `/games/[sport]/[gameId]` | VERIFIED · PRODUCTION-DEPLOYED | `/mlb` 200 at 20:10Z. ET slate date and signed run line fixed (#1070, accepted 10-13). GTP-14/24/34 fixed (#1080/#1081). Today's runs: mlb-daily-production 7/7 ✓, lineup-refresh 6/6 ✓, pregame-capture 5/5 ✓. **Known limitation:** `/games/mlb/<slug>/` exists only for the active slate, so yesterday's shared links 404 (#1083, 10-14 finding; founder decision FD-10) | Eng | No |
| P-09 | **UFC** `/ufc`, `/ufc/bout/[boutId]`, `/cage-chaos` | VERIFIED · PRODUCTION-DEPLOYED | `/ufc` 200 at 20:10Z. #1085 grading integrity: 71 rows = 70 decided + 1 VOID; withdrawn bout excluded. `card-latest.json` state `SCHEDULED_CARD`, generated 2026-10-16T17:17Z. The Oct 17 card is UAT F-09. No public UFC live tracking (labelled) | Eng | No |
| P-10 | **Soccer / EPL** `/epl`, `/epl/match/[slug]`, `/soccer/[league]` (Ligue 1) | VERIFIED · PRODUCTION-DEPLOYED | `/epl` 200 at 20:10Z. Nav: "Premier League · forecasts · not validated", "Ligue 1 · model-only forecasts · backtest only". `/epl` folded 21,848 → 12,460 px (#1081). epl-settle ✓ today; epl-matchweek running | Eng | No |
| P-11 | **Results & Tracking** `/results`, `/results/{mlb,nfl,forecasts,forecasts/[sport]/[family],picks,picks/[sport],parlay-lab,parlays,model-audit,date/[date]}`, `/mr-dub`, archive `/results/nba` | VERIFIED · PRODUCTION-DEPLOYED | `/results` and `/results/forecasts` 200 at 20:10Z. NFL headline truth (#1071); unsupported "beat" claims removed (#1074). The Forecast Record matched the ledger 25/25 files, 15,879 rows at `39df089d02` (10-15, recorded). The explorer still silently caps at 50 of 137 cards; paging fix #1104 is unreleased (P2 per roadmap) | Eng | No |
| P-12 | **Simulation** `/simulate`, `/simulate/d/[date]`; redirect `/games` | VERIFIED · PRODUCTION-DEPLOYED | `/simulate` 200 at 20:10Z. GTP-09/11/33/34 fixed (#1080) | Eng | No |
| P-13 | **Parlay Lab / Parlays** `/build`, `/build/custom`, `/cards/[sport]`, `/results/parlay-lab`; redirects `/parlay-lab`, `/picks`, `/parlays`, `/mlb/parlays`, `/nba/parlays` | VERIFIED · PRODUCTION-DEPLOYED | `/build` 200 at 20:10Z. GTP-08 fixed at the producer and the reader (UFC and multi-sport closed; #1080). `/parlay-lab` prefetch-abort console noise (15 errors) is pre-existing and benign (10-13 record) | Eng | No |
| P-14 | **Bank Builder** `/bank-builder` | VERIFIED · PRODUCTION-DEPLOYED | 200 at 20:10Z. GTP-04 fixed (#1080). Documented limitation: the page reads pool status at build time, so before the morning generation it says "not assessed". NFL eligibility today: `EVALUATED_NONE_QUALIFY` (run 38949424952) | Eng | No |
| P-15 | **Moonshot** `/moonshot` | VERIFIED · PRODUCTION-DEPLOYED | 200 at 20:10Z. GTP-26 legacy-lane pill, graded legs "see receipt" (#1080) | Eng | No |
| P-16 | **Product lanes** `/endzone-vault`, `/homer-nukes`, `/bucket-blitz`, `/goal-rush` | VERIFIED · PRODUCTION-DEPLOYED | Vault truth wording accepted 10-13 (#1069); `/bucket-blitz` copy accepted 10-13 (#1067). Not re-requested in this pass. Note: `ROUTE_TABLE` classifies `/goal-rush` and `/bucket-blitz` as `"product"`, which is not one of the four documented classifications (inventory hygiene, post-launch) | Eng | No |
| P-17 | **Player research** `/players/[sport]/[slug]` | VERIFIED · PRODUCTION-DEPLOYED | Exact-ID NFL/MLB portraits and fighter photos (#1081 36-view sweep, 10-14, recorded). Not re-requested in this pass; UAT F-16. EPL player portraits are deferred (no authorized IDs) | Eng | No |
| P-18 | **Team research** `/teams/[sport]/[slug]` | VERIFIED · PRODUCTION-DEPLOYED | EPL crests and NFL/MLB logos (#1081, 10-14, recorded). Header-size EPL crests are in #1105 (unreleased). UAT F-16 | Eng | No |
| P-19 | **Compare / Matchups** `/compare`, `/compare/teams/[sport]`, `/compare/players/[sport]`, `/matchups/[sport]/[gameId]` | PENDING | No Production evidence for these routes in this pass or in the cited sweeps by name. UAT F-17 | Eng | No |
| P-20 | **Research Lab** `/research`, `/research/lab` | PENDING | Not requested in this pass. UAT F-17 | Eng | No |
| P-21 | **Models & methodology** `/models`, `/methodology`, `/learn`, `/market-guide`, `/about`, `/system-status` | VERIFIED · PRODUCTION-DEPLOYED | `/models`, `/methodology` and `/system-status` 200 at 20:10Z. GTP-22 names the metric (log loss, lower is better), n and the interval (#1080). The GTP-29 copy items on `/learn` and `/responsible-use` are partly fixed (#1081); see L-03 | Eng | No |
| P-22 | **Markets** `/markets` | VERIFIED · PRODUCTION-DEPLOYED | GTP-06 snapshot date instead of "today" (#1080, 10-14, recorded). Not re-requested in this pass | Eng | No |
| P-23 | **Ask GameTime** `/ask` + `/api/ask` (Gemini) | BLOCKED | `/ask` 200 at 20:10Z. The answer path was not exercised (paid). Kill switch `ASK_GAMETIME_ENABLED` (`app/api/_ask-core.mjs:32`). Only a per-instance rate limit. The provider-level cap (Google Cloud quota override plus budget alert) was a 10-13 founder decision; completion is **not recorded anywhere**. A 503 body names config variables (#1090, unreleased) | Founder | **Yes**: confirm the cap, or turn Ask off for launch (FD-4) |
| P-24 | **User accounts** `/account` (Your bets, magic-link sign-in, hand-entered slips), `/api/slip-read` | BLOCKED | **Accounts are enabled in Production.** The 20:10Z HTML has the "Your bets" nav link, which is built only when `NEXT_PUBLIC_SUPABASE_URL` is set (`docs/ACCOUNTS_SETUP.md` §3), and `/account/` shows "Checking your session…". Slip reading is off (`/api/slip-read` 503, 10-14 record). `/privacy` and `/terms` are 404 (L-01/L-02). The hosted RLS check has not run (O-10). Deletion is manual (L-04) | Founder | **Yes**, while accounts are enabled |
| P-25 | **My GameTime** `/my`, `/following`, `/saved` (device-local, noindex) | PENDING | Not requested in this pass. GTP-23 "board updated" label on `/saved` (#1080). UAT F-18 | Eng | No |
| P-26 | **Sports directory** `/sports` | PENDING | Not requested in this pass. GTP-29 removed the hard-coded sport count (#1081). UAT F-17 | Eng | No |
| P-27 | **Feedback** `/feedback` (noindex, `beta_feedback` RLS) | PENDING | Not requested in this pass. Depends on accounts (P-24). UAT T-06 | Eng | No |
| P-28 | **Redirect stubs and archives**: `/games`, `/board`, `/projections`, `/events`, `/trends`, `/nhl`, `/ipl`, `/world-cup`, `/nba/results`; archives `/results/nba`, `/world-cup-specials` | PENDING | All classified in `ROUTE_TABLE`. July's open question ("do `redirect()` stubs emit under `output: export`?") has no recorded closure apart from `/parlay-lab` → `/build/#suggested-cards`. UAT F-19 | Eng | No |
| P-29 | **Internal surfaces are not public**: `/ops`, `/launch`, `/preview/*` | VERIFIED · PRODUCTION-DEPLOYED | `/ops`, `/launch` and `/preview/june20` returned 404 at 20:10Z. Classified internal. `vercel.json` adds noindex and no-store for `/(launch|ops|preview)` | Eng | No |
| P-30 | **Legal routes** `/privacy`, `/terms` | BLOCKED | 404 at 20:10Z (gate locked by `legalReadiness()`). See L-01/L-02 | Founder / Counsel | **Yes** (with accounts enabled) |
| P-31 | **Consolidated UX release** (#1092 ET timestamps, #1102–#1107, #1109, #1112) | PENDING | Local integration 10-16 03:55Z: build 147 s, 10,122 unit + post-build tests with 0 failures, 14-check sweep (#1083 log). Being consolidated into one release branch now. Not yet on the remote. #1103 is red on CI (IDEMPOTENT same-day re-run test) | Eng → Founder | No (polish); a release needs FD-7 |
| P-32 | **Accessibility**: one h1, roving tabs, 44 px targets, keyboard, VoiceOver, 200% zoom | PENDING | Structural: one h1 everywhere (10-13), roving tabs (#1087, verified 10-15), 44 px targets (#1081). Real-device, VoiceOver and 200% zoom checks are an open roadmap verification gate (§16) | Eng / Founder | No |
| P-33 | **Responsive layout** at 320/390/768/1440 | PENDING | Recorded sweeps cover 390/820/1440 (10-13) and 1440/390 (10-14). **320 and 768 have not been swept since Release 2B.** UAT V-01 | Eng | No |

## 2. Data and model integrity

| ID | Requirement | Status | Evidence | Owner | Launch blocker |
|---|---|---|---|---|---|
| D-01 | **Forecast provenance going forward** (Option B: the forecast of record is the revision served by a READY deployment before start) | VERIFIED · REAL-EVENT ACCEPTANCE | NFL: SEA@DEN check 1 PASS. Frozen forecast, board and receipt hashes were identical across 40 post-kickoff passes, with no revision stamped at or after kickoff. Per-game hash-bound `frozenPregame` is displayed (GTP-23, #1080) | Eng | No |
| D-02 | **Historical MLB forecast of record** (29 games graded from unserved revisions, plus 2 never public; shadow #1046, 2026-10-10) | BLOCKED | Stage B restatement #1045 and timing amendment #1049 are DRAFT and not applied. Their `quality` is red. The MLB grader still uses "newest generated before first pitch" (roadmap §4) | Founder / Eng | No, if the founder accepts it as a known limitation (FD-10) |
| D-03 | **Frozen pregame**: no change after start; frozen ≠ generated ≠ published | VERIFIED · REAL-EVENT ACCEPTANCE | SEA@DEN checks 1 and 10 PASS. "Forecast frozen at Oct 15, 8:09 PM ET" against an 8:15 PM kickoff. GTP-23 regression test: no displayed freeze time is later than the start | Live | No |
| D-04 | **Player eligibility / product gating** | VERIFIED · PRODUCTION-DEPLOYED | nfl-event-window 38949424952 (18:44Z): 13 events considered, 0 qualify. Bank Builder, Moonshot and build-inventory `EVALUATED_NONE_QUALIFY`; Vault `PRODUCT_GATED`. All 5 families "not eligible" with reasons (`FORWARD_TEST_IN_PROGRESS`, `ROLE_NOT_CONFIRMED`, `NO_PREGAME_PRICES`, …). The page display is checked in UAT D-04 | Automation | No |
| D-05 | **Injuries** | VERIFIED · PRODUCTION-DEPLOYED | Same run: "nfl injuries/latest.json: 800 entries + 22 carried forward, 0 quarantined, exact=true"; NBA 131 entries; freshness "injuries FRESH". Out and IR players are flagged per game (e.g. BAL @ CLE) | Automation | No |
| D-06 | **Roster changes / current team** | VERIFIED · PRODUCTION-DEPLOYED | Same run: "NFL ROSTER AUDIT · 13 board(s) · 26 team(s) on the slate of 32 rostered · violations: 0"; rosters FRESH (32/32 teams, 2,563 athletes). MLB lineup-refresh 6/6 ✓ today | Automation | No |
| D-07 | **Market availability** (stated honestly when no price exists) | BLOCKED | The NFL odds budget is exhausted: "REFUSED: cumulative 1160 + worst-case 3 would cross the 1160-credit Program 171 ceiling" (runs 38937035149, 38827747478). The display says "the market was not checked in this window" (#1069, accepted 10-13). Week 6 Sunday therefore has no NFL prices, which is honest but thin | Founder | No (honest state); funding is FD-8 |
| D-08 | **No fabricated odds**; market price ≠ GTP probability | VERIFIED · PRODUCTION-DEPLOYED | Odds come only from the receipt-gated capture; the budget refusal produces "not checked", not a number (#1069). Model and market are labelled separately (DS-001 §probability) | Eng | No |
| D-09 | **No unsupported confidence or performance labels** | VERIFIED · PRODUCTION-DEPLOYED | #1074: no "beat" claim without an interval. GTP-34: "VERY STRONG" → "x% of simulated games · unvalidated". GTP-22: names log loss (lower is better) and the interval. MLB board filters say gap size, not confidence (#1081). EPL "not validated" | Eng | No |
| D-10 | **No look-ahead** (point-in-time features) | DEFERRED | `TEMPORAL-001` is NOT_STARTED (roadmap §2). In place today: frozen pre-start receipts, forward-only shadows, write-once NFL WM2 runs. No platform-wide point-in-time guarantee exists. Do not claim one | Eng | No |
| D-11 | **Settlement denominators**: pending, void, push and withdrawn are never losses | VERIFIED · PRODUCTION-DEPLOYED | UFC: draw VOID once, withdrawn excluded, pending excluded from n (#1076/#1085, 10-14). NFL tie is void (#1071: 8 of 14 decided). Open July item: blocker register #6 ("settle log hit_rate includes voids", log line only); no closure recorded | Eng | No |
| D-12 | **Canonical settlement of live games** (SEA@DEN check 9) | VERIFIED · REAL-EVENT ACCEPTANCE | Prop settlement canonical 13:57Z Oct 16 (lead-verified). Production now serves `d6de0ceb47`, which contains it. The capture report has not yet recorded Results, game page and `/live` agreeing (check 9). UAT D-06. **10-17:** SEA@DEN check 9 PASS; the canonical prop settlement was first served at 2026-10-16T17:12:52Z (session report §6) | Live | No |
| D-13 | **Historical reporting immutability** (settled history not rewritten) | BLOCKED | Each nightly-settle run rewrites 380–386 past-dated files: 16,823 `gradedAt` and 32 `settledAt` values with no content change. The guard is #1101 `22b0ac73bd` (protected workflow, CI green, awaiting approval). Content is unchanged; only stamps churn | Founder | No |
| D-14 | **Forecast Record = ledger** (served CSVs match the ledger) | VERIFIED · PRODUCTION-DEPLOYED | 25/25 files, 15,879 rows hash-identical at `39df089d02` (2026-10-15, recorded). Bot data commits have landed since; re-run in UAT D-05 on the served SHA | Eng | No |
| D-15 | **Money / paper-portfolio artifacts unchanged** | VERIFIED · LOCAL | internal-alpha-day 10-16 on `d6de0ceb47`: "Protected money artifacts unchanged: 2/2 match pinned md5". Level LOCAL: offline script on the served commit | Automation | No |
| D-16 | **Board freshness / settlement currency** | VERIFIED · LOCAL | internal-alpha-day: newest board 2026-10-16, settled through 2026-10-15, quarantines s=1 r=0. Level LOCAL: offline script on the served commit | Automation | No |

## 3. Operational

| ID | Requirement | Status | Evidence | Owner | Launch blocker |
|---|---|---|---|---|---|
| O-01 | **Scheduled data workflows** healthy today | VERIFIED · PRODUCTION-DEPLOYED | 178 runs since 00:00Z (see §3a). All data producers green: mlb-daily-production 7, nba-forecast-window 26, nfl-kickoff-refresh 22, nfl-pregame-free-refresh 21, nightly-settle 5, publication-watchdog 13, cron-watchdog 2, … | Automation | No |
| O-02 | **nfl-event-window**: budget refusal reported as a run failure | DEFERRED | 2 of 5 runs today fail with exit 5 at "Authorized odds capture". Cause: the P171 ceiling (D-07), not a pipeline fault; the later steps ran (roster audit 0 violations). This masks real failures (noted 10-13: 30 of 43 runs). Fix: treat budget refusal as non-fatal, or fund the program. **10-17:** DEFERRED, listed post-launch in UAT §4 | Eng / Founder | No |
| O-03 | **Main HEAD unit and contract check** (`data-contract-check`) | VERIFIED · CI | 3 consecutive scheduled failures on `main`. Runs 38853435964 (05:00Z) and 38896919104 (11:55Z): `product-day.test.mjs` "EQUIVALENCE · nfl day …". Run 38935977638 (16:57Z): `totals-play-efficiency.test.mjs:109`, `espn.size >= 28`; actual 26, because Week 6 has 6 teams on bye. This takes a precondition from rolling committed data, which the CI-001 rule forbids. **Any PR's `quality` re-run on current data will fail the same assertion**, so exact-head CI for the UX release or a launch-day fix is blocked. **10-17:** #1114 merged 23:44:59Z; `data-contract-check` green on `main` at 23:53Z (38983736869) and 04:59Z 10-17 (39004608711); quality-gate on the merge green (38983047887). CI level only | Eng | **Yes**: one-line test fix; gates every merge |
| O-04 | **Build reliability** (Vercel 46-min memory kills) | VERIFIED · PRODUCTION-DEPLOYED | #1093 (4 workers) merged 10-15. On the 114 `main` commits since 10-15 15:00Z: 72 "Deployment has completed", 17 "Canceled by Ignored Build Step", 12 queue-superseded ("Canceled from the Vercel Dashboard", per #1110 §11.2), **0 failed**. The margin is thin: 14.82G/16G peak. #1094 (3 workers) is on hold; #1095 adds observability | Eng | No |
| O-05 | **Deployment monitoring / Vercel credentials** | BLOCKED | The Vercel token is expired. The OPS-002 authoritative verdict, build logs and billing all need a fresh token. The GitHub-side OPS-002 pre-check is clean (607/607 bot commits attributed). The 72-hour deploy watch (GitHub API) runs until 10-18 14:30Z | Founder | No |
| O-06 | **Scheduler lateness** (GitHub cron best-effort) | PENDING | 10-14: scheduled crons ran 4–9 h late (#1083 matrix). cron-watchdog ✓ 2/2 and publication-watchdog ✓ 13/13 today. UAT O-02 records Sunday's lateness | Automation / Eng | No |
| O-07 | **Rollback** (revert-merge; Instant Rollback only per runbook) | BLOCKED | `docs/INCIDENT_AND_ROLLBACK_RUNBOOK.md` §4, §9, §10. October addendum §11 is in #1110 `e877e38cef` (docs, unmerged). **The rehearsal has not been performed.** The window in #1110 §11.5 (Sun 08:00–09:00 ET) overlaps the pre-kickoff period of HOU @ JAX (Sun 9:30 AM ET, London). A rollback stops new pushes going live, so its final pregame revision might not be served before start (Option B). Use Mon 10-19 instead (UAT O-05). **10-17:** dry-run rehearsal Mon 10-19 07:00 ET (package 4) awaiting FD-9; blocked on founder approval and execution | Founder / Eng | **Yes**: rehearse, or the founder waives in writing |
| O-08 | **Security headers** | VERIFIED · PRODUCTION-DEPLOYED | GET `/` 20:10Z: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `strict-transport-security: max-age=63072000`, `content-security-policy-report-only: …` (#1075, `app/vercel.json`) | Eng | No |
| O-09 | **CSP enforcement** | DEFERRED | **CSP is Report-Only; nothing is enforced.** It allows `'unsafe-inline'` scripts. 0 report-only violations on 91 pages (10-14). There is no report endpoint, so violations are seen only in DevTools | Eng | No |
| O-10 | **Account security / RLS** | BLOCKED | Live RLS battery against a local Postgres on every main CI: 82–84 PASS (#1084, 10-14). **The hosted Supabase project has never been verified** (`npm run accounts:verify`, anon read-only; or `--hosted`). Needs founder authorization and keys in the founder's shell | Founder | **Yes**, while accounts are enabled |
| O-11 | **Cost alerts: Vercel** | BLOCKED | COST-001: "awaiting founder spend-alert confirmation" (roadmap §2). Steps are in `docs/COST_001_VERCEL_COST_CONTROL.md` §10, with Pause Production Deployments OFF. Baseline ≈ $9.9/day build CPU (10-15) | Founder | No |
| O-12 | **Cost alerts: Ask (Gemini) and Anthropic** | BLOCKED | See P-23. `ANTHROPIC_API_KEY` is evidently set while slip reading is off. Adding the service-role key would switch on a paid path outside the Ask cap (#1083, 10-14) | Founder | Yes, as part of P-23 |
| O-13 | **Odds API spend accounting** | DEFERRED | `mlb-pregame-capture` logs "credits spent 0" while spending about 3 per run (#1083, 10-14). Under-reports paid usage. **10-17:** DEFERRED, listed post-launch in UAT §4 | Eng | No |
| O-14 | **Error handling: API error bodies** | PENDING | #1090 `8af11b4e31`: 503 bodies from `/api/slip-read` and `/api/ask` no longer name configuration variables. CI green 10-15, MERGEABLE/CLEAN | Eng → Founder | No (recommended) |
| O-15 | **Live-data availability and provider failure** | PENDING | SEA@DEN: 312 requests, 0 non-200, 0 bot challenges. V2 replay: 0 disagreements, 0 lags. Provider failure (checks 19–21) and the delayed/stale line (check 7) were **not observed live**; fixture tests only. The Sunday window is UAT D-07. **10-17:** PENDING: availability is real-event verified, but the provider-failure path is fixture-tested only | Live | No |
| O-16 | **Publishing data-loss protection** (OPS-001) | VERIFIED · PRODUCTION-DEPLOYED | #1068, accepted 10-13. About 17 workflows keep their own loud retry loops (post-launch residual) | Eng | No |
| O-17 | **Alert delivery** (ops webhook) | PENDING | The 10-13 assessment lists "alert webhook delivering" under the final-UAT checks, with no delivery receipt recorded. The July blocker register #1 (`OPS_WEBHOOK_URL` absent) has no recorded closure. UAT O-04 | Founder | No |
| O-18 | **Support channel** | VERIFIED · PRODUCTION-DEPLOYED | Footer "Contact support · We reply within 2 business days" in the Production HTML (20:10Z). internal-alpha-day reports this BLOCKED only because it reads the local build environment, not Vercel's | Founder | No |
| O-19 | **Product analytics** | VERIFIED · PRODUCTION-DEPLOYED | Conflicting records. `docs/legal/COUNSEL_REVIEW_BRIEF.md` says analytics have been on since 2026-09-10; `docs/ANALYTICS_ACTIVATION_STATUS.md` (07-31) and internal-alpha-day (local env) say OFF. The Privacy draft text depends on the build flag (`texts.mjs` `ANALYTICS_LIVE`). UAT T-05 checks the network tab. **10-17:** settled. Analytics is **ON** in Production: the shipped chunk inlines `NEXT_PUBLIC_ANALYTICS_ENABLED:"1"` and the `/api/collect/` endpoint (package 1 §2, 01:19Z) | Eng | No |
| O-20 | **Bot challenge on automated Production checks** | PENDING | `x-vercel-mitigated: challenge` was seen on 10-15. None today. UAT follows `docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md`: read the SHA in a real browser and outcomes from GitHub statuses | Eng | No |

### 3a. GitHub Actions on 2026-10-16 (00:00Z → 20:07Z, 178 runs)

| Workflow | Runs | Result |
|---|---:|---|
| nba-forecast-window | 26 | 26 ✓ |
| nfl-kickoff-refresh | 22 | 22 ✓ |
| nfl-pregame-free-refresh | 21 | 21 ✓ |
| nba-results-refresh | 20 | 20 ✓ |
| publication-watchdog | 13 | 13 ✓ |
| daily-products | 8 | 8 ✓ |
| nfl-sim-v2-shadow | 8 | 8 ✓ |
| mlb-daily-production | 7 | 7 ✓ |
| mlb-lineup-refresh | 6 | 6 ✓ |
| morning-projections | 6 | 6 ✓ |
| mlb-pregame-capture | 5 | 5 ✓ |
| nightly-settle | 5 | 5 ✓ |
| **nfl-event-window** | 5 | 3 ✓, **2 ✗**: 38827747478 (00:08Z, dispatch) and 38937035149 (17:05Z). Both exit 5 at the odds budget refusal (O-02) |
| **data-contract-check** | 3 | **3 ✗**: 38853435964, 38896919104, 38935977638 (O-03) |
| **quality-gate** | 4 | 3 ✓, **1 ✗**: 38846606143 is PR #1108 (`claude/live-v2-replay`), not main |
| auto-refresh, results-top-boards | 3 each | ✓ |
| cron-watchdog, soccer-leagues | 2 each | ✓ |
| epl-settle, mlb-research-integration, nfl-props-forward-shadow, soccer-dc-shadow, sport-schedules, ufc-fight-week, ufc-post-card, weather-capture | 1 each | ✓ |
| epl-matchweek | 1 | in progress at 20:07Z |

## 4. Legal and compliance

**What exists:**
- **Gate:** `app/src/lib/legal/texts.mjs` `legalReadiness()` with `content-manifest.mjs`. A page publishes only when the approval receipt's content hash equals the current text and no parameter is null or a placeholder.
- **Parameters** (`LEGAL_PARAMETERS`, as of `main`):

| Parameter | Value | Note |
|---|---|---|
| `operator` | "GameTime Picks" | **placeholder** |
| `state` | **null** | |
| `audience` | the United States | |
| `minimumAge` | "18" | flagged as counsel question 7 |
| `framing` | research and education | |
| `analyticsRetentionDays` | 90 | |
| `effectiveDate` | **null** | |
| `site` | gametimepicks.yashwantbalaji.com | |

- **Drafts:**
  - `docs/legal/terms-draft.md` and `privacy-draft.md`, with the counsel brief `docs/legal/COUNSEL_REVIEW_BRIEF.md` (2026-09-10).
  - #1077 `9de2f79bd2` (CI green 10-13, unmerged) corrects them to describe the accounts, Supabase, deletion-by-request and Ask→Gemini flows. It is still unpublished.
  - **The counsel brief on `main` still says "No … accounts, logins"**, which is false in Production today (P-24).

| ID | Requirement | Status | Evidence | Owner | Launch blocker |
|---|---|---|---|---|---|
| L-01 | **Privacy Notice** published and accurate | BLOCKED | `/privacy/` 404 (20:10Z). Gate locked: operator placeholder, state null, effective date null, no counsel approval receipt. The accurate draft is #1077 (unmerged) | Founder / Counsel | **Yes**, while accounts are enabled (GTP-01, the only open audit P0) |
| L-02 | **Terms of Use** published | BLOCKED | `/terms/` 404 (20:10Z). Same gate and parameters as L-01 | Founder / Counsel | **Yes**, while accounts are enabled |
| L-03 | **Responsible Use** page accurate | BLOCKED | `/responsible-use/` 200. It states 18+, US, not betting advice and 1-800-GAMBLER (brief). Two open issues: (a) the age conflicts with `docs/ACCOUNTS_SETUP.md` ("21+ gate"); (b) it still describes a slip-comparison "Parlay Center" that `/build` does not offer (flagged 10-14 as legal-adjacent, left unedited) | Founder | No for the page itself; the age is part of FD-1 |
| L-04 | **Accounts compliance** (data inventory, retention, deletion, third parties) | BLOCKED | See the data-flow list below this table | Founder / Counsel | **Yes**, while accounts are enabled |
| L-05 | **Qualified legal review** | BLOCKED | No counsel engagement or approval receipt is recorded. The open questions are the next list below. The brief must be re-issued with #1077's hashes | Founder → Counsel | **Yes** for L-01/L-02 |
| L-06 | **Account-feature disable option** (description only; **not a recommendation**) | BLOCKED | See "The account-feature disable option" below. No change is recommended or made without founder approval | Founder | No; it is an alternative path, not a requirement |
| L-07 | **Analytics disclosure** | BLOCKED | Depends on O-19. The Privacy text renders analytics language from the build flag, so the reviewed hash must be taken from a build with the Production flag value. **10-17:** O-19 settled (ON), so the open part is counsel's Q10 and publication through L-01 | Eng / Counsel | No (part of L-01) |

**L-04: data flows that exist today.** These are the flows #1077 discloses.
- Supabase stores:
  - the account email (magic link);
  - optional profile fields: display name, risk level, bankroll, unit size, self-set limits;
  - `bet_slips` rows;
  - images in a private `slips` bucket.
- Account deletion is **manual**: delete the storage folder by hand, then the row cascade. There is no in-site delete.
- Slip reading (Anthropic) is off.
- Ask sends question text to Google Gemini.
- Images load from ESPN, MLB and NBA CDNs.

**L-05: questions for qualified legal review.**
- Questions 6–11 from the counsel brief:
  - **Q6:** gambling advertising or affiliate status;
  - **Q7:** is 18+ adequate vs 21;
  - **Q8:** mandatory signposting;
  - **Q9:** liability disclaimer;
  - **Q10:** privacy regime for cookieless counts;
  - **Q11:** advertising standards for a published win/loss record.
- New since the brief:
  - **(a)** what an account holder must be told and offered: notice, retention, deletion and access, and the state laws that apply;
  - **(b)** whether storing user-entered wager slips, bankroll and loss-limit fields changes the regulatory picture;
  - **(c)** disclosure for Ask's processing of question text by a third-party model provider;
  - **(d)** whether a manual deletion process is acceptable at launch.

### The account-feature disable option (L-06; described, not recommended)

**Mechanism:** remove `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the Vercel Production environment and let one Production build run. `accountsConfig()` (`app/src/lib/accounts/config.mjs`) returns UNCONFIGURED. The "Your bets" link is no longer built, and `/account` renders "accounts are not open yet". `/api/slip-read` is already 503.

**Implications:**
1. **Data:** data already in Supabase stays there and is not deleted. Obligations to existing account holders, including deletion requests and notice, continue. Whether to notify them is a counsel question.
2. **Users:** signed-in people lose access, and magic links already in flight stop working.
3. **Local features:** follows, saved forecasts and My GameTime are browser-local and keep working.
4. **Cost and reversibility:** it costs one Production build (≈ $0.15–0.28), and reversing it costs another.
5. **Legal:** it removes the reason the roadmap gives for Privacy/Terms blocking launch ("while accounts are enabled"). It does not publish Privacy/Terms. Ask→Gemini and any analytics are still data flows a counsel review may say need a notice.
6. **Tests:** the RLS battery and the schema guards are unaffected.
7. **Earlier decisions:** this reverses the earlier operation of the feature, so it needs an explicit founder decision.

## 5. Founder decisions required

These are exact questions. Each one unblocks the rows listed.

**Decision packages (2026-10-17, `docs/launch/decisions/`).** Each package holds the evidence, a step-by-step procedure and the refined questions. Where a package's questions are more specific than the row below, the package wins.
- FD-1/FD-2: [PRIVACY_TERMS_DECISION.md](decisions/PRIVACY_TERMS_DECISION.md)
- FD-3: [SUPABASE_SECURITY_VERIFICATION.md](decisions/SUPABASE_SECURITY_VERIFICATION.md)
- FD-4: [ASK_GAMETIME_SPEND_CONTROLS.md](decisions/ASK_GAMETIME_SPEND_CONTROLS.md)
- FD-9: [ROLLBACK_REHEARSAL.md](decisions/ROLLBACK_REHEARSAL.md)

| # | Question | Unblocks |
|---|---|---|
| FD-1 | For the Terms and Privacy Notice, supply: (a) the operator's legal entity name (replacing the placeholder "GameTime Picks"); (b) the governing US state; (c) the minimum age, 18 or 21; (d) whether you will engage qualified counsel now to approve both texts. Approval is recorded per section: reviewer, role, date, content hash and effective date | L-01, L-02, L-03, L-05 |
| FD-2 | At launch, do accounts stay enabled (which requires FD-1 publication and FD-3), or do you choose the disable option in §4 L-06? No change is made without your instruction | P-24, L-01–L-04 |
| FD-3 | Do you authorize one read-only `npm run accounts:verify` run against the hosted Supabase project, keys in your shell, which reads as an anonymous stranger and creates nothing? | O-10 |
| FD-4 | Is the Google Cloud quota override plus budget alert on the Gemini key's project in place? If not, should `ASK_GAMETIME_ENABLED` be off for launch? | P-23, O-12 |
| FD-5 | Will you (a) confirm the Vercel Spend Management alert (thresholds, Pause Production Deployments OFF) and (b) issue a fresh Vercel token for the OPS-002 verdict, build logs and billing? | O-05, O-11 |
| FD-6 | Do you approve #1101 (settled-history stamp guard) and #1088 (MLB stamp gate), both protected workflows, before launch, or defer them to after it? | D-13, cost |
| FD-7 | Do you approve one consolidated UX release before the Oct 17 freeze, or hold it for after launch? If it ships, which single name per destination (M6: `/simulate` "Simulations"/"Simulate"; `/build` "Parlays"/"Parlay Center"; `/cards/*` "Products"/"Paper cards"; `/results/picks/*` "Results"/"Full record"/"Picks vs Outcomes")? Does #1090 ride with it? | P-05, P-31, O-14 |
| FD-8 | The NFL odds program is at its 1,160-credit ceiling. Do you authorize a new receipt for Week 6 Sunday and launch week, or launch with NFL prices shown as "not checked"? | D-07, O-02 |
| FD-9 | Do you approve the rollback rehearsal for **Mon 2026-10-19, 07:00–08:30 ET**, with you executing the Vercel steps? It moves off #1110's Sunday 08:00–09:00 ET slot, which overlaps the 9:30 AM ET London kickoff | O-07 |
| FD-10 | Do you accept these as launch limitations? (a) 29 MLB historical games graded from unserved revisions, unrestated (#1045/#1049 drafts). (b) Yesterday's MLB game-page URLs 404 once the next board publishes. (c) CSP report-only. (d) The Results explorer caps at 50 rows until #1104 ships | D-02, P-08, O-09, P-11 |

## 6. Hard-blocker list (updated 2026-10-16 ~23:00Z)

### 6a. Engineering blockers: work done, each waiting only on merge approval
| # | Blocker | Status | What closes it |
|---|---|---|---|
| E-1 | ~~**`main` unit suite red: bye-week team count**~~ (O-03) | **CLOSED.** #1114 merged 2026-10-16T23:44:59Z at the approved exact head `c94eb076ee` (merge `2cb1ba3920`). `main`'s quality-gate on the merge passed: unit 9,402/9,404, 0 fail; post-build 696/699, 0 fail. Mutation controls hold on merged `main` (an unknown code and a lost franchise map each fail). Vercel skipped the build ("Canceled by Ignored Build Step"), so it cost 0 builds; Production serves `1f43c5ca90`, which contains it | Closed |
| E-2 | **Stale NFL next kickoff** (the second `main` CI failure) (O-03). The product-day EQUIVALENCE check failed at 04:59Z and 11:54Z. It is also a **user-facing defect**: after a Thursday or Monday game, Home and `/today` said the next window "appears when its forecasts publish" while 13 forecasts were published. It recurs after MNF on launch night | **#1118**, exact head `76c9e3c699`. CI green (unit 9,403/9,405, 0 fail). Real-data comparison: the stale case is fixed and the fresh case is identical. Approval package posted | Founder approves the merge |
| E-3 | **UAT live windows** (UFC 10/17 card; NFL Sunday 10/18). Both must pass with no P0 defect (UAT D-07, F-09) | NFL capture running (kit `ab2f28b88f`, pid 8301; 3 games). UFC is observed per the UAT plan | The windows themselves |

### 6b. Founder or legal blockers: engineering cannot close these
| # | Blocker | Needs |
|---|---|---|
| F-1 | **Privacy and Terms unpublished while accounts are enabled** (L-01, L-02, L-04, L-05, P-24, P-30). Verified: `/privacy/` and `/terms/` → 404, `/account/` → 200 | FD-1 plus qualified counsel, or FD-2's alternative. **Package:** [PRIVACY_TERMS_DECISION.md](decisions/PRIVACY_TERMS_DECISION.md). It covers the gate procedure and 24 draft-vs-Production rows. New: analytics is ON in Production, and Google Fonts and Ask's bankroll/risk fields are undisclosed |
| F-2 | **Hosted Supabase RLS unverified while accounts are enabled** (O-10) | FD-3. **Package:** [SUPABASE_SECURITY_VERIFICATION.md](decisions/SUPABASE_SECURITY_VERIFICATION.md): anon key + catalog SELECTs + two throwaway accounts; no service-role key. `accounts:verify` probes only 2 of 7 tables |
| F-3 | **Ask provider spending cap unconfirmed** (P-23, O-12) | FD-4. **Package:** [ASK_GAMETIME_SPEND_CONTROLS.md](decisions/ASK_GAMETIME_SPEND_CONTROLS.md). Ask is ENABLED in Production (zero-cost 400 probe, 10-17 01:27Z). If disabled, entry points stay visible and the error shows on submit. **Engineering half: #1121** (Production must name its provider; kill switch accepts off/no/disabled) |
| F-4 | **Rollback not rehearsed** (O-07) | FD-9. **Package:** [ROLLBACK_REHEARSAL.md](decisions/ROLLBACK_REHEARSAL.md): a dry run to the confirmation dialog, with an optional live switch at 07:00–07:30 ET. The Monday data chain now lands around 08:00 ET, not 10:15 |

### 6c. Ready releases that are not launch blockers (approval queue)
- **#1101 and #1088:** protected workflows, proposed window Sat 10:30–11:00Z. Packages and independent post-merge verifiers are in `docs/launch/approvals/`.
- **#1117, HTML Release 1** (exact head `4b4610366e`): −27.4% HTML with identical rendering. **Merge first.**
- **#1119, UX Release 1 on HTML Release 1:** #1115 reconciled onto #1117 (reconciliation `bb4f4a02be`, report `4465b08d40`). **Merge second.** It renders the same as #1115: 0 differing elements on 10 of 12 pages at all four widths, the other two differ only because their content changed between build times, and 0 differing pixels. HTML is −26.6% vs #1115. The 132-load sweep is clean. It supersedes merging #1115 on its own.
- **#1120, internal codes in reader words** (head `f218d544c9`, built on #1119): **merge third**. A post-build guard now fails if any internal state code reaches visible text; it passes on a full build. Presentation only, with 0 data change.
- **#1121, Ask spend control** (head `abb72dff26`): this is the engineering half of F-3. In Production, Ask refuses unless `ASK_MODEL_PROVIDER` names the provider, which ends the silent Anthropic fallback at about 10× cost outside the Gemini cap. The kill switch now accepts off/no/disabled. **Before merging**, confirm `ASK_MODEL_PROVIDER=gemini` in Production, or Ask returns 503 until it is set.

## 7. Evidence-based go/no-go assessment (as of 2026-10-16 20:45Z)

**Current position: NO-GO for a full public launch with accounts enabled.**
- **CONDITIONAL GO is reachable by Oct 20** if E-1 to E-3 and F-1 to F-4 close.
- **Engineering's remaining part is merge approvals** (#1114, #1118) plus the live windows.
- **The binding constraint is F-1** (legal publication).

Update 2026-10-16 ~23:00Z: §6 now separates engineering blockers from founder and legal blockers. The text below is the 20:45Z assessment.

**Strong:**
- Production is current: it serves `main`, with 0 build failures since #1093.
- Data workflows are green apart from a known budget refusal.
- Integrity has evidence behind it: frozen-forecast proof on a real NFL game, Forecast Record = ledger, protected money unchanged.
- Rosters and injuries are fresh with 0 audit violations.
- Security headers are present.
- Internal routes are not exposed.
- Every launch-route request in this pass returned 200, except the two legal routes that are locked by design.

**Blocking:**
- Legal publication has made no recorded progress since 10-13. The founder and counsel inputs are missing.
- Accounts are live without a published Privacy Notice or Terms, and the hosted RLS project has never been verified.
- Ask's spend cap is unconfirmed.
- `main` CI is red on a test defect.
- The rollback rehearsal has not run.

**Not blockers:** the unreleased UX polish, Live Hub V2 promotion, HTML reduction, CSP enforcement and the historical MLB restatement. The last needs the founder's explicit acceptance (FD-10).

### Final assessment (Sat 2026-10-17 ~07:20Z)

**NO-GO.**

It becomes **CONDITIONAL GO** when the four items below either close or are explicitly accepted by the founder in writing, and the Sunday windows produce no P0.

**What has improved since 10-16:**
- **Production = `main`:** `/data/build-info.json` read once at 06:26:50Z shows `2c617c780c`, the current `origin/main` HEAD.
- **`main` CI green:** O-03 is now VERIFIED · CI (#1114).
- **Canonical live settlement:** D-12 is VERIFIED · REAL-EVENT ACCEPTANCE.
- **Analytics state known:** O-19, analytics is ON.

| Blocker | Rows | Evidence it is open (10-17) | What closes it |
|---|---|---|---|
| **Legal** (F-1) | L-01, L-02, L-04, L-05, P-24, P-30 | `/privacy/` returned **404** at 06:26Z. The operator is a placeholder; state and effective date are null; there is no counsel receipt. 24 discrepancy rows are classified: 1 incorrect, 5 missing disclosures, 6 legal decisions, 2 product clarifications, 10 resolved; plus 2 new findings | Counsel-approved text through the gate, **or** FD-2 = accounts temporarily disabled plus counsel's guidance on the remaining flows ([package 1](decisions/PRIVACY_TERMS_DECISION.md) §7–§9) |
| **Supabase** (F-2) | O-10 | The hosted project has never been verified; no tier has run | Tiers A, A2, B and C as expected ([package 2](decisions/SUPABASE_SECURITY_VERIFICATION.md) §7), or accounts disabled |
| **Ask cap** (F-3) | P-23, O-12 | Ask is enabled (zero-cost 400 on 10-17 01:27Z). No provider-side cap is recorded; the app has no daily cap | Checklist items 1, 3 or 3b, 5 and 6 confirmed ([package 3](decisions/ASK_GAMETIME_SPEND_CONTROLS.md) §7), **or** Ask disabled for launch with the visible-entry-points caveat accepted |
| **Rollback** (F-4) | O-07 | Not rehearsed. The dry run is proposed for Mon 10-19 07:00 ET | The dry run recorded per [package 4](decisions/ROLLBACK_REHEARSAL.md) §3 and §7, or a written waiver |

**Also required for CONDITIONAL GO:**
- #1118 merged and verified in Production (E-2);
- no P0 from UFC Oct 17 or NFL Oct 18 (E-3, UAT H6).

PENDING rows are not launch blockers unless the UAT turns them into a P0.

---

## Appendix A: Open PR backlog triage (37 PRs, read 2026-10-16 20:07Z)

**Columns:**
- **CI:** the `statusCheckRollup` checks as of each PR's last push.
- **Merge state:** GitHub `mergeStateStatus`.

**Caveats:**
- Green CI recorded before 10-16 05:00Z predates the O-03 data-dependent failure. A re-run today would fail `totals-play-efficiency` until O-03 is fixed.
- "Ready for integration" still requires the founder's exact-head approval (roadmap §22).

| PR | Title (short) | Head | CI | Merge state | Class | One-line reason |
|---|---|---|---|---|---|---|
| #1112 | Live panel "Final score" after final | `65855730e8` | quality ✓ python ✓ | CLEAN | Needs testing | In the consolidated UX release under test now (P-05) |
| #1111 | Live V2 delayed/stale line | `bf0f309f31` | quality ✗ python ✓ | UNSTABLE (base #1082) | Dependent on another PR | Stacked on #1082; `quality` fails (IDEMPOTENT same-day re-run; settler REAL CALL PATH); preview-only |
| #1110 | Runbook October addendum (docs) | `e877e38cef` | none (docs path) | CLEAN | Ready for integration | Docs only, 0 builds. Needed for the rehearsal; fix the §11.5 window first (FD-9) |
| #1109 | Lab eligibility: stale reason names the capture date | `2e104fa6a1` | quality ✓ python ✓ | CLEAN | Needs testing | In the consolidated UX release; also stops clock-only Results restatements |
| #1108 | Live V2 replay tool | `85ca92c369` | quality ✗ python ✓ | UNSTABLE (base #1082) | Dependent on another PR | Stacked on #1082; the replay is evidence tooling for promotion |
| #1107 | UX state labels batch | `55b1de8918` | quality ✓ python ✓ | CLEAN | Needs testing | Consolidated UX release |
| #1106 | Nav consistency (`/nba` strip, Menu label) | `bb3832121e` | quality ✓ python ✓ | CLEAN | Needs testing | Consolidated UX release; M6 naming is FD-7 |
| #1105 | Team identity (crests) | `b5a25afb99` | quality ✓ python ✓ | CLEAN | Needs testing | Consolidated UX release |
| #1104 | Results explorer paging | `7f77894a39` | quality ✓ python ✓ | CLEAN | Needs testing | Consolidated UX release; closes GTP-21/32 (P-11) |
| #1103 | Plain copy (stacked on #1092) | `81b9b66804` | quality ✗ python ✗ | UNSTABLE (base #1092) | Dependent on another PR | Needs #1092 first; red CI (IDEMPOTENT test) must be cleared in the consolidated branch |
| #1102 | One game-state vocabulary | `b22a14537f` | quality ✓ python ✓ | CLEAN | Needs testing | Consolidated UX release |
| #1101 | nightly-settle historical stamp guard | `22b0ac73bd` | quality ✓ python ✓ | CLEAN | Blocked by founder decision | Protected workflow; awaiting approval (FD-6, D-13) |
| #1100 | Player-log CSS → classes | `c51d713bfd` | quality ✓ python ✓ | CLEAN (base #1099) | Dependent on another PR | HTML series tail; merges after #1096–#1099; being measured |
| #1099 | Site chrome CSS → classes | `6c291877e3` | quality ✓ python ✓ | CLEAN (base #1098) | Dependent on another PR | HTML series; being measured |
| #1098 | Results table CSS → classes | `c90a784fc3` | quality ✓ python ✓ | CLEAN (base #1097) | Dependent on another PR | HTML series; being measured |
| #1097 | MLB lean-row CSS → classes | `7abb3fb02d` | quality ✓ python ✓ | CLEAN (base #1096) | Dependent on another PR | HTML series; being measured |
| #1096 | MLB board slim props | `54e1655016` | quality ✓ python ✓ | CLEAN | Needs testing | HTML series head (≈ −27% HTML combined); cost effect not yet measured on Vercel |
| #1095 | Build memory observability (anon/file/peak) | `0f9d3eab81` | quality ✓ python ✓ | CLEAN | Ready for integration | Founder: ride with the next necessary release only (no standalone build) |
| #1094 | Static-gen workers 4 → 3 | `e1bb1b33dc` | quality ✓ python ✓ | CLEAN | Blocked by founder decision | ON HOLD per the founder 10-15 (−6% memory does not justify it while 4 workers works) |
| #1092 | ET timestamps on every public page | `729f8663af` | quality ✓ python ✓ | CLEAN | Needs testing | Base of #1103; consolidated UX release |
| #1090 | 503 bodies name no config vars | `8af11b4e31` | quality ✓ python ✓ | CLEAN (not draft) | Ready for integration | Security hygiene; awaiting founder exact-head approval (O-14) |
| #1088 | COST-001 Stage B MLB stamp gate | `e2dd976085` | quality ✓ python ✓ | CLEAN | Blocked by founder decision | Protected workflows; awaiting approval (FD-6) |
| #1086 | MLB-001 simulation audit (docs) | `4e7287913d` | none (docs path) | CLEAN | Post-launch | Research only; no launch value |
| #1083 | Roadmap: overnight/daytime log | `de18142118` | none (docs path) | CLEAN | Ready for integration | Docs only, 0 builds; carries the 10-14 → 10-16 evidence this matrix cites |
| #1082 | Live Hub V2 foundation | `c52d426125` | quality ✓ python ✓ | CLEAN | Needs testing | Preview-only; NFL Sun 10/18 and an MLB game are still required for promotion (P-04) |
| #1077 | Legal drafts: accounts and Ask flows | `9de2f79bd2` | quality ✓ python ✓ (10-13) | CLEAN (not draft) | Ready for integration | Founder-approved accurate drafts. The gate stays locked, so merging publishes nothing. Should precede counsel review. Re-run CI after O-03 |
| #1066 | NFL rows show capture date and model-vs-line gap | `c7a636d479` | quality ✓ python ✓ | DIRTY | Post-launch | 10-13 assessment: needs gap suppression and funded odds; conflicts with main |
| #1061 | UFC-001 UX Phase B | `b6a30b9ce6` | quality ✗ python ✓ | UNSTABLE | Post-launch | Founder deferred until after launch (10-13) |
| #1056 | OPS-001a untracked side-effect file | `e5ac1c7d16` | quality ✓ python ✓ | DIRTY | Superseded | Superseded by #1068 (10-13 assessment) |
| #1050 | Option A live capture of MLB research forecasts | `60900eb617` | quality ✗ python ✓ | UNSTABLE (base #1048) | Dependent on another PR | Stacked on #1048; research; post-launch |
| #1049 | Ledger timing amendment 2 (DRAFT) | `f0329be63a` | quality ✗ python ✓ | UNSTABLE (base #1045) | Dependent on another PR | Stacked on #1045; both wait on the founder (FD-10a) |
| #1048 | MLB-002 matchup-v1 forward shadow | `1904bdb10e` | quality ✗ python ✓ | DIRTY | Post-launch | Research; listed post-launch 10-13; conflicts |
| #1045 | TRUTH-001 Stage B MLB restatement (DRAFT) | `e6dcf3240f` | quality ✗ python ✓ | UNSTABLE | Blocked by founder decision | Changes the historical record; needs the founder's decision on applying it (D-02, FD-10a) |
| #1044 | MLB run-line market evaluation protocol | `53f53c6814` | none (docs path) | CLEAN | Post-launch | Research only |
| #1043 | MLB-001 official rules in the engine (opt-in) | `79ab30d0c8` | quality ✗ python ✓ | UNSTABLE | Post-launch | Research; red CI (run-line relabel guard) |
| #1041 | NCAAF V1 research lane (DP) | `1222ad0de2` | quality ✗ python ✓ | UNKNOWN | Post-launch | DP-owned lane, "do not merge" |
| #716 | §18 settle publication boundary (Sept) | `1cb4ba689e` | ✓ (09-28) + old Vercel preview | DIRTY | Post-launch | A three-week-old protected nightly-settle draft that conflicts with main. Re-evaluate against #1068 and #1101 after launch; do not merge as is |

**Counts by class** (each PR counted once; 37 in total):

| Class | Count | PRs |
|---|---:|---|
| Ready for integration | 5 | #1077, #1083, #1090, #1095, #1110 |
| Dependent on another PR | 9 | #1049, #1050, #1097, #1098, #1099, #1100, #1103, #1108, #1111 |
| Superseded | 1 | #1056 |
| Needs testing | 10 | #1082, #1092, #1096, #1102, #1104, #1105, #1106, #1107, #1109, #1112 |
| Blocked by founder decision | 4 | #1045, #1088, #1094, #1101 |
| Post-launch | 8 | #716, #1041, #1043, #1044, #1048, #1061, #1066, #1086 |

## Appendix B: internal-alpha-day output, reconciled (2026-10-16, `d6de0ceb47`, offline)

**Totals:** PASS 6 · FAIL 0 · BLOCKED 6 · UNKNOWN 3. The UNKNOWN items need a local export, and none was built, by rule.

| Gate | Script verdict | Reconciliation with Production evidence |
|---|---|---|
| Production measurement / privacy-safe analytics | BLOCKED (founder) | Unresolved; see O-19 |
| User-reachable support channel | BLOCKED (founder) | **Live in Production** (O-18). The script reads the local env |
| Incident response, alerting, rollback, support | BLOCKED (PARTIAL) | Support is live. Alerting (O-17) and rollback (O-07) are open |
| Terms, privacy, jurisdiction, risk acceptance | BLOCKED (FAIL) | Matches L-01–L-05 |
| Beta cohort, feedback loop, adoption baseline | BLOCKED (FAIL) | The July internal-alpha framing ("Day 73 of 7", window 08-05→08-11) is stale. Not used as a launch gate here |
| Board freshness, settlement, stamping, money md5, API credit | PASS | D-15, D-16 |

## Appendix C: summary counts

**By status, across the 76 matrix rows in §1–§4** (founder taxonomy, 2026-10-17 ~07:20Z):

| Status | Count | Rows |
|---|---:|---|
| VERIFIED | **38** | 4 REAL-EVENT ACCEPTANCE (P-03, D-01, D-03, D-12) · 31 PRODUCTION-DEPLOYED · 1 CI (O-03) · 2 LOCAL (D-15, D-16) |
| PENDING | **15** | P-05, P-19, P-20, P-25, P-26, P-27, P-28, P-31, P-32, P-33, O-06, O-14, O-15, O-17, O-20 |
| BLOCKED | **18** | P-23, P-24, P-30, D-02, D-07, D-13, O-05, O-07, O-10, O-11, O-12, L-01 … L-07 |
| DEFERRED | **5** | P-04, D-10, O-02, O-09, O-13 |

**By section:**

| Section | VERIFIED | PENDING | BLOCKED | DEFERRED |
|---|---:|---:|---:|---:|
| §1 Product (33) | 19 | 10 | 3 | 1 |
| §2 Data (16) | 12 | 0 | 3 | 1 |
| §3 Operational (20) | 7 | 5 | 5 | 3 |
| §4 Legal (7) | 0 | 0 | 7 | 0 |

The 10-16 counts (old taxonomy) were: PRODUCTION VERIFIED 36, IMPLEMENTED — NOT RELEASED 3, TESTING IN PROGRESS 16, BLOCKED — FOUNDER DECISION 16, BLOCKED — ENGINEERING 2, DEFERRED 2, FAILED 1.

**Launch-blocker rows:** P-23, P-24, P-30, O-03, O-07, O-10, O-12, L-01, L-02, L-04, L-05. These consolidate to the six hard blockers in §6.
