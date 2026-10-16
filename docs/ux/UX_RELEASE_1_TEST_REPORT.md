# UX Release 1: consolidated test report

**Branch:** `claude/ux-release-1`, cut from `origin/main` @ `d6de0ceb47` (2026-10-16).
**Status:** locally validated at code head `8d91d3a137` (§1a). Draft PR only. **DO NOT MERGE without founder approval.** Nothing was deployed, no workflow was triggered, and no paid API was called.
**Prepared:** Fri 2026-10-16 (ET), for the Oct 20 public launch. **Updated** the same evening with `UXR1-12`…`UXR1-16` and a full re-validation.

This branch merges nine UX-audit PRs, each with `git merge --no-ff` so every original commit is kept. It then adds a set of small fixes for defects that the consolidated browser sweep found. All of it is display-only.

---

## 1. Exact-head approval package

| Item | Value |
|---|---|
| Code head tested | `8d91d3a137` (after `UXR1-16` and `UXR1-15 (cont.)`): typecheck, lint, unit suite, ask checks, build, rendered guards, python suite, structural a11y, the 132-load browser sweep, the fix checks and Results reachability (§6, §6b, §7) |
| Branch head | This document's commit on top of `8d91d3a137`. It changes `docs/ux/UX_RELEASE_1_TEST_REPORT.md` only; no code changes after the tested head. |
| Base | `origin/main` @ `d6de0ceb47` |
| Merged PR heads (re-verified before merging) | #1092 `729f8663af` · #1103 `81b9b66804` · #1102 `b22a14537f` · #1104 `7f77894a39` · #1105 `b5a25afb99` · #1106 `bb3832121e` · #1107 `55b1de8918` · #1109 `2e104fa6a1` · #1112 `65855730e8` |
| Files changed vs base | 9 PRs: 49 files, +587 / −109. Release fixes (`UXR1-01`…`UXR1-16`): 31 files, +513 / −117, of which 1 is the new test file. Whole release, without this report: 70 files, +1,096 / −222. |
| Areas touched | `app/src/app/**` pages, `app/src/components/**`, `app/src/lib/**` (display maps and helpers), new tests under `app/src/lib/**`, `docs/UX_DESIGN_STANDARDS.md` (#1102), and one producer wording line in `app/scripts/parlays/lab-eligibility.mjs` (#1109, see below) |
| **Data impact** | **None.** No file under `data/`, `app/public/data/` or `pipeline/` changes. No forecast, model output, grade, settlement, ledger or historical record is touched, and no committed artifact is rewritten. The local builds regenerate `data/ask-projection/**/*.json.gz`; those files were restored with `git checkout` after every build and are not in the diff. |
| Producer wording note (#1109) | `lab-eligibility.mjs` changes **only the wording** of one blocked-reason string. "the last price capture is 3.9 days old" becomes "the last price capture (Oct 11) is more than 3 days old". The next `nightly-settle` / `daily-products` run writes the new sentence into `lab-ledger.json`. Eligibility logic, thresholds and the evidence fields (`pricesCapturedAt`, `priceAgeDays`) are unchanged. |
| Vercel impact | One Production build when merged (estimate: ≈ $0.14–0.20). No preview builds. |
| Rollback | `git revert -m 1 <merge commit>` of the PR's merge into `main` reverts the whole release. Each PR's own merge, and each `UXR1-xx` commit, can also be reverted on its own. |
| Known merge interaction | The HTML-reduction release (`claude/html-series-measurement`, #1096–#1100) moves inline styles to shared classes in several of the same MLB files. A trial merge conflicts in `mlb-lean-row.tsx` (UXR1-04 chip, UXR1-06 tiles). UXR1-16 was kept to **added classes only** (`gtp-hit-44` and similar, plus one appended rule at the end of `globals.css`) so the combined resolution stays mechanical. The HTML branch was **not** merged here; the lead prepares the combined resolution. |
| CI state expected on #1115 | `python`: green (UXR1-12; 92/92 locally). `quality`: one failure, the pre-existing `totals-play-efficiency` test on `main` (26 < 28 teams), fixed separately in **#1114**. It is not fixed here and has no other failure locally. |

### 1a. Final verdict (code head `8d91d3a137`)

| Gate | Result | Verdict |
|---|---|---|
| Typecheck (`tsc --noEmit`) · `lint:scripts` | exit 0 · exit 0 | Pass |
| Unit phase (`run-suite --phase unit`) | 9,439 tests: 9,436 pass, **1 fail**, 2 skipped | Pass, except the **pre-existing** `totals-play-efficiency` failure on `main` (fixed in #1114, not here) |
| `ask:check` · `ask:eval` (fake provider) | exit 0 · all cases pass | Pass |
| `npm run build` | exit 0, 268 s (`next build` 259 s), 2,883/2,883 static pages | Pass |
| Rendered guards (`run-suite --phase post-build`) | 701 tests: 698 pass, 0 fail, 3 skipped | Pass |
| Python (`scripts/ci/run-python-tests.sh`) | 92 pass, 0 fail | Pass |
| Structural a11y (`audit-accessibility.mjs`) | 0 findings | Pass |
| Browser sweep, 33 routes × 320/390/768/1440 (132 loads) | 0 overflow · 0 overlap · 0 broken or distorted of 4,429 images · 0 console errors and 0 failed requests (3 loads hit by a brief network drop were re-run clean, §7) · 0 unnamed controls · 0 images without `alt` · one `h1` on every page · **32/32 tablists pass, now including `aria-controls` resolving to a `tabpanel` named by the selected tab** | Pass |
| Fix checks (UXR1-13…16) | all pass (§6b) | Pass |
| Results reachability | 137/137 cards and 644/644 picks at 390 and 1440 | Pass |
| MLB `no_events` banner | renders the UXR1-12 sentence on the one committed board where it applies (§6b) | Pass |
| Site chrome touch targets (header, rail, date rail) | under 44 px on every route | **Founder decision** (§8) |

**Ready for integration** once the founder approves, the #1114 fix lands (or `quality` is read with that one known failure), and the lead resolves the HTML-reduction overlap (§1).

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

Each fix is a separate commit with a regression test in `app/src/lib/uiux/ux-release-1-fixes.test.mjs` (17 tests; UXR1-12's lives in `plain-copy.test.mjs`). All are display-only.

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
| UXR1-12 | GTP-27; `pipeline/public_copy_test.py` | #1103's MLB `no_events` banner said "The odds provider listed no events", and the public-copy guard forbids "odds provider" (the python CI failure on #1103 and #1115). | "Sportsbooks had not listed this slate's games when prop prices were captured." The plain-copy test pins the meaning, not the forbidden term. |
| UXR1-13 | GTP-13; DS-001 §9 | The `/results` "Window" tablist used the shared roving-tabs hook but dropped `aria-controls`: no tab named a panel. | The windowed records (public forecasts, products, research) sit in **one** `tabpanel` named by the selected tab, the single-panel shape the MLB game report and `/live` already use. Every tab now carries `aria-controls`. |
| UXR1-14 | DS-001 §1.4, §5 | The archived NBA game page (`/games/nba/ny-vs-sa-2026-06-13`) said "No team projection posted for this fixture **yet**" for a June game, and showed **no crests**. | The page's empty states follow the game's ET date (past: "No team projection was posted…", "No model player picks for this game"; the same rule as `mlbIsPreviousSlate`). NBA sides resolve through the ESPN NBA team registry (`espnNbaCrestUrl`, the `/nba` hub's source); an abbreviation outside the 30 registry teams gets no URL, and `TeamMark` keeps its monogram fallback. Crests now read in the title's "away @ home" order (they were drawn home-first under an "NY @ SA" title). |
| UXR1-15 | DS-001 §9 | The hub section strip only ever *set* the current section, so after scrolling back to the top the last-visited section stayed highlighted over the hero (all hubs). | `currentHubSection()` (pure, tested) recomputes from every section's position whenever one crosses the band: nothing is current above the first section, and the previous section stays current in a gap. |
| UXR1-16 | GTP-12; DS-001 §6 | In-body controls under 44 px: `/mlb` market chips (25 px) and that console's search and selects (29–33 px); `/mlb/board` filter chips and Reset (27 px); `/results` and model-audit window pills (36 px); model-audit "Open N picks" (18 px); "Show all N wins" (30 px); team-page opponent and player links (21–23 px) and the season log's "Game →" (32 px); "What the statuses mean →" (15 px). | Additive classes on the shared `.gtp-hit-44` rule, plus `.gtp-hit-44-links` for flex-row link lists. The model-audit cell drops its 6 px padding, so a day row is 44 px, not 56. Site chrome (header, rail, date rail) is untouched (§8, founder decision). |

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
- **Re-run on the final code head `8d91d3a137`** (after UXR1-13's panel wrapper and UXR1-16's 44 px pills): identical — 137/137 (0 missing, 0 extra, newest first), MLB 109 · EPL 15 · UFC 13, and 644/644, at both 390 and 1440; focus ends on the status line.

---

## 6. Test counts and build

The commands match `.github/workflows/quality-gate.yml` (job `quality`). They ran locally on Node 22 (CI uses 20.4.0), under the shared build lock. Next's static-generation workers are hard-capped at 4 in `next.config` (`experimental.cpus: 4`); there is no environment variable to lower that, so the repo cap was used.

| Step | Integrated, before fixes (`154e1c53e9`) | First code-final (`2b0ca650c8`) | **Final code head (`8d91d3a137`)** |
|---|---|---|---|
| `tsc --noEmit` | — | exit 0 | exit 0 |
| `npm run lint:scripts` | exit 0 | exit 0 | exit 0 |
| Unit phase (`run-suite --phase unit`) | 9,422 tests: 9,418 pass, **1 fail**, 3 skipped, 133 s | 9,435 tests: 9,432 pass, **1 fail**, 2 skipped, 104 s | **9,439 tests: 9,436 pass, 1 fail, 2 skipped**, 110 s |
| `npm run ask:check` | exit 0 | exit 0 | exit 0 |
| `npm run build` (→ `app/out`) | exit 0, 172 s (`next build` 161 s), 2,883 static pages | exit 0, 136 s (`next build` 127 s), 2,883 pages | **exit 0, 268 s** (`next build` 259 s, a loaded machine), 2,883/2,883 pages, 2,864 `index.html` |
| Rendered guards (`run-suite --phase post-build`, 122 files) | 701 tests: 698 pass, **0 fail**, 3 skipped, 67 s | 701 tests: 698 pass, **0 fail**, 3 skipped, 47 s | **701 tests: 698 pass, 0 fail, 3 skipped** |
| `ask:eval` (`ASK_MODEL_PROVIDER=fake`, never billed) | — | — | all cases pass |
| `audit-accessibility.mjs` (structural) | 0 findings | 0 findings | 0 findings |
| `bash scripts/ci/run-python-tests.sh` | — | 92 / 92 after UXR1-12 | **92 pass, 0 fail** |
| Targeted unit runs | 1,215 / 1,215 pass (163 files reading touched sources) | the release-fix suite re-run with each fix | every test file that reads a file touched by UXR1-13…16: 506 / 506 (UXR1-14 set) and 163 / 163 (UXR1-16 set) |

The unit count rises by 4 from `2b0ca650c8`: the four new `UXR1-13`…`UXR1-16` tests. After every build the regenerated `data/ask-projection/**/*.json.gz` files were restored, and the tree was clean apart from this report.

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

### 6a. First code-final run (superseded by the final head above)
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

### 6b. Checks for UXR1-12…16 on the final build (`8d91d3a137`)

| Fix | Check (Chromium, static export) | Result |
|---|---|---|
| UXR1-12 | `/mlb/board/<date>` for every committed board with `pendingReason: no_events` (2026-05-26, 07-15, 09-28, 10-02, 10-09) | **2026-05-26** (15 games, no props) renders "NO PROP LINES FOR THIS SLATE · Sportsbooks had not listed this slate's games when prop prices were captured." The other four have 0 games, so they correctly render the "Off-day — no MLB games scheduled" shell and no banner. No page shows "odds provider" or the raw `no_events`. |
| UXR1-13 | `/results` Window tablist at 390 and 1440 | 5 tabs, all with `aria-controls`; one tab stop; the selected tab's id resolves to a `role=tabpanel` whose `aria-labelledby` is that tab; ArrowRight / End / Home move selection and focus (7 days → 30 days → All time → Today), and the pairing follows; tabs 44 px |
| UXR1-14 | `/games/nba/ny-vs-sa-2026-06-13` at 320 / 390 / 1440 | no "yet" anywhere in `main`; "No team projection was posted for this fixture."; two hero crests (`nba/500/ny.png`, `nba/500/sa.png`) loaded, 32 × 32, alt "NY" / "SA", in "NY @ SA" order; 0 overflow; 0 console errors. Control: today's MLB game page keeps the future wording. |
| UXR1-15 | `/nba`, `/mlb`, `/nfl`, `/epl`, `/ufc` at 390 and 1440: scroll to the last visible section, then back to the top | the strip marks the last section (Results / How it works / Results / Simulations / Fight card) and **clears at the top** on every hub. `/mlb` at 1440 marks "Games" at the top because that section already sits in the reading band there. Strip targets inside a closed `<details>` (`/nfl` Coverage, `/epl` Schedule and Record) open and scroll on click. |
| UXR1-16 | each fixed control at 320 and 390 | all **44 px** tall: `/mlb` chips (15), search and selects (10); `/mlb/board` filter chips (18); Results pills (5) and "Show all N wins" (3); model-audit pills (3) and "Open N picks" (123); team-page opponent and player links (21); "What the statuses mean →" (`/epl` 1, `/models` 4). **0 px page overflow at 320** on every one of those pages. Screenshots at 320 checked: the board filter console is taller, with no clipping or wrap problems. |

---

## 7. Browser verification (Playwright + Chromium, static export)

**Setup.**
- Export: `node app/scripts/serve-export.mjs 4191 <abs>/app/out`.
- Browser: Playwright 1.59.1 with the already-installed Chromium 1217. No browser was downloaded.
- Coverage: 33 routes × 4 widths (320, 390, 768, 1440) = **132 page loads per sweep**. Sweeps ran before the fixes, after builds 2 and 3, on the first code-final build 4, after build 5 (UXR1-13…16, preliminary) and on the **final build 6 (`8d91d3a137`)**.
- Images load from their real public CDNs (ESPN, mlbstatic). No paid API was called.

**Per page:**
- page-level horizontal overflow, and which element causes it;
- horizontally clipped text;
- overlapping text, with each text box clipped to its own and its ancestors' overflow boxes;
- touch targets under 44 px (inline links in running text are exempt, as in DS-001 §6);
- broken images (`naturalWidth 0`), distorted images (more than 6% aspect error under `object-fit: fill`), and logo and portrait counts;
- accessible names on links, buttons, tabs, inputs and summaries, and images without `alt`;
- every visible `role=tablist`: one tab stop, ArrowRight moves focus, Home and End work, every tab has `aria-controls`, and (new for build 6) the selected tab's `aria-controls` resolves to a `role=tabpanel` whose `aria-labelledby` is that tab;
- focus visibility over the first 14 Tab stops;
- visible raw codes (SCREAMING_SNAKE, snake_case, hex hashes, ISO-UTC, file names, `undefined`/`NaN`);
- console errors and failed requests.

**Totals across all 132 loads on the final build (`8d91d3a137`):**
- 0 page-level overflows (1 before the fixes, `/results/date` at 320);
- 0 overlaps (3 real ones before);
- 0 broken images out of 4,429, and 0 distorted;
- 0 console errors and 0 failed requests. The Mac's connection dropped briefly during the sweep: 3 loads (`/` and `/today` at 1440, `/bank-builder` at 320) logged `ERR_INTERNET_DISCONNECTED` for a CDN image. Those 3 routes were re-run at 320 and 1440 with the network up: 0 console errors, 0 failed requests, 0 broken images, 0 overflow, 0 overlaps;
- 0 controls without an accessible name, and 0 images without `alt`;
- every page has exactly one `h1`;
- **32 / 32 tablists pass**: one tab stop, arrow keys, Home/End, `aria-controls` on every tab, and the pairing resolves. The `/results` "Window" gap is closed (UXR1-13).
- Two heuristic hits, both checked by hand and not defects: the `/mlb/board` slate section's 20 px internal scroll width (§9), and "no visible focus" on the model-audit date input at 320/390, which is a timing artefact of the sweep (a screenshot after Tab shows the green focus ring).

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
| `/nba` | NBA | new section strip (#1106), Upcoming/Final chips and NBA note (#1102), decorative crests (#1105) | strip links 33 px; strip kept the last-visited section highlighted at the top (all hubs) | UXR1-09, UXR1-15 | — | Pass | Pass | Pass |
| `/games/nba/ny-vs-sa-2026-06-13` | NBA | game report | no crests; "No team projection posted for this fixture **yet**" on a June archive game | UXR1-14 | "← All games" 40 px | Pass | Pass | Pass (tabs roving) |
| `/mlb` | MLB | plain copy and board eyebrow (#1103), tile destination labels and TBD (#1105) | — | — | 19/103 small (was 41): "+ Slip" 22 px, slip-tier buttons 28 px, stake input 32 px. Market chips and filters fixed (UXR1-16) | Pass | Pass | Pass (tabs roving) |
| `/mlb/board` | MLB | pending reasons (#1103), crests (#1105), lean card | empty gap bar; anomaly chip overlap; banner squeeze at 320; tile labels; filter chips 27 px; `no_events` wording | UXR1-03, 04, 06, 11, 12, 16 | 2/55 small: "Open MLB model audit" 41 px, "← back to MLB overview" 15 px | Pass | Pass (after fix) | Pass |
| `/games/mlb/tb-vs-cle-2026-10-16` | MLB | game report | — | — | 1 small ("← All games" 40 px) | Pass | Pass | Pass (report tabs roving) |
| `/ufc` | UFC | body-face copy and 44 px summary (#1103), decorative fighter avatars (#1105) | "espn_scoreboard"; model fingerprint in prose; "What the statuses mean →" | UXR1-07, UXR1-16 | 13/88 small ("Full analysis →" 32 px) | Pass | Pass | Pass |
| `/ufc/bout/401897388` | UFC | `EtTime` (#1092) | "model ufc-fight-model@e657…" and "scrape_ufc_stats (GPL-3.0)" in provenance | — (labelled provenance; the licence attribution must name the source) | — | Pass | Pass | Pass |
| `/epl` | EPL | plain copy (#1103), source name (UXR1-07) | scorer rows overlap at 320; "What the statuses mean →" 15 px | UXR1-05, UXR1-16 | 0/132 small at 390 | Pass | Pass (after fix) | Pass |
| `/epl/match/arsenal-v-leeds-united-2026-10-10` | EPL | `lg` decorative crests (#1105), `EtTime` (#1092) | — | — | "← Premier League fixtures" 15 px | Pass | Pass | Pass |
| `/results` | all | paging, sport names, provenance disclosures (#1104) | focus lost after the last page; "Window" tablist without `aria-controls`; window pills 36 px; "Show all N wins" 30 px | UXR1-01, UXR1-13, UXR1-16 | — (0/297 small) | Pass | Pass | Pass (after fix) |
| `/results/model-audit` | MLB | paging (#1104) | raw market/bucket keys; focus loss; "Open N picks" 18 px; pills 36 px | UXR1-08, UXR1-01, UXR1-16 | "INSUFFICIENT_SAMPLE" inside an artifact's "Next:" sentence (producer change, §8a); 0/142 small | Pass | Pass | Pass |
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
| `/teams/nfl/baltimore-ravens` | NFL | crest | opponent and player links 21–23 px; season-log "Game →" 32 px | UXR1-16 | — (0/50 small) | Pass | Pass | Pass |
| `/teams/epl/bournemouth` | EPL | crest | "Game →" 34 px; player links 21 px | UXR1-16 | — (0/41 small) | Pass | Pass | Pass |
| `/models` | all | — | "What the statuses mean →" 15 px | UXR1-16 | 25/58 small (model list links 20 px) | Pass | Pass | Pass |
| `/methodology` | all | — | snake_case formula variables (`p_novig_side` …) | — (methodology page: DS-001 §1.7 allows technical text here) | 3 small CTAs | Pass | Pass | Pass |
| `/ask` | all | — | — | — | — | Pass | Pass | Pass |

---

## 8. Findings by sport and feature (resolved / open / deferred)

| Sport / feature | Resolved in this release | Open (needs a decision or a follow-up) | Deferred (planned, P2) |
|---|---|---|---|
| Cross-sport status words | H1, H2, M4, L1 (#1102); M5 (#1107); L5 (#1112); UXR1-10 guard | — | Live Hub V2 regrouping (CC-10) |
| Timestamps | P246 / GTP-27 ISO stamps (#1092; 410+ → 0, post-build guard) | — | — |
| Plain copy and raw codes | H3, H4, H6, H7, L4 (#1103); UXR1-07; UXR1-08 | NFL game provenance shows "input hash" and "state SETTLED" unfolded. Folding "Where this came from" into a disclosure is suggested. Low. | Artifact prose such as "INSUFFICIENT_SAMPLE" in the model-audit "Next:" line needs a producer change |
| Team and player identity | M1, M2, M3, L3, GTP-31 (#1105); NBA archive crests and past tense (UXR1-14) | — | Consolidate `components/player-avatar.tsx` and `components/ui/player-avatar.tsx` (CC-07/08) |
| Navigation | M7, M8 (#1106); UXR1-09; hub strip at the page top (UXR1-15) | **M6 destination naming: founder decision** (below) | `SportHubShell` adoption |
| Results and tracking | H5, GTP-21/32 (#1104); UXR1-01; UXR1-02; Window tab↔panel pairing (UXR1-13) | — | `/results/forecasts/<sport>/<family>` shows the latest 60 rows and offers the full CSV (by design, not paged) |
| MLB board | UXR1-03, 04, 06, 11 | — | GTP-14 filters |
| EPL | UXR1-05 | — | GTP-20 fold |
| UFC | UXR1-07; M10 and L7 (#1103) | — | GTP-16 fighter CDN |
| Touch targets (GTP-12) | hub strip (UXR1-09); 44 px disclosures (#1107, #1103); paging buttons (#1104); MLB chips and filters, Results pills, "Open N picks", team-page links, "What the statuses mean →" (UXR1-16) | **Site chrome under 44 px on all 33 routes (founder decision):** date rail "Today · Oct 16" / "Settled" 29 px; header search 34 px; desktop rail links; sport switcher 36 px. | Remaining body controls, §8a |
| Lab eligibility churn | #1109 wording | Treat `evidence.priceAgeDays` as a stamp for build-trigger purposes (proposed in #1109, needs its own reader trace) | — |

### 8a. Remaining open items after UXR1-16

**Needs a founder decision (not changed here):**

| Item | Detail |
|---|---|
| M6 destination names | One name per destination for `/simulate`, `/build`, `/cards/*` and `/results/picks/*` (table below). It touches the earlier "Simulations kept" and five-primaries decisions. |
| Site chrome under 44 px | On all 33 routes: date rail "Today · Oct 16" / "Games under way →" / "Settled" 29 px, header search 34 px, desktop rail links, sport switcher 36 px. A 44 px chrome pass changes the first-viewport budget on every page. |
| NFL game "Where this came from" | Shows "input hash 7bc81be4…" and "state SETTLED" unfolded. It is a labelled provenance block (GTP-23 asks for hash provenance); folding it into a disclosure is a product call. Left as is, by instruction. |

**Engineering-deferred (known, low; none blocks this release):**

| Item | Where | Why deferred |
|---|---|---|
| `INSUFFICIENT_SAMPLE` in an artifact's "Next:" sentence | `/results/model-audit` | The text comes from a producer artifact; fixing it is a producer change, which this display-only release does not make. |
| Remaining in-body controls under 44 px | `/mlb` "+ Slip" (22 px), slip-tier buttons (28 px) and stake input (32 px), also on `/build`; `/nfl` and NFL game "Model status" summary (38 px), NFL hero CTAs (33–35 px) and team filter chips (36 px); NFL game player tabs (36 px); `/models` model list links (20 px); `/simulate` sport filter (40 px); back links "← All games" / "← Fight card" (40 px), "← Premier League fixtures" and "← back to MLB overview" (15 px); "Full MLB audit →" (14 px) and "All settled dates" (19 px) on `/results/date`; "Full analysis →" (32 px) on `/ufc`; Home "Settled through Oct 15 →" (20 px), "Save" and "Open report →" (36 px); methodology CTAs (33–35 px) | Outside the five controls this pass was scoped to. Most are row-level controls whose 44 px version changes the row design (slip buttons, tier buttons), so they belong in a GTP-12 follow-up that reviews the visual density. |
| Forecast-record pages show the latest 60 rows | `/results/forecasts/<sport>/<family>` | By design: the page offers the full CSV and is not paged. |
| Duplicate avatar components | `components/player-avatar.tsx` and `components/ui/player-avatar.tsx` | Design-system consolidation (CC-07/08, P2). |
| `evidence.priceAgeDays` as a build-trigger stamp | lab eligibility (#1109) | Needs its own reader trace. |
| Commit the 2026-10-15 audit table | `docs/ux/` | So the H/M/L IDs resolve (§2). |

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
- Live-state surfaces were seen in their 2026-10-16 afternoon state (one MLB game scheduled, SEA@DEN settled) and, for the final sweep, that evening (the date rail read "Games under way"). In-progress game rendering itself was not inspected.
- UXR1-16 raises real heights to 44 px rather than adding invisible hit areas: the chips sit in wrapping rows 4–6 px apart, where an invisible 44 px area would overlap the next row's targets. The `/mlb/board` filter console is therefore taller (screenshot-checked at 320 and 390, no clipping); a denser treatment is a design follow-up, not a defect.
- The final sweep ran on a loaded machine with a brief network drop (§7); the affected loads were re-run.
