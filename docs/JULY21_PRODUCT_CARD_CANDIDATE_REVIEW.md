# Bank Builder / Moonshot Candidate Review — July 21, 2026

**Rule:** propose-only. Do **not** mutate an active card unless a replacement is *clearly* better within product rules AND the founder approves. Money untouched; cards are paper/review at **$0 exposure**. Hard lesson (`july1-settlement`): settle/keep the card the founder approved, never a hindsight rewrite.

## Current active cards (all MLB, no World Cup, Step 1, paper/$0)

| Product | Legs | Combined |
|---|---|---|
| **Bank Builder Lane A** | Ranger Suarez Over 5.5 K · Justin Wrobleski Over 5.5 K | +306 |
| **Bank Builder Lane B** | Walker Buehler Over 3.5 K · Willson Contreras Over 1.5 TB | +296 |
| **Moonshot** | Zack Wheeler Over 6.5 K · Kevin Gausman Over 5.5 K | +278 |

All six legs use **model-predicted, settleable, product-eligible** markets (`pitcher_strikeouts`, `batter_total_bases`). None uses a World Cup or unmodeled market.

## Cross-check vs the full modeled lean set (82 leans)

Ranking all modeled leans by model-vs-market gap, **5 of the 6 active legs are top-12** by gap. The three biggest gaps on the slate — Wheeler Over 6.5 K (+31.4%), Gausman Over 5.5 K (+22.9%), Contreras Over 1.5 TB (+22.9%) — are **already in the cards** (Moonshot + Lane B). Walker Buehler Over 3.5 K (Lane B) is a deliberately lower-line, higher-survival leg, not a top-gap leg — appropriate for a bank lane.

**Edge is anti-calibrated** (`mlb-calibration-findings`): the largest gaps carry **Low** confidence (high variance), while the steadier legs carry **High** confidence at more modest gaps. The current cards correctly mix a couple of high-gap legs with survival-oriented ones rather than chasing raw gap.

## Alternative candidates (NOT recommended for swap)

Available, unused, reasonable profiles — listed for transparency only:

| Candidate | Gap | Model prob | Confidence | Note |
|---|---|---|---|---|
| Nolan Arenado Over 1.5 TB | +14.6% | 0.579 | High | steady, but not clearly > current Lane B legs |
| Wilyer Abreu Over 1.5 TB | +20.9% | 0.661 | Low | high gap / low confidence — variance |
| Colby Thomas Under 1.5 H+R+RBI | +13.1% | 0.728 | High | highest model prob among unused |
| Tsung-Che Cheng Over 0.5 hits | +12.1% | 0.668 | High | thin line |

## Recommendation

**No mutation.** The active cards already capture the slate's strongest model gaps and mix in survival-oriented legs; no alternative is *clearly* better under product rules. Keep all three cards as approved, paper/$0. If the founder wants a swap, the cleanest single change would be considering **Colby Thomas Under 1.5 H+R+RBI** (highest unused model prob, High confidence) as a Lane B alternative — but only with explicit founder approval, and it is not an obvious upgrade.

**Expanded coverage impact:** this pass surfaces more of the model (all 4 markets, all leans, distributions) but does **not** add new product-eligible markets — the 5 newly-surfaced markets are market-context only and remain **not product-eligible**. So the product-card leg universe is unchanged; expansion is presentational, not a new edge source.
