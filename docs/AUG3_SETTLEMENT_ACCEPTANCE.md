# Aug 3 Settlement Acceptance (Program 108-111 Lane G/H — WALL-CLOCK PENDING)

Settlement is **owned by the canonical `nightly-settle` workflow** and its finality policy.
Nothing here settles early. Last game (SD @ AZ) starts 01:40 UTC Aug 4; the nightly runs at
01:30 and 03:30 ET Aug 4.

## Frozen expectation (fill after the run)

| Field | Expected |
|---|---|
| Frozen official population | **211 rows across 7 events** (`AUG3_OFFICIAL_POPULATION_FREEZE.md`) |
| Official patch additions | 0 |
| Movement snapshots in the official denominator | 0 |
| Base board sha256 | `d2e81ca3…bebf41` unchanged |
| Uncovered event | LAD @ CHC — no rows, not a loss, absent from all denominators |

## Assertions to run (Aug 4 morning)

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks && git pull --ff-only && cd app
node scripts/public-beta-observe.mjs
npx tsx --test src/lib/mlb/base-immutability.test.mjs      # base must still be d2e81ca3…
```

1. `settled_official_rows + unresolved_policy_rows == 211`
2. `decisive == wins + losses`; void / push / unavailable / no-play excluded from the hit-rate
   denominator (the July-30 regression pins this)
3. Lineage gap `== 0` for eligible official rows
4. Research contract `asOfSettledDate == ledger newest settled date`
5. **`app/public/data/research/*.json` appear in the automated nightly commit** — this is the
   **second independent live proof** of the contract-persistence fix (first: `bbd2bdd9`). After
   this, contract persistence downgrades from active defect to monitored invariant.
6. Public `/results` date == newest legitimate settled date
7. Base board sha256 and identity digest unchanged (guard)
8. Aug 1 / Aug 2 remain absent from all settled denominators — still `NOT_MEASURABLE`

## Settlement contract checks (verified in place today)

`nightly-settle` is the sole scheduled writer (ownership guard) · the boardless-date skip is
narrow — it skips a date with **no board**, and the freshness SLO independently fails when
*today's* board is missing, so the skip cannot hide a generation failure · `research/` is in the
commit allowlist · results advance only after legitimate settlement · patch additions would
settle exactly once (none today).
