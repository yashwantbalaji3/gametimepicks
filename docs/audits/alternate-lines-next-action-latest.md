# Alternate Lines — Next Action (2026-06-05)

> Status + decision memo. No paid fetch. No public alternate-line launch. Builds
> on the earlier approved MLB alternate-line spike (10 credits, shadow-only).

## What the spike found
- The MLB alternate-line source returned **one-sided, Over-only ladders** —
  428 records, **two-way 0/428**.
- One-sided ladders have **no opposing price**, so they are **not de-viggable**:
  we cannot compute a fair (no-vig) probability to compare the model against.
- They are gradable (real lines/results) but **not market-beat-valid** — without
  a de-vig baseline we cannot honestly claim an edge.

## Current stance (unchanged, correct)
- **Blocked for launch validation.** Alternate lines cannot enter official
  suggested parlays as a market-beat edge while one-sided.
- **No public alternate-line claim** anywhere on the site.
- Raw spike data remains gitignored (not committed).

## Options
1. **Display-only ladder (no edge claim).** Show alternate lines as an
   informational ladder (e.g. "also available at …") with NO probability/edge
   framing. Requires a UX decision + strict neutral copy. Does not enter the
   graded published-card record. Medium effort; needs operator sign-off on UX.
2. **Find a two-way alternate source.** Research a provider that returns both
   sides per alternate line so de-vig is possible → then it could be validated
   through the same hardened gates as main lines. No paid fetch without approval.
3. **Hold (default).** Keep alternate lines out of the product until a two-way
   source exists. Zero risk; zero cost.

## Recommendation
**Hold (option 3)** until a two-way source is identified. If the user wants a
visible alternate-line ladder sooner, **option 1 (display-only, no edge claim)**
is feasible but needs an explicit UX + copy decision — it must never be presented
as a beat-the-market edge and must stay out of the published-card record.

## Hard rules respected
No paid fetch. No de-vig fabricated from a one-sided ladder. No public
alternate-line launch claim. No entry into official suggested parlays.

*Decision memo. No code/data change.*
