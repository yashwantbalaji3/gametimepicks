# Market Disagreement Explorer — phase 2

The public research surface that puts the sportsbook price, the simulation's own output, the
calibrated figure, the outcome, and the historical record of similar disagreements on one row.

- Route: `/markets`, bounded section below the Market Center
- Component: `app/src/components/research/disagreement-explorer.tsx` (client, presentation only)
- Arithmetic: `app/src/lib/research/disagreement-buckets.ts` (pure)
- View assembly + copy: `app/src/lib/research/disagreement-explorer.ts` (pure)
- Server assembly: `app/src/lib/research/disagreement-explorer-loader.ts`
- Guard test: `app/src/lib/research/disagreement-explorer.test.mjs`
- Data: `app/public/data/research/row-lineage/` (see `RESEARCH_ROW_LINEAGE_CONTRACT.md`)

## 1. What a row shows

| Field | Source |
|---|---|
| Sportsbook probability | board `impliedOver`/`impliedUnder`, de-vigged (`deVigTwoWay`) |
| Simulation probability | board `modelProbOver`/`modelProbUnder` — raw, never overwritten |
| Calibrated probability | Platt calibrator fitted on strictly earlier dates (`platt-1`) |
| Difference | **raw minus sportsbook**, signed percentage points |
| Outcome | ledger `outcome`, mapped to Came in / Did not come in / Voided / Not settled / Withheld |
| Similar-difference history | `n`, observed rate, Brier, 95% Wilson interval, window |
| Market policy | registry status + calibration record; `batter_total_bases` marked disabled |
| Lineage state | six-state coverage label + plain-English meaning |
| Provenance detail | capture time, first pitch, captured no-vig price, grading source, event id |

### Why the difference uses the raw number

The raw output is the evidence — unmodified by anything fitted afterwards — and the historical table a
row is compared against is built the same way. Measuring the row against the calibrated figure and the
history against the raw one would put a row in a bucket that does not describe it. The calibrated
figure is shown beside it as its own layer.

### Why the difference uses the board price, not the archive's captured price

Both are real. The archive captured the price at its own moment and the board at another; on
2026-07-27 they differ by about 1 pp on average and up to 4 pp. The difference is measured against the
board price so a row is comparable with the table, and the archive figure is shown in the row's
provenance detail with a note saying exactly that.

## 2. Which rows are listed

Only rows where `rowLevelClaimAllowed` (coverage `PROVEN_*`) **and**
`pregameEligibility.researchEligible`. Both, not either: a proven capture time that turns out to be
after first pitch is precisely what the eligibility gate catches, and it is not shown as pregame
evidence.

Everything else is still counted. The header states `listed of total` for the slate, and the excluded
rows appear inside the historical ranges where every denominator is shown. On 2026-07-27 that is 177
of 557.

## 3. Ordering

**Default: event time**, then row id. Never probability, never difference. The most prominent position
on a research surface is itself a claim, and the measured record makes the largest disagreements the
worst-performing rows on the board.

**Optional: largest difference.** Offered only when `largestGapCaution(table)` returns a sentence, and
the sentence renders in the same view. It is derived from the shipped table rather than hardcoded, so
it cannot drift from the data. Current output:

> Ordering by the size of the difference finds disagreement; it ranks nothing. Across settled history
> (2026-05-16 to 2026-07-27), rows 20 pp or more above the market came in 46.1% of the time over 1,593
> rows with a Brier score of 0.313, while rows within 2 pp of the market came in 47.4% over 2,606 rows
> with a Brier score of 0.241. A higher Brier score is a worse one, so on that measure the largest
> disagreements have been the least accurate rows on the board, not the most.

The direction of that claim is taken from the **Brier scores**, not the hit rates: adjacent hit rates
sit inside each other's intervals, while the Brier score separates the ranges cleanly.

`batter_total_bases` is excluded from the ranked list outright and returned in a "Not placed in this
ordering" block with the reason. Its full-corpus hit-rate interval sits entirely below 50%, and a
disabled market anywhere in a magnitude-ordered list is a recommendation-shaped placement.

## 4. Measured history

Signed difference between the simulation's probability for the side it leaned and the same side's
de-vigged price, over the settled corpus, quarantined rows excluded:

| Range | n | Came in | 95% interval | Brier |
|---|---|---|---|---|
| 2 pp or more below the market | 0 | — | — | — |
| within 2 pp of the market | 2,606 | 47.4% | 45.4%–49.3% | 0.241 |
| 2–5 pp above | 4,150 | 52.5% | 51.0%–54.0% | 0.240 |
| 5–10 pp above | 6,175 | 51.9% | 50.7%–53.2% | 0.245 |
| 10–20 pp above | 7,073 | 49.3% | 48.2%–50.5% | 0.266 |
| 20 pp or more above | 1,593 | 46.1% | 43.6%–48.5% | 0.313 |

21,597 rows counted; 36 excluded as withheld. The negative range is empty because the published board
only leans in the direction the simulation favours; it stays in the table so an empty range renders as
"no observations" rather than vanishing.

## 5. Suppression rules

- `n = 0` → no rate, no Brier, no interval, and a stated `suppressedReason`. Never 0%, which reads as
  a measured result.
- A row an integrity gate refused (`countsTowardRates: false`) never reaches a denominator, and the
  count of what was dropped travels with the table as `excludedRows`.
- A range made entirely of withheld rows produces `n = 0` and no rate — a quarantined slate can never
  acquire a hit rate by being bucketed.
- Every rate that is shown carries its denominator, its window and its interval.

## 6. Copy constraints

No wager, stake, bet, ROI, bankroll, edge, lock, value, advantage, guarantee, payout, profit or unit
language anywhere on the surface. The guard scans **rendered strings** — the output of every copy
function, across fixtures covering each branch, plus every sentence produced for the live slate — not
the source text, because a sentence assembled at runtime from three fragments is invisible to a grep.
The component file is scanned as source in addition, and is separately asserted to contain no
statistics of its own (`reduce`, division by a denominator, `Math.sqrt`).

## 7. Analytics

Three v2 contract events, wired to real controls only, surface `research` (distinct from the Market
Center's `markets` on the same page so the counts stay readable):

| Event | Control |
|---|---|
| `market_disagreement_opened` | switching to the largest-difference ordering |
| `market_row_opened` | expanding a row |
| `probability_explainer_opened` | opening "How these three numbers are built" inside an expanded row |

Each carries only `{ dayBucket, surface, sport, marketFamily }` — a coarse family bucket, never a line
or price. All three route through `resolveSink(readSinkConfig())`, which is `NOOP_SINK` until a
provider is approved and configured. Nothing leaves the browser today.

## 8. Empty states

`explorerUnavailableReason` names the precondition that failed rather than saying "no data":

- lineage artifact absent → rows are not shown without it, because a row with no provenance record
  cannot be described honestly;
- no settled slate has a lineage file yet;
- the slate has a file but no row on it has a pregame capture record.

## 9. Rebuild

```bash
cd app
npx tsx scripts/build-research-row-lineage.mjs --now <ISO> --write
npx tsx --test src/lib/research/disagreement-explorer.test.mjs
```

The explorer reads the exported artifacts and nothing else; it does not recompute the table. A surface
that recomputes what an artifact already states is how two pages end up disagreeing with each other.

## 10. Known limits

- MLB player props only. Team markets (`h2h`, `spreads`, `totals`) exist in the pregame archive but not
  on the board's lean rows, so they have no simulation probability to compare.
- Coverage is 2026-07-21 onward. Everything earlier is `LEGACY_UNSTAMPED` and contributes only to the
  aggregate table.
- No line movement, no opening price, no trend: no retained snapshot series exists.
- The section shows a **settled** slate on a page whose upper half shows the **live** market. It states
  its own date for that reason.
