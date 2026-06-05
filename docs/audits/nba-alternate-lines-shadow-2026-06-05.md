# NBA Alternate Lines — Shadow Exploration Decision (2026-06-05)

> Decision memo. **No paid Odds API call was made** this pass. (Mission allowed up
> to 100 NBA-only credits; I declined — reasoning below.)

## State
- 1 NBA game June 5 (Finals), tipoff 8:30pm ET, Scheduled (not started — a fetch would be timing-safe).
- The existing shadow tool `app/scripts/fetch-alternate-lines-shadow.mjs` is **MLB-only** (hardcoded `SPORT_KEY=baseball`, `batter_*_alternate` markets, MLB dest). Probing NBA alternates (`player_points_alternate`, etc.) would require a code change to the script.
- Prior MLB alternate-line spike returned **one-sided Over-only ladders** (two-way 0/428) — not de-viggable, not market-beat-valid.

## Why no paid spend tonight (value/safety judgment)
1. **Tooling gap:** NBA alt-line fetch needs a code change (the shadow script is MLB-only) before any paid call would be meaningful.
2. **Likely one-sided:** the provider returned one-sided ladders for MLB; NBA alternates are likely the same shape → not de-viggable → no honest edge.
3. **No downstream use tonight:** even valid NBA alt-lines could not power a conservative NBA bank-builder, because NBA recent form is stale (see bank-builder doc) — so the data couldn't be used responsibly tonight anyway.
4. **Spending the user's credits for low/no actionable value** conflicts with the conservative ethos, despite the 100-credit allowance.

## Recommendation
Defer NBA alternate-line exploration to a fresh slate where (a) the shadow tool is extended to NBA markets (code + tests first), and (b) NBA recent form is current (post-#282). If/when fetched: keep shadow-only, classify one-sided vs two-way, de-vig only two-way ladders, no public alt-line edge claims, no entry into official Suggested Parlays without full gates.

*Decision memo. No paid call, no public alt-line claim, no data change.*
