# "Predicted winner vs final" results graphic: gtp-social-results@1.1

**Status: PROTOTYPE, not approved.** Neither 1.0 nor 1.1 has a design approval, and no approval of `gtp-social@2.3.x` carries over. It needs your design approval, and then each post needs its own approval. It is **not wired into the daily queue**.

## 1.1 changes (founder 10-29)

- **Removed from the image:**
  - the "1 day · 12 games · Wednesday" subtitle;
  - "One day of results. Not a long-term accuracy claim.";
  - "Estimate = Elo-derived game-winner estimate, published before tip-off".
- **Lead KPI:** the day's accuracy, computed to one decimal (66.7%). It carries the label "Accuracy" and, below it, the sample size: "8 of 12 graded games". The big "12 Games" KPI is gone; Correct and Missed stay.
- **Kept:** every final, predicted winner, estimate share and ✓/✕ pill. Misses are as visible as hits. The X mark + @GameTimePicksHQ and the NBA disclosure stay.
- **Internal only:** the sample size, methodology and qualifications live in the bundle (`sampleSize`, `contextLine`, `estimateLabel`, `sources`), in this doc and in the captions. Both captions still state the sample and "not a long-term accuracy claim".

## Review images (Oct 28 NBA, data at `d367dd50fac6`)

- [`assets/nba-results-2026-10-28.png`](assets/nba-results-2026-10-28.png): 1080×1350, sha256 `606c2d8312fceec835249e77aa8c1b782d3febbe213c2e10b1b626f98c4510f7`
- [`assets/nba-results-2026-10-28-square.png`](assets/nba-results-2026-10-28-square.png): 1080×1080, sha256 `5823662241c47a7dff66a6e9890c5ea8e2181fd38be88e18c8573e9b10b517a4`

**Result: 8 of 12 correct, 4 missed (ATL, MIN, OKC, LAC), 66.7%.**

The two sources:

- `app/public/data/nba/experimental-public/2026-10-28.json`, sha256 `bde95d0b…7151fe`
- `app/public/data/nba/results/finals-2026-27.json`, sha256 `0f69f5b6…a4dda56`

## Data: `recap/results-accuracy.mjs`

`resultsAccuracy({ src, date })` returns a bundle with these fields:

- **Summary:** `{date, sport, period: "single day", games[], correct, total, missed, accuracy, accuracyDisplay, sampleSize, excluded[], claims[], sources[]}`
- **Each entry in `games[]`:**
  - `away`, `home`
  - `predictedSide`, `predictedWinner`
  - `winProbability`, `estimateDisplay`
  - `finalAway`, `finalHome`, `actualSide`, `actualWinner`
  - `correct`

`src` is `gitDataSource(repo, ref)`, which pins every read to one commit.

**Sources:**

- **Prediction:** the published lane's `game.elo.favoured`. Its family `nba_winner_side` must be an Official Forecast family in the public registry. A prediction is admitted only when it was frozen before tip.
- **Estimate:** the site accessor `eloWinProbabilityOf`, loaded from the same commit. It is never called a probability.
- **Final:** the write-once finals record (`STATUS_FINAL`). A game is left out if it is an exhibition, has a recorded conflict, or its teams differ from the lane.

**Excluded games:** a game without both a pre-tip forecast and an official final goes in `excluded[]` with a code and a reason. It is never counted and never drawn as a miss.

## Card: `render/social-results.mjs` + `render/templates/social-results/`

The template is sport-agnostic. Everything sport-specific comes from `SPORT_ADAPTERS[sport]`; only NBA exists today. To add NFL, MLB, UFC or soccer you supply two things.

**1. A data builder.** It emits the same results-accuracy bundle (the schema above) from that sport's own official forecast of record and its official finals. For each game it supplies:

- `predictedSide` (`home`/`away`) and `estimateDisplay` (or null);
- the finals;
- `actualSide`;
- `correct`;
- source paths + sha256 + commit;
- exclusions with reasons.

**2. An adapter.** It provides:

- `league`: the chip label;
- `teamOf({abbr, name})`: returns `{abbr, color, ink, accent}` from verified colour data. No logos, no scraping.
- `finalsWord`: e.g. "Finals" or "Full time";
- `separator`.
- `homeFirst` is declared on the adapter (soccer order) but the renderer does not use it yet.
- `ties`: a sport that can draw needs a third "Draw" pill and a tally rule. This is **not implemented**; such a sport must not be rendered until it is.

The disclosure comes from `DISCLOSURES[sport]` in `render/social-v2.mjs`. A sport without an adapter refuses to render.

**Layout and rules:**

- Variants are portrait 1080×1350 (up to 14 games) and square 1080×1080 (up to 12 games).
- All text is at least 22 px.
- The render refuses on any overflow.
- The same bundle on one machine gives the same PNG bytes.

## Captions

`resultsAccuracyCaptions(bundle)` writes two captions: A is factual and B is narrative.

- **Both state:** the miss count and the sample size, plus "not a long-term accuracy claim".
- **Checks:** `validateResultsAccuracyCaption` runs `recap/caption-validator.mjs` (traceable numbers, forbidden terms, a prediction word, miss disclosure, 280 characters or fewer). It also rejects bet/betting/picks/odds/probability/lock and requires both the sample size and "N missed".

## Tests

`node --test tests/results-accuracy.test.mjs` runs 7 tests:

- the Oct 28 recompute (8/12, 66.7%);
- a partial night;
- synthetic exclusions;
- card content (accuracy KPI present, removed lines absent);
- PNG size, determinism and the 22 px minimum;
- captions;
- sport adapters.

## Open

- **Not wired into the queue.** `queue-flow.mjs` has a single design approval, bound to `SOCIAL_TEMPLATE`. A new post kind needs a design approval per template version.
- **Partial nights:** a partial night renders with a "Not graded" line. Whether to post one is a judgment call.
