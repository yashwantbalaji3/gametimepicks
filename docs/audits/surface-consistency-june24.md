# Surface Consistency Audit — June 24, 2026

Which public surfaces track settled results and display ROI.

| Surface | Tracks results? | Displays ROI/record? | Notes |
|---|:--:|:--:|---|
| Bank Builder | ✅ ledger + record + crown | ✅ bankroll/ROI/streak | canonical money product |
| Moonshot | ✅ own record (`portfolio.moonshot`) + product-ledger | ⚠️ record only | separate paper |
| WC Specials | ✅ now (`world-cup-specials-history` + product-ledger, PR #584) | ⚠️ via product-performance report, not on-page yet | was orphan (0 entries) before |
| WC Parlays | ❌ no ledger | ❌ | not settled/tracked |
| Homer Nukes | ❌ no settled history (data-gated) | ❌ "awaiting settled history" | new product (Jun 23 live) |
| MLB Featured / Player Props / Pitcher Props | ❌ display-only | ❌ | never graded/tracked |
| MLB Game Explorer | ❌ display-only | n/a | |
| Mr. Dub | ✅ portfolio bankroll/record | ✅ | aggregates BB; daily-portfolio paper |

## Findings
- **Tracked + ROI shown:** Bank Builder, Mr. Dub.
- **Tracked, ROI not surfaced on-page:** Moonshot, WC Specials (data exists in product-ledger; the Results
  page component to render it is the remaining "C" task in the tracking architecture).
- **Not tracked:** WC Parlays, Homer Nukes (data-gated), all MLB props surfaces.

## Reasonable fixes (done this run)
- Product-ledger + performance engine make tracking *possible* for every product (the data layer is built).
- June 24 MLB board generated so the flagship is live, not stale.

## Deferred (documented)
- Build the shared `ProductResults` page (Today/History/Stats/ROI) reading `product-ledger/*` → wires ROI
  onto Moonshot / WC Specials / Homer Nukes surfaces.
- Settle + track MLB props + WC Parlays (need a grading adapter per surface).
