# HTML reduction series (#1096–#1100): measurement against a reproducible baseline

Date: 2026-10-16. Local measurement only. No deploys, previews, workflow runs or paid APIs were used.

## What was measured

| Role | Commit | Tree |
|---|---|---|
| Baseline | `d6de0ceb47e8719c2d9e4b53208caac14c3712a5` | `origin/main` at measurement time |
| Stack | `db8efbd4e8` (local throwaway merge) | the baseline plus the #1100 head `c51d713bfd5575c23e6bb173b658a72b0a68c375` |

- The merge was clean. `git diff d6de0ceb47 db8efbd4e8` touches exactly the 13 files of the series and nothing else.
- Since the stack's merge-base (`6de43c6186`), `main` has only `auto:` data commits. None of them touch the series' files, so nothing in the series is superseded.
- Re-checked against the newer `origin/main` `9b6059239d`: it adds two more data-only `auto` commits, and the merge is still clean.

### Method
- Two separate worktrees. `node_modules` was symlinked from the main checkout; no install was run.
- Each `npm run build` ran cold (no `.next`) under the shared build lock.
- Both builds used the same static-generation worker cap, `experimental.cpus: 3`. This is an uncommitted local edit of `next.config.mjs`, applied to both trees and restored afterwards; the committed value is 4 and there is no env var for it.
- A replicate pair was then built in the reverse order (stack first) with a warm `.next` cache.

## 1. Measured export bytes (`app/out`)

| | Baseline | Stack | Change |
|---|---|---|---|
| Files | 7,656 | 7,656 | 0 |
| HTML files | 2,865 | 2,865 | 0 |
| **HTML bytes** | **1,144,358,719** | **831,085,296** | **−313.3 MB (−27.4%)** |
| RSC `.txt` bytes | 390.0 MB | 293.5 MB | −24.7% |
| JSON / CSV / JS / images | 56.9 / 4.3 / 2.4 / 0.8 MB | same | 0 (JS −0.2%) |
| **Total `out/` bytes** | **1,600,367,227** | **1,190,612,817** | **−409.8 MB (−25.6%)** |
| `du -sk out` (on disk) | 1,859,952 KB | 1,429,056 KB | −23.2% |

- The replicate builds reproduced every total above to the byte.
- Every one of the 2,865 HTML pages got smaller. None grew, and none is missing or added.

### HTML by route group (largest first)

| Group | Pages | Baseline MB | Stack MB | Change |
|---|---|---|---|---|
| `mlb/board` | 148 | 482.9 | 309.0 | −36.0% |
| `results/date` | 133 | 199.2 | 141.7 | −28.9% |
| `players/nfl` | 761 | 113.6 | 95.3 | −16.1% |
| `players/epl` | 414 | 76.0 | 57.4 | −24.6% |
| `players/mlb` | 272 | 67.5 | 40.7 | −39.6% |
| `players/ufc` | 363 | 39.1 | 33.4 | −14.7% |
| `nfl` | 160 | 35.7 | 33.9 | −5.1% |
| `matchups/mlb` | 196 | 26.9 | 23.7 | −11.8% |
| `matchups/nfl` | 95 | 13.0 | 11.4 | −12.0% |
| `teams/mlb` | 30 | 12.4 | 11.3 | −8.7% |
| `results/nba` | 1 | 3.8 | 2.8 | −26.5% |

On every page, the site chrome (command rail and footer) shrinks by about 11.3 KB. For example, `/` goes from 223,580 to 212,230 bytes (−5.1%).

### Top 15 HTML pages, before → after

**Ranked by baseline size**

| Page | Baseline MB | Stack MB | Change |
|---|---|---|---|
| mlb/board/2026-09-16 | 5.52 | 3.40 | −38.5% |
| mlb/board/2026-09-15 | 5.52 | 3.40 | −38.4% |
| mlb/board/2026-09-05 | 5.51 | 3.39 | −38.5% |
| mlb/board/2026-09-22 | 5.50 | 3.38 | −38.5% |
| mlb/board/2026-08-22 | 5.48 | 3.38 | −38.3% |
| mlb/board/2026-09-04 | 5.48 | 3.38 | −38.4% |
| mlb/board/2026-08-05 | 5.46 | 3.37 | −38.2% |
| mlb/board/2026-08-11 | 5.46 | 3.37 | −38.3% |
| mlb/board/2026-09-11 | 5.44 | 3.35 | −38.4% |
| mlb/board/2026-08-16 | 5.44 | 3.36 | −38.3% |
| mlb/board/2026-08-26 | 5.44 | 3.35 | −38.3% |
| mlb/board/2026-08-25 | 5.44 | 3.35 | −38.4% |
| mlb/board/2026-08-21 | 5.44 | 3.35 | −38.3% |
| mlb/board/2026-08-12 | 5.43 | 3.35 | −38.2% |
| mlb/board/2026-08-07 | 5.43 | 3.35 | −38.2% |

**Ranked by stack size.** After the change, the largest page is a Results date page.

| Page | Baseline MB | Stack MB | Change |
|---|---|---|---|
| results/date/2026-06-10 | 5.16 | 3.53 | −31.6% |
| mlb/board/2026-06-16 | 5.33 | 3.43 | −35.6% |
| mlb/board/2026-07-24 | 5.34 | 3.42 | −35.9% |
| mlb/board/2026-07-08 | 5.30 | 3.40 | −35.8% |
| results/date/2026-06-13 | 4.96 | 3.40 | −31.4% |
| mlb/board/2026-06-12 | 5.29 | 3.40 | −35.6% |
| mlb/board/2026-06-24 | 5.28 | 3.40 | −35.6% |

The stack-ranked top 15 continues through 2026-09-16, 09-15, 09-05, 07-28, 09-22, 05-30, 06-13 and 08-22, all between 3.38 and 3.40 MB.

## 2. Measured local build time and memory (macOS, 8 cores, 16 GB)

The machine was shared: another agent's work was running, the load average was 12–26, and system memory sat at 15.5–15.9 of 16 GB during static generation. **Read the timings as noisy.**

| Phase (seconds) | Base cold | Stack cold | Stack warm (r2, run first) | Base warm (r2) |
|---|---|---|---|---|
| build-info-emit | 0.1 | 0.1 | 0.1 | 0.1 |
| compare-assets | 0.3 | 0.3 | 0.4 | 0.4 |
| lab-assets | 0.2 | 0.1 | 0.1 | 0.1 |
| ask-projections | 5.3 | 5.3 | 3.9 | 3.9 |
| ask-assets | 0.1 | 0.2 | 0.1 | 0.1 |
| search-index | 1.1 | 1.2 | 1.0 | 0.9 |
| forecast-record-assets | 0.3 | 0.2 | 0.2 | 0.2 |
| **next-build** | **195.3** | **163.1** | **133.4** | **133.8** |
| prune-internal-routes | 4.3 | 2.3 | 2.3 | 2.8 |
| build-info-publish | 0.1 | 0.1 | 0.1 | 0.1 |
| Wall (npm run build) | 208 | 174 | 142 | 143 |
| Peak summed RSS of the build process tree | 4,477 MB | 5,284 MB | 5,734 MB | 5,841 MB |

- **Memory reading:** peak RSS is the maximum of the summed `ps -o rss` over the `npm run build` process tree, sampled every 5 s. It is **local macOS RSS**, under memory compression and swap. It is **not** Vercel cgroup memory.
- **Conclusion on time:** no build-time effect was detected. The cold pair differs by 32 s, but the warm replicate is equal to within 0.4 s, so that 32 s gap sits inside the machine's noise.
- **Conclusion on memory:** no peak-memory effect was detected. Pairs move by ±0.8 GB in both directions, which is sampling and pressure noise.
- **What can be said about I/O:** prune time and the bytes written fall with export size, but nothing about time is claimed beyond the table.

## 3. Equivalence

### Whole export, all pages, normalised
- **Visible text:** identical on 2,865/2,865 pages (scripts and styles removed, tags stripped). The only token that differs is the footer build stamp (`build Oct 16, h:mm PM`), on every page.
- **Element structure:** the tag sequence is identical on every page.
- **Links:** the `href` sequence is identical on every page.
- **Records:** `<tr>` and `<td>` counts are identical on every page. Totals: 138,926 `tr`, 906,455 `td` and 401,030 `a[href]` in both builds.
- **Inline styles:** `style=` attributes fall from 4,010,052 to 1,054,825.
- **Non-HTML files:**
  - JS chunks differ only by content hash.
  - JSON: 1,758/1,761 are identical. The other 3 differ only by build-instant `generatedAt`/`asOf` (`build-info.json`, `build/explorer-slate.json`, `search/index.json`).
  - CSV, JSONL, XML, PNG and webmanifest are identical.
  - RSC `.txt` differ, as expected (the chrome classes are on every page).

### Real browser (Chromium via `app/node_modules/playwright`)
Both exports were served by `scripts/serve-export.mjs` on two ports, at viewports 390 and 1440, with animations frozen and every `<details>` opened. The sample covered 12 pages:
- `/`, `/mlb/`, `/results/`;
- `/mlb/board/2026-09-04/` (29,841 elements, every tier);
- `/results/date/2026-09-24/` and the historical `/results/date/2026-05-15/`;
- `/results/nba/` (17,719 elements);
- the MLB, EPL and NFL player pages (`adley-rutschman`, `aaron-hickey`, `aaron-jones-sr`);
- `/matchups/mlb/822678/` and `/teams/mlb/new-york-yankees/`.

**Computed styles:** all standard properties of every element were compared, 78,859 elements per viewport. Result: **0 differing elements** on all 24 page × viewport pairs. Two expected differences were normalised first:
- custom properties: the new `--lr-*` variables, and whitespace in how `--rail-shadow` is serialised;
- the gradient's first stop, which serialises as `0%` in the baseline and `0px` in the stack (the same position).

Before that normalisation, the custom properties were the only differences. Custom-property enumeration order is not stable in Chrome, so values were compared after sorting.

**Screenshots:** full-page pixel diffs, with the 390 px MLB board capped at 20,000 px. On all 24 pairs the only differing pixels are 136–177 px inside one box about 210×35 px: the footer build-stamp time (4:08 PM vs 4:12 PM, checked by eye). Everything else is pixel-identical.

**Hover:** the first rail link, footer link and in-table link have the same colour, background, decoration, box-shadow and border under hover.

**Interaction parity:** each visible control in `main` (buttons, selects, tabs; up to 40) was operated in the same sequence on both builds, comparing the visible-text hash and the row and link counts after each step. Result: **0 mismatches** at both viewports.

| Page | What was exercised | Result |
|---|---|---|
| `/mlb/board/2026-09-04/` | 40 steps: 4 market filters, 5 gap filters, "All teams" + 30 team filters | 11 distinct states, all identical |
| `/mlb/board/` | 19 steps | identical |
| `/results/` | windows Today/7/30/Season/All time; Record type and Sport selects (rows 186 → 71 → 69 → 68) | identical |
| `/results/date/2026-09-24/` | "Jump to a date" select, paging back through 2026-05-15 … 05-20 | each historical page identical |
| `/results/nba/`, a player page, `/` | available controls | identical |

**Console:** no hydration errors on either build. The only console errors are 404s for `/i/headshots/nba/...png` on historical NBA results. These are external-CDN headshot paths that the local server cannot serve, and the same set appears on both builds. The pages with errors had equal counts, except one 46 vs 47 during date-paging navigation, which is timing.

## 4. Tests (stack worktree unless noted; run under the lock)

| Run | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| Targeted (14 files) | 90 | 90 | 0 | 0 |
| `npm run suite` (unit), stack | 9,408 | 9,405 | 1 | 2 |
| `npm run suite` (unit), baseline | 9,404 | 9,401 | 1 | 2 |
| `npm run suite:built` (post-build, reads `out/`), stack | 699 | 696 | 0 | 3 |
| `npm run suite:built`, baseline | 699 | 696 | 0 | 3 |

- **Targeted files:** `board-lean-view` (added by #1096), `board-calibration-honour`, `confidence-semantics`, `release-2a-truth`, `motion-hygiene`, `motion-roles`, `token-definition`, `token-ratchet`, `token-exception-registry`, `style-element-hydration`, `footer-identity`, `navigation`, `nav-active-route`, `build-workers-cap`.
- **The one unit failure is pre-existing on `main`** and identical on both trees: `sports/nfl/totals-play-efficiency.test.mjs`, "every ESPN schedule abbreviation reaches a rated franchise" (26 teams on the mid-week schedule vs ≥ 28 asserted). It is fixed separately in #1114.
- The stack's +4 unit tests are the new `board-lean-view` tests.

## 5. Not measured

- **Vercel:** build minutes, build-machine memory (cgroup), CDN egress, function or edge usage, and anything on the bill. None of these was observed. The byte reductions above are **not** translated into time or money.
- **Deployment upload and caching:** neither the upload size Vercel sees for the deployment nor its compression/caching behaviour was measured.
- **Transfer size:** compressed (gzip/brotli) transfer sizes were not measured; all figures are uncompressed bytes on disk.
- **Browsers:** Firefox and WebKit rendering were not checked (Chromium only).
- **Sample coverage:** computed-style and pixel parity cover the 12-page sample above, not all 2,865 pages. Whole-export parity covers text, structure, links and row counts only.

## 6. Exact-head approval package

**Merge order:** each PR is based on the previous one; merge in this order and do not reorder.

| # | Branch | Head SHA |
|---|---|---|
| 1 | #1096 `claude/mlb-board-slim-props` | `54e1655016e47ee6dcd71c9a2ac9fa6cbe0379bf` |
| 2 | #1097 `claude/mlb-lean-row-css` | `7abb3fb02d0b298a5d45b9915c6a63705694f060` |
| 3 | #1098 `claude/results-table-css` | `c90a784fc3b33fd543bb86bece8f08631ae70d41` |
| 4 | #1099 `claude/chrome-css` | `6c291877e331b2cc849f96c5e1c904cf31accab3` |
| 5 | #1100 `claude/player-log-css` | `c51d713bfd5575c23e6bb173b658a72b0a68c375` |

- **Approval condition:** approve only if each PR's head still equals the SHA above at merge time. Any new push invalidates this measurement for that PR and everything above it.
- **Tested tree:** the measured tree is `main@d6de0ceb47` + `c51d713bfd`. Main has since moved only by data (`auto`) commits, and the merge is clean against `9b6059239d`.
- **Rollback is by revert:**
  - Reverting all six series commits in **reverse order** (`c51d713bfd`, `6c291877e3`, `c90a784fc3`, `7abb3fb02d`, `54e1655016`, `9781ddab25`) applies cleanly and returns `app/` exactly to the baseline tree (empty diff vs `d6de0ceb47`).
  - Reverting `c51d713bfd` alone or `54e1655016` alone is clean.
  - Reverting `9781ddab25`, `7abb3fb02d`, `c90a784fc3` or `6c291877e3` **alone**, with later commits present, conflicts: in `globals.css`, where the appended class blocks are adjacent, and for `9781ddab25` in `board-lean-view.test.mjs`. Partial rollback of a middle PR therefore needs a manual resolve. To avoid that, roll back from the top.
- **No data change:** no data, forecast, settlement, results or provenance file is touched by the series.

## Artifacts
Kept in the measuring session's scratchpad and not committed:
- build logs (`base-build.log`, `stack-build.log`, `*-r2-build.log`) and RSS series (`*-rss.json`);
- per-file sizes (`*-sizes.json`) and the whole-export equivalence result (`equiv.json`);
- Playwright results and screenshots (`pw/`) and interaction steps (`interact.json`);
- test logs.
