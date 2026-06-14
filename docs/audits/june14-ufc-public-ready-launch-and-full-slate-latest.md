# June 14 — UFC Public-Ready Launch + Full Slate

**Baseline SHA:** 8b444a0 · ~10:20 ET June 14, 2026.
**Bank Builder:** completed (kept untouched) — $10,376.17, 5–0, Road to $10K done (PR #480).

## Discovery — current state (real, not assumed)

### UFC `/ufc` — already a public-ready, fail-closed page
The UFC beta is **not** a fake stub — it's a full tabbed SportShell (Overview · Fight Card · Projections · Suggested Cards · Results · Methodology) with real data and honest gating:
- **Schedule** (ESPN MMA, free): tonight's real card **"UFC Freedom 250: Topuria vs. Gaethje"**, eventDate `2026-06-15T00:00Z` (June 14 8pm ET), 7 fights, `isRealCard: true`.
- **Odds** (The Odds API MMA): 20 bouts, real moneylines (generated Jun 9).
- **Fighter stats** (greco1899 ufcstats CSV): connected.
- **Model**: conservative V1 moneyline, 7 projections (mostly "no clear edge" — honestly mirrors the market), 2 suggested moneyline-only cards (model-probability only, no payout).
- **Honesty gates**: `publicLevel "grading-internal"`, `moneylineValidated: false`, `marketScope: h2h_moneyline_only`, blocker "no historical backtest yet". The page shows a validation-progress meter and "method/distance/round props not offered yet" — all truthful.

### UFC status matrix
| Area | Status | Public-ready? | Blocker | Action |
|---|---|---|---|---|
| Route `/ufc` | full SportShell | yes | — | keep; surface it |
| Data source | ESPN MMA + Odds API MMA + ufcstats CSV | yes | — | keep |
| Fight card | 7 real fights, tonight | yes | — | keep |
| Odds (h2h) | 20 bouts, real | yes | Jun-9 freshness | refresh attempted (below) |
| Model probability | V1 moneyline, 7 projections | yes | not backtested | keep, honest "validation in progress" |
| Method/round props | none | n/a | no prop-odds feed | honest "not offered yet" (already shown) |
| Suggested parlays | 2 moneyline cards | yes | — | keep |
| Fighter visuals | initials fallback | yes | no fighter image CDN wired | acceptable fallback |
| Mobile UI | SportShell, hot-lava | yes | — | QA |
| Tests | ufc-types.test.mjs | partial | — | add today-lead + integrity tests |
| Settlement | grade_moneylines pipeline | yes | results after fights | n/a tonight |

### Live refresh attempt (June 14) — honest result
- **UFC schedule refresh** (free ESPN MMA): SUCCESS — re-confirmed tonight's card, 7 fights.
- **UFC odds refresh** (The Odds API MMA, paid): returned **0 bouts** (no MMA markets posted at fetch time, 0 credits). Continuing would have degraded the page to empty → **reverted** to the consistent, real Jun-9/10 dataset. The page shows odds freshness honestly.
- **MLB June-14 board** (paid): schedule fetched (**15 games**), but the paid odds fetch was **skipped — Odds API credit floor** ("projected remaining 349 < floor 350"). Result: real 15-game schedule, **0 leans/odds**. Kept as a schedule-only board; projections marked pending (provider credit limit), not fabricated.
- **NBA June-14**: empty board — the Finals ended with Game 5 (Jun 13); no NBA games today. Honest no-slate.
- **World Cup**: still credential-blocked (no API_FOOTBALL). No June-14 WC cards.

## Gameplan (executed below)
1. June 13 settlement: Bank Builder Step 5 already officially settled (PR #480). No other June-13 public pending cards are user-facing (slate pages date-gated to June 14). Documented; nothing to re-settle.
2. `/today`: make **UFC tonight's featured lead**; fix the stale Bank Builder spotlight to the **completed crown** state; add UFC to the active-sports grid.
3. Keep `/ufc` (already public-ready); ensure it's discoverable from Today/nav/Picks.
4. Keep the real MLB schedule board; honest "projections pending" state.
5. Preserve Bank Builder completion everywhere.
6. Tests/build/copy+secret audits; deploy; verify.

## Honest limitations carried forward
- Fresh UFC/MLB odds blocked today by The Odds API (MMA empty + MLB credit floor) — presented the most recent real data with truthful freshness, never fabricated.
- UFC remains moneyline-only, model in validation — labeled as such (not over-claimed as a validated public model).
