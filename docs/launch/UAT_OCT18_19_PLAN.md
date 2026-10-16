# UAT plan: Sat 2026-10-17 → Mon 2026-10-19 (launch Tue 2026-10-20)

**Prepared:** 2026-10-16, read-only.
**Companion:** `docs/launch/LAUNCH_READINESS_MATRIX_2026-10-20.md`. IDs such as P-24, O-07 and FD-3 refer to that document.

**Schedule source:** roadmap §16, "Schedule, cost and release control":
- **Oct 17:** feature freeze and UFC card day.
- **Oct 18–19:** final UAT on phone and desktop, live NFL Sunday, legal gate status and a rollback rehearsal.
- **Oct 20:** launch and NBA opening night.

NFL times come from the committed `app/public/data/nfl/schedule/latest.json` (captured 2026-10-16T13:55Z) and are converted to ET. Re-check them on `/nfl` on the morning of the 18th.

## 0. Ground rules

1. **Production is read-only during UAT.**
   - No merges, deploys or paid captures except the controlled exceptions the founder approves. The roadmap allows "controlled exceptions only" on Oct 18–19.
   - The rollback rehearsal (O-05) is the one planned Production action, and only the founder can perform it.
2. **Use a real browser for every Production check.**
   - Do not script repeated requests. Vercel answers automated polling with `x-vercel-mitigated: challenge` (`docs/VERCEL_BOT_CHALLENGE_VERIFICATION_CONTRACT.md`).
   - Read deployment outcomes from GitHub commit statuses (context `Vercel`).
   - Read the live SHA from `/data/build-info.json` in the browser.
3. **Accounts:**
   - Only the founder signs in, with the founder's own test inbox.
   - Claude sessions never create accounts, sign in or enter keys on Production.
   - The hosted RLS check (T-03) runs in the founder's shell with the founder's keys.
4. **Evidence:** everything goes in `~/gtp-evidence/uat-2026-10-18/`. Name files `<test-id>_<route-slug>_<width>_<HHMM>Z.png` (or `.txt`/`.json`).
   - Each session starts with a line in `SESSION.md`: who, start time, the served SHA from `build-info.json`, browser and version, and device.
5. **Severity:**
   - **P0, a hard blocker:**
     - a number that is wrong, fabricated or not traceable to its artifact;
     - a forecast that changes after start, or a freeze time later than start;
     - a void, pending or push counted as a loss;
     - a launch route returning 4xx/5xx (except `/privacy` and `/terms` while gated);
     - one reader seeing another reader's data;
     - a secret or config name in a public response;
     - live score or status contradicting ESPN on two consecutive checks;
     - a legal or age statement that contradicts another public statement.
   - **P1, fix-forward before or soon after launch:**
     - horizontal overflow or clipped primary content at 320/390;
     - a broken image on a launch route;
     - a mislabelled state such as "LIVE NOW" above a final;
     - misleading copy that does not change a number.
   - **P2:** polish.
6. **Widths:**

| Width | Device |
|---|---|
| **320** | small phone; Chrome DevTools "iPhone SE (1st gen)" or custom 320×640 |
| **390** | iPhone 12–15; also on a real device |
| **768** | tablet portrait |
| **1440** | desktop |

   - Phone checks also use one real iPhone (Safari) and one Android (Chrome) if available.
   - 320 and 768 have not been swept since Release 2B (matrix P-33).

## 1. Timeline (ET)

| When (ET) | Block | Tests | Who |
|---|---|---|---|
| **Fri 10-16** (rest of day) | Eng fixes the O-03 test defect locally (pinned or whole-history check). PR and CI. The founder answers FD-1…FD-10 where possible | — | Eng / Founder |
| **Sat 10-17**, morning | **Feature freeze.** Baseline sweep on the served SHA: F-01…F-19 at 390 and 1440; V-01 at all four widths on the 12 launch routes | F, V | Eng (browser), Founder (real phone) |
| Sat 10-17, from 07:00 | UFC fight-week run (Sat 11:00Z). Check the `/ufc` card state and every bout page | F-09 | Eng |
| Sat 10-17, card time (per `/ufc`) | UFC card: no public live tracking claimed; results flow and the `ufc-post-card` grading the next day | F-09, D-03 | Eng |
| Sat 10-17, afternoon | Trust and compliance block (T-01…T-08). The founder runs the account flows if accounts stay enabled (FD-2) | T | Founder (+Eng observer) |
| **Sun 10-18**, 07:00–08:30 | Pre-game baseline: build-info SHA, workflow health (O-01), injuries and rosters (D-02), eligibility display (D-04). **No Production actions** | O-01, D-02, D-04 | Eng |
| Sun 08:30–09:45 | **HOU @ JAX (Wembley) 09:30 ET.** Freeze-time check before kickoff, then kickoff transition | D-01, D-07 | Live |
| Sun 12:00–13:00 | 1 PM window pregame: 7 games (CHI@ATL, BAL@CLE, TEN@IND, NYJ@NE, NO@NYG, CAR@PHI, PIT@TB). Frozen stamps ≤ kickoff; inactives reflected | D-01, D-02 | Live / Eng |
| Sun 13:00–16:00 | Live window 1: `/live`, Home and Today live strips, game-page live panels at 390 and 1440. The capture kit (fixed `players=1`) runs every 5 min | D-07, V-03 | Live |
| Sun 16:05–19:45 | Late window: ARI@LAR 16:05; LAC@KC and BUF@LV 16:25. First finals: "Final · grading pending", then the next event window grades them | D-06, D-07 | Live |
| Sun 20:20–23:45 | SNF DAL @ GB. Low-intensity checks only | D-07 | Live |
| **Mon 10-19**, 07:00–08:30 | **Rollback rehearsal** (O-05). Founder-executed; Eng validates. It must finish before the MLB daily production run (≈ 10:15 ET), per runbook §11.5 | O-05 | Founder + Eng |
| Mon 09:00–12:00 | Sunday settlement verification: Week 6 report, Forecast Record re-hash (D-05), denominators (D-03). Regression of any fix-forward | D-03, D-05, D-06 | Eng |
| Mon 13:00–15:00 | Re-run of the T block for anything changed by FD answers. Final 320/768 visual pass | T, V | Eng / Founder |
| **Mon 17:00** | **Go/no-go review** (§4) | — | Founder |
| Mon 20:15 | MNF WSH @ SF: a second live sample if needed | D-07 | Live |
| **Tue 10-20** morning | Launch-morning smoke: F-01, F-07 (NBA opening night), O-01, build-info | F, O | Eng |

## 2. Test scripts

Each script gives the steps, then the expected result, then the evidence to capture.
- **Routes:** use the trailing slash (`trailingSlash: true`).
- **Default width set:** 390 and 1440, unless a script says "4W", which means 320, 390, 768 and 1440.

### F: Functional

**F-01 · Home `/` (4W)** · Eng
- **Steps:**
  1. Load the page.
  2. Check that the h1 count is 1.
  3. Open each primary in the phone bar: Home, Sports, Live, Simulations, Results.
  4. Open the Menu.
  5. Follow the first featured simulation, the live strip and the results recap links.
- **Expected:**
  - every link resolves with a 200 page;
  - no "today" claim beside a dated snapshot;
  - the UFC card features the title fight or the first modelled bout;
  - the footer has "Contact support" and "Responsible use".
- **Evidence:** screenshots at four widths, plus the link list with statuses.

**F-02 · Today `/today` (4W)** · Eng
- **Steps:**
  1. Check the header count ("Today · <date> · N events") against the sum of sport schedules for the ET date.
  2. Open "More from today's slate".
- **Expected:**
  - the count matches;
  - Live Now comes first when games are live;
  - folded sections open and keep anchors.

**F-03 · Live `/live` (390, 1440; before, during and after games)** · Live
- **Steps:** use the sport tabs, then follow "Open game report →" on each card state.
- **Expected:**
  - LIVE, UPCOMING and FINAL badges;
  - "Forecast locked pregame";
  - NBA, EPL and UFC are labelled not tracked live;
  - no period line once a game is final.

**F-04 · Game report live panel** · Live
- **Steps:** on `/nfl/game/<id>/` for an in-progress game, then the same game when final.
- **Expected:** the region title follows the state.
  - "LIVE NOW" above a final is a **known P1 until #1112 ships** (matrix P-05). Record it; do not raise it as a new defect.

**F-05 · NFL `/nfl`, `/nfl/week/<key>/`, `/nfl/game/<id>/`, `/nfl/simulation/<id>/`** · Eng
- **Steps:**
  1. Open the hub sections and folds; deep-link to a fold anchor.
  2. Open a Week 6 game report and its simulation.
  3. Try `/nfl/world-model/`.
- **Expected:**
  - the anchor opens its fold;
  - the market state reads "not checked in this window" when unpriced (FD-8);
  - `/nfl/world-model/` lands on `/nfl/`.

**F-06 · MLB `/mlb`, `/mlb/board`, `/mlb/board/<date>/`, `/mlb/power`, `/mlb/results`, `/games/mlb/<slug>/`** · Eng
- **Expected:**
  - the slate date is the ET date;
  - the run line is signed as the book's;
  - filters are labelled by gap size;
  - Power links to Homer Nukes.
- **Record:** whether yesterday's `/games/mlb/<slug>/` 404s. That is a known limitation (FD-10b).

**F-07 · NBA `/nba`; on Oct 20, the opening-night slate** · Eng
- **Expected:**
  - schedule and finals only;
  - no forecast language;
  - `/simulate` lists Oct 20–22 dates.

**F-08 · Simulation `/simulate`, `/simulate/d/<date>/`** · Eng
- **Expected:**
  - date-first selection;
  - started games are kept for today;
  - UFC rows are grouped by card with names.

**F-09 · UFC `/ufc`, `/ufc/bout/<id>/`, `/cage-chaos`** · Eng
- **Steps:** walk through every bout on the Oct 17 card, before and after the card.
- **Expected:**
  - all bout pages 200;
  - a withdrawn or cancelled bout is never active;
  - after grading, the record follows the void, withdrawn and pending rules;
  - no "live" claim.

**F-10 · EPL / soccer `/epl`, `/epl/match/<slug>/`, `/soccer/ligue-1/`** · Eng
- **Expected:**
  - "not validated" appears above the first number;
  - folds keep URLs;
  - match pages exist for priced fixtures.

**F-11 · Results `/results`, `/results/{nfl,mlb,forecasts,picks,parlay-lab,parlays,model-audit}/`, `/results/forecasts/<sport>/<family>/`, `/results/date/<date>/`, `/mr-dub`** · Eng
- **Expected:**
  - no pooled "came true" accuracy;
  - metric names and directions;
  - CSV downloads open;
  - windows are labelled.
- The explorer cap of 50 rows is a known limitation (FD-10d).

**F-12 · Parlays `/build`, `/build/custom`, `/cards/<sport>/`, redirects `/parlay-lab` `/picks` `/parlays` `/mlb/parlays` `/nba/parlays`** · Eng
- **Expected:**
  - each redirect lands on `/build/` (or `#suggested-cards`) in one hop;
  - no sport shows "publishing" while its card capability refuses.

**F-13 · Bank Builder `/bank-builder`; Moonshot `/moonshot`** · Eng
- **Expected:**
  - the state matches the pool ("N candidate legs · M games …");
  - the legacy Moonshot lane is pilled;
  - graded legs say "see receipt".

**F-14 · Product lanes `/endzone-vault`, `/homer-nukes`, `/bucket-blitz`, `/goal-rush`** · Eng
- **Expected:** honest product states, and no "ran over a real pool" sentence with an empty pool.

**F-15 · Models and methodology `/models`, `/methodology`, `/learn`, `/market-guide`, `/about`, `/system-status`** · Eng
- **Expected:**
  - "log loss (lower is better)", n and an interval;
  - "not distinguishable" when the interval spans 0;
  - no claim that a model beats a baseline without such an interval.

**F-16 · Research `/players/<sport>/<slug>/`, `/teams/<sport>/<slug>/`** · Eng
- **Steps:** sample 2 per sport (NFL, MLB, EPL, UFC).
- **Expected:**
  - exact-ID portraits and crests, or initials fallback;
  - missing is never shown as zero;
  - noindex where documented.

**F-17 · `/compare`, `/compare/teams/<sport>/`, `/compare/players/<sport>/`, `/matchups/<sport>/<id>/`, `/research`, `/research/lab`, `/sports`** · Eng
- **Expected:**
  - 200;
  - EPL team compare shows only the blocked state;
  - the query-state pair renders.
- These routes have no Production evidence yet (matrix P-19, P-20, P-26).

**F-18 · `/my`, `/following`, `/saved`** · Eng
- **Steps:** follow a team, save a forecast, reload, then clear.
- **Expected:**
  - device-local persistence;
  - "board updated" wording on saved items;
  - nothing is sent to a server (Network tab).

**F-19 · Redirect stubs and archives** · Eng
- **Routes:** `/games`, `/board`, `/projections`, `/events`, `/trends`, `/nhl`, `/ipl`, `/world-cup`, `/nba/results`, `/results/nba`, `/world-cup-specials`, plus `/ops`, `/launch`, `/preview/june20` (expect 404).
- **Expected:**
  - each stub lands on its `ROUTE_TABLE` `redirectTo`, never on a blank page;
  - internal routes are 404.

### V: Visual (DS-001)

**V-01 · Launch routes at 4W** · Eng; real phone by the Founder
- **Routes:** `/`, `/today`, `/live`, `/nfl`, `/mlb`, `/nba`, `/ufc`, `/epl`, `/results`, `/simulate`, `/build`, `/bank-builder`.
- **Expected:**
  - `document.documentElement.scrollWidth <= innerWidth`;
  - 0 broken images;
  - exactly one h1;
  - the primary content is not clipped at 320.

**V-02 · Touch targets (390)**
- **Expected:**
  - chips, disclosures and CTAs at 44 px or more (`.gtp-hit-44`);
  - visible focus ring on keyboard Tab;
  - roving tabs on `/results` (one tab stop; arrows move).

**V-03 · Live cards in all states (390, 1440)**
- **Expected:**
  - logo plus full name (abbreviation fallback);
  - score and status chip visible;
  - consistent across NFL and MLB.

**V-04 · 200% zoom and VoiceOver** · Founder on a real iPhone
- **Steps:**
  1. Open `/`, `/live` and one game report.
  2. Navigate by headings and landmarks.
- **Expected:**
  - a reading order that makes sense;
  - the tabs announce their state;
  - no content lost at 200% zoom.

**V-05 · Console**
- **Steps:** open DevTools on each launch route.
- **Expected:**
  - 0 errors, except the known `/parlay-lab` prefetch aborts;
  - 0 CSP report-only violations, recorded as a count.

### D: Data integrity

**D-01 · Frozen pregame** · Live
- **Steps:** for each Sunday window, open 2 game reports before kickoff and again after it.
- **Expected:**
  - "Forecast frozen at …" ≤ kickoff;
  - the values are identical after kickoff.
- **Evidence:** paired screenshots with times.

**D-02 · Injuries and rosters** · Eng
- **Steps:** compare a team's Out/IR list on the report with `injuries/latest.json` at the served SHA.
- **Expected:**
  - Out and IR players carry no projection, or are flagged;
  - the nfl-event-window log shows "NFL ROSTER AUDIT … violations: 0".

**D-03 · Settlement denominators** · Eng
- **Steps:** after UFC grading and the NFL Sunday settle.
- **Expected:**
  - void, withdrawn, push and pending are excluded from losses and from n;
  - a tie is void;
  - the counts are identical on `/results`, `/results/nfl` and the sport page.

**D-04 · Eligibility display** · Eng
- **Expected:**
  - pages state not-eligible reasons in words that match the workflow log (13 considered · 0 qualify on 10-16);
  - no product card is built from ineligible families.

**D-05 · Forecast Record = ledger** · Eng; run on Mon after the rehearsal, and on launch morning
- **Steps:** in the browser console on Production, hash every `/data/forecast-record/v1/*.csv` (sorted `forecastId|settlementState`), then compare with `data/internal/forecast-ledger/v1/*.jsonl` at the served SHA (runbook §11.3, in #1110).
- **Expected:** 25/25 files match and there are 0 settlement mismatches. The last recorded result was 15,879 rows at `39df089d02`.

**D-06 · Canonical settlement agreement** · Live
- **Steps:**
  1. SEA@DEN check 9 (still open).
  2. Then each Sunday game.
- **Expected:**
  - Results, the game page and `/live` agree once canonical;
  - "Final · grading pending" only until then;
  - no WIN/LOSS before grading.
- **Evidence:** the time the settlement lands on `main`, and the time Production serves it.

**D-07 · Live versus ESPN** · Live
- **Steps:**
  1. Run the capture kit (`docs/live/capture/` on #1082; it reads `players=1`).
  2. Run the V2 replay (#1108) afterwards.
- **Expected:**
  - 0 disagreements;
  - LAG of one pass at most;
  - player stats match ESPN's box.
- If the provider fails, record the delayed/stale behaviour (checks 7 and 19–21, not yet observed live).

**D-08 · Market honesty** · Eng
- **Expected:**
  - NFL markets with no capture say "not checked", with no price (FD-8);
  - MLB markets show the capture date;
  - there is no model-vs-line gap for unqualified families.

### O: Operational

**O-01 · Workflow health** (each morning, and on Sun at 12:00 and 18:00 ET) · Eng
- **Steps:** `gh run list -L 100`, grouped by workflow.
- **Expected:**
  - the only failures are known ones: the nfl-event-window budget refusal (exit 5), and `data-contract-check` until the O-03 fix merges;
  - every other failure is triaged within 1 hour.

**O-02 · Scheduler lateness** · Eng
- **Steps:** for each Sunday NFL window, record the scheduled time against the actual start of nfl-event-window and nfl-kickoff-refresh.

**O-03 · Deploy status** · Eng
- **Steps:** read the GitHub `Vercel` statuses on `main` since the last check.
- **Expected:** "Deployment has failed" = 0.
  - "Canceled from the Vercel Dashboard" is queue supersession (#1110 §11.2).
  - If there are two consecutive memory-kill signatures, open an incident (§11.1).

**O-04 · Alert delivery** · Founder
- **Steps:** trigger the documented safe test (`OPS_WEBHOOK_FOUNDER_SETUP.md`).
- **Expected:** the alert arrives in the founder's channel. Record the time received.

**O-05 · Rollback rehearsal** (Mon 07:00–08:30 ET) · Founder executes, Eng validates
- **Sources:** runbook §10, and #1110 §11.
- **Steps:**
  1. Record `/data/build-info.json` in the browser (SHA A) and the time.
  2. Founder: Vercel → gametime-picks → **Instant Rollback** to the previous Production deployment (§4). Record the time and SHA B.
  3. Validate (§5): build-info = B; `/`, `/live`, `/results` and `/nfl` return 200. D-05 Forecast Record check on B, against the ledger at B.
  4. Note that bot data builds keep building but do not go live (§4). Keep this step under 30 min.
  5. Founder: **Undo Rollback**, promoting the newest `main` deployment (§9).
  6. Validate that build-info = the newest `main` SHA. Run D-05 again.
  7. Tabletop the revert-merge path. Identify the last code merge (`39df089d02`, #1091) and prepare `git revert -m 1 39df089d02` on a local branch. **Do not push it.** Estimated rebuild time is 5–7 min (§11.4).
  8. Post the times and SHAs to `SESSION.md`. Steps 1–6 together must take at most 45 min.
- **Why not Sunday 08:00–09:00 ET (#1110 §11.5):**
  - HOU @ JAX kicks off at 09:30 ET;
  - a rollback stops new pushes going live;
  - so the final pregame revision might not be *served* before start, and Option B forecast-of-record requires it to be.

**O-06 · Launch-morning check** (Tue) · Eng
- **Expected:**
  - build-info = `main` HEAD, or the last data commit;
  - O-01 is clean;
  - F-01 and F-07 pass.

### T: Trust and compliance

**T-01 · Legal routes** · Eng
- **Expected:**
  - `/privacy/` and `/terms/` stay 404 until `legalReadiness()` passes; never bypass the gate;
  - if FD-1 and counsel approval land, both render with the approved hash, an effective date, and no placeholder or null value.

**T-02 · Age and audience consistency** · Eng
- **Steps:** search the public pages (`/responsible-use`, `/about`, the footer, `/account`) for age and audience statements.
- **Expected:** one minimum age everywhere (FD-1c) and "United States". Today `/responsible-use` says 18+ while `ACCOUNTS_SETUP.md` says 21+.

**T-03 · Hosted RLS verification** (only if accounts are enabled; FD-3) · Founder
- **Steps:** in the founder's shell, run `cd app && NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… npm run accounts:verify`.
- **Expected:**
  - exit 0;
  - an empty answer to cross-reader reads;
  - the `slips` bucket is private;
  - **STOP** = a P0.
- **Evidence:** the redacted output, with no keys.

**T-04 · Authenticated account flows** (only if enabled) · Founder, with own inbox
- **Steps:**
  1. Request the magic link; it lands on `/account/` (not localhost).
  2. Enter one hand-entered slip, view it, then sign out.
  3. In a second browser profile, signed out, confirm the slip is not visible.
  4. Confirm `/api/slip-read` answers 503 with no configuration names (after #1090).
- **Expected:** own rows only, and a clean sign-out.
- **Deletion:** document the manual procedure (storage folder first, then the row cascade) and its owner and response time. **Do not run a deletion on real data.**

**T-05 · Data flows versus the disclosures** · Eng
- **Steps:** in DevTools Network on `/`, `/ask` (load only) and `/account`, list every third-party host contacted.
- **Expected:**
  - only the hosts the Privacy draft (#1077) names: Supabase, ESPN, MLB and NBA CDNs, fonts;
  - record whether any analytics request is sent (resolves matrix O-19).

**T-06 · Ask GameTime** (FD-4) · Founder
- **Steps:** confirm the Gemini project quota override and budget alert in the console (screenshot with the key redacted).
- **Paid test:** at most one question, run by the founder. It checks that the answer cites the site's own data and adds no betting advice.
- **Expected:** if the cap is not confirmed, `ASK_GAMETIME_ENABLED` is off and `/ask` shows the closed state.

**T-07 · Claims and framing** · Eng
- **Steps:** on the launch routes, search the visible text for "beat", "lock", "guarantee", "came true", "VERY STRONG" and "confidence".
- **Expected:**
  - none of them unsupported;
  - "research and education" / "Not betting advice" framing on every page footer;
  - 1-800-GAMBLER on `/responsible-use`.

**T-08 · Security headers** · Eng
- **Steps:** browser DevTools on `/` and on one deep route.
- **Expected:**
  - nosniff, DENY, referrer, permissions and HSTS are present;
  - the CSP is **Report-Only**, so a violation is logged but not blocked. Record the violation count.

## 3. Who runs what

| Role | Runs | Never does |
|---|---|---|
| **Founder** | Real-device V-01/V-04, T-03, T-04, T-06, O-04, O-05 (the Vercel steps), the go/no-go decision, every merge | — |
| **Eng** (primary session) | F, V-01–V-03/V-05, D-02–D-05/D-08, O-01–O-03/O-06, T-01/T-02/T-05/T-07/T-08 | Sign in, create accounts, enter keys, scripted polling of Production, merges without exact-head founder approval |
| **Live** (capture session) | F-03/F-04, D-01, D-06, D-07; the capture kit and V2 replay | Touch the capture checkout during a window |

## 4. Go/no-go rubric

### Hard blockers

Every one must be met, or explicitly accepted in writing by the founder where marked.

| # | Criterion | Evidence required | Current (10-16 20:45Z) |
|---|---|---|---|
| H1 | **Legal:** Privacy and Terms published through the gate with counsel approval receipts, **or** the founder chooses the accounts-disable option (FD-2) and records counsel's guidance on the remaining flows (Ask, analytics) | `/privacy/` and `/terms/` 200 with the approved hash, or the FD-2 decision record | ✗ Gate locked; operator placeholder; state and effective date null; no counsel receipt |
| H2 | **Accounts security** (if accounts are enabled): T-03 exit 0 and T-04 pass; the manual deletion procedure has an owner | T-03 and T-04 evidence | ✗ The hosted project has never been verified |
| H3 | **Ask spend:** a provider cap is confirmed, or Ask is disabled | T-06 evidence | ✗ Unconfirmed |
| H4 | **CI:** the `main` HEAD `data-contract-check` is green, and any release or fix head has green exact-head CI | Run IDs | ✗ 3 consecutive failures today (`totals-play-efficiency.test.mjs:109`, `espn.size >= 28`, 26 teams in a bye week) |
| H5 | **Rollback rehearsed** with Forecast Record checks after both the rollback and the undo, or a written founder waiver | O-05 record | ✗ Not performed |
| H6 | **No open P0** from UAT: UFC Oct 17, NFL Sun Oct 18, MLB postseason | The UAT defect log | Pending. SEA@DEN was clean except for check 9 |
| H7 | **Production = `main`** on launch morning; 0 failed deploys since the last check; D-05 passes | O-06, D-05 | ✓ today: `d6de0ceb47` served; 0 failed of 114 statuses |

### Post-launch improvements (not blockers)

| Item | Where |
|---|---|
| Consolidated UX polish | #1092, #1102–#1107, #1109, #1112. P-05's "LIVE NOW" above a final is a P1 cosmetic |
| Results paging | #1104 |
| Live Hub V2 promotion | #1082, #1108, #1111 |
| HTML reduction | #1096–#1100 |
| Build observability and workers | #1095, #1094 |
| Settle stamp guard and MLB stamp gate | #1101, #1088 (founder decision) |
| CSP enforcement | — |
| Point-in-time platform | `TEMPORAL-001` |
| MLB historical restatement | #1045, #1049, with founder acceptance FD-10a |
| Budget refusal as non-fatal in nfl-event-window | O-02 |
| MLB credit logging | O-13 |
| Yesterday's MLB game-page URLs | — |
| Redirect-stub verification beyond F-19 | — |
| Real-device a11y polish beyond V-04 findings | — |
| Research PRs | #1041, #1043, #1044, #1048, #1050, #1061, #1066, #1086 |

### Decision outcomes

- **GO:** H1–H7 are all met.
- **CONDITIONAL GO:** H1–H5 and H7 are met and H6 has only P1 defects, each with an owner and date.
- **NO-GO:** anything else. The fallback is to launch the accounts-off, Ask-off read-only site only if the founder chooses FD-2 and FD-4 that way and counsel guidance on the remaining flows is recorded. Otherwise hold.

## 5. Current evidence-based assessment (2026-10-16 20:45Z)

**NO-GO today, with a realistic path to CONDITIONAL GO by Mon 10-19 17:00 ET.**

The core product is in good shape:
- Production serves `main` (`d6de0ceb47`), with 0 failed builds since #1093.
- Every launch route checked returns 200.
- Frozen-forecast integrity is proven on a real NFL game.
- The Forecast Record matches the ledger.
- Rosters and injuries are fresh with 0 audit violations.
- The security headers are present.

What blocks launch is mostly founder- and counsel-owned (H1–H3, H5), plus one small engineering fix (H4). The binding constraint is H1. Counsel lead time is outside engineering's control. If counsel approval cannot land by Mon 17:00 ET, the founder's choice is between FD-2 (accounts off; described, not recommended, in matrix L-06) and holding the launch.
