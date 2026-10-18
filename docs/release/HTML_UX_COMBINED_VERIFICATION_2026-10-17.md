# HTML Release 1 + UX Release 1: combined-branch verification

**Branch:** `claude/ux-release-1-on-html`, head **`bb4f4a02be`** (`bb4f4a02bef2f3c3de89ce6d2cbe7158573c97bb`), the reconciliation merge. This document's commit sits on top of it and changes only this file.
**Verified:** Sat 2026-10-17, 00:05Z–01:00Z, on the local Mac. Everything ran locally. Nothing was merged, deployed or dispatched, no paid API was called, and no data file was changed. The build-regenerated `data/ask-projection/**/*.json.gz` were restored, and the worktree was clean afterwards.
**Status: DO NOT MERGE without founder approval.**

## 1. What was verified

| Item | SHA | Notes |
|---|---|---|
| HTML Release 1 (draft PR #1117) | `4b4610366e` | `claude/html-series-measurement`. Shared classes replace repeated inline styles (−27.4% HTML vs main `d6de0ceb47`). |
| UX Release 1 (draft PR #1115) | head `8efe2da1eb`, code head `8d91d3a137` | `claude/ux-release-1`. Nine UX-audit PRs plus `UXR1-01…16`. `8efe2da1eb` adds only the test report. |
| Reconciliation | **`bb4f4a02be`** | Parents `4b4610366e` (#1117) and `8efe2da1eb` (#1115). |
| Baseline export for equivalence | built from `8d91d3a137` | `gametimepicks-wt/ux-release-1/app/out`. `data/build-info.json` reads `commit.sha = 8d91d3a137…`, `builtAt 2026-10-16T23:06:56Z`. |
| Combined export | built from `bb4f4a02be` | `builtAt 2026-10-17T00:07:21Z`. |
| `origin/main` at verification | `95ff638735` | Includes #1114 (`2cb1ba3920`), which `bb4f4a02be` does not (§2). |

**What the reconciliation changes relative to #1115's code** (15 files, +587/−283):

- The #1117 class conversions, in `command-rail`, `footer`, the MLB board, filter, game-section and lean-row components, the player research view, research primitives and `settled-game-detail`.
- `board-lean-view.ts` and its test, both from #1117.
- `globals.css`, which keeps both appended blocks.
- The two source-shape tests, rewritten to the class form.

**Data:**

- No `data/` or `app/public/data/` file differs between `bb4f4a02be` and `8d91d3a137`.
- A simulated merge (`main` + #1117 + this branch) has data **identical to `origin/main`**.

## 2. Quality gates on `bb4f4a02be`

These are the same commands as `.github/workflows/quality-gate.yml`. They ran under the heavy-work lock from 00:05Z to 00:11Z.

| Gate | Result | Verdict |
|---|---|---|
| Unit phase (`run-suite --phase unit`) | 9,443 tests: 9,439 pass, **1 fail**, 3 skipped, 128 s | **Explained.** The failure is the bye-week test that #1114 fixes; see the root cause below. |
| Typecheck (`npm run typecheck`) | exit 0 | Pass |
| `lint:scripts` | exit 0 | Pass |
| `ask:check` | up to date (29 committed files) | Pass |
| `npm run build` | exit 0, 142 s; 2,883/2,883 static pages | Pass |
| Rendered guards (`run-suite --phase post-build`) | 701 tests: 698 pass, **0 fail**, 3 skipped (the same 3 as on #1115) | Pass |
| `ask:eval` (fake provider) | all cases pass | Pass |
| Structural a11y (`audit-accessibility.mjs`) | 0 findings, 0 serious | Pass |
| Python (`scripts/ci/run-python-tests.sh`) | 92 pass, 0 fail | Pass |
| Browser a11y (`e2e/accessibility.spec.ts`, `route-assurance.spec.ts`) | not run locally; CI-only (three-engine matrix) | n/a |

**Root cause of the one unit failure** (`totals-play-efficiency.test.mjs:98`, "every ESPN schedule abbreviation reaches a rated franchise", error "the schedule carries the league (26 teams)"):

- This is the pre-existing bye-week failure that **#1114** fixes. #1114 changes only that test file.
- #1114 merged to `main` at 23:44Z, *after* both #1117 (`4b4610366e`) and #1115 (`8efe2da1eb`) were cut. This branch therefore still carries the old test: its copy is byte-identical to `d6de0ceb47`'s.
- **Check:** `main`'s #1114 version of the test, run against this branch's code and data, passes 7/7. The temporary file was deleted afterwards.
- `bb4f4a02be` merges into `origin/main` with **no conflicts**. A PR's `quality` job runs on the merge ref, so it will carry #1114 and this test will pass.
- It was investigated, not suppressed. Nothing on this branch was changed to hide it.

## 3. Sizes: combined export vs #1115 export

| | #1115 (`8d91d3a137`) | Combined (`bb4f4a02be`) | Change |
|---|---:|---:|---:|
| HTML pages | 2,865 | 2,865 | 0 |
| **HTML bytes** | **1,174,484,062** | **862,306,093** | **−312.2 MB (−26.58%)** |
| RSC `.txt` bytes | 390,166,654 | 293,676,638 | −24.73% |
| `.css` bytes | 156,573 | 162,206 | +5.6 KB (+3.6%, the class rules) |
| `.js` bytes | 2,372,707 | 2,368,394 | −0.18% |
| `.json` bytes | 56,859,494 | 56,859,398 | 0.00% |
| Files | 7,656 | 7,656 | same set (0 only-in-one) |
| **Total `out/` bytes** | **1,630,669,239** | **1,222,002,478** | **−408.7 MB (−25.06%)** |

**Every page shrank:** all 2,865 HTML pages are smaller; none grew or stayed the same.

**The reduction carries over:**

- #1117's own figure against `main` was −27.4% HTML and −25.6% total.
- Here it is −26.6% HTML and −25.1% total, against a larger baseline: #1115 adds UX markup, and its data snapshot is later.

**Largest route groups:**

| Route group | HTML change |
|---|---:|
| `mlb/board` (148 pages) | −33.8% |
| `results/date` (133) | −28.8% |
| `players/mlb` (272) | −39.5% |
| `players/epl` (414) | −24.5% |
| `players/nfl` (761) | −16.0% |

The busiest board, `/mlb/board/2026-09-16/`, goes from 5,840,645 to 3,729,878 bytes (−36.1%).

## 4. Render equivalence vs #1115

### Method

- Both exports were served with `app/scripts/serve-export.mjs` (ports 4301 and 4302) and driven with Playwright (`app/node_modules/playwright`, Chromium).
- **Page setup:**
  - Viewport 900 px high, DPR 1, `reducedMotion: reduce`, timezone `America/New_York`.
  - Animations and transitions were frozen, after waiting for network idle and fonts.
  - Every `<details>` was opened.
- **Style snapshot:**
  - Every element from `<html>` down was captured, excluding `script/style/head/meta/link/noscript/title/template`.
  - Each element's **full `getComputedStyle`** was captured, **custom properties included** (≈251 per element). The list was **sorted** and then compared element by element.
- **Normalisations:**
  - `0%` → `0px` for gradient stops.
  - Whitespace was collapsed in custom-property values (`--rail-shadow`).
  - The new `--lr-*` variables were dropped.
- **Footer build stamp:** its row ("last build … · freshness …") differs by build time. It was masked (`visibility:hidden`) in screenshots and excluded from the style comparison: 3 elements per page.
- **Pixels:**
  - Full-page screenshots were taken in 12,000 px chunks, capped at 96,000 px per page, and diffed pixel by pixel.
  - Because of the cap, the busiest board's pixels cover 35% of the page at 320 and 61% at 1440. Its computed styles cover 100%.
- **Hover:** hover parity was checked on the first rail link, footer link, table link, player link and in-body button.

### Result: 10 of 12 pages identical at every width

0 differing elements, 0 differing pixels, identical hover, and 0 console errors on both builds:

| Page | Elements | 320 | 390 | 768 | 1440 | Pixels |
|---|---:|:---:|:---:|:---:|:---:|---|
| `/mlb/board/2026-09-16/` (busiest board) | 30,010 | 0 | 0 | 0 | 0 | 0 differ |
| `/mlb/board/2026-05-26/` (`no_events` banner) | 732 | 0 | 0 | 0 | 0 | 0 differ |
| `/results/date/2026-06-10/` (largest date page) | 25,333 | 0 | 0 | 0 | 0 | 0 differ |
| `/results/` | 8,146 | 0 | 0 | 0 | 0 | 0 differ |
| `/results/model-audit/` | 3,262 | 0 | 0 | 0 | 0 | 0 differ |
| `/players/mlb/adley-rutschman/` | 1,430 | 0 | 0 | 0 | 0 | 0 differ |
| `/teams/nfl/baltimore-ravens/` | 828 | 0 | 0 | 0 | 0 | 0 differ |
| `/games/nba/ny-vs-sa-2026-06-13/` (archived NBA) | 778 | 0 | 0 | 0 | 0 | 0 differ |
| `/epl/` | 2,305 | 0 | 0 | 0 | 0 | 0 differ |
| `/ufc/` | 3,341 | 0 | 0 | 0 | 0 | 0 differ |

**Totals for these 10 pages:**

- 40 page/width pairs.
- 76,165 elements per width, each with every computed property compared.
- 116 screenshot chunks, 783,829,108 pixels compared: **0 differ**.

### Lean-row chip (UXR1-04) and stat tile (UXR1-06)

These elements were matched to the same element in #1115's DOM and checked property by property on `/mlb/board/2026-09-16/`. That board includes anomaly-tier rows, which carry the long chip label.

| Element (count) | Width | white-space | max-width | padding | min-height | overflow-wrap | Equal to #1115 |
|---|---|---|---|---|---|---|---|
| `.lr-chip.lr-chip-lg` (571) | 320 / 390 / 768 / 1440 | normal | 100% | 4px 9px | auto | normal | **571/571 at each width** |
| `.lr-tile` (1,713) | 320 | normal | none | 8px 8px | **40px** | normal | **1,713/1,713** |
| `.lr-tile` (1,713) | 390 / 768 / 1440 | normal | none | 8px 8px | **56px** | normal | **1,713/1,713 at each width** |
| tile label `.lr-wrap-any` (1,713) | all four | normal | none | 0 | auto | **anywhere** | **1,713/1,713 at each width** |

The rest of each element's computed style also matched.

### `/` and `/mlb/`: differences explained by build time, not by the merge

The two exports were built an hour apart: 19:06 ET for #1115, 20:07 ET for the combined branch. TB @ CLE was scheduled for 8:00 PM ET, so it moved from "upcoming" to "started" between the two builds.

Both builds have identical data (0 data files differ), so this is the build clock, not code. On these two pages the element sequences differ, so index matching cannot be used. Instead:

- Elements were aligned by DOM depth and tag (difflib).
- Every matched pair's full computed style was compared.
- Each differing property was classified as geometry (sizes and positions that follow content) or not.

| Page | Width | Elements A / B | Matched | Only in #1115 / only in combined | Matched with geometry-only change | **Matched with a non-geometry change** |
|---|---|---|---:|---|---:|---:|
| `/` | 320 | 932 / 898 | 897 | 35 / 1 | 15 | **0** |
| `/` | 390 | 932 / 898 | 897 | 35 / 1 | 13 | **0** |
| `/` | 768 | 932 / 898 | 897 | 35 / 1 | 12 | **1**, an `mt-auto` margin (see below) |
| `/` | 1440 | 932 / 898 | 897 | 35 / 1 | 2 | **1**, the same `mt-auto` margin |
| `/mlb/` | 320 | 3,002 / 3,003 | 3,002 | 0 / 1 | 13 | **0** |
| `/mlb/` | 390 | 3,002 / 3,003 | 3,002 | 0 / 1 | 14 | **0** |
| `/mlb/` | 768 | 3,002 / 3,003 | 3,002 | 0 / 1 | 13 | **0** |
| `/mlb/` | 1440 | 3,002 / 3,003 | 3,002 | 0 / 1 | 13 | **0** |

**What the differences are:**

- **Home, only in #1115:** the TB @ CLE "upcoming" card (31 elements) and the two "simulation-ready / top model picks" counters.
- **Home, only in the combined export:** the note "Every game on today's slate has started…".
- **`/mlb/`, only in the combined export:** the heading "Started or final". "Upcoming" becomes "Started" and "Open report" becomes "View archived report".
- **The `mt-auto` margin:** a flex child (`mt-auto flex … pt-1`) whose used `margin-top` follows the height of its grid row. That row lost the TB @ CLE card. This is geometry by construction.
- **Pixels:** these two pages differ only from the changed card downward. Everything above it is pixel-identical.

### Equivalence verdict

0 differing elements across all four widths on every page whose content does not depend on the build clock. On the two that do, 0 style-rule differences, and every remaining difference traces to the TB @ CLE status change between builds.

## 5. Four-width functional sweep on the combined export

The sweep used the same harness and the same 33 routes as `docs/ux/UX_RELEASE_1_TEST_REPORT.md` §7: 33 routes × 320/390/768/1440, **132 loads**, Chromium against the combined export.

| Check | Combined `bb4f4a02be` | #1115 final (`8d91d3a137`) |
|---|---|---|
| Loads / non-200 / errors | 132 / 0 / 0 | 132 / 0 / 0 |
| Horizontal overflow | **0** | 0 |
| Overlapping text | **0** | 0 |
| Images: broken / distorted | **0 / 0** of 4,492 | 0 / 0 of 4,429 |
| Console errors / failed requests | **0 / 0** | 0 / 0 after a re-run (3 loads hit a network drop) |
| Controls without an accessible name · images without `alt` | **0 · 0** | 0 · 0 |
| Exactly one `h1` | **132/132** | 132/132 |
| Tablists (one tab stop, arrows, Home/End, `aria-controls` → `tabpanel` named by the tab) | **32/32** | 32/32 |
| Clipped-text heuristic hits | 4 (same pages and counts as #1115) | 4 |
| "No visible focus" heuristic | model-audit date input at 320/390 (same as #1115, a known timing artefact) | same |

**In-body touch targets under 44 px:** per route and width, compared with #1115's final sweep. They are identical except where the build clock changed the content:

- **Home:** 2 fewer small links and 2 fewer controls, because the TB @ CLE card is gone.
- **`/today`:** "OPEN SIMULATION →" now reads "REVIEW SIMULATION →".
- **The TB @ CLE game page:** one fewer control.

There are no new small targets.

**Image counts that differ, all explained:**

| Page | Width | #1115 → combined | Cause |
|---|---|---|---|
| `/nba` | all | 94 → 96 | Clock-driven content: the preseason list re-buckets between upcoming and started. |
| `/bank-builder` | 320 | 8 → 18 | #1115's run lost images to the network drop. |
| home | 1440 | 4 → 17 | Network drop, as above. |
| `/today` | 1440 | 7 → 45 | Network drop, as above. |

**Targeted fix checks** (`UXR1-13…16` and the `no_events` banner): 45 checks, **45/45 identical to #1115's final run**. They cover:

- `/results` "Window" tablist: 5 tabs, all with `aria-controls`, 1 tab stop, panel `role=tabpanel` labelled by the selected tab; ArrowRight/End/Home → 30 days / All time / Today; tabs 44 px, at 390 and 1440.
- NBA archive wording and crests.
- Hub strip clearing at the top.
- Every UXR1-16 control at 44 px with 0 overflow at 320.
- The `no_events` sentence.

**Results reachability (by ID set against the committed artifacts):**

| Width | `/results` cards | Sport filter + "Show all" | `/results/model-audit` 2026-07-24 |
|---|---|---|---|
| 390 | **137/137** (50 → 100 → 137), 0 missing, 0 extra; focus ends on the status line | MLB 109/109 · EPL 15/15 · UFC 13/13 | **644/644** (250 → 500 → 644) |
| 1440 | **137/137**, same paging and focus | same | **644/644** |

### Interactions, differential A (#1115) vs B (combined)

Each control was driven in turn and the resulting main text hash, row and link counts and URL were compared after every step, at 390 and 1440.

| Page | Controls exercised | Steps | Mismatches |
|---|---|---:|---:|
| `/mlb/board/2026-09-16/` | market (All / Pitcher Ks / Hits / H+R+RBI), gap (Any / ≥5 / 2.5–5 / Small / Sample too small), team (All + 30 teams), sort (Featured / Edge / Projection gap / Game time), density | 47 | **0** |
| `/mlb/board/2026-10-15/` | the same families (4 teams) | 21 | **0** |
| `/results/` | Window (Today / 7 / 30 days / Season / All time), Record type (3 values), Sport | 65 | **0** |
| `/results/model-audit/` | market select (5 values), Last 7 / 30 days, Reset, 50+ "Open N picks" | 65 | **0** |

0 console errors in every case, on both builds.

**Harness note:** one step, "Risk tier", errored identically on both builds. The sport change re-rendered the form, so the harness's control index pointed at a non-`select`. This is a harness artefact, not a product defect.

**Date jump** ("Jump to a date" on `/results/date/2026-10-15/`):

- Both builds offer 133 options.
- Jumping to 2026-05-15, 2026-07-24 and 2026-09-16 navigates to the right URL, h1 and select value, with identical row counts (147 / 719 / 711), at 390 and 1440.
- The console errors there, 30 on 05-15 and identical on both builds, are 404s for `/i/headshots/nba/players/full/*.png`. Those are CDN paths the local static server cannot serve. #1117's report noted the same.

## 6. Defects

**No defects were found in the combined branch, and no code changes were made.**

Two observations, neither a defect of this branch:

1. **Bye-week unit test:** the branch predates #1114 (§2). It resolves on merge with no change needed.
2. **Network stall during verification:** the Mac lost network for about 20 minutes (≈00:20–00:42Z). Two aligned-comparison loads (`/` and `/mlb/` at 390) fell back to text team badges, because the external logo CDN was unreachable. Both were re-run with the network up and are reported above. The sweep and the equivalence runs were unaffected (0 failed requests).

## 7. Approval package: recommended path

**Order:**

1. Merge #1117 first.
2. Then merge this branch as the UX release.

This branch already contains #1117, #1115 and the reconciliation, so the UX release lands as one reviewed unit on top of HTML Release 1.

**Use a merge commit, not squash or rebase, for both.** That keeps every original commit, and it lets GitHub recognise #1115's head as merged (step 3).

| Step | Action | Exact head | Expected |
|---|---|---|---|
| 1 | Mark **#1117** ready and merge with a merge commit | **`4b4610366e811793b4542742d881ffcfe0ef2d51`** | Merges cleanly into current `main`. One Production build. HTML −27.4% vs the pre-UX main. Data unchanged. |
| 2 | Open a PR from `claude/ux-release-1-on-html` to `main` and merge with a merge commit | **`bb4f4a02bef2f3c3de89ce6d2cbe7158573c97bb`** for code, or this document's commit (docs-only on top) | Simulated on `main` `95ff638735` + #1117: **clean**, and the result's data equals `main`'s. `quality` runs on the merge ref, which includes #1114, so the one unit failure in §2 does not recur. One Production build. |
| 3 | **#1115** | — | After step 2, `8efe2da1eb` (#1115's head) is an ancestor of `main`. If merged with a merge commit, GitHub marks #1115 as merged automatically. If it is still open (for example after a squash), **close it as superseded by this branch**. Do **not** merge #1115's own head after #1117 without this branch: it conflicts in `globals.css` and `mlb-lean-row.tsx`, the conflict this branch resolves. |

**Approve against these facts:**

- Every gate in §2 passes, apart from the explained #1114 test.
- HTML is −26.6% vs #1115 (§3).
- Equivalence with #1115 is shown in §4 (computed styles and pixels): 0 differing elements on every page whose content does not depend on the build clock, at all four widths.
- The UX acceptance results are unchanged (§5): 132/132 sweep loads clean, 32/32 tablists, 137/137 and 644/644 reachability, interactions identical.

**Rollback (each step is display-only; no data to restore):**

| To undo | Command | Verified (merge-tree simulation) |
|---|---|---|
| The UX release (step 2) only | `git revert -m 1 <step-2 merge commit>` | Clean. Leaves HTML Release 1 in place. |
| Both releases | Revert step 2 first, then `git revert -m 1 <step-1 merge commit>` | Clean in that order. |
| HTML Release 1 alone, with the UX release still merged | not recommended | **Conflicts** in `globals.css` and `mlb-lean-row.tsx`. Roll back from the top instead. |

Each revert is one Production build. Vercel's instant rollback to the previous READY Production deployment is the faster first response if needed; the founder controls it.

**Cost note:** two merges mean two Production builds, the same count as merging #1117 and #1115 separately. No preview builds, since `claude/*` is not built.

## 8. Reproduction

All scripts are in the session scratchpad (`combo/`):

| Script | Purpose |
|---|---|
| `heavy.sh` | Gates under the lock |
| `sizes.mjs` | Export sizes |
| `equiv.mjs` | Index-matched computed style, pixels and hover |
| `dump.mjs` + `align.py` | Aligned comparison for `/` and `/mlb/` |
| `pixdiff.py` | Pixel diff |
| `audit.mjs` / `checks.mjs` / `reach.mjs` | The UX Release 1 sweep, fix checks and reachability harnesses, unchanged |
| `interact.mjs` / `datejump.mjs` | Differential interactions |

Logs are next to them.

**Limitations:**

- Chromium only.
- Pixel coverage of the busiest board is capped (§4).
- The computed-style sample covers 12 pages. Whole-export parity beyond those rests on #1117's own 2,865-page text, structure and link comparison and on this sweep.
