# June 24 Performance Review

_From persisted product ledgers + canonical portfolio. Lifetime where data exists._

## Product ROI ranking (settled to date)
| Rank | Product | Record | Profit | ROI | Notes |
|---|---|---|---|---|---|
| 1 | **Bank Builder** | 12-2 (canonical) | +$10,076.17 | 100.76× on $100 | the flagship ladder → crown $10,376.17 |
| 2 | WC Specials | 0-5 | −$50 | −100% | June 23 only (ledger just started) |
| 2 | Moonshot | 0-2 | −$50 | −100% | June 23 + stopped lane |
| — | Homer Nukes | 0-0 | — | — | no settled history (June 23 was first live; MLB settles from box scores) |

## Reading
- Bank Builder is the only product with a meaningful settled sample (12-2, +$10k from $100). It carries the
  canonical bankroll/crown/record.
- Moonshot + WC Specials have only the June 23 sample (both losing days) — too small to rank on EV yet; the
  product-ledger now accumulates them going forward.
- Homer Nukes: first live card was June 23 (the MLB HR parlay settles from MLB box scores once those games
  finalize — not yet graded).

## Engine status
Registry (`lib/products/registry.ts`) + performance (`lib/products/performance.ts`) compute daily /
cumulative / rolling-7d/30d / streaks / ROI / units from the ledgers — operational and unit-tested. The
remaining gap is the on-page Results component to surface this per product (architecture documented).
