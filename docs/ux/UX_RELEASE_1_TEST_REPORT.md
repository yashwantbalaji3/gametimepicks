# UX Release 1: consolidated test report

**Branch:** `claude/ux-release-1`, cut from `origin/main` @ `d6de0ceb47` (2026-10-16).
**Status:** locally validated. Draft PR only. **DO NOT MERGE without founder approval.** Nothing was deployed, no workflow was triggered, and no paid API was called.
**Prepared:** Fri 2026-10-16 (ET), for the Oct 20 public launch.

This branch merges nine UX-audit PRs, each with `git merge --no-ff` so every original commit is kept. It then adds a set of small fixes for defects that the consolidated browser sweep found. All of it is display-only.

---

## 1. Exact-head approval package

| Item | Value |
|---|---|
| Code head tested | `2b0ca650c8`: unit suite, build, rendered guards and browser sweep (§6) |
| Branch head | This document's commit, which adds `docs/ux/UX_RELEASE_1_TEST_REPORT.md` only. No code changes after the tested head. |
| Base | `origin/main` @ `d6de0ceb47` |
| Merged PR heads (re-verified before merging) | #1092 `729f8663af` · #1103 `81b9b66804` · #1102 `b22a14537f` · #1104 `7f77894a39` · #1105 `b5a25afb99` · #1106 `bb3832121e` · #1107 `55b1de8918` · #1109 `2e104fa6a1` · #1112 `65855730e8` |
| Files changed vs base | 9 PRs: 49 files, +587 / −109. Release fixes (`UXR1-01`…`UXR1-11`): 17 files, +290 / −68, of which 1 is the new test file. Plus this report. |
| Areas touched | `app/src/app/**` pages, `app/src/components/**`, `app/src/lib/**` (display maps and helpers), new tests under `app/src/lib/**`, `docs/UX_DESIGN_STANDARDS.md` (#1102), and one producer wording line in `app/scripts/parlays/lab-eligibility.mjs` (#1109, see below) |
| **Data impact** | **None.** No file under `data/`, `app/public/data/` or `pipeline/` changes. No forecast, model output, grade, settlement, ledger or historical record is touched, and no committed artifact is rewritten. The local builds regenerate `data/ask-projection/**/*.json.gz`; those files were restored with `git checkout` after every build and are not in the diff. |
| Producer wording note (#1109) | `lab-eligibility.mjs` changes **only the wording** of one blocked-reason string. "the last price capture is 3.9 days old" becomes "the last price capture (Oct 11) is more than 3 days old". The next `nightly-settle` / `daily-products` run writes the new sentence into `lab-ledger.json`. Eligibility logic, thresholds and the evidence fields (`pricesCapturedAt`, `priceAgeDays`) are unchanged. |
| Vercel impact | One Production build when merged (estimate: ≈ $0.14–0.20). No preview builds. |
| Rollback | `git revert -m 1 <merge commit>` of the PR's merge into `main` reverts the whole release. Each PR's own merge, and each `UXR1-xx` commit, can also be reverted on its own. |

---

## 2. What each PR changes, and the findings it addresses

**Where the finding IDs come from.**
- **GTP-xx, DS-001, LIVE-F and NEW-x** are defined in `GAMETIMEPICKS_MASTER_ROADMAP_V2.md` §16 ("UX System V2 — independent audit reconciliation") and in `docs/UX_DESIGN_STANDARDS.md`.
- **H1–H7, M1–M10 and L1–L7** come from the 2026-10-15 cross-sport consistency audit. That audit is **not committed to the repository.** These IDs are defined only in the PR descriptions and test headers below.
- Note that `docs/PUBLIC_BETA_LAUNCH_AUDIT.md` reuses the same letters for an unrelated July audit.
- Recommendation: commit the 2026-10-15 audit table to `docs/ux/` so the IDs resolve.

### PR → finding traceability

| PR | What it changes | Findings | Routes |
|---|---|---|---|
| **#1092** ux-et-timestamps | New `<EtTime>` component. It shows "Oct 14, 7:43 PM ET" and keeps the exact ISO value in `dateTime` and `title`. It replaces 410+ raw ISO-UTC stamps in first-view text. The `/nfl/simulation` availability id is made readable. Post-build guard `uiux/first-view-utc.test.mjs`. | P246 house rule; DS-001 §1.3 and §1.7; GTP-27 (ISO times) | NFL game, NFL week, `/nfl`, UFC bout, EPL match, EPL/UFC card ladders, `/nfl/simulation` |
| **#1103** ux-plain-copy (stacked on #1092) | `/nfl` lane states get reader words, and the run hash is gone from the eyebrow. MLB board `pendingReason` codes become sentences. "Nothing renders here…" and "on disk" style phrases are rewritten. New `EVENT_STATUS_LABEL` (UFC bout statuses included). UFC body text moves to the body face at 12.5 px. Two summaries become 44 px. | H3, H4, H6, H7, L4; M10 and L7 (UFC); DS-001 §1.4 and §1.7; GTP-27 | `/nfl`, `/mlb`, `/mlb/board`, `/ufc`, `/epl`, `/sports`, Home upcoming, game report |
| **#1102** ux-status-vocabulary | `hubStatusDisplay()` maps hub chips to Upcoming / Live / Final / Started. `/live` groups say "Upcoming" and "Final · grading pending" / "Final today". `/simulate` says Started / Final / Report ready. The NBA note no longer repeats "Final". | H1, H2, M4, L1; DS-001 §2; LIVE-F vocabulary | sport hubs, `/live`, `/simulate`, `/nba` |
| **#1104** results-explorer-paging | The `/results` card explorer and the `/results/model-audit` pick detail page in steps ("Show N more" / "Show all N", 44 px) instead of a silent cap at 50 or 250. Sport names replace keys. Slip IDs and source files move behind disclosures. | H5; **GTP-21/32** (P2 work, done before launch) | `/results`, `/results/model-audit` |
| **#1105** ux-team-identity | EPL header crests go to `lg` and become decorative. Adds `decorative` to `TeamBadge` / `TeamLogo` fallback / `PlayerAvatar`. MLB tiles name their real destination and show "TBD", not "?". The board schedule grid gets ID-based crests. | M1, M2, M3, L3; GTP-31; DS-001 §5 | EPL match, sport hubs, `/mlb`, `/mlb/board`, `/ufc` |
| **#1106** ux-nav-consistency | `/nba` gets the shared section strip (Games / Model status / Results / Ask, with no Live link). The mobile Menu label is corrected. | M7, M8 (**M6 left for the founder**, §8) | `/nba`, mobile bar |
| **#1107** ux-state-labels-batch | Archive CTA reads "View archived report". `/today` says Upcoming / Started at 10.5 px. NFL hub, game report and hub-header disclosures become 44 px. | L2, M5, L7; GTP-12; DS-001 §6 | sport hubs, `/today`, `/nfl`, NFL game |
| **#1109** stable-age-text | The lab-eligibility stale reason names the capture date, not a wall-clock age. This stops Results projection restatements (r2 → r5 on Oct 15) that were caused only by the clock. | New finding 2026-10-15 (truthfulness and build churn) | `/results/parlay-lab` (through `lab-ledger.json` on the next producer run) |
| **#1112** live-panel-final-labels | After the final, the live panel's region title reads "Final score" instead of "Live now" (from the SEA@DEN capture). | L5 (confirmed by the 2026-10-15 capture); LIVE-F | NFL game pages |

### Overlap between the PRs, and what was already on main
- **Shared files:**
  - `app/nfl/page.tsx`: #1092, #1103, #1107;
  - `components/sport-hub/game-summary.tsx`: #1102, #1105, #1107;
  - `app/mlb/page.tsx` and `components/mlb/mlb-board-body.tsx`: #1103, #1105;
  - `app/epl/match/[slug]/page.tsx`: #1092, #1105;
  - `app/nfl/game/[eventId]/page.tsx`: #1092, #1107.
- In every case the PRs edit different hunks, and #1103 was built on #1092's text.
- **Already on main: none.** All 9 merges brought in their full diff. The integrated diff is exactly the union: 49 files, and +587 equals the sum of each PR's own additions minus 2 lines that #1103 rewrote over #1092. #1092 and #1103 were 149 commits behind main. The other PRs were 60–89 commits behind.
- **Status-word maps.** #1102 (`hubStatusDisplay`) and #1103 (`EVENT_STATUS_LABEL`) each add a map beside the live owner (`LIFECYCLE_LABEL`).
  - They translate three different input vocabularies, so they stay three functions.
  - The new guard **UXR1-10** pins that they print one word set.
- **Duplicate components.** #1105 adds `decorative` to `components/player-avatar.tsx`, with the same meaning (`alt=""` plus `aria-hidden`) as the existing `components/ui/player-avatar.tsx`.
  - These two avatar components already existed on main. Merging them is design-system work (P2, CC-07/08), not part of this release.
- **Source display names.** `components/sports/upcoming-sports.tsx` kept the only source-name map privately, so `/ufc` and `/epl` printed raw ids. UXR1-07 moves that map into one place: `sourceDisplayName()` in `lib/sports/source-registry.mjs`.

---

## 3. Conflicts and how they were resolved

| Merge | Textual conflicts | Semantic check and resolution |
|---|---|---|
| #1092 → base | none | — |
| #1103 (stacked) | none | It rewrites #1092's `/nfl` products eyebrow (drops the run hash, keeps `formatUpdatedEt`). Kept as #1103 has it. |
| #1102 | none | `game-summary.tsx` chip now goes through `hubStatusDisplay`. Checked alongside #1105 and #1107 below. |
| #1104 | none | — |
| #1105 | none in `mlb-board-body.tsx` or `mlb/page.tsx` (different hunks from #1103) | #1103's past-slate "Slate · N games" label and #1105's crests and "TBD" render together on `/mlb/board/<date>`. Verified in the export. |
| #1106 | none | `HubSport` gains `nba`, and the `hub-shell` guard now covers it. |
| #1107 | none in `game-summary.tsx` (CTA line) or `nfl/page.tsx` (:1041) | #1107 left `nfl/page.tsx:1070` alone so as not to collide with #1103, and #1103 already makes it 44 px. No `minHeight: 32` summary remains in the files #1107 guards. |
| #1109, #1112 | none | — |

**Result:** 0 textual conflicts. 3 multi-PR files were reviewed hunk by hunk. One consolidation was made (the source-name map, UXR1-07), and one cross-PR guard was added (UXR1-10).

---

## 4. Defects found by the consolidated sweep and fixed here

Each fix is a separate commit with a regression test in `app/src/lib/uiux/ux-release-1-fixes.test.mjs` (12 tests). All are display-only.

| ID | Rule | Defect (where found) | Fix |
|---|---|---|---|
| UXR1-01 | GTP-21/32 follow-up; DS-001 §9 | After the last "Show N more" or "Show all", the buttons unmount and **keyboard focus dropped to `<body>`**, back to the top of an ~18,000 px page (`/results`, `/results/model-audit`). | Focus moves to the "Showing all N" status (`tabIndex=-1`). It moves only when everything is shown, never on a filter change. |
| UXR1-02 | DS-001 §9 | `/results/date/*` was **11 px wider than a 320 px viewport**. The cause was a `shrink-0` section eyebrow, and the day tables had no scroll container. | The eyebrows wrap. Day tables and receipt tables scroll inside `overflow-x-auto`. |
| UXR1-03 | DS-001 §9 | The MLB lean card's line-vs-projection bar was passed `width={9999}`. Its centre tick sat at ~5,000 px, so **the bar rendered as an empty strip** at every width (`/mlb/board`). | `MlbProjectionGap` accepts a CSS length, and the card passes `"100%"`. The gap is computed exactly as before. |
| UXR1-04 | DS-001 §9 | At 320 and 390 px the nowrap "Anomaly · gap too large to trust" chip **overlapped** "TB vs CLE" and squeezed the identity column to one word per line. | The header row wraps. The identity column keeps a 12rem basis, and the chip may wrap. |
| UXR1-05 | DS-001 §9 | `/epl` likeliest-scorer rows at 320 px: the club and fixture text **overlapped "127 apps"**. | The row wraps, and the name side keeps a 12rem basis. |
| UXR1-06 | DS-001 §9 | Stat-tile labels were **clipped** ("SIMULATE…", "SPORTSBO…") on the `/nfl` hero at 320 px. "PROJECTION" ran into "EDGE" on lean cards. After the first fix, the labels broke mid-word at 320–390 px. | From 375 px the labels drop the extra tracking below `sm` and the tiles use 8 px side padding, so whole words fit (measured). Below 375 px both trios stack. |
| UXR1-07 | GTP-27; DS-001 §1.7 | `/ufc` printed "Schedule source: **espn_scoreboard**". The UFC board's explainer sentence carried "(**ufc-fight-model@e657fc40b64d**)". | One `sourceDisplayName()` map, used by `/sports`, `/ufc` and `/epl`. The model fingerprint moves to the paragraph's `title` and stays in the bout report's provenance. |
| UXR1-08 | GTP-27; DS-001 §1.7 | `/results/model-audit` tables printed keys such as `batter_hits_runs_rbis`, `pitcher_strikeouts`, `insufficient_data` and `regular_season`. | Market names come from `mlbMarketLabel`, other keys are shown as words, and the key stays in `title`. No number changes. |
| UXR1-09 | GTP-12; DS-001 §6 | The hub section-strip links (now on `/nba` too, via #1106) were **33 px** tall. | 44 px `inline-flex` targets. |
| UXR1-10 | DS-001 §2 | (Guard) Three status maps were merged in this release. | A test pins that they print one shared word set. |
| UXR1-11 | DS-001 §9 | The `/mlb/board` status banner at 320 px squeezed "1 game · 37 model leans tonight" to ~40 px: one word per line, "tonight" clipped, and the date split. | The summary column gets a 12rem basis, so the banner's own `flex-wrap` moves it under the eyebrow. |

---

## 5. Results reachability (GTP-21/32, the #1104 acceptance check)

The check ran in a real browser (Chromium, Playwright) against the static export, by UI paging only. The paging buttons were activated with the keyboard (focus plus Enter) and by click. Ground truth was read from the committed artifacts: `loadSettledCards(public/data)` for cards, and `mlb/results/model-rows/<day>.json` for picks.

| Width | Surface | Ground truth | Steps | Reached | Missing / extra |
|---|---|---|---|---|---|
| 390 | `/results` card explorer (all sports) | 137 slip IDs | 50 → 100 → 137 | **137** (compared as an ID set) | 0 / 0 |
| 390 | Sport filter + "Show all" | MLB 109 · EPL 15 · UFC 13 | — | 109 · 15 · 13 | 0 |
| 390 | `/results/model-audit`, day 2026-07-24 | 644 graded picks | 250 → 500 → 644 | **644** | — |
| 1440 | `/results` card explorer | 137 | 50 → 100 → 137 | **137** | 0 / 0 |
| 1440 | Sport filter + "Show all" | 109 · 15 · 13 | — | 109 · 15 · 13 | 0 |
| 1440 | `/results/model-audit`, 2026-07-24 | 644 | 250 → 500 → 644 | **644** | — |

- The live region announces "Showing the 50 most recent of 137" and then "Showing all 137".
- The paging buttons measure 117 × 44 px.
- After the final step, focus is on the status line (UXR1-01). Before the fix it was on `<body>`.
- Older settled days stay reachable through `/results/date/<date>`. That path is unchanged.

---

## 6. Test counts and build

The commands match `.github/workflows/quality-gate.yml` (job `quality`). They ran locally on Node 22 (CI uses 20.4.0), under the shared build lock. Next's static-generation workers are hard-capped at 4 in `next.config` (`experimental.cpus: 4`); there is no environment variable to lower that, so the repo cap was used.

| Step | Integrated, before fixes (`154e1c53e9`) | Code-final (`2b0ca650c8`) |
|---|---|---|
| `tsc --noEmit` | — | exit 0 |
| `npm run lint:scripts` | exit 0 | exit 0 |
| Unit phase (`run-suite --phase unit`, 1,172 files) | 9,422 tests: 9,418 pass, **1 fail**, 3 skipped, 133 s | 9,435 tests: 9,432 pass, **1 fail**, 2 skipped, 104 s |
| `npm run ask:check` | exit 0 | exit 0 |
| `npm run build` (→ `app/out`) | exit 0, 172 s (`next build` 161 s), 2,883 static pages | exit 0, 136 s (`next build` 127 s), 2,883 pages |
| Rendered guards (`run-suite --phase post-build`, 122 files) | 701 tests: 698 pass, **0 fail**, 3 skipped, 67 s | 701 tests: 698 pass, **0 fail**, 3 skipped, 47 s |
| `audit-accessibility.mjs` (structural) | 0 findings | 0 findings |
| Targeted unit run (163 files reading touched sources) | 1,215 / 1,215 pass, 31 s | the release-fix suite re-run with each fix |

**The one unit failure is pre-existing on `main` and not caused by this branch.**
- The test is `app/src/lib/sports/nfl/totals-play-efficiency.test.mjs`, "every ESPN schedule abbreviation reaches a rated franchise". It asserts at least 28 teams, but the 2026-10-16 schedule capture has 26 because of mid-week byes.
- This branch does not touch that test or its data.
- It is fixed separately in **#1114** (`claude/fix-nfl-bye-week-test`).

**`internal-alpha-day.test.mjs:106` IDEMPOTENT (CI red on #1103): it passes on this branch** (9/9 in the file). The script exits 0 with verdict DEGRADED: 6 PASS, 0 FAIL, 6 BLOCKED, 3 UNKNOWN.
- Why it failed on #1103: the script exits 1 only when a criterion FAILs.
- The "Board freshness" criterion reads `public-beta-observe`, which compares the newest committed MLB board with the wall-clock ET date (after 14:00 ET it requires today's board).
- #1103's CI ran on a merge into its stacked base `claude/ux-et-timestamps`, which is 149 commits behind `main` and predates that day's board commits. So freshness FAILed and the script exited 1.
- On current `main`, and on this branch, the boards are current and it passes.
- The test is wall-clock and data dependent, so it can recur on any stale base after 14:00 ET.

### 6a. Final run on the code-final head
Run on `2b0ca650c8`, the fourth local build of the day:

| Step | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `lint:scripts` | exit 0 |
| Unit phase | **9,435 tests: 9,432 pass, 1 fail (the pre-existing #1114 test above), 2 skipped**, 104 s. +13 tests vs before the fixes: the 12 `UXR1-*` tests, plus 1 run-to-run skip difference. |
| `ask:check` | exit 0 |
| `npm run build` | **exit 0, 136 s** (`next build` 127 s, 2,883/2,883 static pages, 2,864 `index.html`, `app/out` 1.8 GB before the deploy-side upload) |
| Rendered guards (post-build) | **701 tests: 698 pass, 0 fail, 3 skipped**, 47 s. Includes #1092's "no raw ISO-UTC in first-view text" guard. |
| Structural a11y audit | 0 findings |
| Browser sweep (132 loads) | 0 overflow · 0 overlap · 0 broken/distorted of 4,460 images · 0 console errors · 0 failed requests · 0 unnamed controls · 32/32 tablists roving |
| Results reachability | 137/137 cards and 644/644 picks at 390 and 1440 (§5) |

---

## 7. Browser verification (Playwright + Chromium, static export)

**Setup.**
- Export: `node app/scripts/serve-export.mjs 4191 <abs>/app/out`.
- Browser: Playwright 1.59.1 with the already-installed Chromium 1217. No browser was downloaded.
- Coverage: 33 routes × 4 widths (320, 390, 768, 1440) = **132 page loads per sweep**. Sweeps ran before the fixes, after builds 2 and 3, and on the code-final build 4 (≈ 4.5 min each).
- Images load from their real public CDNs (ESPN, mlbstatic). No paid API was called.

**Per page:**
- page-level horizontal overflow, and which element causes it;
- horizontally clipped text;
- overlapping text, with each text box clipped to its own and its ancestors' overflow boxes;
- touch targets under 44 px (inline links in running text are exempt, as in DS-001 §6);
- broken images (`naturalWidth 0`), distorted images (more than 6% aspect error under `object-fit: fill`), and logo and portrait counts;
- accessible names on links, buttons, tabs, inputs and summaries, and images without `alt`;
- every visible `role=tablist`: one tab stop, ArrowRight moves focus, Home and End work, `aria-controls` present;
- focus visibility over the first 14 Tab stops;
- visible raw codes (SCREAMING_SNAKE, snake_case, hex hashes, ISO-UTC, file names, `undefined`/`NaN`);
- console errors and failed requests.

**Totals across all 132 loads on the code-final build:**
- 0 page-level overflows (1 before, `/results/date` at 320);
- 0 overlaps (3 real ones before);
- 0 broken images out of 4,460, and 0 distorted;
- 0 console errors and 0 failed requests;
- 0 controls without an accessible name, and 0 images without `alt`;
- every page has exactly one `h1`;
- 32 / 32 tablists pass the roving-tab check (one tab stop, arrow keys, Home/End).
  - Gap: the `/results` "Window" tablist has no `aria-controls`.

### Per-route verdicts

Abbreviations:
- **D** = desktop (768 and 1440);
- **M** = mobile (320 and 390);
- **A11y** = keyboard, names and focus;
- "small targets" = body controls under 44 px at 390 px, as n / all body controls, not counting site chrome (§9).

| Route | Sport | Release components exercised | Issues found | Corrected | Remaining | D | M | A11y |
|---|---|---|---|---|---|---|---|---|
| `/` | all | game-summary chips (#1102), upcoming status words (#1103) | — | — | 20/62 small targets (hub cards, Save, "Open … hub →") | Pass | Pass | Pass |
| `/today` | all | Upcoming/Started chips at 10.5 px (#1107) | — | — | 2/96 small CTAs (34 px) | Pass | Pass | Pass |
| `/live` | MLB, NFL | `/live` group words (#1102) | — | — | — | Pass | Pass | Pass (sport tabs roving) |
| `/sports` | all | `EVENT_STATUS_LABEL`, source names (#1103, UXR1-07) | — | — | — | Pass | Pass | Pass |
| `/nfl` | NFL | ET stamps (#1092), lane labels and no run hash (#1103), 44 px summaries (#1107), section strip (UXR1-09) | stat-tile labels clipped at 320 | UXR1-06, UXR1-09 | 41/143 small (team filter chips, hero CTAs 33–35 px) | Pass | Pass (after fix) | Pass (hub-boards tabs roving) |
| `/nfl/game/401872995` (SEA@DEN) | NFL | `EtTime` provenance (#1092), "Final score" panel (#1112), 44 px disclosures (#1107) | "input hash 7bc81be4…" and "state SETTLED" visible in "Where this came from" | — (labelled provenance block; GTP-23 asks for hash provenance) | 15/46 small (player tabs, model-status summary 38 px) | Pass | Pass | Pass (2 tablists roving) |
| `/nfl/week/2-06` | NFL | board stamp via `EtTime` (#1092) | — | — | — | Pass | Pass | Pass |
| `/nba` | NBA | new section strip (#1106), Upcoming/Final chips and NBA note (#1102), decorative crests (#1105) | strip links 33 px | UXR1-09 | strip highlights the last-visited section after scrolling back to the top (scrollspy, all hubs) | Pass | Pass | Pass |
| `/games/nba/ny-vs-sa-2026-06-13` | NBA | — | no crests; "No team projection posted for this fixture **yet**" on a June archive game | — | open (generic `/games` page, low) | Pass | Pass | Pass (tabs roving) |
| `/mlb` | MLB | plain copy and board eyebrow (#1103), tile destination labels and TBD (#1105) | — | — | 41/102 small (market filter chips 25 px, slip-tier buttons 28 px) | Pass | Pass | Pass (tabs roving) |
| `/mlb/board` | MLB | pending reasons (#1103), crests (#1105), lean card | empty gap bar; anomaly chip overlap; banner squeeze at 320; tile labels | UXR1-03, 04, 06, 11 | 20/54 small (market filter 27 px) | Pass | Pass (after fix) | Pass |
| `/games/mlb/tb-vs-cle-2026-10-16` | MLB | game report | — | — | 1 small ("← All games" 40 px) | Pass | Pass | Pass (report tabs roving) |
| `/ufc` | UFC | body-face copy and 44 px summary (#1103), decorative fighter avatars (#1105) | "espn_scoreboard"; model fingerprint in prose | UXR1-07 | 14/87 small ("Full analysis →" 32 px) | Pass | Pass | Pass |
| `/ufc/bout/401897388` | UFC | `EtTime` (#1092) | "model ufc-fight-model@e657…" and "scrape_ufc_stats (GPL-3.0)" in provenance | — (labelled provenance; the licence attribution must name the source) | — | Pass | Pass | Pass |
| `/epl` | EPL | plain copy (#1103), source name (UXR1-07) | scorer rows overlap at 320 | UXR1-05 | 57/158 small at 1440 ("What the statuses mean →" 15 px links) | Pass | Pass (after fix) | Pass |
| `/epl/match/arsenal-v-leeds-united-2026-10-10` | EPL | `lg` decorative crests (#1105), `EtTime` (#1092) | — | — | "← Premier League fixtures" 15 px | Pass | Pass | Pass |
| `/results` | all | paging, sport names, provenance disclosures (#1104) | focus lost after the last page | UXR1-01 | "Window" tablist has no `aria-controls`; window pills 36 px | Pass | Pass | Pass (after fix) |
| `/results/model-audit` | MLB | paging (#1104) | raw market/bucket keys; focus loss | UXR1-08, UXR1-01 | "INSUFFICIENT_SAMPLE" inside an artifact's "Next:" sentence; 126/141 small ("Open N picks" buttons in the day table) | Pass | Pass | Pass |
| `/results/parlay-lab` | all | (#1109 wording lands on the next producer run) | — | — | — | Pass | Pass | Pass |
| `/results/date/2026-10-15` | MLB/NBA | day tables | 11 px page overflow at 320 | UXR1-02 | "Full MLB audit →" 14 px link | Pass | Pass (after fix) | Pass |
| `/results/picks/mlb` | MLB | — | — | — | — | Pass | Pass | Pass |
| `/simulate` | all | Started / Final / Report ready (#1102) | — | — | 15/44 small (sport filter 40 px) | Pass | Pass | Pass |
| `/build` (Parlay Center / Lab) | all | — | — | — | 10/26 small (stake input 32 px, tier buttons 28 px) | Pass | Pass | Pass |
| `/bank-builder` | all | — | — | — | — | Pass | Pass | Pass |
| `/moonshot` | all | — | — | — | — | Pass | Pass | Pass |
| `/cards/ufc` | UFC | ladder "Prices read" via `EtTime` (#1092) | — | — | — | Pass | Pass | Pass |
| `/players/nfl/aaron-rodgers` | NFL | portrait | — | — | — | Pass | Pass | Pass |
| `/players/mlb/adley-rutschman` | MLB | portrait | — | — | — | Pass | Pass | Pass |
| `/teams/nfl/baltimore-ravens` | NFL | crest | — | — | 27/49 small (opponent links 23 px in the game log) | Pass | Pass | Pass |
| `/teams/epl/bournemouth` | EPL | crest | — | — | 26/40 small ("Game →" 34 px) | Pass | Pass | Pass |
| `/models` | all | — | — | — | 29/57 small ("What the statuses mean →" 15 px) | Pass | Pass | Pass |
| `/methodology` | all | — | snake_case formula variables (`p_novig_side` …) | — (methodology page: DS-001 §1.7 allows technical text here) | 3 small CTAs | Pass | Pass | Pass |
| `/ask` | all | — | — | — | — | Pass | Pass | Pass |

---

## 8. Findings by sport and feature (resolved / open / deferred)

| Sport / feature | Resolved in this release | Open (needs a decision or a follow-up) | Deferred (planned, P2) |
|---|---|---|---|
| Cross-sport status words | H1, H2, M4, L1 (#1102); M5 (#1107); L5 (#1112); UXR1-10 guard | — | Live Hub V2 regrouping (CC-10) |
| Timestamps | P246 / GTP-27 ISO stamps (#1092; 410+ → 0, post-build guard) | — | — |
| Plain copy and raw codes | H3, H4, H6, H7, L4 (#1103); UXR1-07; UXR1-08 | NFL game provenance shows "input hash" and "state SETTLED" unfolded. Folding "Where this came from" into a disclosure is suggested. Low. | Artifact prose such as "INSUFFICIENT_SAMPLE" in the model-audit "Next:" line needs a producer change |
| Team and player identity | M1, M2, M3, L3, GTP-31 (#1105) | NBA `/games/nba/*` archive page has no crests and says "yet" | Consolidate `components/player-avatar.tsx` and `components/ui/player-avatar.tsx` (CC-07/08) |
| Navigation | M7, M8 (#1106); UXR1-09 | **M6 destination naming: founder decision** (below). Hub strip scrollspy keeps the last section highlighted at the top of the page. | `SportHubShell` adoption |
| Results and tracking | H5, GTP-21/32 (#1104); UXR1-01; UXR1-02 | `/results` "Window" tablist has no `aria-controls` | `/results/forecasts/<sport>/<family>` shows the latest 60 rows and offers the full CSV (by design, not paged) |
| MLB board | UXR1-03, 04, 06, 11 | — | GTP-14 filters |
| EPL | UXR1-05 | — | GTP-20 fold |
| UFC | UXR1-07; M10 and L7 (#1103) | — | GTP-16 fighter CDN |
| Touch targets (GTP-12) | hub strip (UXR1-09); 44 px disclosures (#1107, #1103); paging buttons (#1104) | **Site chrome under 44 px on all 33 routes:** date rail "Today · Oct 16" / "Settled" 29 px; header search 34 px; desktop rail links; sport switcher 36 px. **Body controls:** MLB market chips 25 px, board filter 27 px, `/results` window pills 36 px, model-audit "Open N picks", team-page links 23 px, "What the statuses mean →" 15 px. | A single 44 px pass over the chrome needs a first-viewport-budget review |
| Lab eligibility churn | #1109 wording | Treat `evidence.priceAgeDays` as a stamp for build-trigger purposes (proposed in #1109, needs its own reader trace) | — |

### Founder decision: M6 destination names (from #1106, unchanged here)
| Destination | Nav | Page / other surfaces |
|---|---|---|
| `/simulate` | "Simulations" / "Sim" | h1 and title "Simulate" |
| `/build` | "Parlays" | "Parlay Center · Suggested Parlays"; MLB strip "Parlay Center" |
| `/cards/{epl,ufc}` vs `/cards/nfl` | "Products" | "Paper cards" (the `/nfl` strip shows both "Products" and "Paper cards ↗") |
| `/results/picks/<sport>` | "Results" (MLB, UFC) | "Full record" (EPL); footer "Picks vs Outcomes" |

Once one name per destination is chosen, applying it is a small change. It is not made here because it touches earlier founder decisions ("Simulations kept", five primaries).

---

## 9. Remaining limitations of this verification
- The run used Chromium only, at 4 widths. There was no WebKit/Firefox or real-device / VoiceOver / 200%-zoom check; those are still listed as open gates in the roadmap.
- The overlap and clipping detectors are heuristic. Every hit was checked by screenshot, and the 3 real overlaps (anomaly chip, EPL scorers, MLB banner) are fixed. The `/mlb/board` slate section reports a 20 px internal scroll width from a non-visible box, with no visible effect.
- The touch-target counts treat every `a`, `button`, `summary`, `[role=tab]` and `input` outside running text as a control. Inline links in prose, list items and table cells are exempt (DS-001 §6).
- The `e2e/accessibility.spec.ts` and `route-assurance.spec.ts` Playwright suites from the CI job were **not** run locally (they need the CI browser matrix). The structural audit and this sweep cover the same routes in Chromium.
- Live-state surfaces were seen in their 2026-10-16 afternoon state: one MLB game scheduled, and SEA@DEN settled. In-progress rendering was not observed.
