# June 14 — UFC Public-Ready End-to-End (market coverage + methodology)

**Baseline SHA:** 8a278cb (incl. auto-cron `37b037d` Phase-10 refresh + `8a278cb` morning projections). ~11:50 ET June 14.
**Bank Builder:** completed, untouched — $10,376.17 / 5–0 / runStatus completed.

## State found (much already in place)
- **`/ufc`**: already a public-ready, fail-closed SportShell (real ESPN MMA schedule, 20 h2h bouts, V1 moneyline model with 7 projections, 2 cards, honest "validation in progress"). Event tonight: **UFC Freedom 250: Topuria vs. Gaethje** (2026-06-15T00:00Z, 7 fights).
- **`/today`**: already leads with UFC + has the active-sports grid (PR #481); Bank Builder shown as completed.
- **`/picks`**: already has full sport filtering — All / Mixed / World Cup / MLB / NBA / **UFC** tabs + risk filters + a sport×risk matrix (PicksExperience). No rebuild needed.
- **MLB June-14**: the **auto-cron generated it** — 15 games, **673 leans** + optimizer/snapshot parlays (18 cards). Live, no action needed.
- **NBA**: no games (Finals ended Game 5). **World Cup**: credential-blocked; existing cached projections only.

## UFC market coverage — the hard, honest blocker
The expanded-market ask (total rounds / goes-the-distance / method-of-victory) **cannot be fulfilled with real data**:
- `pipeline/ufc/build_odds.py` is hardcoded to `markets="h2h"` (PER_EVENT_CREDITS = 1, h2h × 1 region) — there is **no ingestion for totals/method/distance** at all.
- A live odds refresh today (attempted twice, fail-closed) returned **0 bouts** (The Odds API MMA posted no markets at fetch time, 0 credits) — so even h2h could not be freshened; reverted to the consistent real Jun-9 dataset (UFC data dir unchanged).
- `readiness.propMarketsAvailable` = { h2h: true, method: false, distance: false, rounds: false }.

→ Per the integrity rule, **no expanded props are fabricated**. They are shown as **Unavailable** with the reason ("feed is moneyline-only").

## Work done this run (additive, honest)
1. **`/ufc` Markets tab** — new tab with a transparent coverage matrix: Moneyline (h2h) = **LIVE** (7 projections, real odds); Total rounds / Goes the distance / Method of victory = **UNAVAILABLE** (feed is moneyline-only), gated on `readiness.propMarketsAvailable` so they'd flip to live automatically if a real feed connects.
2. **`/methodology` UFC section** — "UFC — moneyline V1": data sources (ESPN MMA, The Odds API MMA h2h, UFCStats), market coverage (moneyline live; expanded unavailable), model + edge (de-vigged market baseline, conservative "no clear edge"), and limitations (validation in progress, small sample, late news, props unavailable).
3. Tests: +2 (Markets-tab honesty, methodology UFC section). 871 pass.

## Preserved / not touched
- Bank Builder data (completed). UFC data dir (reverted to real Jun-9 set). MLB/NBA/WC cron data.

## Honest limitations carried forward
- UFC is moneyline-only and validation-stage (no historical backtest threshold yet) — labeled as such everywhere.
- Expanded UFC markets require both a prop-odds feed (not connected) and a model — neither exists; building them would be fabrication, so they stay unavailable.
- UFC h2h odds are from the most recent successful fetch (Jun-9); live refresh returns no markets today — freshness shown honestly on the page.

## Next steps (when unblocked)
- Connect a prop-odds feed (totals/method/distance) + build models → the Markets tab + methodology flip those rows to live automatically.
- Re-run `build_odds` once The Odds API MMA posts tonight's markets / credits refresh for fresher h2h lines.
