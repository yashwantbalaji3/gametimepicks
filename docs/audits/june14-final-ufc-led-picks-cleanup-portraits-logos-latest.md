# June 14 — Final UFC-led cleanup: stale /picks fix, fighter portraits/comparison, next-ladder teaser, hot-lava sweep

**Baseline SHA:** 40340de. Bank Builder preserved: $100 → $10,376.17 / 5–0 / completed (untouched).

## Findings
- **`/picks` (+ /today) were showing STALE cards as active:** `loadDailyMixedCards` read `daily/cards/latest.json` (June-12) and `loadWorldCupParlays` read June-12 WC parlays — neither date-gated. So 6 stale mixed + 7 stale WC cards rendered alongside fresh June-14 UFC (4) + MLB (18). **This was the core complaint.**
- **No real UFC fighter-image source:** the fighter DB has slugs/names + stats but no ESPN athlete IDs or photo URLs → portraits must be initials fallback (no fabrication).
- **No detailed fight history in the source:** the DB has `recentForm.last5` (W-L summary) + record, but NOT per-bout opponent/method/date → show last-5 W-L (real) + "detailed history unavailable."
- **Homepage `/` is `/today`** (re-export) — already UFC-led.
- **Dusty-theme remnants:** cool-blue panel rgba (`20,24,38` / `10,14,28` / `20,24,35`) in 7 components + cool-gray `--text-mute` token.

## Done
1. **Stale /picks fix (priority):** date-gated daily-mixed (`loadDailyMixedCards(today)`) + World Cup (`wcParlays.date === today`) on /picks and /today. /picks: **35 → 22** active cards (UFC 4 + MLB 18), UFC ordered first, honest empty filters. No stale June-12/13 cards as active.
2. **UFC fighter comparison + portraits:** `build_expanded_projections` now emits per-fighter `fighterStats` (record, last-5 W-L, reach/stance/age, sig-str & TD/round, finish rate) + moneyline for every fight. Fight cards render initials avatars + a comparison block + "detailed bout history unavailable" note. **Ruffy vs Chandler** shown fully (records + moneyline + avatars), method/distance withheld (limited data) — documented, not fabricated.
3. **Bank Builder "Coming Soon":** next-ladder teaser on the completed crown ($100 → $10,376.17 recap + "new ladder · coming soon" badge), gated on `completed`.
4. **Hot-lava end-to-end:** swept all cool-blue panel rgba → warm lava across 7 components; warmed `--text-mute` to the lava muted tone. **0 cool-blue remnants, 0 neutral Tailwind color classes** in `src`.

## Ruffy vs Chandler — search result
Searched: ESPN MMA schedule (present — "Mauricio Ruffy" vs "Michael Chandler", boutId `2026-06-15:mauricio ruffy|michael chandler`), moneyline projections (present — Ruffy -700, model 0.84), fighter DB (both matched: Ruffy 4-1, Chandler 2-5). The fight **renders fully** (moneyline + records + avatars). Only the expanded method/distance/rounds projection is withheld because Chandler's matched record (2 wins) is below the 3-win threshold for a credible method split — shown as an honest "projection withheld" state, never invented.

## Integrity / limitations
- No fabricated odds/photos/history; missing sources → fallbacks/unavailable. No banned copy (copy audit now covers pipeline + generated data). Bank Builder untouched. 878 tests pass, tsc + build clean.
- **Limitation:** UFC fighter portraits remain initials-only (no connected image source); detailed bout history unavailable (source has W-L summary only); expanded markets remain model-only (no prop-odds feed). All shown honestly.
