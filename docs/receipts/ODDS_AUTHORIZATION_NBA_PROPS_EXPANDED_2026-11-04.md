# Founder Odds-API Authorization — NBA player props, expanded coverage for Bank Builder & Moonshot research, 2026-11-04 ET slate

**Provenance:**
- Delivered by the founder directly in the November Program Director session on 2026-11-04 at about 2:45 PM ET ("CEO APPROVAL — EXPANDED NBA ODDS COVERAGE FOR NOVEMBER 4").
- It follows the early props receipt (`ODDS_AUTHORIZATION_NBA_PROPS_BBM_V2_EARLY_2026-11-04.md`), which reached its 71-credit cumulative ceiling at 19:05Z. The same ledger continues (`data/internal/research/odds/nba/authorization-ledger.json`, 71 credits counted).
- Guard: `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`).

## Authorization (verbatim)

> I approve the proposed additional Odds API budget of up to 54 credits for November 4, 2026, strictly within the existing 120-credit daily ceiling, 3,500-credit weekly shared cap, and 2,000-credit minimum balance.
> Authorization is limited to:
> * Up to 24 credits for main points, rebounds and assists markets across the remaining eight NBA games.
> * Up to 30 credits for alternate lines across a maximum of five shortlisted games.
> This is a maximum allowance, not an instruction to spend every credit. Select the games and markets most likely to improve eligible candidate coverage. Stop before any authorization limit is reached. Account for any separate moneyline-refresh usage as well.

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-04 ET slate.

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 95 credits

| Term | Value |
|---|---|
| Scope | Main points, rebounds and assists lines for the eight games not refreshed at 19:05Z (CHA@BKN, UTAH@NO, MIN@HOU, TOR@DEN, POR@PHX, DAL@SA, LAL@SAC, MIA@LAC). Research input for Level B daily research selections; no edge claim. |
| Ceiling | 71 prior + up to 24 new = 95. The founder's separate 30-credit alternate-line allowance is NOT executable under this receipt: the capture tool does not yet support alternate market keys, and adding them is a tested code change for a later slate. |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Endpoint | The free `/v4/sports/basketball_nba/events` for the join, then per game `/v4/sports/basketball_nba/events/{id}/odds` with the three markets. ≤ 3 credits per game. |
| Cadence | One capture per game, before tip. No polling, no automatic retries. |
| Daily ceiling | Counts within the BBM V2 receipt's 120-credit daily ceiling together with the moneyline captures (2 used before this receipt). |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. An unreadable balance stops the run before any paid call. The shared 3,500/week budget applies across all jobs. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | The 95-credit cumulative ceiling, or 2026-11-04 23:59 ET, whichever comes first. |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | Private research plus the founder-approved display paths only: the site's encrypted display, and Bank Builder & Moonshot graphics under `challengeGraphics`. Never in plain public JSON, a feed or a downloadable file. |
| Kill switch | Do not run the capture. The receipt refuses on its own after its expiry or ceiling. |

Approved by: founder 2026-11-04
