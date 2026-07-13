# World Cup Week — Operations Schedule (2026-07-13 → 07-19)

The refresh/settlement cadence for the biggest week. All refreshes: `bash scripts/refresh_daily_products.sh
--date <D>` (credit-guarded, md5-guards money, never deploys). Settlement: official-gated, never fabricate.

## Mon Jul 13 (today) — DONE
- ✅ Production go/no-go smoke (green).
- ✅ Semifinal predictions generated (France v Spain, England v Argentina) from real odds.
- ✅ No-games/All-Star-break state honest; ASG placeholder removed.
- → deploy on push (Vercel auto), then re-smoke `/world-cup` SFs on prod.

## Tue Jul 14 — France vs Spain (SF1)
- AM: `refresh_daily_products.sh --date 2026-07-14` (re-price if lines moved). Verify SF1 board/report.
- Post-match (after FT): watch for the official score → settle supported 90' team markets (soccer settle,
  official-gated). Do NOT settle on ET/pens for 90' markets. Do NOT touch official money.

## Wed Jul 15 — England vs Argentina (SF2)
- AM: `refresh_daily_products.sh --date 2026-07-15`. Verify SF2 board/report.
- Post-match: settle SF2 supported markets from the official score.

## Thu Jul 16 — SF settlement + finalists known
- Settle both SFs (paper/display) from official scores. Finalists + 3rd-place teams now known.
- If Odds API lists the final / third-place events with odds → `refresh_daily_products.sh --date 2026-07-18`
  and `--date 2026-07-19` to generate those predictions. Until listed, keep TBD.

## Fri Jul 17 — MLB returns
- Check MLB schedule; if games resume: `refresh_daily_products.sh --date 2026-07-17` +
  `node scripts/generate-mlb-game-simulations.mjs --date 2026-07-17 --write`. Else keep the honest break state.

## Sat Jul 18 — Third-place game
- `refresh_daily_products.sh --date 2026-07-18` (once teams+odds exist). Generate predictions; settle after FT.

## Sun Jul 19 — Final
- `refresh_daily_products.sh --date 2026-07-19`. Generate final prediction; settlement watch; public results review.

## Required GH Actions secrets (founder — do not print values)
`ODDS_API_KEY`, `API_FOOTBALL_KEY`, `BALLDONTLIE_API_KEY`, `VERCEL_DEPLOY_HOOK_URL`, plus the `ENABLE_AUTONOMOUS_DEPLOY`
repo var. With these set, `daily-refresh` + `nightly-settle` + `daily-rebuild` run this cadence automatically;
until then, run the commands above manually (local `.env` has ODDS_API_KEY + API_FOOTBALL_KEY; credits ~18k).

## Standing guardrails
Money md5 `affe6b21` · official 19-14 / $0 · no fake games/odds/teams/settlements · final+3rd-place TBD until
finalists known · WC = market-implied read · push both refs only when green.
