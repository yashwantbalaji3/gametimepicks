# Level A · NBA game-winner tiering rule (`nba-game-winner-tiers@1`)

- **Status:** ACCEPTED FOR IMPLEMENTATION (release owner review 2026-10-23). Public switch: after every §7 acceptance check passes (founder conditional approval, 2026-10-23, relayed by the release owner: no further routine go). The amendments from the reviews are folded into the sections below and listed in §8 and §10.
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
3. **Probability: one source.** The tiering reads the probability only from the NBA model session's public display accessor, for that same game:
   - the accessor returns null when the display switch is OFF or the game is gated, and null means untiered;
   - any tiered NBA card therefore needs both switches ON (the display's and `NBA_GAME_WINNER_TIERS_PUBLIC`), and turning the display OFF removes every tier with no other change;
   - receipts are read only for the §1.4 cross-check, never as a second probability source;
   - the published side's Elo probability is `pHome` if the side is home, `1 − pHome` if away, copied exactly as the accessor returns it and never recomputed from ratings;
   - it is never taken from the v0.1 simulation (`sim.pHome`), the v1 supporting simulation, or any market price.
4. **Provenance agrees.** The probability and the side come from the same frozen receipt: the same `providerEventId`, the same `frozenAt`, the same receipt `payloadSha256`.
   - The published side must be the team with Elo probability strictly above 0.5 (the display's own rule; exactly 0.5 is TOO_CLOSE, which has no side).
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
- **Same game, duplicate events and teams.** One leg per game (a repeated event id counts once). No team may appear twice in a card, even across different event ids: an NBA team plays at most once a night, so this guard only ever rejects a malformed input, but it is enforced, not assumed.
- **Leg counts.** 2 to `BAND_MAX_LEGS[tier]` legs, with the same caps as the Level A cross-sport policy (Low 2, Medium 3, High 4, Longshot 5).
- **Selection.** For each tier, the qualifying combination with the highest joint probability wins. Ties are broken by the sorted event-id key (deterministic). If none qualifies, the tier shows no card and says why, e.g. "no two of tonight's favourites combine into the Low Risk band; 3 combinations are shorter than the Low band, so not tiered".
- **Products (founder mandate, 2026-10-24).** One engine, three placements, each with its own policy under the `nba-game-winner-tiers@1` family:

| Page | Policy | Rule |
|---|---|---|
| Parlay Center (/build) | `nba-game-winner-tiers@1/parlay-lab` | one card per tier (Low, Medium, High, Longshot), 2 to `BAND_MAX_LEGS[tier]` legs |
| Bank Builder | `nba-game-winner-tiers@1/bank-builder` | conservative: exactly 2 legs, Low or Medium band, highest joint |
| Moonshot | `nba-game-winner-tiers@1/moonshot` | Longshot band, up to 5 legs, highest joint (two favourites never reach Longshot, so in practice 3 to 5) |

  Every card shows a probability % only, with the independence disclosure. No odds, no payout. An empty slot says why.

## 3. How the joint is formed

- **joint** = the product of the legs' published Elo probabilities, over distinct games.
- That product **assumes the games are independent**. Every card says so verbatim ("Assumes the games are independent"), as on all Level A cards. Correlation between same-night games is not modelled and is not corrected for; the disclosure is the treatment.
- Same-night NBA results can be related (shared travel, schedule spots, league-wide scoring trends). That is not modelled, and the disclosure says so.

## 4. Which bands

- The same founder-approved D2 bands as every Level A card, applied to the model-fair price `1 ÷ joint` (`getRiskBucketForCombinedOdds`). A tier therefore means the same thing on NBA cards as on cross-sport cards:

| Tier | Fair price of 1 ÷ joint | Joint probability |
|---|---|---|
| Low Risk | −200 … +100 | 0.500 – 0.667 |
| Medium Risk | +100 … +300 | 0.250 – 0.500 |
| High Risk | +300 … +600 | 0.143 – 0.250 |
| Longshot | above +600 | below 0.143 |

- A joint above 0.667 is untiered: it is shorter than the Low band. It is said aloud ("shorter than the Low band, so not tiered"), as D2 does everywhere, and is never dropped silently.
- Every leg is a favourite (p > 0.5), so these follow from the numbers alone:
  - Low needs two strong favourites, e.g. 0.75 × 0.75 = 0.5625.
  - Longshot needs at least three legs.
- Cards show a model probability %, never odds, payout or EV. The fair price is used only to place the tier. It is never displayed as a price.

## 5. What every tiered NBA card says

- "Model joint probability X%", plus each leg's published Elo probability, its source (the NBA model session's display, with its frozen time) and its receipt reference.
- **Rounding.** Each leg % is the display's own text (whole percent), character for character. The joint is ours to format and is shown at 1 dp, like every Level A card ("model joint probability 22.1%", the text the recorder matches). The tier comes from the exact joint and never moves to fit the text. Just past a band edge, where the 1 dp text would read as the neighbouring band (0.4987 is Medium at +101, but "49.9%" bands Low), that card alone shows the extra decimals that keep the text in its band (at most 4 dp). Amended by the release owner, 2026-10-23.
- "Assumes the games are independent."
- The display's validation label, imported from the display's own label constant (one source, never a copied sentence), so the two can never disagree.
- "No sportsbook price. Settles on the official final."

## 6. Switch, recording, grading

- **Switch.** A committed constant, `NBA_GAME_WINNER_TIERS_PUBLIC = false`, in the Level A module. It is separate from `LEVEL_A_SUGGESTIONS_PUBLIC`. An `NEXT_PUBLIC_…` override exists for local and preview builds only. The release owner flips the constant after acceptance; rollback is flipping it back.
  - Turning it on still shows nothing for a game until the NBA model session's display publishes that game's probability.
- **Recording.** Tiered NBA cards are appended to the Level A record (`data/internal/products/level-a/suggestions.jsonl`) under policy `nba-game-winner-tiers@1`, with `priced:false, price:null, payout:null`.
  - Only while `NBA_GAME_WINNER_TIERS_PUBLIC` is on, so the record holds only cards readers saw. Recording a tiered NBA card while the switch is OFF is a test failure.
  - Nothing is recorded at or after the first tip.
  - A changed card is written as a revision.
  - Existing rows are never rewritten.
- **Grading.** Forward only: the NBA settlement contract (moneyline winner, official final), through the Level A forward grader for every policy in the `nba-game-winner-tiers@1` family. A card loses when any leg loses; pending and VOID are never losses. No retroactive grading of earlier days, and no change to any existing forecast or graded record.
- **Publication cutoff.** The Level A leg gates apply unchanged: a leg leaves every card 30 minutes before its tip (and the record never holds a card shown at or after its first tip).

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

## 8. Release-owner review (2026-10-23): answers and amendments

1. **Placement.** Its own "NBA game winners" block in the Parlay Center only. Not in Bank Builder or Moonshot.
2. **Validation label.** Imported from the display's label constant. A test asserts it is the same string as the display's.
3. **Above 0.667.** Untiered and said aloud, as D2 everywhere.
4. **One probability source.** The display accessor only (§1.3). Tests:
   - display OFF → no tier;
   - display gated for a game → that leg untiered;
   - both switches ON → tiers.
5. **Recording.** Only while the public switch is on (§6).
6. **Rounding.** The shown leg % equals the display's shown %. The joint is shown at 1 dp, with more decimals only at a band edge, and the tier is never moved (§5; amended: the joint was first proposed at the display's precision, which would show a 0.2496 High card as "25%").
7. **Accessor dependency.** No code is built against an imagined accessor. The pure rule and its refusals are written first against a fixture. The accessor integration stacks on the NBA model session's draft PR (merge, never force-push).

## 10. Founder mandate (2026-10-24, relayed by the release owner)

1. **Placement superseded.** §8.1's "Parlay Center only" is replaced: NBA game-winner suggestions appear on the Parlay Center, Bank Builder and Moonshot (§2 Products), all behind `NBA_GAME_WINNER_TIERS_PUBLIC`.
2. **Recording.** The per-deployment recorder covers all three pages' NBA cards. Each card carries a `data-level-a-card` key (policy, tier, games, shown joint) and the recorder matches it exactly.
3. **Wording.** The NBA display's number is the "Elo-derived game-winner estimate" (its constant `ELO_WIN_PROBABILITY_LABEL`). This rule's own text never calls it a probability; only the card's own joint is a "model joint probability".
4. **Missing estimate.** A game the display does not publish (switch off, gated, or a slate published without the field) stays an untiered side-only suggestion. Never imputed.

## 9. Implementation order

1. The pure rule (legs, refusals, joint, bands, selection, copy text) against a FIXTURE accessor, behind `NBA_GAME_WINNER_TIERS_PUBLIC = false`.
2. Wire the real accessor, stacked on the NBA model session's display PR.
3. The §7 verification, then the founder go for the public switch.
