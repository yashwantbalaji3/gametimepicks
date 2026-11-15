# NCAAF → Universal Forecast Ledger: adapter proposal (NCAAF-006.8)

**For the shared ledger owner + founder. Nothing here is wired.** The NCAAF lane has made no change to any
`forecast-ledger/` file.

## What exists (NCAAF-local)

`app/src/lib/sports/ncaaf/ledger-proposal.mjs` maps one event's **forecast of record** + its NCAAF grade onto
ledger rows with the ledger's own `makeRow`, `measureBinary`, `measureContinuous` and `marketBlock`:

| Family | Subject | Kind | Source |
|---|---|---|---|
| `ncaaf_winner` | GAME (provider event id) | BINARY_PROBABILITY | C1 P(home win) |
| `ncaaf_margin` | GAME | CONTINUOUS_PROJECTION (80% range) | C2 mean margin, home − away |
| `ncaaf_total` | GAME | CONTINUOUS_PROJECTION (80% range) | C2 mean total |
| `ncaaf_team_points` | TEAM `ncaaf-team-<ESPN id>` ×2 | CONTINUOUS_PROJECTION | C2 mean team points |

`recoverability: EXACT_FROZEN` (write-once pre-kickoff receipts). The market block carries the captured line,
moneyline and de-vigged `impliedProbability`, and never a model probability.

## Evidence (`ledger-proposal.test.mjs`, 4 tests)

- SHADOW / RESEARCH_ONLY / WITHHELD / UNAVAILABLE receipts → **0 rows**. Every NCAAF receipt today is SHADOW,
  so wiring the adapter now would add nothing to public history.
- For a hypothetical PUBLISHED receipt, the ledger's own `validateRow` returns exactly **`["sport NCAAF"]`** for
  all 5 rows. The sport allowlist is the only contract obstacle.
- Identities are distinct and never equal an NFL row for the same provider event id.
- Pending rows carry no measurement. VOID stays VOID.

## Requested shared changes (only after a founder decision to publish an NCAAF family)

1. `app/src/lib/forecast-ledger/contract.mjs`: `SPORTS` += `"NCAAF"`.
2. `app/scripts/results/build-forecast-ledger.mjs`: import the adapter, read
   `data/internal/research/ncaaf/{forecasts,grades}/`, select the forecast of record per event
   (`forward.mjs forecastOfRecord`), emit rows into `ncaaf.jsonl`.
3. Parity test: ledger Brier/log loss equal the NCAAF grader's own numbers (same pattern as NFL/EPL/UFC).

Not requested: any change to identity, append-only rules or measurement.
