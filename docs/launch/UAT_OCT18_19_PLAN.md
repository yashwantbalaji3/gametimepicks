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
| **Fri 10-16** (rest of day) | ~~Eng fixes the O-03 test defect~~ **Done:** #1114 merged 23:44:59Z; `data-contract-check` green on `main` at 23:53Z (run 38983736869) and 04:59Z 10-17 (run 39004608711). The founder answers FD-1…FD-10 where possible | — | Eng / Founder |
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
| **Mon 10-19**, 07:00–08:30 | **Rollback rehearsal** (O-05), a **dry run** to the confirmation dialog per `decisions/ROLLBACK_REHEARSAL.md` §3. Production is never switched unless the founder separately chooses the §6 live switch (07:00–07:30 only). Correction (10-17): the morning data chain lands around **08:00 ET**, not ≈ 10:15 (package 4 §4) | O-05 | Founder + Eng |
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

**F-20 · Site search** (added 10-17) · Eng · `PRODUCTION-READ-ONLY`
- **Where:** the search box in the desktop rail (`command-rail.tsx:104`), the phone header, and the tablet Menu sheet (`mobile-bottom-nav.tsx:177`). Index: `/data/search/index.json`, fetched on first open (`components/search/site-search.tsx`).
- **Steps:**
  1. At 1440, 768 and 390, open search.
  2. Type a current NFL player, an MLB team, a UFC fighter and an EPL club.
  3. Use the arrow keys and Enter, then Escape.
- **Expected:**
  - results are grouped "Games & fights / Players / Teams / Pages";
  - **no probability or price** appears in a result row;
  - each result opens a 200 page about that entity;
  - the field says it is loading until the index arrives, never a silent empty list;
  - focus returns to the trigger on Escape.
- **Fail:** a dead result (404), a number in a result row, a keyboard trap, or no way to search at 390.

**F-21 · Mobile navigation** (added 10-17) · Eng (Founder on a real phone) · `PRODUCTION-READ-ONLY`
- **Steps:** at 320 and 390, use each bottom-bar item (Home, Sports, Live, Simulations, Results) and the Menu sheet. Open and close the sheet with the keyboard and by tapping outside it, then use browser Back.
- **Expected:**
  - the active item is marked;
  - every Menu destination resolves with 200;
  - the sheet traps focus while open and returns it on close;
  - targets are 44 px or larger;
  - the bar never covers the last content row;
  - "Your bets" appears only while accounts are enabled (package 1 §9).
- **Fail:** a dead link, a trapped or lost focus, overflow at 320, or the bar hiding primary content.

**F-22 · Error handling** (added 10-17) · Eng · `PRODUCTION-READ-ONLY`
- **Steps:**
  1. Open a non-existent route such as `/nfl/game/0/` or `/does-not-exist/`.
  2. Load `/account/` and `/feedback/` signed out.
  3. With DevTools offline, submit a question on `/ask/`.
  4. Open a game page whose live feed is idle.
- **Expected:**
  - the site's own 404 page (`app/not-found.tsx`) with a way home, **not** a Vercel error page;
  - `/account/` shows the sign-in panel, or the "not open yet" notice if accounts are disabled;
  - offline Ask shows "Ask GameTime is temporarily unavailable. The rest of the site still works." with a Retry button;
  - no stack trace, configuration name or key in any visible text or response body.
- **Fail:** a blank page, a framework error overlay, or a config or variable name visible. Before #1090 ships, a 503 body naming a config variable is a **known P0 item tracked by O-14**; record it, do not re-raise it.
- **Covered elsewhere:** API refusal copy for Ask at limits is listed in `decisions/ASK_GAMETIME_SPEND_CONTROLS.md` §7. Live-feed failure is D-07 (observe; never induce on Production).

**F-23 · Ask GameTime state, zero cost** (added 10-17) · Eng · `PRODUCTION-READ-ONLY`
- **Steps:**
  1. Load `/ask/` and its entry points: the rail and footer link, `/research`, and one sport hub section.
  2. Send **one** `POST /api/ask/` with body `{"messages":[]}`. This cannot reach the model.
- **Expected:**
  - **Ask enabled:** 400 `MALFORMED_REQUEST`.
  - **Ask disabled (FD-4 option B):** 503 `FEATURE_DISABLED` "Ask GameTime is not enabled". The entry points stay visible; that is the accepted caveat, so record it.
  - **After #1121, provider unnamed:** 503 `PROVIDER_NOT_CONFIGURED`. That is a **fail**: #1121 must not merge before `ASK_MODEL_PROVIDER` is confirmed.
- **Fail:** any 200 answer (it would mean a paid call happened), or an unexpected status.
- **Paid check:** at most one question, run by the founder only (T-06).

**F-24 · Accounts, signed out, as a stranger** (added 10-17) · Eng · `PRODUCTION-READ-ONLY`
- **Steps:** in a clean profile, open `/account/` and `/feedback/`. Do **not** submit an email (Claude sessions never sign in).
- **Expected:**
  - **Invite-only or public:** the sign-in panel with "Email me a link", and "Feedback is for invited testers. Sign in first." on `/feedback/`.
  - **Disabled:** "Accounts are not open yet…" on `/account/`; on `/feedback/` the same notice plus "The feedback form opens with tester accounts."; no "Your bets" link anywhere.
- **Fail:** the account mode on screen does not match the founder's FD-2 decision.

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

**O-05 · Rollback rehearsal** (Mon 07:00–08:30 ET) · Founder executes, Eng validates · `NEEDS-FOUNDER`
- **Procedure (10-17):** the **dry run** in `decisions/ROLLBACK_REHEARSAL.md` §3. Record SHA A, identify last-known-good SHA K, verify K's build-info and Forecast Record against the ledger at K, run the append-only K→A comparison, then the founder walks the Vercel Instant Rollback dialogs and presses **Cancel**. Tabletop the revert locally (nothing pushed).
- **Pass:** build-info = SHA A before and after; K's Forecast Record matches the ledger at K; append-only `violations: 0`; dialog screenshots show both production domains.
- **Fail:** Production moved without the founder's §6 choice, or any integrity mismatch on K.
- The previous steps 1–8 (a live switch and Undo) are now package 4 §6, **only** if the founder explicitly chooses it, 07:00–07:30 ET with Undo by 07:30.
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

**T-03 · Hosted RLS verification** (only if accounts are enabled; FD-3) · Founder · `NEEDS-FOUNDER`
- **Superseded procedure (10-17):** do **not** use the service-role key. Run Tiers **A, A2, B and C** of `decisions/SUPABASE_SECURITY_VERIFICATION.md` §3 (summary table in §7): anon key in the shell, catalog SELECTs in the dashboard SQL editor, and two throwaway accounts UAT-A/UAT-B created and deleted the same day. Optional A3 (sign-up toggle) and D (full battery).
- **Pass:** every line matches its expectation in package 2; `accounts:verify` `exit=2` (UNPROVEN) is the expected result without the service-role key.
- **Fail:** any STOP line in A, A2, B or C. That is a **P0**: take the accounts-disable option until re-applied and re-run.
- **Evidence:** the redacted files in package 2 §4, with no keys, tokens, passwords or real emails.

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

### L: Local (no Production contact) (added 10-17)

**L-01 · Release-candidate export** · Eng · `LOCAL`
- **Steps:** full export build plus the post-build suite at each approved head before it merges (#1118, #1117 → #1119 → #1120, #1121).
- **Expected:**
  - build exit 0;
  - post-build 0 failures, including #1120's internal-code guard;
  - 0 missing internal link targets.
- **Fail:** any failure. The head does not merge.

**L-02 · Legal gate stays shut** · Eng · `LOCAL`
- **Steps:** `node -e` with `legalReadiness('terms')` and `legalReadiness('privacy')` at `origin/main`.
- **Expected:** `publishable: false`, with reasons naming:
  - the placeholder operator;
  - the null state;
  - the null effective date;
  - the missing approval.
- **Fail:** `publishable: true` without a counsel receipt. That would be a P0.

**L-03 · Accounts-disabled rendering** · Eng · `LOCAL`
- **Steps:** a local export with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset.
- **Expected:**
  - no "Your bets" link in the rail or footer;
  - `/account/` shows "Accounts are not open yet…";
  - `/feedback/` shows that notice plus "The feedback form opens with tester accounts.";
  - follows and saves still work in the browser.
- **Why:** this proves FD-2's disable option without touching Production.

**L-04 · Ask kill switch and fail-closed** · Eng · `LOCAL`
- **Steps:** #1121's unit tests (`ask-spend-fail-closed.test.mjs`), plus `decideAsk` with `ASK_GAMETIME_ENABLED` set to each of `0`, `false`, `off`, `no` and `disabled`.
- **Expected:** every value gives 503 `FEATURE_DISABLED`. A production-mode call with no `ASK_MODEL_PROVIDER` gives 503 `PROVIDER_NOT_CONFIGURED`.

**L-05 · Live replay** · Live · `LOCAL`
- **Steps:** after each Sunday game, run the V2 replay (#1108) on the capture's saved envelopes.
- **Expected:**
  - 0 disagreements;
  - a lag of 1 pass at most;
  - V2-only checks 5, 6 and 13–18 evaluated from the envelopes (§2b).

## 2a. Coverage map and tags (added Sat 2026-10-17 ~07:10Z)

**Tags:**
- **`LOCAL`:** a local checkout or build, or GitHub/git reads. Never touches Production.
- **`PRODUCTION-READ-ONLY`:** real-browser reads of Production (UAT rule 2), or a single zero-cost request. No sign-in, no paid call, no state change.
- **`NEEDS-FOUNDER`:** founder credentials, a console, a real device, a sign-in, or a Production action.

**Tag per test:**

| Tag | Tests |
|---|---|
| `LOCAL` | L-01, L-02, L-03, L-04, L-05, O-01, O-02, O-03 |
| `PRODUCTION-READ-ONLY` | F-01 … F-24 (F-18 writes only to the tester's own browser storage), V-01, V-02, V-03, V-05, D-01 … D-08, O-06, T-01, T-02, T-05, T-07, T-08 |
| `NEEDS-FOUNDER` | V-04, O-04, O-05, T-03, T-04, T-06; plus V-01 and F-21 on a real phone |

**Area coverage.** Each area lists its expected experience, then what counts as a pass or a fail. Severity follows §0 rule 5.

| Area | Tests | Expected experience | Pass | Fail |
|---|---|---|---|---|
| **Home** | F-01, V-01, T-07 | A truthful hero, featured simulations, a live strip, a results recap; footer with support and responsible use | Every link 200; one h1; no "today" beside a dated snapshot; no overflow at 320 | A dead link, an unsupported claim, overflow or clipping |
| **Today** | F-02 | "Today · <date> · N events"; Live first when games are live; folded sections | The count equals the sum of sport schedules for the ET date; anchors open folds | Wrong count; stale "next window" text after a published slate (#1118 fixes it) |
| **Sport hubs** (NFL, MLB, NBA, UFC, EPL, Ligue 1) | F-05, F-06, F-07, F-09, F-10, D-04, D-08 | Each hub states what is forecast, what is not, and why | Markets "not checked" when unpriced; NBA schedule only; EPL "not validated" above the first number | A fabricated price; forecast language on NBA; a withdrawn bout shown as active |
| **Player and team research** | F-16, F-17 | Exact-ID portraits and crests, or an initials fallback; missing ≠ zero | 2 per sport open with 200; no wrong headshot | A wrong person's photo; missing shown as 0 |
| **Simulations** | F-08 | Date-first selection; UFC grouped by card | Oct 20–22 dates present; started games kept for today | A missing date; an ungrouped card |
| **Results** | F-11, D-03, D-05, D-06 | Metric names and directions; windows labelled; CSVs downloadable | Forecast Record = ledger at the served SHA; void, push, pending and withdrawn excluded from losses and n | Any mismatch (P0); a pooled "came true" figure |
| **Parlay Lab and products** | F-12, F-13, F-14 | Redirects land on `/build/` in one hop; honest product states | No sport "publishing" while refused; "see receipt" on graded legs | A multi-hop or blank redirect; an empty pool described as run |
| **Accounts** | F-24, T-03, T-04, L-03 | The mode the founder chose for FD-2, shown consistently | Package 2 tiers all as expected; own rows only; a clean sign-out | Any cross-user read (P0); the mode on screen ≠ FD-2 |
| **Ask** | F-23, T-06, L-04 | Enabled with a confirmed cap, **or** disabled with the visible-entry caveat accepted | The zero-cost POST matches FD-4; the founder's one paid question cites site data and gives no betting advice | A 200 from the zero-cost probe; a config name visible; on without a cap |
| **Live tracking** | F-03, F-04, D-01, D-06, D-07, V-03, L-05 | LIVE/UPCOMING/FINAL; "Forecast locked pregame"; untracked sports labelled | Frozen ≤ kickoff and unchanged after; scores equal ESPN; "Final · grading pending" until canonical | A forecast change after start (P0); a score contradicting ESPN twice (P0) |
| **Mobile navigation** | F-21, V-01, V-02 | Bottom bar plus Menu sheet; 44 px targets | All destinations 200; focus managed; no overflow at 320 | A dead item; lost focus; the bar covering content |
| **Search** | F-20 | Players, teams, games and pages; results are doors, never numbers | Every sampled result 200; keyboard works | A dead result; a number in a result row |
| **Accessibility** | V-02, V-04, F-20, F-21; CI's browser a11y step on each release head | One h1, roving tabs, visible focus, VoiceOver order, 200% zoom | Founder's real-device pass; CI green | A keyboard trap; content lost at 200% |
| **Error handling** | F-22, F-23, T-05 | The site's own 404; plain refusal copy; nothing internal shown | No config or variable names; no stack traces | A framework error page, or a config name (P0, rule 5) |
| **Legal and trust** | T-01, T-02, T-07, T-08, L-02 | Gate shut until counsel approval; one age statement | `/privacy/` and `/terms/` 404 until the receipt exists, then 200 with the approved hash | A bypassed gate; contradicting age statements |

## 2b. Sunday NFL capture alignment (Week 6, Sun 2026-10-18)

The capture kit (`docs/live/capture/`, branch `claude/live-hub-sunday-kit` `ab2f28b88f`) reads only Production's gateway and pages and `origin/main`. Check numbers refer to `docs/live/LIVE_V2_THURSDAY_ACCEPTANCE.md` (23 checks).

| Game | ESPN id | Kickoff | UAT tests in the window | Acceptance checks targeted |
|---|---|---|---|---|
| **HOU @ JAX** (London) | 401872996 | **13:30Z = 09:30 ET** | D-01 (freeze before kickoff and unchanged after), F-03 and F-04 through to final, V-03 at 390 and 1440 | 1, 2 (kickoff transition), 3, 4, 5 (player stats; envelope-level), 11, 13 (poll cadence), 14 (freshness bands), 15, 22, 23. Then 8 at final |
| **NO @ NYG** | 401873000 | **17:00Z = 13:00 ET** | D-01, D-07 (ESPN agreement), F-03, D-02 (inactives) | 1–6, 12, 16 (rail landmarks), 17 (an **under** row; open since SEA@DEN), 18 (TD wording). 7 and 20 (delay and recovery) **if** a delay occurs naturally |
| **BUF @ LV** | 401873005 | **20:25Z = 16:25 ET** | D-01, D-06 (canonical settlement, Mon), D-07 | 1–4, 8 (provisional final), 9 (canonical settlement, watched into Mon), 10 (pregame immutability, Option B) |

**For all three games:**
- **Checks 19–21 (provider failure)** are **observe-only; never induce on Production**. If none occurs, they stay "not observed live" (matrix O-15), as at SEA@DEN.
- **Checks still open after SEA@DEN**, which Sunday should close:
  - 5: envelope-level player stats;
  - 7: delay and recovery;
  - 13: client cadence;
  - 14: freshness bands;
  - 17: an under row;
  - 19–21: provider failure, only if it occurs.
- **Live Hub V2 promotion** still also needs one MLB postseason game (matrix P-04). Sunday does not promote V2.
- **No Production actions on Sunday.** The rollback rehearsal is Monday (O-05). Merges approved for Sat 10:30–11:00Z must not slip into the 12:30Z–23:45Z capture span without the founder's explicit go-ahead.

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
| H4 | **CI:** the `main` HEAD `data-contract-check` is green, and any release or fix head has green exact-head CI | Run IDs | ✓ (10-17 06:30Z): #1114 merged; `data-contract-check` green at 10-16 23:53Z and 10-17 04:59Z. Re-check on any new merge |
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
