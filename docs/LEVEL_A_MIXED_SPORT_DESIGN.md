# Level A · mixed-sport model suggestions: design (DRAFT, doc only)

- **Status:** DRAFT for release-owner review. No code. Nothing here changes a switch, a gate or a published number.
- **Builds on:**
  - the Level A decision ([founder text](decisions/2026-10-23-LEVEL-A-MODEL-SUGGESTIONS.md));
  - the live cross-sport Level A cards (`level-a/suggestions.mjs`);
  - the NBA game-winner rule ([`nba-game-winner-tiers@1`](LEVEL_A_NBA_GAME_WINNER_TIERING_RULE.md)), live on all three pages since Release H.
- **Question:** may one Level A card combine legs from NBA (game winner), MLB, EPL and Ligue 1? And under what outcome semantics, provenance, grading, correlation and display rules?
- **Level B is untouched.** No price, odds, EV, payout or sportsbook link appears anywhere below.

## 1. What qualifies now

A leg qualifies only if the sport's Level A axis is OPEN (`MODEL_SUGGESTION_CAPABILITIES`), its official forecast publishes the outcome's probability, and that forecast was frozen before the event.

| Sport | Market | The leg | Its probability (verbatim, never recomputed) | Status |
|---|---|---|---|---|
| MLB | game winner | the official snapshot's `predictedWinner` | `moneyline.simulationProbability` from the latest official prediction snapshot before first pitch (10,000 full-game simulations) | qualifies (live in cross-sport cards) |
| EPL | 1X2 (90 minutes) | the most likely of home / draw / away | the EPL lane's published 1X2 probability for that outcome (`forecastRows`) | qualifies (live) |
| Ligue 1 | 1X2 (90 minutes) | the most likely of home / draw / away | the public model-only forecast's 1X2 probability (`forecastAt` stamped) | qualifies (live) |
| NBA | game winner | the official Elo favoured side (`nba-winner-side@1`) | the display accessor's exact receipt number (`eloWinProbabilityOf`), shown as the "Elo-derived game-winner estimate" | **qualifies only in NBA-only cards today**. Mixed use is the proposal in §6. |
| NFL | n/a | n/a | n/a | **CLOSED** (§8) |
| UFC | n/a | n/a | n/a | **CLOSED** (§8) |

**Not markets for Level A cards:**
- player props (no line, so no outcome to grade a suggestion on);
- spreads and totals (no Level A threshold rule yet; EPL publishes over 2.5, but no rule names a selection);
- anything priced.

## 2. Outcome semantics per market (what a leg wins on)

| Market | Wins when | Draw / push | Overtime / extra time |
|---|---|---|---|
| MLB game winner | the named team wins the official final | none: MLB has no ties (equal scores are "not final", so pending) | extra innings count |
| NBA game winner | the named team wins the official final | none: an NBA game cannot end tied (a tied "final" is quarantined as a source defect, pending) | overtime counts |
| EPL / Ligue 1 1X2 | the 90-minute result (full time, including stoppage time) equals the named outcome | "Draw" is itself an outcome. A home or away leg loses on a draw. | not counted (league formats have none; a competition with extra time grades only a declared 90-minute score) |

**What each probability means** (shown as each leg's own label, never blended into one word):
- MLB: the official simulation's win probability.
- EPL and Ligue 1: the model's probability of that 90-minute outcome.
- NBA: the Elo-derived game-winner estimate. The display's own disclosure says it is not an independently validated probability.

A mixed card must show each leg's label, so a reader never reads the NBA estimate as the same kind of number as the MLB simulation probability.

## 3. Provenance per sport (carried on every leg, recorded with it)

| Sport | Owner | Frozen time | Reference | Cross-check |
|---|---|---|---|---|
| MLB | mlb-prediction official snapshot | snapshot `generatedAt` | `mlb-prediction-snapshot:<date>:snapshot-N#<artifactHash>` (an identifier, not a repo path) | snapshot not started before generation |
| EPL | EPL lane (epl-model-v2-elo-poisson) | forecast set `generatedAt` | lane reader + event id | EPL closeout guard: only the lane reads its artifact |
| Ligue 1 | soccer-league-forecasts | row `forecastAt` | public forecast file + event id | `forecastAt` before kickoff |
| NBA | nba-official-composition@1 + the Elo display | receipt `generatedAt` (= lane `frozenAt`) | lane file + event id | the display's provenance (`receiptPayloadSha256`, `frozenAt`) equals the side's receipt; the side's p is strictly above 0.5 |

**Every leg** also passes the Level A leg gates:
- the start is known;
- it is more than 30 minutes before start;
- it was frozen before start;
- it is on the same ET product day;
- the participant is available.

## 4. Grading contract per leg (existing rules only)

| Sport | Rule | Finals |
|---|---|---|
| MLB | `settleMlbMoneyline` | committed linescores (`data/internal/mlb/linescores/<date>`) |
| EPL | `gradeSoccerLeg` match_result | the EPL lane's joined official finals (`sports/epl/official-finals.mjs`) |
| Ligue 1 | `gradeSoccerLeg` match_result | the league's committed graded finals |
| NBA | `gradeNbaLabLeg` moneyline, i.e. the NBA settlement contract | the committed NBA finals record |

**Card result:**
- any leg lost → loss;
- else any pending → pending;
- else any void → void;
- else win.

Pending and VOID are never losses. Grades are append-only, and the record is never rewritten (`level-a/grade.mjs`, live in nightly-settle). A mixed card needs no new grader: each leg routes by its sport.

## 5. Correlation and independence

- **Distinct events, distinct teams.** One leg per event. No team twice in a card (the NBA rule's guard, applied to every sport).
- **The joint is the product of the legs' published probabilities.** Every card says "Assumes the games are independent".
  - **Across sports:** different leagues and different games; no shared outcome. The assumption is mild, and stated.
  - **Within a sport, same night:** travel, schedule and league-wide scoring can relate results. This is not modelled, and the disclosure says so (the NBA card's wording, generalised).
  - **Same game:** never. A side plus a total from one game, or two outcomes of one match, would be correlated by construction, so same-game legs are excluded and not merely disclosed.
- **No correction is applied.** A copula or correlation adjustment would be a new, unvalidated model and is out of scope. The disclosure is the treatment.

## 6. Proposal: NBA game-winner legs in mixed cards

Today NBA legs appear only in NBA-only cards (rule §2, deliberately conservative). Proposed conditions for letting them join mixed cards:

1. **Same probability source.** Only the display accessor's exact number. Untiered when the display is off or the game is gated. Never imputed.
2. **Per-leg labelling.** Each NBA leg shows "Elo-derived game-winner estimate" and each MLB/soccer leg its own label. The card shows the display's accuracy disclosure once whenever an NBA leg is present.
3. **The same engine.** Mixed and NBA-only cards come from one selection function (highest joint per band, deterministic ties, distinct events and teams), so a card cannot be computed two ways.
4. **Policy and recording.** A new policy id (`level-a-mixed@1/<page>`), recorded per deployment with the exact `data-level-a-card` key, graded by the existing grader.
5. **Switch.** Its own committed constant, default false. Flipped only after a §7-style evidence package on a real slate (per-leg equality, expected cards per page and tier, band sweep, switch-OFF identity).
6. **Open question for the release owner.** Should a mixed card require that at most one leg's probability is "not independently validated" (today: NBA)? Or is per-leg labelling enough? The recommendation is labelling plus the disclosure, with no cap, because a cap would be a methodology constant needing its own source and approval.

## 7. Bands and rounding (shared, unchanged)

- **Bands.** The founder-approved D2 bands on the model-fair price `1 ÷ joint` (`tierForJoint`), the same function for every Level A card. The band is decided on the exact joint and never moved to fit the text.
- **Shown joint.** `jointShownFor(joint, tier)`: 1 dp, with extra decimals only where 1 dp would read as the neighbouring band (e.g. 0.4987 is Medium, so "49.87%").
- **Shown leg %.** Each sport's own published text: soccer and MLB at 1 dp of the published probability; NBA as the display's whole-percent text (decimals only on ties).
- **Leg counts.** Bank Builder: 2 legs, Low or Medium. Moonshot: Longshot, up to `BAND_MAX_LEGS.longshot`. Parlay Center: 2 to `BAND_MAX_LEGS[tier]`.

## 8. What would open NFL and UFC

| Sport | Why CLOSED | What would open it |
|---|---|---|
| NFL | No reader of the NFL official game forecast has been reviewed for Level A. A forecast of record exists: the latest `nfl-regular-season-public-v1` receipt before kickoff (forecast-ledger adapter). | (1) a Level A reader that takes the forecast of record's published side and probability verbatim, frozen before kickoff; (2) the outcome semantics for an NFL winner leg (ties are possible in the NFL, so a "tie" outcome needs a stated grading rule: VOID, never a loss); (3) the NFL settlement contract wired into the Level A grader; (4) release-owner review of (1)–(3) and the switch. |
| UFC | The UFC moneyline is a de-vigged market price with a capped nudge, not an independent forecast. A Level A leg would be a sportsbook price relabelled as a model. | An independent model probability (not derived from market prices) with a frozen pre-event record and a forward evaluation. Until then, UFC stays CLOSED for Level A regardless of any other change. |

## 9. Non-goals

- No new probability, line, odds or payout.
- No player props.
- No Level B change.
- No change to any published forecast or graded record.
- No change to the NBA game-winner rule.
