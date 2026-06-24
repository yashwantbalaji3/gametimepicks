# June 23 Settlement Verification

_Verification only — no bankroll modified._

## Cross-check: ledger vs history vs official results
| Product | Product-ledger | Settlement record | Official source | Match? |
|---|---|---|---|---|
| Bank Builder | 2-0 | Lane A/B WON | Panama 0-1 CRO, COL 1-0 DRC, POR 5-0, ENG 0-0 (API-Football FT) | ✅ |
| Moonshot | 0-2 | both LOST | player box scores (Kane 0⚽, Perišić 0 ast, etc.) | ✅ |
| WC Specials | 0-5 | all LOST | ≥1 losing leg each (verified) | ✅ |
| WC Parlays | — | 1 PENDING | empty `double_chance` leg (data bug) | ⚠️ flagged |

## Sources
`official-scores-2026-06-23.json` (API-Football `/fixtures` FT + `/fixtures/players`) →
`settlement/2026-06-23.json` (graded) → `product-ledger/*` + `world-cup-specials-history.json`.

## Findings
- **Tracking is accurate** — product ledgers reconcile exactly with the graded settlement and official
  results. No double-counting, no orphan entries.
- **Bankroll untouched** ($10,176.17 / crown $10,376.17 / 10-2) — paper products' results live in their own
  ledgers; the canonical Bank Builder ladder advance is via the seed-model pipeline (deferred, not faked).
- **One data bug:** the WC parlay card carries an empty `double_chance` leg → graded PENDING. Fix in the
  parlay generator (flagged).
