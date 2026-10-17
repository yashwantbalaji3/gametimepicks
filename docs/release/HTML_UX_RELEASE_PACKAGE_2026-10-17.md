# Coordinated approval package: HTML Release 1 → UX Release 1 → UX follow-up

**Status: not merged; founder approval required for each step.** This document is the single package for the sequence. Prepared 2026-10-17 06:40Z against `main` `2c617c780c`, which is what Production serves.

## Sequence and exact heads
| Step | PR | Exact head | Contains | CI on the current merge ref |
|---|---|---|---|---|
| 1 | [#1117](https://github.com/yashwantbalaji3/gametimepicks/pull/1117) HTML Release 1 | `4b4610366e811793b4542742d881ffcfe0ef2d51` | #1096→#1100 plus the measurement doc | ✅ quality and python (run 38992920612: unit 9,406/9,408, post-build 696/699, 0 fail) |
| 2 | [#1119](https://github.com/yashwantbalaji3/gametimepicks/pull/1119) UX Release 1 on HTML | `4465b08d40dfc5f267b2712b7b8a3b384bd1b723` | #1117 + #1115 (9 audit PRs and UXR1-01…16) + the reconciliation `bb4f4a02be` | ✅ (run 38988680885) |
| 3 | [#1120](https://github.com/yashwantbalaji3/gametimepicks/pull/1120) UX follow-up | `55153b79705468e24f7073db97b80095001156ef` | #1119 + internal codes in reader words + the export guard + 5 journey fixes | ✅ (run 38993725289: unit 9,445/9,447, post-build 704/707, 0 fail) |

## Compatibility with current `main`
- No source, API, script, workflow or Next-config change has landed on `main` since the evidence was gathered (`8433d82bd9` → `2c617c780c` is bot data commits only). Prior verification therefore still applies; repeating the expensive comparison has no concrete reason.
- A **simulated sequential merge** of steps 1→2→3 on `main` `2c617c780c` is **clean** and changes **0** files under `data/`, `app/public/data/` or `pipeline/`.
- **Merge method:** a merge commit for each step, never squash. Step 2 then contains step 1's head, and #1115's head becomes part of `main`'s history, so GitHub marks #1115 merged. Close it as superseded if it stays open.

## Evidence summary
| Area | Result | Source |
|---|---|---|
| Export size | HTML −27.4% vs `main` (step 1); combined −26.6% HTML and −25.1% whole export vs #1115; busiest MLB board 5.84 → 3.73 MB | `docs/cost/HTML_SERIES_MEASUREMENT_2026-10-16.md`, `docs/release/HTML_UX_COMBINED_VERIFICATION_2026-10-17.md` |
| Rendering | Step 1 vs `main`: 0 differing computed-style elements on 12 pages × 2 widths, pixel-identical apart from the build stamp. Steps 1+2 vs #1115: 0 differing elements on 10/12 pages × 4 widths (`/` and `/mlb` differ only because their content changed between build times), 0 differing pixels | same |
| Records | All 2,865 pages kept; identical row, cell and link counts (138,926 / 906,455 / 401,030 at step 1); no record removed | same |
| Interactions | 198 steps (MLB board market/gap/team/sort/density, Results windows/selects, date jump, model-audit) identical to #1115; 40 MLB filter steps identical to `main` at step 1 | same |
| Accessibility | 32/32 tablists pass, including `aria-controls`; 0 unnamed controls; one h1 per page; in-body 44 px targets per UXR1-16; structural a11y 0 findings; browser a11y (Chromium, Firefox, WebKit) in CI ✅ | CI and reports |
| Mobile | 132-load sweep (33 routes × 320/390/768/1440): 0 overflow, 0 overlap, 0 broken or distorted images (4,492) | combined verification |
| Journeys | 6 journeys × NFL/NBA/MLB/UFC/soccer × 390/1440, plus 320/768 spot checks and keyboard runs. 5 defects fixed in step 3; 0 missing targets across 392,451 internal links | `docs/ux/UX_JOURNEYS_2026-10-17.md` (on #1120) |
| Preserved fixes | EPL home/away identity (UXJ-02); graded NFL games on past lobby dates (UXJ-05); tablist names (UXJ-01); NBA destination (UXJ-03); internal terms (export guard); MLB chip wrapping and tile stacking (UXR1-04/06, class form verified equal to #1115); touch targets (UXR1-16); Results paging 137/137 and 644/644 | reports and tests |
| Forecasting and history | No forecast, grade, settlement or ledger file changes. Presentation only | diff check above |

## Production impact and cost
- **Deployments:** 3 Production builds if merged as three separate pushes. If merged back-to-back, Vercel may cancel superseded queued builds, but count 3 as the upper bound.
- **Build time:** no measured change locally. Billed CPU is not measured.
- **Timing:** avoid merging during MLB lineup refreshes (:25–:45 past the hour, 15:30–00:30Z) and Sunday's NFL windows (12:30Z–01:00Z Mon). Suggested slot: Sat 10-17 or Mon 10-19 morning ET, before UAT.

## Post-merge acceptance (Production)
1. `build-info.json` serves each step's merge commit.
2. Spot-check `/`, `/mlb/board/<today>`, `/results/`, a Results date page, an NFL game, an EPL match and `/saved` at 390 and 1440: no overflow; chips wrap; tiles stack below 375 px.
3. Run `check-live.mjs`-style read-only page checks: no internal codes in visible text on `/`, `/today`, `/nfl`, `/results/model-audit`, `/results/forecasts` and `/results/parlay-lab`.
4. Saved Forecasts: save an EPL fixture and check that it reads home-first.
5. The `/simulate` lobby on a past NFL date lists graded games as "View result →".

## Rollback (reverse order only)
- Revert step 3, then step 2, then step 1.
- Reverting step 1 while step 2 is merged conflicts in `globals.css` and `mlb-lean-row.tsx`.
- Each revert is a code-only change; no data migration.

## Not included, and deferred
- Site-header and rail 44 px targets (founder decision).
- M6 naming (founder decision).
- D-04: settled pages should show the final score and a link to the graded result (lifecycle rule review).
- D-06: /live grouping when tracking is off.
- Search listbox semantics.
