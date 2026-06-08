# Premium UI Phase 4 — Plan (latest)

> Projections board + Bank Builder premium experience. Presentation-only;
> no data/model/grading/workflow change; no banned/V2 copy.

## Projections (/projections/)
Replace the page's static `DateStatusHeader` (shared component left untouched —
date pills live in ProjectionsExperience) with a premium **board hero**: layered
gradient frame + gold top accent rule + headline "Today's projections board." +
a sportsbook **scoreboard stat strip** (Active slate / Games / Projections /
Sports) built from the same real payload counts. Honest empty note when 0.

## Bank Builder (/bank-builder/)
Already mature (PageHero + ladder tower + honest Daily Pick). Add a board
**target-path stat strip** under the hero: Start ($100 base) / Step target (~2×,
≈ +100 odds) / Current step (N/5 + bankroll) / On a loss (Reset → $100). Honest
target, never a promise; the loss reset stays visible.

## Shared
New `board-stat-tile.tsx` (BoardStatTile + fmtShortDate) so the scoreboard
language matches the homepage hero across surfaces.

## Results
No change this pass (already revamped earlier this session). Light polish
deferred.

## Risk control
No lib/pipeline/data change; new JSX/CSS over existing values; tsc + 718 tests +
build + browser QA at 375/1280.
