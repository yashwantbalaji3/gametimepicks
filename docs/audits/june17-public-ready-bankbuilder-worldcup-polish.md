# Audit — June 17 Public-Ready Bank Builder + World Cup Polish

_Branch `june17-public-ready-bankbuilder-worldcup-polish` off main `bbb2997`. Follows #511 (WC odds + active launch)._

## Objective
Make `/bank-builder` and the build/parlay surfaces public-ready for June 17: active Dual Bank Builder
primary, no public "Run #" labels, the old failed test run demoted, and stale June-16 games removed —
without mutating protected history or fabricating anything.

## What changed (high-impact, focused)
- **Active run is now primary** on `/bank-builder`: the active dual-ladder panel renders first; the
  $100→$10,376.17 completed-ladder proof stays; the **old failed dual-run teaser is demoted into a
  collapsed `<details>` "Archived closed test ladder"** (real outcome preserved, not promoted).
- **Public "Run #1/#2/#3" labels removed** from the meter, status rail, V2 panel, dual teaser, and
  methodology page → product vocabulary ("Completed ladder", "Active dual ladder", "Dual ladder ·
  evaluating", "Closed test ladder"). Code comments may still reference Run # for history; only
  rendered chip labels were changed. Locked by `no-run-labels.test.mjs`.
- **Stale games removed from Build**: `buildWcLegs` now gates team markets + player props to
  **upcoming kickoffs only** (real-now, overridable). June-16 France/Norway/Argentina/Senegal no
  longer appear; only not-started June-17 games (Colombia, Ghana — England-Croatia correctly drops
  once it kicks off).

## Active run (unchanged from #511, paper, non-protected namespace)
`dual-bank-builder-2026-06-17` — Lane A: Colombia or Draw + JR Ritchie K 3.5 (survival 93); Lane B:
Ghana or Draw + Javier Assad K 4.5 (survival 84). One World Cup leg per lane, with country flags +
player portraits via the lane trackers.

## Integrity
- **Protected `public/data/bank-builder/*` untouched** — the old failed run's data is preserved (only
  demoted in the UI); the completed ladder proof remains. No fabrication; no settlement edits.

## Honest scope note
This pass nails the loudest public-readiness issues (Bank Builder primary/labels/demote, Build stale
games). Deeper consolidation of `/parlay-lab` + `/picks` into the engine view, and an exhaustive
visual-identity sweep of every legacy surface, remain as follow-ups — the engine surfaces
(`/parlays`, `/bank-builder` trackers, `/today` card) already carry portraits/logos/flags.

## Verification (recorded at PR time)
tsc · full app tests (1010) · build · copy/secret/protected-data audits · browser QA (mobile+desktop).
