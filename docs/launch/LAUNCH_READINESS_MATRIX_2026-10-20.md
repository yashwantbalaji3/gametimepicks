# Launch-readiness matrix: GameTimePicks public launch, Tue 2026-10-20

**Prepared:** Fri 2026-10-16, 20:05–20:45Z (afternoon ET), by a read-only Claude Code session. Docs only; nothing was built, merged, deployed or paid for.
**Repository state:** `origin/main` = `934055d613` at 20:11Z (bot data commits only since the last code merge, #1091 → `39df089d02`).
**Production state:** `/data/build-info.json` read once at 20:10Z: commit `d6de0ceb47`, built 2026-10-16T20:02:53Z. That is the `main` HEAD from 20:01Z (a bot data commit on top of every merged code change).
**Planning authority:** `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` §16 (UX System V2 plan, schedule: freeze Oct 17, UAT Oct 18–19, launch Oct 20), plus the unmerged session logs on #1083 (`de18142118`).
**Companion:** `docs/launch/UAT_OCT18_19_PLAN.md` (test scripts, rehearsal and go/no-go rubric).

## How to read this

**Status values.** Each row uses exactly one of these:

| Status | Meaning |
|---|---|
| PRODUCTION VERIFIED | There is evidence from Production: a check in this pass, or a recorded Production acceptance. The row gives the date. |
| IMPLEMENTED — NOT RELEASED | The code exists on a branch or PR and is not live. |
| TESTING IN PROGRESS | Live, or about to be, but the acceptance evidence is incomplete. A UAT script is named. |
| BLOCKED — FOUNDER DECISION | Waiting on a founder answer, a console action, a credential or counsel. |
| BLOCKED — ENGINEERING | An engineering fix is needed. |
| DEFERRED — POST-LAUNCH | Out of launch scope by recorded decision or plan. |
| FAILED | The check ran and failed. |

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
| P-01 | **Home** `/`: truthful hero, featured simulations, live strip, results recap | PRODUCTION VERIFIED | 200 at 20:10Z on `d6de0ceb47`. GTP-02/10/27/33 fixed in #1080, Release 1 fold in #1072. Footer carries "Contact support · We reply within 2 business days" (GET 20:10Z) | Eng | No |
| P-02 | **Today** `/today`: Live first, folded deeper sections, correct event count | PRODUCTION VERIFIED | 200 at 20:10Z. Header reads "Today · Oct 16 · 13 events" in the `/account/` HTML fetched 20:10Z. #1072 fold, #1073 count | Eng | No |
| P-03 | **Live Hub** `/live` (LIVE-F): one card layout, LIVE/UPCOMING/FINAL badges, "Forecast locked pregame", report link; untracked sports never shown as live | PRODUCTION VERIFIED | 200 at 20:10Z. LIVE-F shipped in #1081. SEA@DEN capture 10-15/16 (`docs/live/LIVE_V2_SEA_DEN_ACCEPTANCE.md` on #1082): 312 requests, 0 non-200; checks 1–4, 6, 8, 10–12, 16, 18, 22–23 PASS. `/live` states "NBA, Premier League and UFC are not tracked live yet" | Eng / Live | No |
| P-04 | **Live Hub V2** (prop rails, Live/Upcoming/Final grouping) | TESTING IN PROGRESS | Preview only: #1082 `c52d426125`; #1108/#1111 stacked, with red `quality`. Promotion needs NFL Sun 10/18 plus one MLB postseason game. Roadmap §16 puts it in P2 | Live | No (not in launch scope) |
| P-05 | **Game-page live panel**: label after final | IMPLEMENTED — NOT RELEASED | The SEA@DEN capture showed "LIVE NOW" above "Final/OT" (cosmetic). Fixed by #1112 `65855730e8` (CI green), which is in the consolidated UX release | Eng | No |
| P-06 | **NFL** `/nfl`, `/nfl/game/[eventId]`, `/nfl/week/[key]`, `/nfl/simulation/[eventId]`; redirects `/nfl/world-model*` | PRODUCTION VERIFIED | `/nfl` 200 at 20:10Z. Hub folded 24,232 → 15,651 px on a phone (#1081). Week 6: 13 events. The game page shows "Forecast frozen at Oct 15, 8:09 PM ET" for SEA@DEN | Eng | No |
| P-07 | **NBA** `/nba` (schedule and finals, no forecast); opening night Oct 20 | PRODUCTION VERIFIED | 200 at 20:10Z. Nav label "NBA · schedule + final scores · no forecast". GTP-11 date list fixed (#1080). "Regular season opens October 20, 2026" (#1067). The first regular-season slate is checked in UAT F-07 on Oct 20 | Eng | No |
| P-08 | **MLB** `/mlb`, `/mlb/board`, `/mlb/board/[date]`, `/mlb/power`, `/mlb/results`, `/games/[sport]/[gameId]` | PRODUCTION VERIFIED | `/mlb` 200 at 20:10Z. ET slate date and signed run line fixed (#1070, accepted 10-13). GTP-14/24/34 fixed (#1080/#1081). Today's runs: mlb-daily-production 7/7 ✓, lineup-refresh 6/6 ✓, pregame-capture 5/5 ✓. **Known limitation:** `/games/mlb/<slug>/` exists only for the active slate, so yesterday's shared links 404 (#1083, 10-14 finding; founder decision FD-10) | Eng | No |
| P-09 | **UFC** `/ufc`, `/ufc/bout/[boutId]`, `/cage-chaos` | PRODUCTION VERIFIED | `/ufc` 200 at 20:10Z. #1085 grading integrity: 71 rows = 70 decided + 1 VOID; withdrawn bout excluded. `card-latest.json` state `SCHEDULED_CARD`, generated 2026-10-16T17:17Z. The Oct 17 card is UAT F-09. No public UFC live tracking (labelled) | Eng | No |
| P-10 | **Soccer / EPL** `/epl`, `/epl/match/[slug]`, `/soccer/[league]` (Ligue 1) | PRODUCTION VERIFIED | `/epl` 200 at 20:10Z. Nav: "Premier League · forecasts · not validated", "Ligue 1 · model-only forecasts · backtest only". `/epl` folded 21,848 → 12,460 px (#1081). epl-settle ✓ today; epl-matchweek running | Eng | No |
| P-11 | **Results & Tracking** `/results`, `/results/{mlb,nfl,forecasts,forecasts/[sport]/[family],picks,picks/[sport],parlay-lab,parlays,model-audit,date/[date]}`, `/mr-dub`, archive `/results/nba` | PRODUCTION VERIFIED | `/results` and `/results/forecasts` 200 at 20:10Z. NFL headline truth (#1071); unsupported "beat" claims removed (#1074). The Forecast Record matched the ledger 25/25 files, 15,879 rows at `39df089d02` (10-15, recorded). The explorer still silently caps at 50 of 137 cards; paging fix #1104 is unreleased (P2 per roadmap) | Eng | No |
| P-12 | **Simulation** `/simulate`, `/simulate/d/[date]`; redirect `/games` | PRODUCTION VERIFIED | `/simulate` 200 at 20:10Z. GTP-09/11/33/34 fixed (#1080) | Eng | No |
| P-13 | **Parlay Lab / Parlays** `/build`, `/build/custom`, `/cards/[sport]`, `/results/parlay-lab`; redirects `/parlay-lab`, `/picks`, `/parlays`, `/mlb/parlays`, `/nba/parlays` | PRODUCTION VERIFIED | `/build` 200 at 20:10Z. GTP-08 fixed at the producer and the reader (UFC and multi-sport closed; #1080). `/parlay-lab` prefetch-abort console noise (15 errors) is pre-existing and benign (10-13 record) | Eng | No |
| P-14 | **Bank Builder** `/bank-builder` | PRODUCTION VERIFIED | 200 at 20:10Z. GTP-04 fixed (#1080). Documented limitation: the page reads pool status at build time, so before the morning generation it says "not assessed". NFL eligibility today: `EVALUATED_NONE_QUALIFY` (run 38949424952) | Eng | No |
| P-15 | **Moonshot** `/moonshot` | PRODUCTION VERIFIED | 200 at 20:10Z. GTP-26 legacy-lane pill, graded legs "see receipt" (#1080) | Eng | No |
| P-16 | **Product lanes** `/endzone-vault`, `/homer-nukes`, `/bucket-blitz`, `/goal-rush` | PRODUCTION VERIFIED | Vault truth wording accepted 10-13 (#1069); `/bucket-blitz` copy accepted 10-13 (#1067). Not re-requested in this pass. Note: `ROUTE_TABLE` classifies `/goal-rush` and `/bucket-blitz` as `"product"`, which is not one of the four documented classifications (inventory hygiene, post-launch) | Eng | No |
| P-17 | **Player research** `/players/[sport]/[slug]` | PRODUCTION VERIFIED | Exact-ID NFL/MLB portraits and fighter photos (#1081 36-view sweep, 10-14, recorded). Not re-requested in this pass; UAT F-16. EPL player portraits are deferred (no authorized IDs) | Eng | No |
| P-18 | **Team research** `/teams/[sport]/[slug]` | PRODUCTION VERIFIED | EPL crests and NFL/MLB logos (#1081, 10-14, recorded). Header-size EPL crests are in #1105 (unreleased). UAT F-16 | Eng | No |
| P-19 | **Compare / Matchups** `/compare`, `/compare/teams/[sport]`, `/compare/players/[sport]`, `/matchups/[sport]/[gameId]` | TESTING IN PROGRESS | No Production evidence for these routes in this pass or in the cited sweeps by name. UAT F-17 | Eng | No |
| P-20 | **Research Lab** `/research`, `/research/lab` | TESTING IN PROGRESS | Not requested in this pass. UAT F-17 | Eng | No |
| P-21 | **Models & methodology** `/models`, `/methodology`, `/learn`, `/market-guide`, `/about`, `/system-status` | PRODUCTION VERIFIED | `/models`, `/methodology` and `/system-status` 200 at 20:10Z. GTP-22 names the metric (log loss, lower is better), n and the interval (#1080). The GTP-29 copy items on `/learn` and `/responsible-use` are partly fixed (#1081); see L-03 | Eng | No |
| P-22 | **Markets** `/markets` | PRODUCTION VERIFIED | GTP-06 snapshot date instead of "today" (#1080, 10-14, recorded). Not re-requested in this pass | Eng | No |
| P-23 | **Ask GameTime** `/ask` + `/api/ask` (Gemini) | BLOCKED — FOUNDER DECISION | `/ask` 200 at 20:10Z. The answer path was not exercised (paid). Kill switch `ASK_GAMETIME_ENABLED` (`app/api/_ask-core.mjs:32`). Only a per-instance rate limit. The provider-level cap (Google Cloud quota override plus budget alert) was a 10-13 founder decision; completion is **not recorded anywhere**. A 503 body names config variables (#1090, unreleased) | Founder | **Yes**: confirm the cap, or turn Ask off for launch (FD-4) |
| P-24 | **User accounts** `/account` (Your bets, magic-link sign-in, hand-entered slips), `/api/slip-read` | BLOCKED — FOUNDER DECISION | **Accounts are enabled in Production.** The 20:10Z HTML has the "Your bets" nav link, which is built only when `NEXT_PUBLIC_SUPABASE_URL` is set (`docs/ACCOUNTS_SETUP.md` §3), and `/account/` shows "Checking your session…". Slip reading is off (`/api/slip-read` 503, 10-14 record). `/privacy` and `/terms` are 404 (L-01/L-02). The hosted RLS check has not run (O-10). Deletion is manual (L-04) | Founder | **Yes**, while accounts are enabled |
| P-25 | **My GameTime** `/my`, `/following`, `/saved` (device-local, noindex) | TESTING IN PROGRESS | Not requested in this pass. GTP-23 "board updated" label on `/saved` (#1080). UAT F-18 | Eng | No |
| P-26 | **Sports directory** `/sports` | TESTING IN PROGRESS | Not requested in this pass. GTP-29 removed the hard-coded sport count (#1081). UAT F-17 | Eng | No |
| P-27 | **Feedback** `/feedback` (noindex, `beta_feedback` RLS) | TESTING IN PROGRESS | Not requested in this pass. Depends on accounts (P-24). UAT T-06 | Eng | No |
| P-28 | **Redirect stubs and archives**: `/games`, `/board`, `/projections`, `/events`, `/trends`, `/nhl`, `/ipl`, `/world-cup`, `/nba/results`; archives `/results/nba`, `/world-cup-specials` | TESTING IN PROGRESS | All classified in `ROUTE_TABLE`. July's open question ("do `redirect()` stubs emit under `output: export`?") has no recorded closure apart from `/parlay-lab` → `/build/#suggested-cards`. UAT F-19 | Eng | No |
| P-29 | **Internal surfaces are not public**: `/ops`, `/launch`, `/preview/*` | PRODUCTION VERIFIED | `/ops`, `/launch` and `/preview/june20` returned 404 at 20:10Z. Classified internal. `vercel.json` adds noindex and no-store for `/(launch|ops|preview)` | Eng | No |
| P-30 | **Legal routes** `/privacy`, `/terms` | BLOCKED — FOUNDER DECISION | 404 at 20:10Z (gate locked by `legalReadiness()`). See L-01/L-02 | Founder / Counsel | **Yes** (with accounts enabled) |
| P-31 | **Consolidated UX release** (#1092 ET timestamps, #1102–#1107, #1109, #1112) | IMPLEMENTED — NOT RELEASED | Local integration 10-16 03:55Z: build 147 s, 10,122 unit + post-build tests with 0 failures, 14-check sweep (#1083 log). Being consolidated into one release branch now. Not yet on the remote. #1103 is red on CI (IDEMPOTENT same-day re-run test) | Eng → Founder | No (polish); a release needs FD-7 |
| P-32 | **Accessibility**: one h1, roving tabs, 44 px targets, keyboard, VoiceOver, 200% zoom | TESTING IN PROGRESS | Structural: one h1 everywhere (10-13), roving tabs (#1087, verified 10-15), 44 px targets (#1081). Real-device, VoiceOver and 200% zoom checks are an open roadmap verification gate (§16) | Eng / Founder | No |
| P-33 | **Responsive layout** at 320/390/768/1440 | TESTING IN PROGRESS | Recorded sweeps cover 390/820/1440 (10-13) and 1440/390 (10-14). **320 and 768 have not been swept since Release 2B.** UAT V-01 | Eng | No |

## 2. Data and model integrity

| ID | Requirement | Status | Evidence | Owner | Launch blocker |
|---|---|---|---|---|---|
| D-01 | **Forecast provenance going forward** (Option B: the forecast of record is the revision served by a READY deployment before start) | PRODUCTION VERIFIED | NFL: SEA@DEN check 1 PASS. Frozen forecast, board and receipt hashes were identical across 40 post-kickoff passes, with no revision stamped at or after kickoff. Per-game hash-bound `frozenPregame` is displayed (GTP-23, #1080) | Eng | No |
| D-02 | **Historical MLB forecast of record** (29 games graded from unserved revisions, plus 2 never public; shadow #1046, 2026-10-10) | BLOCKED — FOUNDER DECISION | Stage B restatement #1045 and timing amendment #1049 are DRAFT and not applied. Their `quality` is red. The MLB grader still uses "newest generated before first pitch" (roadmap §4) | Founder / Eng | No, if the founder accepts it as a known limitation (FD-10) |
| D-03 | **Frozen pregame**: no change after start; frozen ≠ generated ≠ published | PRODUCTION VERIFIED | SEA@DEN checks 1 and 10 PASS. "Forecast frozen at Oct 15, 8:09 PM ET" against an 8:15 PM kickoff. GTP-23 regression test: no displayed freeze time is later than the start | Live | No |
| D-04 | **Player eligibility / product gating** | PRODUCTION VERIFIED | nfl-event-window 38949424952 (18:44Z): 13 events considered, 0 qualify. Bank Builder, Moonshot and build-inventory `EVALUATED_NONE_QUALIFY`; Vault `PRODUCT_GATED`. All 5 families "not eligible" with reasons (`FORWARD_TEST_IN_PROGRESS`, `ROLE_NOT_CONFIRMED`, `NO_PREGAME_PRICES`, …). The page display is checked in UAT D-04 | Automation | No |
| D-05 | **Injuries** | PRODUCTION VERIFIED | Same run: "nfl injuries/latest.json: 800 entries + 22 carried forward, 0 quarantined, exact=true"; NBA 131 entries; freshness "injuries FRESH". Out and IR players are flagged per game (e.g. BAL @ CLE) | Automation | No |
| D-06 | **Roster changes / current team** | PRODUCTION VERIFIED | Same run: "NFL ROSTER AUDIT · 13 board(s) · 26 team(s) on the slate of 32 rostered · violations: 0"; rosters FRESH (32/32 teams, 2,563 athletes). MLB lineup-refresh 6/6 ✓ today | Automation | No |
| D-07 | **Market availability** (stated honestly when no price exists) | BLOCKED — FOUNDER DECISION | The NFL odds budget is exhausted: "REFUSED: cumulative 1160 + worst-case 3 would cross the 1160-credit Program 171 ceiling" (runs 38937035149, 38827747478). The display says "the market was not checked in this window" (#1069, accepted 10-13). Week 6 Sunday therefore has no NFL prices, which is honest but thin | Founder | No (honest state); funding is FD-8 |
| D-08 | **No fabricated odds**; market price ≠ GTP probability | PRODUCTION VERIFIED | Odds come only from the receipt-gated capture; the budget refusal produces "not checked", not a number (#1069). Model and market are labelled separately (DS-001 §probability) | Eng | No |
| D-09 | **No unsupported confidence or performance labels** | PRODUCTION VERIFIED | #1074: no "beat" claim without an interval. GTP-34: "VERY STRONG" → "x% of simulated games · unvalidated". GTP-22: names log loss (lower is better) and the interval. MLB board filters say gap size, not confidence (#1081). EPL "not validated" | Eng | No |
| D-10 | **No look-ahead** (point-in-time features) | DEFERRED — POST-LAUNCH | `TEMPORAL-001` is NOT_STARTED (roadmap §2). In place today: frozen pre-start receipts, forward-only shadows, write-once NFL WM2 runs. No platform-wide point-in-time guarantee exists. Do not claim one | Eng | No |
| D-11 | **Settlement denominators**: pending, void, push and withdrawn are never losses | PRODUCTION VERIFIED | UFC: draw VOID once, withdrawn excluded, pending excluded from n (#1076/#1085, 10-14). NFL tie is void (#1071: 8 of 14 decided). Open July item: blocker register #6 ("settle log hit_rate includes voids", log line only); no closure recorded | Eng | No |
| D-12 | **Canonical settlement of live games** (SEA@DEN check 9) | TESTING IN PROGRESS | Prop settlement canonical 13:57Z Oct 16 (lead-verified). Production now serves `d6de0ceb47`, which contains it. The capture report has not yet recorded Results, game page and `/live` agreeing (check 9). UAT D-06 | Live | No |
| D-13 | **Historical reporting immutability** (settled history not rewritten) | BLOCKED — FOUNDER DECISION | Each nightly-settle run rewrites 380–386 past-dated files: 16,823 `gradedAt` and 32 `settledAt` values with no content change. The guard is #1101 `22b0ac73bd` (protected workflow, CI green, awaiting approval). Content is unchanged; only stamps churn | Founder | No |
| D-14 | **Forecast Record = ledger** (served CSVs match the ledger) | PRODUCTION VERIFIED | 25/25 files, 15,879 rows hash-identical at `39df089d02` (2026-10-15, recorded). Bot data commits have landed since; re-run in UAT D-05 on the served SHA | Eng | No |
| D-15 | **Money / paper-portfolio artifacts unchanged** | PRODUCTION VERIFIED | internal-alpha-day 10-16 on `d6de0ceb47`: "Protected money artifacts unchanged: 2/2 match pinned md5" | Automation | No |
| D-16 | **Board freshness / settlement currency** | PRODUCTION VERIFIED | internal-alpha-day: newest board 2026-10-16, settled through 2026-10-15, quarantines s=1 r=0 | Automation | No |

## 3. Operational

| ID | Requirement | Status | Evidence | Owner | Launch blocker |
|---|---|---|---|---|---|
| O-01 | **Scheduled data workflows** healthy today | PRODUCTION VERIFIED | 178 runs since 00:00Z (see §3a). All data producers green: mlb-daily-production 7, nba-forecast-window 26, nfl-kickoff-refresh 22, nfl-pregame-free-refresh 21, nightly-settle 5, publication-watchdog 13, cron-watchdog 2, … | Automation | No |
| O-02 | **nfl-event-window**: budget refusal reported as a run failure | BLOCKED — ENGINEERING | 2 of 5 runs today fail with exit 5 at "Authorized odds capture". Cause: the P171 ceiling (D-07), not a pipeline fault; the later steps ran (roster audit 0 violations). This masks real failures (noted 10-13: 30 of 43 runs). Fix: treat budget refusal as non-fatal, or fund the program | Eng / Founder | No |
| O-03 | **Main HEAD unit and contract check** (`data-contract-check`) | FAILED | 3 consecutive scheduled failures on `main`. Runs 38853435964 (05:00Z) and 38896919104 (11:55Z): `product-day.test.mjs` "EQUIVALENCE · nfl day …". Run 38935977638 (16:57Z): `totals-play-efficiency.test.mjs:109`, `espn.size >= 28`; actual 26, because Week 6 has 6 teams on bye. This takes a precondition from rolling committed data, which the CI-001 rule forbids. **Any PR's `quality` re-run on current data will fail the same assertion**, so exact-head CI for the UX release or a launch-day fix is blocked | Eng | **Yes**: one-line test fix; gates every merge |
| O-04 | **Build reliability** (Vercel 46-min memory kills) | PRODUCTION VERIFIED | #1093 (4 workers) merged 10-15. On the 114 `main` commits since 10-15 15:00Z: 72 "Deployment has completed", 17 "Canceled by Ignored Build Step", 12 queue-superseded ("Canceled from the Vercel Dashboard", per #1110 §11.2), **0 failed**. The margin is thin: 14.82G/16G peak. #1094 (3 workers) is on hold; #1095 adds observability | Eng | No |
| O-05 | **Deployment monitoring / Vercel credentials** | BLOCKED — FOUNDER DECISION | The Vercel token is expired. The OPS-002 authoritative verdict, build logs and billing all need a fresh token. The GitHub-side OPS-002 pre-check is clean (607/607 bot commits attributed). The 72-hour deploy watch (GitHub API) runs until 10-18 14:30Z | Founder | No |
| O-06 | **Scheduler lateness** (GitHub cron best-effort) | TESTING IN PROGRESS | 10-14: scheduled crons ran 4–9 h late (#1083 matrix). cron-watchdog ✓ 2/2 and publication-watchdog ✓ 13/13 today. UAT O-02 records Sunday's lateness | Automation / Eng | No |
| O-07 | **Rollback** (revert-merge; Instant Rollback only per runbook) | TESTING IN PROGRESS | `docs/INCIDENT_AND_ROLLBACK_RUNBOOK.md` §4, §9, §10. October addendum §11 is in #1110 `e877e38cef` (docs, unmerged). **The rehearsal has not been performed.** The window in #1110 §11.5 (Sun 08:00–09:00 ET) overlaps the pre-kickoff period of HOU @ JAX (Sun 9:30 AM ET, London). A rollback stops new pushes going live, so its final pregame revision might not be served before start (Option B). Use Mon 10-19 instead (UAT O-05) | Founder / Eng | **Yes**: rehearse, or the founder waives in writing |
| O-08 | **Security headers** | PRODUCTION VERIFIED | GET `/` 20:10Z: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `strict-transport-security: max-age=63072000`, `content-security-policy-report-only: …` (#1075, `app/vercel.json`) | Eng | No |
| O-09 | **CSP enforcement** | DEFERRED — POST-LAUNCH | **CSP is Report-Only; nothing is enforced.** It allows `'unsafe-inline'` scripts. 0 report-only violations on 91 pages (10-14). There is no report endpoint, so violations are seen only in DevTools | Eng | No |
| O-10 | **Account security / RLS** | BLOCKED — FOUNDER DECISION | Live RLS battery against a local Postgres on every main CI: 82–84 PASS (#1084, 10-14). **The hosted Supabase project has never been verified** (`npm run accounts:verify`, anon read-only; or `--hosted`). Needs founder authorization and keys in the founder's shell | Founder | **Yes**, while accounts are enabled |
| O-11 | **Cost alerts: Vercel** | BLOCKED — FOUNDER DECISION | COST-001: "awaiting founder spend-alert confirmation" (roadmap §2). Steps are in `docs/COST_001_VERCEL_COST_CONTROL.md` §10, with Pause Production Deployments OFF. Baseline ≈ $9.9/day build CPU (10-15) | Founder | No |
| O-12 | **Cost alerts: Ask (Gemini) and Anthropic** | BLOCKED — FOUNDER DECISION | See P-23. `ANTHROPIC_API_KEY` is evidently set while slip reading is off. Adding the service-role key would switch on a paid path outside the Ask cap (#1083, 10-14) | Founder | Yes, as part of P-23 |
| O-13 | **Odds API spend accounting** | BLOCKED — ENGINEERING | `mlb-pregame-capture` logs "credits spent 0" while spending about 3 per run (#1083, 10-14). Under-reports paid usage | Eng | No |
| O-14 | **Error handling: API error bodies** | IMPLEMENTED — NOT RELEASED | #1090 `8af11b4e31`: 503 bodies from `/api/slip-read` and `/api/ask` no longer name configuration variables. CI green 10-15, MERGEABLE/CLEAN | Eng → Founder | No (recommended) |
| O-15 | **Live-data availability and provider failure** | PRODUCTION VERIFIED | SEA@DEN: 312 requests, 0 non-200, 0 bot challenges. V2 replay: 0 disagreements, 0 lags. Provider failure (checks 19–21) and the delayed/stale line (check 7) were **not observed live**; fixture tests only. The Sunday window is UAT D-07 | Live | No |
| O-16 | **Publishing data-loss protection** (OPS-001) | PRODUCTION VERIFIED | #1068, accepted 10-13. About 17 workflows keep their own loud retry loops (post-launch residual) | Eng | No |
| O-17 | **Alert delivery** (ops webhook) | TESTING IN PROGRESS | The 10-13 assessment lists "alert webhook delivering" under the final-UAT checks, with no delivery receipt recorded. The July blocker register #1 (`OPS_WEBHOOK_URL` absent) has no recorded closure. UAT O-04 | Founder | No |
| O-18 | **Support channel** | PRODUCTION VERIFIED | Footer "Contact support · We reply within 2 business days" in the Production HTML (20:10Z). internal-alpha-day reports this BLOCKED only because it reads the local build environment, not Vercel's | Founder | No |
| O-19 | **Product analytics** | TESTING IN PROGRESS | Conflicting records. `docs/legal/COUNSEL_REVIEW_BRIEF.md` says analytics have been on since 2026-09-10; `docs/ANALYTICS_ACTIVATION_STATUS.md` (07-31) and internal-alpha-day (local env) say OFF. The Privacy draft text depends on the build flag (`texts.mjs` `ANALYTICS_LIVE`). UAT T-05 checks the network tab | Eng | No |
| O-20 | **Bot challenge on automated Production checks** | TESTING IN PROGRESS | `x-vercel-mitigated: challenge` was seen on 10-15. None today. UAT follows `docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md`: read the SHA in a real browser and outcomes from GitHub statuses | Eng | No |

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
| L-01 | **Privacy Notice** published and accurate | BLOCKED — FOUNDER DECISION | `/privacy/` 404 (20:10Z). Gate locked: operator placeholder, state null, effective date null, no counsel approval receipt. The accurate draft is #1077 (unmerged) | Founder / Counsel | **Yes**, while accounts are enabled (GTP-01, the only open audit P0) |
| L-02 | **Terms of Use** published | BLOCKED — FOUNDER DECISION | `/terms/` 404 (20:10Z). Same gate and parameters as L-01 | Founder / Counsel | **Yes**, while accounts are enabled |
| L-03 | **Responsible Use** page accurate | BLOCKED — FOUNDER DECISION | `/responsible-use/` 200. It states 18+, US, not betting advice and 1-800-GAMBLER (brief). Two open issues: (a) the age conflicts with `docs/ACCOUNTS_SETUP.md` ("21+ gate"); (b) it still describes a slip-comparison "Parlay Center" that `/build` does not offer (flagged 10-14 as legal-adjacent, left unedited) | Founder | No for the page itself; the age is part of FD-1 |
| L-04 | **Accounts compliance** (data inventory, retention, deletion, third parties) | BLOCKED — FOUNDER DECISION | See the data-flow list below this table | Founder / Counsel | **Yes**, while accounts are enabled |
| L-05 | **Qualified legal review** | BLOCKED — FOUNDER DECISION | No counsel engagement or approval receipt is recorded. The open questions are the next list below. The brief must be re-issued with #1077's hashes | Founder → Counsel | **Yes** for L-01/L-02 |
| L-06 | **Account-feature disable option** (description only; **not a recommendation**) | BLOCKED — FOUNDER DECISION | See "The account-feature disable option" below. No change is recommended or made without founder approval | Founder | No; it is an alternative path, not a requirement |
| L-07 | **Analytics disclosure** | TESTING IN PROGRESS | Depends on O-19. The Privacy text renders analytics language from the build flag, so the reviewed hash must be taken from a build with the Production flag value | Eng / Counsel | No (part of L-01) |

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

## 6. Hard-blocker list (current)

1. **Privacy and Terms are unpublished while accounts are enabled** (L-01, L-02, L-04, L-05, P-24, P-30). This needs FD-1 plus counsel, or FD-2's alternative.
2. **The hosted Supabase RLS project is unverified while accounts are enabled** (O-10). This needs FD-3.
3. **The Ask provider spending cap is unconfirmed** (P-23, O-12). This needs FD-4: confirm the cap, or turn Ask off.
4. **`main` unit suite red on a data-dependent assertion** (O-03). Eng fix: replace `espn.size >= 28` with a whole-history or pinned check, per the CI-001 rule. Until then no exact-head CI can pass, including for a launch-day fix.
5. **Rollback not rehearsed** (O-07). This needs FD-9, or a written waiver.
6. **NFL Sunday 10/18 live window and UFC 10/17 card observed with no P0 defect.** This is a UAT gate: UAT D-07 and F-09.

## 7. Evidence-based go/no-go assessment (as of 2026-10-16 20:45Z)

**Current position: NO-GO for a full public launch with accounts enabled. CONDITIONAL GO is reachable by Oct 20 if the six hard blockers close.**

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

**By status, across the 76 matrix rows in §1–§4:**

| Status | Count |
|---|---:|
| PRODUCTION VERIFIED | 36 |
| IMPLEMENTED — NOT RELEASED | 3 |
| TESTING IN PROGRESS | 16 |
| BLOCKED — FOUNDER DECISION | 16 |
| BLOCKED — ENGINEERING | 2 |
| DEFERRED — POST-LAUNCH | 2 |
| FAILED | 1 |

**Launch-blocker rows:** P-23, P-24, P-30, O-03, O-07, O-10, O-12, L-01, L-02, L-04, L-05. These consolidate to the six hard blockers in §6.
