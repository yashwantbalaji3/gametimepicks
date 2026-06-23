# MLB Odds / Homer Nukes — Root-Cause Report (why the MLB board is empty)

**Date:** 2026-06-23. **Scope:** Phase 7 investigation — determine why the MLB board (and therefore Homer Nukes + the MLB player boards) shows no picks.

## Verdict
The MLB board is empty because **no MLB data has been ingested for the current slate, and the home-run model inputs are explicitly not wired** — not because of a bug in the rendering or the Homer Nukes loader. Both products are built correctly and data-gated; they populate automatically once real data lands. **No fabrication is acceptable here, so the honest empty state is correct.**

## Evidence
| Input | Latest available | Today (2026-06-23) |
|---|---|---|
| `public/data/mlb/schedule/<date>.json` | **2026-06-22** | missing |
| `public/data/mlb/boards/<date>.json` | **2026-06-22** | missing |
| `public/data/mlb/game-markets/<date>.json` (carries HR props) | **2026-06-10** (stale) | missing |
| `public/data/mlb/power/<date>.json` (HR analysis) | 2026-06-22, `state: "pending"` | missing |

- `getMlbScheduleForDate` returns `source: "unavailable"` + `games: []` when the file is absent (data-mlb.ts).
- The **HR "Power Board" reports `state: "pending"`** with the reason that its inputs (season slugging + hard-hit + barrel rate, pitcher HR-allowed rate + handedness splits, park factor, weather, lineup position) **"are not yet wired."**
- There is **no committed MLB Odds-API fetch script** in `app/scripts/` (only a backtest + a one-off leg-replace helper). MLB artifacts are produced by an **external/manual ingestion process** that did not run for 06-23, and the HR-prop game-markets feed is stale to June 10.

## Root causes (two, independent)
1. **Ingestion not run for the slate.** The schedule/board/game-markets producers were last run 06-22 (game-markets 06-10). With no `schedule/2026-06-23.json` there are no games to attach markets to, so `getMlbBoardForDate` returns the empty board.
2. **HR model inputs not wired.** Even with a posted slate, the Power Board's home-run inputs (slugging/hard-hit/barrel, pitcher HR-allowed, park, weather, lineup) are not connected — so a model HR probability can't be produced, and Homer Nukes' model floor can't be cleared.

## What is NOT the cause
- Not a market-key mismatch in the loader: `lib/mlb/homer-nukes.ts` already accepts the standard anytime-HR market keys (`batter_home_runs` / `player_home_runs` / `to_hit_a_home_run` / `home_run_anytime` / `anytime_home_run`) and reads `mlb/home-run-props/{date|latest}.json` then `mlb/game-markets/{date}.json`.
- Not a timezone/date-filter bug: the loader fails closed when `raw.date !== date`, but the files are simply absent, so it never reaches that branch.
- Not a rendering bug: `/homer-nukes` + the Today board + the Mr. Dub allocation all render the honest "board not posted yet" state correctly.

## To make Homer Nukes / MLB boards go live (pipeline work, out of scope for fabrication-free UI)
1. Run the MLB schedule + Odds-API game-markets ingestion for the slate so `schedule/<date>.json` + `game-markets/<date>.json` (with anytime-HR props: player, team, opponent, americanOdds, provider, commenceTime) exist. Optionally write a normalized `mlb/home-run-props/<date>.json` the Homer Nukes loader prefers.
2. Wire the HR Power Board inputs (slugging/hard-hit/barrel + pitcher HR-allowed + park + weather + lineup) to emit a `modelProbability` per batter so the model floor (≥8%) can select the top-5.
3. The product UI then lights up automatically — no UI change required.

## Verification
- Bankroll/crown/exposure/settlement untouched (investigation only; no data written).
- The empty-state behavior is covered by `homer-nukes-product.test.mjs` ("HONEST data-gated: no posted MLB home-run board → empty, no fabricated picks").
