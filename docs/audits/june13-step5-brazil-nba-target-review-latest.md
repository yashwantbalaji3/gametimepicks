# Step 5 target review — Brazil (WC) + NBA Finals Game 5

Run: 2026-06-13 ~11:45 UTC · Base `d8dd95c`. User's intended final rung: a cross-sport
2-leg card = **Brazil vs Morocco (World Cup) + NBA Finals Game 5**. Publish ONLY if BOTH
legs are real + model-recommended. Result: **NEITHER clears → Step 5 stays Review Pending,
no card invented.**

## 1. API_FOOTBALL present? NO
Re-checked `.env`: `API_FOOTBALL` / `API_FOOTBALL_KEY` / `APIFOOTBALL_KEY` all absent.
`ODDS_API_KEY` present, `ODDS_DRY_RUN=true`.

## 2. Brazil vs Morocco — BLOCKED
No `API_FOOTBALL` credential → the World Cup model (`build_team_projections.py`) hard-stops
("STOP API_FOOTBALL_KEY not set"). No June-13 WC projections artifact exists, so Brazil has
**no real odds + no model probability**. Per the rules ("odds alone are not enough; do not
publish Brazil without real WC odds AND model projections"), the Brazil leg cannot be used.
Brazil candidate legs reviewed: none available (no data).

## 3. NBA Finals Game 5 (NYK @ SAS) — PENDING (no recommendation)
Re-ran the NBA board live on game day:
`ODDS_DRY_RUN=false python3 -m pipeline.generate_daily_board --date 2026-06-13` (todayMode=Live).
Result: **196 props, but ALL flagged `No Play` (183) / `Pass` (13), confidence
`insufficient_data` for all 196** — root cause `insufficient_data: no player game logs
available`. **Zero model-recommended legs.** NBA candidate legs reviewed: none clear (every
prop is no-play). (The refresh was a functional no-op vs the committed board — both all
no-play — so it was reverted to keep this diff surgical.)

## 4. Best Brazil + NBA pair / +176 / gates
No pair exists — neither leg has a usable selection. Combined odds / return / model+market
probability / edge cannot be computed because there are no legs. **Card NOT published.**

## 5. Decision: Step 5 REVIEW PENDING (Brazil + NBA target)
Per the hard rules: do not invent the card; do not publish Brazil without real WC data; do
not publish NBA while all props are no-play; do not substitute an MLB leg for this
Brazil+NBA instruction. **No card invented.** Bank Builder unchanged: $3,623.97 · 4-0 ·
Step 5/5 (no Step-5 candidate artifact written).

## 6. UI — honest transparent pending panel (Phase 5)
`/bank-builder` final-step panel now shows the TARGET structure + REAL per-leg status,
computed from on-disk artifacts (`loadStep5TargetStatus`):
- **Target final card: Brazil vs Morocco (World Cup) + NBA Finals Game 5.**
- Brazil leg → **BLOCKED** — "World Cup projections aren't generated … needs an API-Football
  credential that isn't configured."
- NBA leg → **PENDING** — "Model has no recommended Game 5 prop yet — 193 props … flagged
  no-play (insufficient game-log data)."
- Next: "Add an API-Football credential and generate the June 13 World Cup slate to unblock
  the Brazil leg." CTA: "Check final-step candidates →".
The card publishes automatically (`canPublish`) only when BOTH legs read "ready".

## 7. Unblock path
- Brazil: add an `API_FOOTBALL` key → generate the June-13 WC slate → a real Brazil
  moneyline/double-chance/team-total leg with odds + model probability.
- NBA: a Game-5 board where the model has player game logs (so props aren't all no-play).
When both legs read "ready", re-run the Step 5 gate and publish if combined ≥ +176.
