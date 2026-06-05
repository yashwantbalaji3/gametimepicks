# Alternate Lines — Shadow Fetch Audit (auto-generated)

> `app/scripts/audit-alternate-lines-shadow.mjs --write-report` · READ-ONLY.
> Source: gitignored shadow cache (NOT public, NOT committed). One approved
> paid MLB spike. No public/optimizer/projection/UI change.

## Spike: 2026-06-04 (fetched 2026-06-05T01:28:59.967Z; **10 credits**, 5 events)

## Headline finding
- **Alternate markets EXIST** (428 rungs across 84 players, 157 ladders).
- **BUT they are ONE-SIDED (Over-only ladders): two-way completeness = 0/428 → de-viggable = 0/428.**
- MLB alternate batter props are "N+ hits / N+ total bases" Over ladders with no paired Under, so the two-way de-vig (impliedOver/(impliedOver+impliedUnder)) cannot be computed for the alternate rungs.

## Counts
- records by source market: batter_hits_alternate=191, batter_total_bases_alternate=237
- distinct players: 84 · distinct ladders (player|market): 157 · multi-rung ladders (≥2): 134
- validationStatus: partial=428
- duplicate exact rungs: 0

## Resolution / completeness
- playerId resolved (via board join): **359/428** (84%)
- gameId resolved: **378/428** (88%)
- two-way odds: **0/428** · de-viggable: **0/428**

## Main-line comparison (alt rung vs board main line)
- lower than main: 7 · same: 85 · higher than main: 217 · unknown (no board main): 119

- example ladder: `Michael Harris II|batter_total_bases` lines = [2.5, 3.5, 4.5]

## Grading readiness
- **Gradable: YES (one-sided).** An Over rung settles vs the existing final stat (`actual > line` → hit), exactly like main-line grading — no new stat source needed.
- **De-viggable: NO.** One-sided rungs have no paired Under, so the two-way de-vig (the basis of the hardened launch gate) cannot be computed. Only RAW implied prob (vig-inclusive) is available.

## Shadow-watchlist eligibility
- **NOT eligible** under the current methodology. The launch gate requires beating the **de-vigged** market with a corrected CI; one-sided alt rungs cannot be de-vigged, so they cannot clear that gate. Using raw (vig-inclusive) implied would be a weaker, biased baseline and is not used as a quality signal.

## Verdict / recommendation
- **STOP — do not proceed to launch-oriented shadow grading of these alternate lines.** They are one-sided (de-vig blocked). This matches the documented STOP condition ("provider returns one-sided/unusable lines").
- Options to revisit later (each its own decision): (a) source a **two-way** alternate feed (paired Under) if the provider offers it for other markets/books; (b) build a one-sided **calibration** method that compares Over-rung hit rate to RAW implied (explicitly weaker, vig-inclusive — not a market-beat claim); (c) use alt rungs only as a **display ladder** (higher line → lower de-vigged-from-main probability → bigger payout) with neutral copy, NOT as a validated edge.

*Read-only; shadow data is local-only (gitignored). No public/model/data change.*
