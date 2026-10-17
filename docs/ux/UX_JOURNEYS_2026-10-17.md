# UX journeys: combined UX + HTML release candidate

**Candidate tested:** `claude/ux-release-1-on-html` (draft PR #1119), code head `bb4f4a02be`. The static export was built from that commit at 2026-10-17 00:07Z (`app/out/data/build-info.json`). It was served with `node app/scripts/serve-export.mjs 4193 …/s16-relmerge/app/out`.
**Fix branch:** `claude/ux-journey-fixes`, cut from `claude/ux-release-1-on-html` @ `4465b08d40` (bb4f4a02be plus a docs-only commit). No PR.
**Run:** Sat 2026-10-17, 01:20Z–02:30Z. Playwright 1.x from `app/node_modules`, installed Chromium only. Nothing was merged, deployed or dispatched. No paid API was called and no data file was edited.

The prior verification (`docs/release/HTML_UX_COMBINED_VERIFICATION_2026-10-17.md`, `docs/ux/UX_RELEASE_1_TEST_REPORT.md`) already covered a 33-route static sweep and computed-style equivalence, so this run does not repeat them. This run tests **journeys**: it clicks real links and controls after the entry page, and only the entry page is loaded by URL.

---

## 1. Verdict

| Journey | Verdict | Defects fixed here | Deferred |
|---|---|---|---|
| 1. Home → Today → Sport hub → Game details | **Pass** for NFL, MLB, Premier League and UFC at 390 and 1440, and keyboard-only. NBA and Ligue 1 have no game-detail page by design. | UXJ-01 (tablist names, found on the game page) | Today has no in-page link to the sport hubs (D-12) |
| 2. Sport hub → Player research → Forecast | **Pass** for NFL, MLB, Premier League and UFC. Identity matched on every hop. | — | D-13 (EPL/MLB forecast hop lands on a past fixture) |
| 3. Forecast → Simulation → Results | **Pass after fix.** On Thu Oct 15 the NFL lobby said "No NFL games on this date" beside SEA @ DEN, so the NFL path was a dead end. | UXJ-05, UXJ-03 | D-04, D-05 (settled game pages show no final score) |
| 4. Live → Game tracking → Results | **Pass with a finding.** Live tracking is OFF, and a game 90 minutes past first pitch is grouped as UPCOMING / "Scheduled". | — | D-06 |
| 5. Parlay Center → saved lists | **Pass after fix.** Save, Saved Forecasts, Following and My GameTime round-trip on both widths. A saved EPL fixture had its home and away sides reversed. | UXJ-02 | D-10 (pluralisation) |
| 6. Search → Player or Team → Research | **Pass** for NFL players and for NFL, MLB and EPL teams. Keyboard path is clean. MLB, EPL and UFC **player** research pages are not in the search index by design. | UXJ-04 (found on Results) | D-01, D-02, D-03 |

No journey reached a 404 or an unexpected redirect, at any width. There were no console errors and no broken or distorted images. There was no horizontal overflow at 320, 390, 768 or 1440 on any of the 56 pages these journeys visited.

---

## 2. Method

- **Harness:** `scratchpad/j/run.mjs` and companion scripts (not committed).
  - Each step finds the first visible control matching the next destination inside `#main-content`. When the page has no such control, it uses the global navigation: the desktop rail at 1440, the Menu sheet at 390.
  - It taps (390, `hasTouch` + `isMobile`) or clicks (1440), then waits for the network to go idle.
  - It then records:
    - the destination URL against the link's `href` (any redirect is flagged)
    - the link's accessible name against the destination's `h1`
    - whether the id or slug from the href appears on the destination
    - an audit: 404, horizontal overflow and the elements causing it, broken or distorted images, raw tokens matching `/[A-Z]{3,}_[A-Z_]+|[a-z]+_[a-z]+_…|undefined|NaN|null/`, unnamed visible controls, and console or page errors
- **Keyboard (journeys 1 and 6):**
  - Tab-only from Home to Today, the NFL hub and a game, with focus visibility checked at every stop.
  - Arrow, Home and End keys on every tablist of the game page.
  - `/` to open search, typing, ↓ and Enter, then Tab to the Research Lab link, and Escape to close search with focus returned to the trigger.
- **Static integrity (whole export, cheap and exhaustive):**
  - 392,450 internal `href`s across 2,865 pages: **0 missing targets**.
  - 28,308 fragment links: 15 missing ids, all on one legacy route (D-08).
  - 1,304 search-index rows: **0 missing destinations**, and 2 rows whose destination does not name the player (D-02).
- **Content scans** over the visible text of all 56 journey pages:
  - raw codes
  - hit-rate or profit claims and whether a denominator sits within reach
  - standalone `0` / `$0` / `—` values, to check empty states

---

## 3. Results by journey × sport × width

"Pass (N/A)" means the sport has no such surface by design, and the page says so in words.

| Journey | Sport | 390 (touch) | 1440 | Path followed (1440) | Console errors |
|---|---|---|---|---|---|
| J1 | NFL | pass | pass | `/` → `/today/` → (rail) `/nfl/` → `/nfl/game/401872996/` | 0 |
| J1 | MLB | pass | pass | `/` → `/today/` → `/mlb/` → `/games/mlb/tb-vs-cle-2026-10-16/` | 0 |
| J1 | Premier League | pass | pass | `/` → `/today/` → `/epl/` → `/epl/match/everton-v-chelsea-2026-10-17/` | 0 |
| J1 | UFC | pass | pass | `/` → `/today/` → `/ufc/` → `/ufc/bout/401897388/` | 0 |
| J1 | NBA | pass (N/A) | pass (N/A) | `/` → `/today/` → `/nba/` (schedule and final scores; no game page by design) | 0 |
| J1 | Ligue 1 | pass (N/A) | pass (N/A) | `/` → `/today/` → `/soccer/ligue-1/` (forecasts inline; no match page) | 0 |
| J1 keyboard | NFL | pass (Tab×4, ×90, ×65) | pass (Tab×7, ×4, ×27) | same path, Enter on each link; focus visible at every stop | 0 |
| J2 | NFL | pass | pass | `/nfl/` → game → **Research matchup** `/matchups/nfl/401872996/` → `/players/nfl/bhayshul-tuten/` → "open the game forecast" `/nfl/game/401872996/` | 0 |
| J2 | MLB | pass | pass | `/mlb/` → game → matchup `/matchups/mlb/849817/` → team → `/players/mlb/cedric-mullins/` → "Game →" `/mlb/board/2026-09-27/#game-823408` (anchor present; player on that board) | 0 |
| J2 | Premier League | pass | pass | `/epl/` → match → team `/teams/epl/everton/` → `/players/epl/beto/` → `/epl/match/everton-v-manchester-united-2026-09-06/` (D-13) | 0 |
| J2 | UFC | pass | pass | `/ufc/` → bout → `/players/ufc/mike-malott/` → "open the bout forecast" `/ufc/bout/401897388/` | 0 |
| J3 | NFL | **fail → fixed** | **fail → fixed** | Upcoming: `/nfl/game/401872996/` → `/nfl/simulation/401872996/` → `/results/`. Past date: `/simulate/` → ← Thu Oct 15 said "No NFL games on this date" (UXJ-05) | 0 |
| J3 | MLB | pass | pass | `/simulate/` → `/games/mlb/tb-vs-cle-2026-10-16/` (simulation is inline) → `/results/`. Past date Oct 15: "VIEW RESULT →" → `/results/` (D-05) | 0 |
| J3 | Premier League | pass | pass | Today's lobby has no EPL fixture (Fri), so the run entered from the hub: match (simulation inline) → `/results/` | 0 |
| J3 | UFC | pass | pass | Same as EPL: bout (inline) → `/results/` | 0 |
| J3 | NBA | **fail → fixed** | **fail → fixed** | `/simulate/` NBA card → stage dialog → "View event details →" opened `/sports` (UXJ-03) | 0 |
| J4 | MLB (only live sport today) | pass | pass | `/` → `/live/` (tabs ALL / MLB) → "Open game report →" `/games/mlb/tb-vs-cle-2026-10-16/` → `/results/` (D-06) | 0 |
| J4 | NFL / EPL / UFC | pass | pass | `/results/` → "Every graded row →" `/results/picks/{sport}/` | 0 |
| J5 | all | **fail → fixed** | **fail → fixed** | `/` → "Open Parlay Center" `/build/` → "Build your own card" `/build/custom/`. Save on NFL, EPL and UFC game pages, then follow a team → Saved Forecasts (rail or Menu) → item → back to the same game; also checked `/following/` and `/my/`. EPL saved as "Chelsea v Everton" (UXJ-02). MLB TB @ CLE had started, so it correctly showed "not saveable". | 0 |
| J6 | NFL player "stafford" | pass | pass | Search → "Matthew Stafford · Player research" → `/players/nfl/matthew-stafford/` → "Filter game stats" → `/research/lab/?mode=players&sport=nfl&player=matthew-stafford` | 0 |
| J6 | MLB team "yankees" | pass | pass | Search → `/teams/mlb/new-york-yankees/` → "Find games" → Lab | 0 |
| J6 | NFL team "chiefs" | pass | pass | Search → `/teams/nfl/kansas-city-chiefs/` → Lab | 0 |
| J6 | EPL team "arsenal" | pass (N/A) | pass (N/A) | Search → `/teams/epl/arsenal/`. The Lab has no EPL games mode, so the team page correctly offers no Lab link. | 0 |
| J6 | EPL player "haaland" | pass (D-01) | pass (D-01) | Only result: "Erling Haaland · Manchester City v Ipswich Town" → match page. `/players/epl/erling-haaland/` exists but is not indexed. | 0 |
| J6 | UFC fighter "blanchfield" | pass (D-01) | pass (D-01) | Result → bout page; fighter research page not indexed | 0 |
| J6 | NBA "lebron" | pass (N/A) | pass (N/A) | "Nothing published right now matches 'lebron'. Only players and games on a current board are indexed." | 0 |
| J6 keyboard | NFL | pass | pass | `/` focuses the input; ↓ highlights "Matthew Stafford · Player research"; Enter opens it; Tab×27 (1440) / ×11 (390) to "Filter game stats"; Escape closes the dialog and returns focus to the trigger | 0 |

**Identity:** every hop that carried an id or slug landed on a page carrying the same id or slug. Each clicked link's name matched the destination `h1`, for example "Open report → for HOU at JAX" → "Houston Texans at Jacksonville Jaguars", and "Mike Malott" → `/players/ufc/mike-malott/`. The one identity defect is UXJ-02: a reversed fixture in Saved Forecasts.

**Spot checks at 320 and 768** on all 56 journey pages: 0 overflow, 0 broken images, 0 unnamed controls, 0 console errors.

---

## 4. Defects fixed on `claude/ux-journey-fixes`

All five fixes are in commit `271679c0db` and pinned by `app/src/lib/uiux/ux-journey-fixes.test.mjs`. Before the fix, the test file fails: the imports are missing. With the old export linked in as `out/`, UXJ-01's built-HTML check fails on the old pages.

| ID | Severity | Journey | Defect | Fix |
|---|---|---|---|---|
| UXJ-01 | Medium (a11y) | 1 | Each NFL game page's player-projection tablist had the accessible name `players-401872996`, and the NFL hub's had `hub-boards`. `FamilyTabs` used its id base as `aria-label`. This affects 93 game pages and the hub. | New `listLabel` prop (default "Player projections by statistic"; the hub passes "Weekly leaders by statistic"). `label` is now only an id base. |
| UXJ-02 | Medium (wrong identity) | 5 | Saving "Everton v Chelsea" stored and showed **"Chelsea v Everton"**: away side first, so the home side was named second. The Save control's name was also away-first. | `matchupSides` / `matchupLabel` in `saved-schema.mjs` follow the prediction card's per-sport `ORDER`: home v away for EPL, away @ home for MLB and NFL, red vs blue for UFC. The test reads `ORDER` from the card's source, so the two rules cannot drift apart. Snapshots saved earlier keep their stored text, as the schema intends. |
| UXJ-03 | Low–Medium (dead end) | 3 | On an NBA card in the Simulate lobby, "View event details" (twice: on the card, then in the dialog) opened the generic `/sports` index, which has no event on it. | `href: "/nba"`. The NBA hub carries the schedule and final scores, and every other sport's schedule-only card already opens its own hub. |
| UXJ-04 | Low (raw code where a reader label exists) | 4 / Results | The MLB game-record line on `/results/picks/` read "moneyline 418–400 · total … · run line 510–300 · **run line_posted** 5–3". `m.replace("_", " ")` replaced only the first underscore, and the two run-line records could not be told apart. | The label table moved to `graded-picks-loader.ts` (`mlbGameFamilyLabel`) and is shared with `/results/picks/[sport]`. The line now reads "Run line (simulated ±1.5, retired)" and "Run line (posted line)". |
| UXJ-05 | Medium (dead end / wrong empty state) | 3 | `/simulate/d/2026-10-15/` said "No NFL games on this date — next kickoff Sun, Oct 18". SEA @ DEN was played that night and is graded. Graded NFL games are not lobby-eligible ("graded games belong in results"), so they vanished, while MLB lists its settled games as "View result" cards. | Graded NFL games on the date join the same `nflSection` loop, so `postStartState` still assigns their state (the one-owner test stays green). Each shows as a settled "View result →" card linking to `/results/nfl/`. |

**Gates on the fix branch:**
- `tsc --noEmit`: clean.
- Targeted suites: 453 tests across saved, simulate, uiux, my, command-center, game-record, roving-tabs, the NFL page/source tests and results-day.
  - Unit: all pass.
  - With the candidate's export linked as `out/`, the post-build tests pass too, except UXJ-01's built-HTML check, which correctly fails on the old HTML.
- Post-fix rebuild and journey re-run: §6.

---

## 5. Deferred findings (recorded, not fixed)

| ID | Severity | Where | Finding | Why deferred / owner |
|---|---|---|---|---|
| D-01 | Low | Search | MLB (272), EPL (414) and UFC (363) **player and fighter research pages are not in the search index**. Only NFL players and all teams are indexed. Searching "Haaland" or "Blanchfield" reaches the match or bout page, never `/players/epl/erling-haaland/`. | By design: `build-search-index.mjs` documents a 260 KB fetch budget. These pages are reachable from team, match and bout pages. Product decision. |
| D-02 | Low | Search | 2 of 281 NFL player→game rows land on a game page that does not name the player: Jalen McMillan → PIT @ TB, Tyrell Shavers → BUF @ LV. Both have `participation: AVAILABLE_ROLE_UNCERTAIN` and get no projection row. Each also has a correct "Player research" row. | The index builder would need the game page's own row filter. Not a one-line fix. |
| D-03 | Low (a11y) | Search dialog | Results are plain links. The active row is shown visually only, with no `role="listbox"`/`option` and no `aria-activedescendant`, so a screen-reader user does not hear ↓/↑ movement. Tab still reaches every row. | It is an ARIA-pattern change, not a bounded fix. |
| D-04 | Medium | NFL and EPL game pages after settlement | A graded game's page shows "STARTED · NOT SAVEABLE" and the frozen forecast, but **no final score and no link to its graded row**. SEA @ DEN's provenance even says "state SETTLED". The EPL page for Sep 6 (Everton v Man Utd) shows the same. Only the header chip "Settled · Oct 15" leads to `/results/`. | It would be a new results module on game pages. Design scope. |
| D-05 | Low | Simulate lobby | "VIEW RESULT →" on settled MLB cards opens the top of `/results/`, not the dated `/results/date/<date>/` page that lists that game. UXJ-05 follows the existing MLB pattern, `/results/nfl/`. | Destination choice; the dated page would be better. |
| D-06 | Medium | `/live` | With live tracking OFF, TB @ CLE (first pitch 8:00 PM ET) was still grouped "UPCOMING · 1 … Scheduled" at about 9:30 PM ET. `/simulate`, the MLB hub and the game page all said STARTED at the same moment. The page does say "Live tracking is currently turned off". | Live Hub V2 owns the lifecycle (`derivePresentationState` deliberately does not infer "started" without the feed). Flagged for that work stream. |
| D-07 | Info (told to record only) | `/results/model-audit/` | Raw `INSUFFICIENT_SAMPLE` in prose. | Owned by the internal-terminology agent. |
| D-07b | Low | `/results/forecasts/` "Published but not in this record yet" | Raw `nfl_score_shape`, `SHADOW / PRIVATE_RESEARCH` and "DEMOTED … (RESEARCH)" come from `forecast-ledger/compose.mjs`, which is also written to the ledger manifest. | Changing it changes a data artifact. Owned by the internal-terminology agent. |
| D-08 | Low | `/nfl/world-model/<id>/` (legacy) | Redirects to `/nfl/game/<id>/#simulation`, but 15 of those 29 game pages have no `id="simulation"`, so old bookmarks land at the top of the page. No internal page links to the legacy route. | Legacy URLs only. |
| D-09 | Low | `/results/` slate list | The 2026-10-09 slate shows "Complete · Generated 0 · Win 0 … No play 0" with "No result on this slate has been decided yet". With zero rows generated, that message implies pending results. | Empty-state copy in the results-day component. |
| D-10 | Low | `/build/`, `/parlay-lab/` | "1 candidate cards were withheld" (pluralisation). | Copy. |
| D-11 | Low | Terminology across journeys | One place, several names. **Simulations** (nav) vs **Simulate** (h1/title). **Parlays** (nav) vs "Parlay Center" (eyebrow / Home) vs "Suggested Parlays" (h1); `/parlay-lab/` repeats `/build/`, and "Suggested-Card Record" names the results lane. `/results/picks/<sport>/` is "Full record" (NFL, EPL hubs), "Results ↗" (MLB, UFC hubs), "Every graded row" (Results) and "Picks vs outcomes" (its h1). Game-detail links read "Open report", "View archived report" (MLB, for a game that started today) or "ANALYSIS" (UFC). The MLB game `h1` is "TB @ CLE" while other sports use full names. | Naming decision for the founder; no single defect. |
| D-12 | Low | `/today/` | No in-page link to the sport hubs. The hub is reached through the rail (desktop) or the Menu sheet (phone), so keyboard-only at 390 is 90 Tabs to the NFL hub. | Navigation design. |
| D-13 | Info | J2 EPL and MLB | From a player page the first game link is a past fixture or archived board (most recent game in the log), not the upcoming forecast. The NFL and UFC player pages lead with "open the game/bout forecast". | Product design. |
| D-14 | Low | NFL game page | "No simulation story for this event: No NFL event with a published simulation for this date." appears directly above "World Model V2 · 10,000 simulated games" on SEA @ DEN. | The copy contradicts the content below it; story-artifact scope. |
| D-15 | Low | `/simulate/` coverage text | "it picked about 64% of winners on a held-out 2025 season" gives no game count next to it. Every other hit-rate claim on the journey pages carries its denominator (e.g. "25 hit · 31 missed · 56 graded picks is still a small sample"). | Copy. |

**Checked and clean:**
- Confidence language: every hit rate on Results and the hubs carries its count and a small-sample caveat. "It has NOT been shown to beat the sportsbook market" appears where the NFL rating is compared with the market.
- Predictions vs live vs settled: forecasts are labelled frozen or pregame everywhere, and Live says "Forecast locked pregame".
- Empty states use words ("No card today", "No final recorded", "not recorded"). The only all-zero row is D-09.
- `scrape_ufc_stats` on bout pages is the open-source data project's name, in a provenance attribution with its licence. It is not a leaked code.
- The `Failed to fetch RSC payload` console messages appear only when a navigation interrupts an in-flight Next prefetch. The payloads themselves serve 200.

---

## 6. Post-fix verification

**Rebuild:** a full `npm run build` from `271679c0db`, taken under the shared build lock, which was released afterwards. The rebuild regenerated `data/ask-projection/**/*.json.gz`, and those files were restored with `git checkout`, so the diff stays code and test only. The export was served on port 4194 and checked against the candidate on 4193.

| Check | Result on the fixed export |
|---|---|
| UXJ-01 | `/nfl/` tablist is named "Weekly leaders by statistic". `/nfl/game/401872996/` has "Player projections by statistic" and "Choose a simulated game". 0 NFL pages carry a tablist named by an id. The keyboard pass is unchanged: →, End and Home move focus and selection, and focus is visible. |
| UXJ-02 | EPL hub → Everton v Chelsea → Save. The control reads "Save the Everton and Chelsea forecast". Saved Forecasts lists "Everton v Chelsea → /epl/match/everton-v-chelsea-2026-10-17/" at 390 and 1440, with 0 overflow. |
| UXJ-03 | Simulate → NBA card → dialog "View event details →" opens `/nba`, the NBA hub (h1 "NBA"), at both widths. |
| UXJ-04 | `/results/picks/` reads "Winner (moneyline) 418–400 · Total (over/under) 380–395–38 · Run line (simulated ±1.5, retired) 510–300 · Run line (posted line) 5–3". No raw key remains. |
| UXJ-05 | Simulate → "← Thu, Oct 15" shows "SEA @ DEN · 8:15 PM ET · FINAL · Settled … VIEW RESULT →", and "No NFL games on this date" is gone. The card opens `/results/nfl/`, which lists event 401872995. |
| Journey re-run | All six journeys at 390 and 1440 give the same paths and verdicts as §3, plus the fixes above. 0 redirects, 0 404s, 0 console errors. |
| Width spot check | All 56 journey pages at 320 and 768: 0 overflow, broken images or unnamed controls. One transient Next RSC-prefetch "Failed to fetch" on `/parlay-lab/` at 768 came from the harness closing the page mid-prefetch. It did not reproduce in 3 idle reloads on either export. |
| Static integrity | 392,451 internal hrefs across 2,865 pages: 0 missing targets. |
| Tests | Targeted suites, 453 tests including the post-build checks against this export: **453/453 pass**. `tsc --noEmit` is clean. |

Not run here: the full unit suite, lint and the a11y Playwright suite. The five fixes touch 9 source files, and the targeted suites cover every test that references them.
