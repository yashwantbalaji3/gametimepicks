# Level A · NBA game-winner tiering rule (`nba-game-winner-tiers@1`)

- **Status:** PROPOSED. For the release owner to review before any card is built. No code implements it yet.
- **Authority:** the founder decision of 2026-10-23, as relayed by the release owner. It approves preparing a separately identified Elo game-winner probability display, sourced from the existing frozen official forecast, with consistent provenance across pages. It requires that Elo probabilities are not used automatically to tier player props or mixed parlays: a documented game-winner-specific tiering rule must be implemented and verified first. Existing forecasts and grading stay immutable.
- **Ownership:**
  - The probability *display* belongs to the NBA model session (official composition and provenance).
  - This document owns only the *tiering rule* that turns published NBA game-winner probabilities into Level A tiers.
- **Relation to Level A** ([decision](decisions/2026-10-23-LEVEL-A-MODEL-SUGGESTIONS.md)):
  - Non-transactional: no price, odds, EV, payout or sportsbook link.
  - The existing side-only NBA suggestions stay public and unchanged.

## 1. Which legs

A leg is eligible only if all of these hold:

1. **Sport and market.** NBA, market `winner` (full game, settled on the official final including overtime). Spreads, totals and player props are excluded, including player points: those have no line and are never legs.
2. **Selection.** The leg is the official forecast's own published side: the Elo favoured team from the frozen `nba-winner-side@1` record. No other selection is allowed, so no card ever picks against the official side.
3. **Probability.** It comes only from the published Elo game-winner probability for that same game, as shown by the NBA model session's display:
   - the published side's Elo probability is `pHome` if the side is home, `1 − pHome` if away;
   - it is copied exactly as published, never recomputed from ratings;
   - it is never taken from the v0.1 simulation (`sim.pHome`), the v1 supporting simulation, or any market price.
4. **Provenance agrees.** The probability and the side come from the same frozen receipt: the same `providerEventId`, the same `frozenAt`, the same receipt `payloadSha256`.
   - The published side must be the team with Elo probability ≥ 0.5.
   - If either check fails, the leg is refused as `PROVENANCE_MISMATCH` and is not tiered.
5. **The usual Level A leg gates apply unchanged:**
   - the start is known;
   - tip is more than 30 minutes away;
   - the forecast was frozen before tip;
   - the game is on the same ET product day;
   - the participant is available.

**A missing probability is never imputed.** If the display does not publish a probability for a game, the leg stays the existing side-only, untiered suggestion ("Untiered: no published NBA win probability"). That applies whether the display is withheld, not yet live, or blocked by its own gate. Such a leg is never in a tiered card and never counts toward one.

## 2. Which cards

- **NBA-only.** Every leg in a tiered NBA card is an NBA game-winner leg under §1. There are no mixed-sport cards with NBA, and NBA legs never join the cross-sport Level A cards.
- **Distinct games.** One leg per game. An NBA team plays at most once per night, so legs on the same night never share a team.
- **Leg counts.** 2 to `BAND_MAX_LEGS[tier]` legs, with the same caps as the Level A cross-sport policy (Low 2, Medium 3, High 4, Longshot 5).
- **Selection.** For each tier, the qualifying combination with the highest joint probability wins. Ties are broken by the sorted event-id key (deterministic). If none qualifies, the tier shows no card and says why.

## 3. How the joint is formed

- **joint** = the product of the legs' published Elo probabilities, over distinct games.
- That product **assumes the games are independent**. Every card says so verbatim ("Assumes the games are independent"), as on all Level A cards.
- Same-night NBA results can be related (shared travel, schedule spots, league-wide scoring trends). That is not modelled, and the disclosure says so.

## 4. Which bands

- The same founder-approved D2 bands as every Level A card, applied to the model-fair price `1 ÷ joint` (`getRiskBucketForCombinedOdds`). A tier therefore means the same thing on NBA cards as on cross-sport cards:

| Tier | Fair price of 1 ÷ joint | Joint probability |
|---|---|---|
| Low Risk | −200 … +100 | 0.500 – 0.667 |
| Medium Risk | +100 … +300 | 0.250 – 0.500 |
| High Risk | +300 … +600 | 0.143 – 0.250 |
| Longshot | above +600 | below 0.143 |

- A joint above 0.667 is untiered: it is shorter than the Low band. The card is not shown, and the slot says why.
- Every leg is a favourite (p ≥ 0.5), so these follow from the numbers alone:
  - Low needs two strong favourites, e.g. 0.75 × 0.75 = 0.5625.
  - Longshot needs at least three legs.
- Cards show a model probability %, never odds, payout or EV. The fair price is used only to place the tier. It is never displayed as a price.

## 5. What every tiered NBA card says

- "Model joint probability X%", plus each leg's published Elo probability, its source (the NBA model session's display, with its frozen time) and its receipt reference.
- "Assumes the games are independent."
- "This probability has not yet been validated on graded regular-season NBA games." The wording comes from the display's own label, verbatim, so the two never disagree.
- "No sportsbook price. Settles on the official final."

## 6. Switch, recording, grading

- **Switch.** A committed constant, `NBA_GAME_WINNER_TIERS_PUBLIC = false`, in the Level A module. It is separate from `LEVEL_A_SUGGESTIONS_PUBLIC`. An `NEXT_PUBLIC_…` override exists for local and preview builds only. The release owner flips the constant after acceptance; rollback is flipping it back.
  - Turning it on still shows nothing for a game until the NBA model session's display publishes that game's probability.
- **Recording.** Tiered NBA cards are appended to the Level A record (`data/internal/products/level-a/suggestions.jsonl`) under policy `nba-game-winner-tiers@1`, with `priced:false, price:null, payout:null`.
  - Nothing is recorded at or after the first tip.
  - A changed card is written as a revision.
  - Existing rows are never rewritten.
- **Grading.** Forward only: the NBA settlement contract (moneyline winner, official final). No retroactive grading of earlier days, and no change to any existing forecast or graded record.

## 7. Verification before the switch is flipped

1. Unit tests:
   - every refusal (no probability, provenance mismatch, side/probability disagreement, cutoff, product day);
   - distinct games;
   - band edges at exactly 0.5, 0.25, 0.143 and 0.667;
   - deterministic ties;
   - NBA-only (a mixed input never yields a mixed card);
   - no price, odds or payout anywhere in the card or its copy text.
2. Real data, using a day with the display live:
   - every NBA leg's probability equals the display's number for that game, exactly;
   - its receipt sha and `frozenAt` equal the side's.
3. A flag-ON preview build, browser-checked by the release owner against expected values sent in advance.
4. A flag-OFF build is identical to today's for NBA: side-only, untiered.

## 8. Questions for the release owner

1. **Placement.** Proposal: a separate "NBA game winners" block in the Parlay Center (one card per tier). Not in Bank Builder or Moonshot until they are reviewed separately.
2. **Validation label.** Use the display's own sentence verbatim (proposed), or a fixed sentence owned here?
3. **The Low upper edge.** Leave joints above 0.667 untiered (proposed: the same D2 rule as everywhere), or exclude them silently?
