# Audit — Bank Builder lane legs: exact side + clickable "why" + two ladders

_Branch `final-public-uiux-bankbuilder-gamepages` off main `7030867`. Follows #512._

## Scope
The owner's sharp, concrete ask (from the screenshot): the active Bank Builder lane legs must show the
**exact Over/Under side** (not just "Strikeouts 3.5"), be **clickable to see why** each pick was made,
present as **two separate ladders**, and drop the stale "no qualifying launch yet" box. Delivered that
high-value slice; the broader visual-identity-on-every-legacy-route + game-page rebuilds remain a
documented follow-up (the engine surfaces already carry flags/avatars).

## What changed
- **Exact pick side** threaded end-to-end: `EligibleLeg.side` → `BankBuilderLaneLeg` (+ label
  "JR Ritchie Strikeouts Over 3.5", "Javier Assad Strikeouts Under 4.5") → `ParlayLegDisplay.side` →
  the lane leg row (market + Over/Under + line on its own line, never truncated away). Applied to the
  `/parlays` leg rows too.
- **Clickable "why" drawer**: each lane leg is a `<details>` that expands to confidence · survival ·
  risk · quality tier · model% + the top positive/negative factors (e.g. "recent form supports the
  over (83%)", "+15.1pp model edge", "small sample") + kickoff/first-pitch + official-settlement note.
  The factors are carried in the committed artifact so they render even after a leg's game starts.
- **Two separate lane ladders**: each lane shows a Step 1→5 path (Step 1 active, Steps 2–5 coming
  soon) with "$100 → <projected> · pending official settlement" and a → $10K target.
- **Stale "no qualifying launch yet" removed**: the V2 evaluation panel is hidden on `/bank-builder`
  when an active dual ladder is launched, and the meter + `/today` status rail now read the active-run
  state (`activeLaunched`) so they show "Active dual ladder · Two lanes live" instead of the old
  evaluating/no-launch copy.
- Regenerated the active run artifact (same 4 legs, conservative `--now`) so it carries side + factors.

## Active run (unchanged legs)
`dual-bank-builder-2026-06-17` — Lane A: Colombia or Draw + JR Ritchie Strikeouts **Over** 3.5
(survival 93, → $184.03); Lane B: Ghana or Draw + Javier Assad Strikeouts **Under** 4.5 (survival 84,
→ $217.00). One World Cup leg per lane, flags + player portraits.

## Integrity
Protected `public/data/bank-builder/*` untouched; the active run lives in the engine namespace.

## Honest follow-ups (not in this pass)
Full visual-identity sweep of every legacy route, the World Cup game-page rebuild (top picks / team
props / player props sections), and `/picks`+`/parlay-lab` consolidation onto the engine data.

## Verification
tsc · 1012 app tests · build · copy/secret/protected-data audits · browser QA mobile 375px
(exact side visible, clickable why, two ladders, no no-launch box, no overflow, no console errors).
