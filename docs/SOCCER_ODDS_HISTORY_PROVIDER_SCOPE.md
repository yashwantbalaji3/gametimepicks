# Soccer Odds-History Provider Scope (2026-07-14)

The single blocker to declaring the engine public-ready is a **market baseline**: closing 1X2/total/BTTS odds for
a settled match set, de-vigged, so we can ask "does the engine beat the price?" This scopes exactly what data is
needed and where it can come from. Nothing here is assumed — verified facts are marked.

## What we have today (verified)
- **The Odds API** is the repo's odds provider (`ODDS_API_KEY` in `.env`, `api.the-odds-api.com`, sport key
  `soccer_fifa_world_cup`). Used live for 2026 (`odds-discovery-*.json`). Snapshots committed are **2026 only**.
- **API-Football free plan: NO historical 2022 odds** — probed `/odds?fixture=…&season=2022` → `results: 0`,
  `errors: []`. Confirmed unavailable, not a bug.
- No committed pre-2026 odds snapshots anywhere in the repo.

## Required market-baseline fields (per match, per market)
```
fixtureId            // join key to wc-2022-results.json
kickoffUtc
snapshotTimestamp    // MUST be < kickoff (closing = last snapshot before KO)
bookmaker            // or a consensus across books
market               // h2h (1X2) | totals | btts
rawOdds              // decimal/american per outcome
impliedProbRaw       // 1/decimal
overround / vig      // sum(impliedRaw) − 1
impliedProbDeVig     // raw normalized to sum 1  <-- what the engine is compared against
```
The de-vigged 1X2 is the baseline for Brier/RPS/log-loss vs the engine. Totals + BTTS enable the secondary
comparisons.

## Provider options
| Option | Gets 2022 WC closing 1X2? | Totals/BTTS? | Status | Notes |
|---|---|---|---|---|
| **The Odds API — `/v4/historical/sports/soccer_fifa_world_cup/odds`** | Yes (historical snapshots, provider covers back to ~2020) | Yes (h2h, totals; BTTS varies by book) | **Paid add-on** — historical endpoints are not on the free/basic key | Best fit: repo already integrates this provider. Verify the current plan includes historical + the credit cost before building. |
| API-Football `/odds` (paid) | Coverage varies by plan/season | Partial | Paid | Free plan confirmed empty for 2022; a paid tier *may* backfill — must verify. |
| Manual/CSV archive (e.g. football-data.co.uk) | Yes (1X2 closing for major leagues/cups, free CSV) | Partial (1X2 + some O/U) | Free but manual | Honest fallback for a one-off 2022 baseline; not an automated pipeline. |

## Cost / call estimate (The Odds API historical)
- ~**64 matches × 1 closing snapshot** (timestamped just before each kickoff).
- Markets: h2h + totals (+ btts where available) ≈ 3 → snapshots cost credits per market×region. Rough order:
  **~1,500–2,000 credits** for the full 2022 WC baseline (confirm exact per-snapshot cost against the plan).
- One-off, not recurring — this is a **backtest** fetch, not a daily pipeline.

## Avoiding lookahead (critical)
- Use the **last snapshot strictly before kickoff** as "closing." Never a post-kickoff or settled-line snapshot.
- Store the `snapshotTimestamp` and assert `snapshotTimestamp < kickoffUtc` at ingest; drop matches that fail.
- De-vig per snapshot (not across time) so the baseline is a genuine pre-match price.

## Storage (internal-only, same pattern as the results/FIFA refs)
```
data/internal/world-cup/reference/wc-2022-closing-odds.json   // public:false, keyed by fixtureId
```
Then extend `backtest-soccer-2022-wc.mjs`: join odds by fixtureId, compute market Brier/RPS/log-loss, and add a
`marketComparison` block (model − market on each proper score). Only if the model **matches or beats** the market
does `verdict.publicReady` become eligible to flip (with founder approval).

## Definition of done
1. `wc-2022-closing-odds.json` exists, de-vigged, all timestamps `< kickoff`, ≥ ~55/64 matches covered.
2. Backtest emits model-vs-market Brier/RPS/log-loss.
3. Doc states plainly whether the engine beats, matches, or loses to the closing market.
4. Only then does the public-readiness conversation open. Until then: internal, market baseline **unavailable**.
