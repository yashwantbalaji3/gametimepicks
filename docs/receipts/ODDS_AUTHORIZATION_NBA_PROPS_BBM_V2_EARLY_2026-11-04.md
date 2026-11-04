# Founder Odds-API Authorization — NBA player props, early snapshot for Bank Builder & Moonshot V2, 2026-11-04 ET slate

**Provenance:**
- Delivered by the founder directly in the November Program Director session on 2026-11-04 at about 12:11 AM ET ("P0 — NOVEMBER 4 NBA BANK BUILDER & MOONSHOT: BUILD THE LANES NOW, NOT BEFORE TIP-OFF").
- It extends the founder's same-day BBM V2 receipt (`ODDS_AUTHORIZATION_NBA_BBM_V2_2026-11-04.md`) to an early player-prop capture. It stays within that receipt's 120-credit daily ceiling: the props here are capped at 60 credits, which leaves the remainder for the moneyline capture and refresh.
- Guard: `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`). Capture: `app/scripts/nba/capture-nba-props-odds.mjs --phase early`. Ledger: `data/internal/research/odds/nba/authorization-ledger.json` (11 prior credits counted).

## Authorization (verbatim)

> Retrieve available November 4 NBA moneylines and relevant player-prop markets, including points, rebounds and assists.
> Respect the approved credit ceilings. If the existing authorization covers only moneylines, extend the scoped authorization for the requested prop-market capture without exceeding those limits.
> Record the sportsbook, exact market, player, line, odds and capture timestamp.
> If the current prop models do not pass the approved reliability gate, show prop candidates separately as provisional analysis and use qualifying moneyline legs for the official challenge.

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-04 ET slate (14 games).

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 71 credits

| Term | Value |
|---|---|
| Scope | NBA player props only, the three markets above, the 2026-11-04 ET slate. Used as PROVISIONAL ANALYSIS: projection vs line, side by side. No prop is a challenge leg until a family passes the reliability gate (none does: backtest `claude/nba-prop-probability-1104` @ 0ce4b94208). |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Endpoint | First the free `/v4/sports/basketball_nba/events` for the join. Then per game, `/v4/sports/basketball_nba/events/{id}/odds` with the three markets. Expected ≤ 3 credits per game, ≤ 42 total. |
| Cadence | The early snapshot below, plus at most one targeted pregame refresh per game, only for a game whose prop is shown in published-facing content. Never at or after tip. No polling, no automatic retries. |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. An unreadable balance stops the run before any paid call. The shared 3,500/week budget applies across all jobs (baseline 306 used at 2026-11-04T04:15Z). |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | The 71-credit cumulative ceiling (11 prior + up to 60 new), or 2026-11-04 23:59 ET, whichever comes first. |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | Private research plus the founder-approved display paths only: the site's encrypted display, and Bank Builder & Moonshot V2 graphics under `challengeGraphics`. Never in plain public JSON, a feed or a downloadable file. |
| Kill switch | Do not run the capture. The receipt refuses on its own after its expiry or ceiling. |

Early snapshot: one per game, any time before tip on 2026-11-04 ET, in addition to at most one pregame refresh; same markets, books, ceiling, floor, stop conditions and private storage.

Approved by: founder 2026-11-04
