# Premium UI Phase 5 — Plan (latest)

> Projections content readability + Results stat-bars. Presentation-only; no
> data/model/grading/workflow change; no banned/V2 copy.

## Projections (/projections/)
- **Game cards** (MatchupCard): add a sport-accent left lane rail + sport-label
  colour (reusing #301 tokens — MLB sky-blue, NBA rose), so the board reads as a
  sport-coded sportsbook board. Existing hover/focus/reduced-motion unchanged.
- **Player projection rows** (PlayerMarketRow): subtle premium hover (inset ring
  via a `.gtp-proj-row` class — no inline-style override). Row content/fields
  unchanged.
- Left the 4-col row layout as-is (functional + readable, 0 overflow at 375) —
  a full row→card rewrite is higher-risk and not needed.

## Results (/results/)
- **Mini stat-bars** on the Model Projection Accuracy cards: an honest fill =
  the SAME hit-rate value, 50% reference tick, colour matching the existing
  positive/neutral card convention. No new value judgments; pushes still excluded
  upstream; settled-only.

## Risk control
No lib/pipeline/data change; new JSX/CSS over existing values; tsc + 718 tests +
build + browser QA at 375/1280.
