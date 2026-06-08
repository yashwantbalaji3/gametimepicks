# Premium UI Phase 3 — Bold Redesign Plan (latest)

> Visible, first-glance premium transformation. No data/model/grading/workflow
> changes; no banned/V2 copy; honest paper-only positioning preserved.

## What visibly changes this pass
1. **Home command-center hero** (NEW): a layered gradient hero band at the top of
   `/` with a bold display headline ("Today's board, ranked by the model."), a
   "Educational · paper picks only" pill, two sportsbook-style CTAs (Suggested
   Parlays / Track record), and a **scoreboard stat strip** — three premium stat
   tiles with colored accent rails: Active slate (emerald), Latest settled
   (sky-blue), Tracked accuracy (gold). All values are real loader data
   (slate date, latest graded date, leg-level decisive hit rate).
2. **Parlay Lab hero band** (NEW): the Suggested-mode page header is wrapped in
   the same premium gradient frame + gold top accent rule, so the #1 product page
   reads as a sportsbook board (build/bankroll/embedded headers unchanged).

## What stays unchanged
All loaders, optimizer, grading, generated data; risk-lane (#300) + sport-accent
(#301) systems; the modular dashboard below the hero (path cards, Top Pick, Bank
Builder, Results breakdowns). Results was already revamped earlier this session
(ProjectionAccuracySummary + ResultsHero + ModelNotesPanel).

## How we avoid data/model risk
Pure presentation: new JSX + CSS rendering EXISTING values. No change to any
lib/pipeline/data file. Verified with tsc + 718 tests + build + browser QA.

## Deferred (next bold passes — concrete)
Projections "board" mobile card layout; Bank-Builder progression visual; extend
scoreboard tiles to Results/Projections headers. Each is reversible and best done
as its own focused PR.
