# "Predicted winner vs final" results graphic: gtp-social-results@1.0

**Status: PROTOTYPE, not approved.** This is a new design version. No approval of `gtp-social@2.3.2` or of the `gtp-social-accuracy@0.1` prototype carries over. It needs your design approval, and then each post needs its own approval. It is **not wired into the daily queue**.

## Review images (Oct 28 NBA)

- [`assets/nba-results-2026-10-28.png`](assets/nba-results-2026-10-28.png): 1080×1350, sha256 `7d8b0aa7ae5e52df6ead13b12c6a360a379e2cddcd9f7398887cc0f34df27de2`
- [`assets/nba-results-2026-10-28-square.png`](assets/nba-results-2026-10-28-square.png): 1080×1080, sha256 `0007d97a2c1b92e79f94352187a8655e6a5084bafa00b816fdd310e85204d0d9`

**Data:** both images come from commit `d367dd50fac6` (the 05:40Z results capture).

- `app/public/data/nba/experimental-public/2026-10-28.json`, sha256 `bde95d0b…7151fe`
- `app/public/data/nba/results/finals-2026-27.json`, sha256 `0f69f5b6…a4dda56`

**Result: 8 of 12 correct, 4 missed** (ATL, MIN, OKC, LAC). This is recomputed from those two files and matches the reconciliation report.

## Data: `recap/results-accuracy.mjs`

`resultsAccuracy({ src, date })` returns a bundle with these fields:

- `{date, sport, period: "single day", games[], correct, total, missed, excluded[], claims[], sources[]}`
- each entry in `games[]` holds: `away`, `home`, `predictedWinner`, `winProbability`, `estimateDisplay`, `finalAway`, `finalHome`, `actualWinner` and `correct`

`src` is `gitDataSource(repo, ref)`, which pins every read to one commit.

**Sources:**

- **Prediction:** the published lane's `game.elo.favoured` (rule `nba-winner-side@1`). The public registry lists `nba_winner_side` as an Official Forecast family; if that ever changes, the builder refuses. A prediction is admitted only when `frozenAt` is before tip.
- **Estimate:** the website's own accessor, `eloWinProbabilityOf`, loaded from the same commit. It is the same number as the pregame meter. It is shown as an "Elo-derived game-winner estimate" and never called a probability.
- **Final:** the write-once finals record, using `STATUS_FINAL` only. A game is left out if it is an exhibition, has a recorded conflict, or its teams differ from the lane.

**Excluded games:** a game without both a pre-tip published forecast and an official final goes in `excluded[]` with a code and a reason. It is never counted and never drawn as a miss.

The codes are:

- `NO_PUBLISHED_WINNER`
- `NOT_PRE_TIP`
- `NO_OFFICIAL_FINAL`
- `NO_PUBLISHED_FORECAST`
- `FINAL_UNDER_REVIEW`
- `TEAMS_DIFFER`
- `EXHIBITION`

## Card: `render/social-results.mjs` + `render/templates/social-results/`

**Layout, top to bottom:**

1. Logo and date chip.
2. "Predicted winner vs final".
3. "1 day · N games".
4. Hero tally: correct, missed, games. Under it, a bar with one segment per game, hits then misses.
5. One row per game:
   - team chips in the verified team colours;
   - the final score, with the winner's score bright;
   - the predicted team chip and its estimate;
   - a solid ✓ CORRECT pill (neon) or ✕ MISSED pill (amber), both the same width.
6. Footer: the context line "One day of results. Not a long-term accuracy claim.", a note explaining the estimate, the X mark with @GameTimePicksHQ, and the NBA disclosure.

**Visual rules:**

- Every miss row also carries an amber stripe and tint, so misses are as visible as hits.
- No league or club logos and no player photos.
- The fonts and logo are the V2.3 bundled assets.
- All text is at least 22 px (the render measures it).

**When the render refuses (throws):**

- any text or row overflows;
- more than 14 games (portrait) or 12 games (square);
- zero graded games.

**Determinism:** the same bundle on the same machine gives the same PNG bytes (tested).

## Captions

`resultsAccuracyCaptions(bundle)` writes two captions: A is factual and B is narrative. Both state the miss count and the sample size.

`validateResultsAccuracyCaption` runs `recap/caption-validator.mjs`, which checks:

- every number is traceable;
- the MLB pack's FORBIDDEN_TERMS;
- a prediction word is present;
- a miss is disclosed;
- 280 characters or fewer.

It then adds these checks:

- no "bet", "betting", "picks", "odds", "probability" or "lock";
- the sample size is stated;
- the miss count is stated as "N missed" or "missed N".

## Tests

`node --test tests/results-accuracy.test.mjs` runs 6 tests, all passing:

- Oct 28 recomputed from the data;
- a partial night, with 9 excluded games;
- synthetic exclusions;
- card content;
- PNG size, determinism and the 22 px minimum;
- captions.

## Not done / open

- **Not wired into the queue.** `orchestrator/queue-flow.mjs` has one design approval, bound to `SOCIAL_TEMPLATE` (`approveDesign` refuses any other version). A new post kind needs a per-template design approval. That touches the approval model the other sessions are changing, so it was left out on purpose.
- **Other sports:** NBA only.
- **Posting time:** if the finals refresh is late, the card should wait. A partial night renders with a "Not graded" line, but posting one is a judgment call.
