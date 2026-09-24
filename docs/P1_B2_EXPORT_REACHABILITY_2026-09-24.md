# P1 / B2 — the export reachability inventory, remeasured, and why the relocation is NOT the next move

**Date:** 2026-09-24 · **Status:** measured; implementation deliberately NOT started, under the B2 stop
rule. Every number here is from a real local build of `8cccf8a9`+ on this repo, not carried forward.

## 1 · Remeasured baseline (the prior figures were close, and slightly low)

| | prior note | measured 2026-09-24 |
|---|---|---|
| copied into the export then pruned | ~982 MB / ~3,100 files | **952.1 MB / 3,186 files** |
| `parlays/optimizer*` | ~414 MB | **426.9 MB across the whole `parlays` tree** (585 files) |
| `app/public` total | — | **1.0 GB / 4,814 files under `public/data`, 996.6 MB** |
| `out/data` after the prune | — | **44.4 MB / 1,628 files** |
| `out/` total | — | **1.4 GB / 6,706 files**, of which ~1.35 GB is GENERATED PAGES |
| routes / pages | — | 2,492 routes → **2,476 HTML pages** (⚠ **2,572 routes** after R0 refreshed the matchup registry — see §6) |

**95.5% of the data the export copies is deleted again before deploy.**

## 2 · Reachability inventory

| source family | bytes | files | reaches the export? |
|---|---|---|---|
| `parlays` | 426.9 MB | 585 | **FULLY DISCARDED** — not one byte |
| `mlb` | 422.8 MB | 1,164 | 105 files / 19.7 MB kept |
| `nfl` | 47.0 MB | 340 | 1 file kept |
| `soccer` | 29.1 MB | 251 | **FULLY DISCARDED** |
| `research` | 20.0 MB | 65 | **FULLY DISCARDED** |
| `compare` | 10.4 MB | 1,456 | fully kept — emitted public projection |
| `lab` | 8.5 MB | 29 | fully kept — emitted public projection |
| `ufc` | 6.5 MB | 120 | 1 file kept |
| `world-cup` | 6.1 MB | 188 | **FULLY DISCARDED** |
| `boards` | 5.8 MB | 116 | **FULLY DISCARDED** |
| `ask` | 5.4 MB | 30 | fully kept — emitted public projection |
| `audit` | 2.5 MB | 125 | **FULLY DISCARDED** |

Classified against the prompt's six categories: `compare`/`lab`/`ask` are **(1) required by public
runtime**; `parlays`, `soccer`, `research`, `boards`, `world-cup`, `audit` and the bulk of `mlb`/`nfl`
are **(2) required at BUILD time but never served** — which is exactly why the deny-by-default prune
removes them and why they cannot simply be moved.

## 3 · ⚠ THE MEASUREMENT THAT CHANGES THE DECISION

**The copy costs 4.5 seconds.** `cp -R public <tmp>` of the full 1.0 GB: **4.50 s real, 1.37 s sys**.
Eliminating the entire copy-then-prune would not have prevented one of the 41 forty-six-minute wedges
in §1 of `P0_VERCEL_WEDGE_CONCURRENCY_2026-09-24.md`, and would not move the median build measurably.

**And the relocation is not small.** `public/data/parlays` — the largest fully-discarded family — has
**build-time readers in at least six modules** (`data-parlays.ts`, `parlay-results.ts`,
`parlays/lab-record.ts`, `parlays/sport-lab-cards.ts`, `parlays/risk-ladder.ts`, and the ladder
builders), each resolving `process.cwd()/public/data/parlays`. Moving the tree means moving every
reader with it. The prompt's own rule applies: *do not move a file merely because it is large.*

**Where the size DOES cost, measurably:** the Vercel checkout. `Cloning completed: 57.589s` on the
2026-09-24T07:28Z production build, on a working tree of **1.0 GB `app/public` + 1.7 GB repo-root
`data/`** (and a 1.26 GiB pack). At ~100 builds/day that is the real recurring charge of keeping
discarded corpora in the checkout — not the copy, and not the deploy, which the prune already leaves
clean at 44 MB of data.

## 4 · Decision under the B2 stop rule

**Not started, deliberately.** P1.5 says implement the highest-confidence, highest-impact reduction
first. Measured, this is not it: 4.5 s of build time for a six-module refactor of a money-adjacent
data path. The build-economics win available this session was P0's, and it is measured in whole
46-minute builds avoided rather than seconds.

What a future B2 program should target, in evidence order:

1. **The checkout, not the copy.** 2.7 GB of working tree per build. Options span LFS, a data
   submodule, and a build-time fetch — each a genuine architecture decision, none a file move.
2. **Generated page payload.** 1.35 GB of the 1.4 GB export is pages, and `/mlb` alone is 523 MB of
   HTML across 129 pages — **4.15 MB per page**. This is also the structural driver behind the P0
   wedge, so it is the one reduction that would buy reliability as well as bytes.
3. **The copy-then-prune**, last, when a reader relocation is being done for another reason anyway.

## 4b · THE TARGET, LOCATED — and it is a defect class this repo has already fixed once

§4 ranked "generated page payload" second and named `/mlb`. Measured further, it is not diffuse:

| | |
|---|---|
| `out/mlb` | 643 MB — **45% of the entire 1.4 GB export** |
| `out/mlb/board` | **631 MB of that 643 MB** |
| exported board dates | **124**, 2026-05-16 → 2026-09-29 |
| one page (`2026-08-11`) | 6.30 MB — `<main>` **4.55 MB** (72%) + inline RSC **1.71 MB** (27%) |

⚠ So this one is NOT the RSC-payload problem that `/mlb`'s hub page had. It is **server-rendered
markup**: 35,642 elements in one `<main>`. Broken down:

| component of `<main>` | count | bytes | share |
|---|---|---|---|
| **inline `style="…"` attributes** | **21,339** | **1.75 MB** | **38%** |
| `class="…"` attributes | 24,312 | 0.89 MB | 20% |
| inline `<svg>` | 642 | 0.78 MB | 17% |

**The single largest component of the largest page family in the export is per-element inline
styles** — 1.75 MB per page × 124 pages ≈ **217 MB of `style=` attributes**.

⚠ **This repo has already diagnosed and fixed this exact class once.** `/results` measured 1,160 KB
when per-cell style objects shipped once per cell, and `prediction-board.tsx` carries the lesson in
its docstring: *"everything positional here is a class, and the only inline value is the rank
counter."* The MLB board never got that treatment.

**Why this is the right next B2 step**, where the 952 MB relocation was not:

- it changes **no data, no model, no copy, no selector** — the same visual result, expressed as
  classes instead of per-element attributes;
- the pattern, the precedent and the guard idiom all already exist in this repo;
- it reduces the thing that actually hurts — **static-generation memory**, the measured cause of the
  46-minute wedge (`P0_VERCEL_WEDGE_CONCURRENCY_2026-09-24.md` §6) — as well as bytes. The 952 MB
  copy would have bought 4.5 seconds and no reliability at all;
- it is the precondition for the §8 checkpoint on returning to the standard build machine.

A second, separable question the numbers raise: **124 fully-rendered historical board dates** is a
lot of static surface for a beginner-first product. Whether every archived slate day needs a complete
6 MB page, or a lighter archived form, is a product decision — not a build one — and is recorded here
rather than assumed.

## 5 · What is NOT claimed

No savings are claimed, because none were implemented. The prune's own guard continues to prove that
prohibited families do not reach the exported surface; nothing about it was weakened, and no
selector, model, result or history was touched.

## 6 · WHAT CHANGED LATER THE SAME DAY, AND WHY IT RAISES THE BAR

Two measurements landed after this receipt was written, and both make the page-payload target
(§4/§4b) **more** load-bearing, not less.

**The build's real memory demand is 11.31 GB, not the ~7 GB estimated here from a partial reading.**
The heartbeat shipped in #654 measured the enhanced machine directly: `mem 11.31G/16.00G` at exactly
the `1867/2490` three-quarter print where every wedge on the 8 GB machine had died. A later
production build, running concurrently, was already at `8.13G` by 180 s — past `standard`'s ENTIRE
8 GB ceiling before reaching the point where it used to hang. **8 GB was never marginal; it was
structurally insufficient.** Demand also scales with worker count, so 8 cores costs more memory than
4, not less.

**And the route count grew.** R0's refreshed matchup registry took the export from **2,492 to 2,572
routes** — roughly 73 more pages of real forward coverage. That is correct product behaviour, and it
means peak memory is now a moving target that rises as coverage improves.

Together: returning to the standard 4-vCPU / 8-GB class is not a near-term option, and the gap to
close is larger than this receipt originally implied. The `/mlb/board` reduction in §4b —
~217 MB of inline `style=` attributes across 124 pages — remains the one change that would buy
reliability and bytes at the same time, and it is now the explicit precondition for that checkpoint.
