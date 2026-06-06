# June-6 MLB Suggested-Parlay Depth (latest)

> Measured on the generated June-6 MLB-only slate. Honest depth — no padding.

## Slate inputs
- MLB games: **15** · MLB board leans: **686** · actionable leans: **634**
- optimizer `totalSlips`: **64** · `legPool`: **477** legs
- NBA games: **0** (Finals rest day)

## publicRiskSections (the curated public pool) — nba / mlb / multi
| risk | nba | mlb | multi |
|------|----:|----:|------:|
| low | 0 | **6** | 0 |
| medium | 0 | **6** | 0 |
| high | 0 | **6** | 0 |
| longshot | 0 | **6** | 0 |

**MLB meets the 3–5-per-risk target at every tier (6 each, the #281
target-per-bucket).** NBA = 0 and multi = 0 because there is no NBA slate to
draw from — honest lack of supply, not a shortfall to pad.

## Displayed Suggested view (volume-disciplined)
- Showing **8 published cards**: **Low 5 · Medium 3 · High 0 · Longshot 0**.
- The displayed count (8) is below the public pool (24) by design: the Suggested
  view caps how many cards it surfaces and leads with the lower-variance tiers.
  The page states this explicitly — *"We cap how many cards we publish per slate
  and show fewer when the slate doesn't produce enough varied combinations —
  sections can be empty rather than padded."*
- "MLB-ONLY SLATE" badge + "No NBA games scheduled today — MLB-only slate" make
  the empty NBA/Mixed honest.

## Why any tier shows fewer than the pool holds
- **Volume discipline** caps the *displayed* Suggested view (supply exists; the
  display is deliberately limited and leads with Low/Medium).
- **Strict Low gate** (#282) keeps Low conservative (L10 ≥ 80%, odds floor, no
  weak plus-money) — 12 Low legs, **0 violations**.
- **No NBA slate** → NBA/Mixed honestly 0.
- **No fabricated or padded cards** were added to hit a target.

## Verdict
Depth is **honest and sufficient for MLB**: the public pool carries 6 per risk
tier; the surfaced view is volume-disciplined (8 cards, Low/Medium-led); NBA and
Mixed are correctly empty.

*Read-only. No paid API, no data/model change.*
