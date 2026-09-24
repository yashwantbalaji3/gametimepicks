# v1.8 — B2: export baseline, waste ownership, and the guard that was missing

**Date:** 2026-09-23 · **Branch:** `v18-b2-export-reduction` · **Base:** `4dbd40a3b`

## 1. Baseline — measured today, not carried forward

| | measured |
|---|---|
| `public/` total | **964 MB** (`public/data` is 963 MB of it) |
| files in `public/data` | ~3,240 |
| static HTML pages | **2,457** |
| `out/` after prune | **1.4 GB**, 6,667 files |
| `out/data` after prune | **47 MB**, **1,626 files** |
| **pruned** | **3,128 files · 982.3 MB** |
| `next-build` | 123.3 s |
| `prune-internal-routes` | 2.6 s |
| all pre-build emit phases | < 2.5 s combined |

The carried figures (~982.5 MB / ~3,127 files) are confirmed: **982.3 MB / 3,128 files**.

**97% of the data tree is copied into the export and then deleted.** That is not a prune bug — it is
`output: "export"` mirroring all of `public/` before anything can filter it.

### Where the bulk is

| family | size | files | src readers |
|---|---|---|---|
| `parlays/optimizer-graded` | **233 MB** | 85 | 3 |
| `mlb/boards` | **202 MB** | 111 | **16** |
| `parlays/optimizer` | **181 MB** | 85 | 3 |
| `mlb/game-simulations` | 72 MB | 65 | 3 |
| `mlb/results` | 66 MB | — | (partly **kept**) |
| `mlb/player-props` | 48 MB | 77 | 3 |
| `mlb/home-run-props` | 14 MB | 66 | 3 |

Six of these survive the prune with **zero files**. The old candidates `/mlb`, `/players`, `/results` are
*route* families; the actual weight is in `parlays/*` and `mlb/boards`, which together are **616 MB (63%)**.

### What is genuinely served

1,626 files / 47 MB: `compare/v1` (1,456), `mlb/results` (103), `lab/v1` (29), `ask/v1` (29), and nine
singletons (`build-info.json`, `search/index.json`, `*/graded-picks.json`, `my/*`, `build/explorer-slate.json`,
`mlb/corrections`).

## 2. The distinction that decides everything

> **"needed to build the site"** and **"part of the site"** are different claims.

`mlb/boards` is read by **sixteen** source files, including the public `/mlb` page. It must be on disk
during static generation. It must never be a URL. Relocating it out of `public/` is therefore not a
deletion question — it is a *read-path* question, and the read path is not centralised: **370 call sites
across 164 source files, plus 579 in scripts, and no `dataRoot` helper exists.**

## 3. Why the relocation is NOT in this PR

The prevention fix — move never-served families out of `public/` and emit only what is served, the way
`emit-compare-assets` / `emit-lab-assets` / `emit-ask-assets` already do — is the right architecture and is
ranked first below. It is not being done unsupervised overnight, for one specific reason:

**the commit allowlists would have to move with the data.**

```
nightly-settle.yml:687       git add app/public/data/parlays/optimizer-graded/
morning-projections.yml:311  git add app/public/data/mlb/boards/
morning-projections.yml:332  git add app/public/data/parlays/optimizer/
```

A writer whose output path moves out from under its allowlist keeps running, keeps succeeding, and stops
being committed. This repository has already paid 62 hours for exactly that shape. The change is safe to
make with someone watching the next nightly run; it is not safe to make at 06:00 with nobody to see the
first failure.

## 4. What IS in this PR: the guard that was missing

The prune is deny-by-default and derives its keep-set from the build — good design. **Nothing guarded the
outcome.** Existing tests name individual families that must be absent (`public-data-boundary.test.mjs`),
so a family nobody thought to name is unguarded; and more importantly, **nothing at all notices if the
sweep fails open.** Two documented escape hatches do exactly that — `GTP_KEEP_PUBLIC_DATA=1` and
`NEXT_PUBLIC_INTERNAL_ROUTES=1` — and every existing check would still pass while 963 MB of internal
working data became world-readable at raw URLs.

`export-data-budget.test.mjs` asserts the property instead of a list:

1. **No internal family is served** — the seven heavy families, by measurement not by name-matching.
2. **The sweep removed the bulk** — `out/data` must stay under **20%** of `public/data` by bytes. Measured
   today: **4.9%**. A ratio, not a byte budget, because `compare/v1` alone is 1,456 files and grows with
   the slate; a fixed budget fails on a busy day and teaches everyone to raise it.
3. **POSITIVE CONTROL: the public families are present.** Without it the file passes perfectly for a build
   that emitted nothing — the classic way a "nothing leaked" assertion becomes a tautology.
4. Neither escape hatch is set.

**Probes — all caught, baseline and restore clean:**

| probe | result |
|---|---|
| an internal family reaches the export | **caught** (2 failing) |
| the export is broken/empty | **caught** (1 failing) |
| the sweep fails open — whole mirror published | **caught** (2 failing) |

## 5. Ranked attack plan

| # | action | saving | risk |
|---|---|---|---|
| 1 | Relocate `parlays/optimizer-graded` + `parlays/optimizer` out of `public/`; emit nothing (nothing serves them). **3 src readers each.** | **414 MB, 170 files** | must move 2 workflow allowlist lines with it — supervised change |
| 2 | Relocate `mlb/boards`. | **202 MB, 111 files** | **16 src readers** incl. public `/mlb`; 1 allowlist line |
| 3 | Relocate `mlb/game-simulations`, `mlb/player-props`, `mlb/home-run-props`, `mlb/full-game-simulations`. | 144 MB, 265 files | 3–8 readers each |
| 4 | Introduce a single `dataRoot()` helper so the read path stops being 370 hand-built joins. | 0 MB | large diff; prerequisite for doing 1–3 cheaply |
| 5 | `mlb/results/settled_leans.jsonl` is a **19.7 MB single file** — the largest in the tree. Check whether the export needs it or only the model-rows beside it. | up to 20 MB | low |

Doing 1–3 removes **760 MB (79%)** of the copy-then-delete cycle. **No published byte changes** — the prune
already removes all of it. The win is build-resource pressure (relevant to the ~46-minute Vercel stall
class) and one less way for internal data to reach a URL.

## 6. Not claimed

No speed gain is claimed from this PR: it changes no build behaviour. The timings above are one run and
are recorded as a baseline, not as a result. No source or history was deleted, no settlement artifact
touched, no route or canonical URL changed.
