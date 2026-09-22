# v1.7 — Sport eligibility matrix (Phase D)

**As of:** 2026-09-21 · **Source of truth:** `app/src/lib/sport-capability-registry.ts` (binding) plus each
sport's own status owner. Measured with `build-product-eligible-legs.mjs` at the day's real publication
instant. Nothing here was flipped; every row states what would change it.

| Sport | Registry | Public forecast owner | Product-eligible markets today | Blocked markets (why) | Eligible legs, sample days | What would qualify |
|---|---|---|---|---|---|---|
| **MLB** | `FULL_MODEL` | `mlb/team-markets/<date>.json` (market-implied, one bookmaker) — **not a forecast**; the model families (`mlb/predictions`) are WATCH (moneyline), HOLDING (run line), BREACHED/PAUSED (total) against the market | moneyline, run line, total runs — as **market-priced legs** under gate F1 | none by status; every leg is `MARKET_PRICED_NO_FORECAST` | 09-13: 90 · 09-14: 60 · 09-20: 84 · 09-21: 18 | a family that clears its live-record bar against the market (`model-health.json`) would become a `VALIDATED_MODEL` owner |
| **NFL** | `EXPERIMENTAL_PUBLIC` | `nfl/forecasts/<date>.json` (`nfl-regular-season-public-v1`, every game `PUBLIC_EXPERIMENTAL`) + `nfl/markets/capture-*.json` (team markets, 11 books) | **none** | moneyline / spread / total: `SPORT_NOT_ELIGIBLE` + `FORECAST_EXPERIMENTAL` (84/84 on 09-20); player families (rush / reception yds / receptions PUBLISHED, pass yds ESTIMATE, anytime TD ROLE_UNCERTAIN): **no line and no price** — the provider offers no NFL player markets | 09-13: 0/78 · 09-20: 0/84 · 09-21: 0/6 | `output-state.permitsProductLeg` ⇔ `VALIDATED_PICK`, which needs a `validated{approved, modelVersion, priceAtApproval}` block the engine never emits; `nfl_winner` is INSUFFICIENT_SAMPLE n=31 of the 64-decisive / 4-week bar |
| **UFC** | `SCAFFOLD_ONLY` (downgraded 2026-07-23) | none — `ufc/projections-latest.json` is a nudged market price (`genuineModel: false`), 10 weeks stale, for a different card than the newest odds | **none** | h2h: `SPORT_NOT_ELIGIBLE`, no per-bout start (`MISSING_IDENTITY`), stale capture | 0/24 every day | an independent fight model with a point-in-time pregame odds capture and a backtest (`status/ufc-graduation-decision.json` lists six requirements, all unmet) |
| **EPL** | `EXPERIMENTAL_PUBLIC` | `soccer/epl/forecasts/<date>.json` (P304 Elo-Poisson; artifact says `VALIDATED_OUT_OF_SAMPLE_HISTORY` for 1X2; lane gate: calibration UNPROVEN, `epl_result` INSUFFICIENT_SAMPLE n=36) + `soccer/epl/odds/latest.json` (`public: false`, 3-day freshness, file-level capture) | **none** | match result, total goals: `SPORT_NOT_ELIGIBLE` + `FORECAST_EXPERIMENTAL`; P305-F totals are shadow and never read | 0 on the sample days (no EPL fixtures those dates; matchweek fixtures Oct 3–4 next) | a registry promotion to `FULL_MODEL` — **founder gate §29.3**: the artifact's out-of-sample validation and the lane's UNPROVEN calibration do not clearly satisfy the existing policy; plus a dated odds capture for time-lock |
| **NBA** | `HISTORICAL_ONLY` | none | **none** | all: `SPORT_NOT_ELIGIBLE`; nothing is normalized by design | 0/0 | the NBA readiness track (N5): DATA_READY → PRESEASON_EXPERIMENTAL → REGULAR_SEASON_SHADOW → validation receipt → public forecast → market-by-market eligibility |

## What this means for the founder's ask

The founder wants NFL legs on Sunday/Monday/Thursday and UFC legs on Saturdays. **Neither can enter today
without breaking the charter**: NFL has a public model that is experimental and unvalidated (the bar it must
clear is preregistered and measured weekly); UFC has no model at all. The contract already carries their
candidates — 84 NFL legs on an ordinary Sunday — so the day a status changes, legs flow with no new code.

The cross-sport universe the selectors can legally draw from in v1.7 is therefore **MLB only, market-priced**,
and the honest product statement is the one the availability artifact makes: `marketPricedOnly: true`.

## Founder decisions this matrix raises (not made here)

- **F1** — whether market-priced legs (no forecast) may be product legs at all. Today: admitted, labelled.
- **F2** — whether EPL's registry state should move on the artifact's out-of-sample receipt. Today: no.
- **F3** — MLB season ends 2026-09-27 (regular season); postseason slates are thin and the products' only
  sport goes dark until NBA earns eligibility. This is the calendar reason the NBA track is inside v1.7.
