# Proposal: preregistration §13 amendment A, projection-only player boards (DRAFT, not in force)

**Status:** PROPOSED for founder decision. It changes nothing until the founder records it in `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` §13.

**Requested by:** the founder, 2026-10-20 (in chat): "projection-only player boards, filter by matchup / team / player / stat, sort by projection; PRA / P+R / P+A / minutes".

## Why an amendment is needed

§13 as recorded publishes v0.1 medians for PTS / REB / AST / 3PM plus expected minutes. Players are "listed by expected minutes, never ranked", and "Top-10 rankings" are withheld. Two requested features are outside that scope:

1. **Sorting by projection** is a ranking.
2. **PRA, P+R and P+A** are not among the published player figures.

Filtering by matchup, team or player changes no number and no order. It sits inside §13 if the default order stays expected minutes.

## Proposed text (amendment A)

> **Projection-only board view.** The `/nba` lane may present the same snapshot's figures as a filterable table. The filters are matchup, team, player and stat (PTS / REB / AST / 3PM, and PRA / P+R / P+A when published below).
>
> The default order is expected minutes. A reader may re-sort a column by the median. That is a reader's sort, not a published ranking. No rank number, "top" wording, highlight or badge is shown.
>
> **Combination medians.** PRA, P+R and P+A medians from the same v0.1 receipt, which are joint sums over the same simulated draws, may be published to 1 dp. They carry the label "sum of independently simulated components within a player (v0 engine)".
>
> R+A, steals, blocks and turnovers are not modelled and are never shown.
>
> Unchanged from §13:
> - no odds, lines, leans, edges, EV, probabilities, ranges or picks;
> - the UNVALIDATED EXPERIMENTAL SIMULATION notice;
> - every figure copied from the receipt and re-derived by the producer;
> - the registry stays `HISTORICAL_ONLY`.

## Engineering already available (drafts, not merged)

- **Canonical source.** #1149 marks exactly the lane cells (`publicDisplay: MEDIAN_1DP`), and the audit compares the lane with the snapshot. Amendment A would extend `publicDisplay` to pra / ptsReb / ptsAst.
- **Board rows.** The #1151 row view model and table already offer filters and sorts. Its price cells read "No authorized NBA price".
- **Producer.** `build-nba-experimental-public.mjs` would add the three combo medians. A `snapshotMatchesSource` re-derivation pin goes with them.

## Cost and risk

- **Page weight.** `/nba` sits near its budget, about 236 KB, and three more columns × ~55 players adds to it. A collapsed "Combinations" group, or a separate projection-board route, keeps first view light. This needs measuring after a build; no budget raise without justification.
- **Builds.** One Production build per release; the daily lane publish (#1150) is unchanged.

## Decision requested

Approve amendment A as written, approve it without combos, or defer it.
