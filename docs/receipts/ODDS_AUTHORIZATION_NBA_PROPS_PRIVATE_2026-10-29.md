# Founder Odds-API Authorization — NBA player props, PRIVATE capture, 2026-10-29 and 2026-10-30 ET slates

**Provenance:** delivered by the founder in the release-owner session on 2026-10-29 ("Updated Odds API Capture Authorization & Multi-Sport Credit Budget"). New receipt; it supersedes the unexecuted 100-credit draft and does not revive the closed 2026-10-28 receipt. Guard: `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`); ledger `data/internal/research/odds/nba/authorization-ledger.json` (11 prior credits counted).

## Authorization (verbatim)

> I approve a new, current-date-scoped PRIVATE NBA odds capture for October 29 and October 30, 2026, covering the scheduled games and their supported player-prop markets.
> For this initial NBA capture, I authorize up to **750 additional credits**, counted against the shared 3,500-credit weekly ceiling.
> Before the first paid request, create a new receipt containing the exact event window, market scope, expected costs, 750-credit ceiling, expiration, reserve floor and stop conditions.
> Once the receipt and enforcement checks pass, execute the approved private NBA capture without requiring another routine approval.
> I am authorizing private Odds API capture within the stated limits. I am not authorizing unrestricted redistribution of sportsbook data.

## Operative terms

NBA player props only (`basketball_nba`).

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_points_rebounds_assists`, `player_points_rebounds`, `player_points_assists`

Effective cumulative ceiling: 761 credits

| Term | Value |
|---|---|
| Scope | NBA player props only; the seven official model families above; every other sport, market (incl. game lines) and product is out of scope |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only (draftkings, fanduel, betmgm, williamhill_us, caesars, betrivers, fanatics, espnbet, betparx); no `regions=` |
| Endpoint | free `/v4/sports/basketball_nba/events` for the join; then per game `/v4/sports/basketball_nba/events/{id}/odds` with the markets above |
| Cadence | at most ONE successful capture per game, 20–75 minutes before tip; never at or after tip. Events in scope (provider commence times): 10-29 ET — CLE@ATL 00:10Z, SAC@NOP 00:10Z, MEM@POR 02:10Z; 10-30 ET — CHA@WAS 23:10Z, CHI@BOS / DET@BKN / NYK@PHI / ORL@TOR 23:40Z, HOU@DAL / IND@MIA / LAC@MIN 00:10Z, DEN@PHX / LAL@GSW 02:10Z. Expected ≤ 7 credits per game (≤ 91 total) |
| Credit floor | every paid call requires remaining − cost ≥ `ODDS_API_MIN_CREDITS_REMAINING` (2000); an unreadable balance stops the run before any paid call. Shared weekly cap: the local runner reads provider-reported usage (free `/v4/sports`) before each tick and stops if usage since the 2026-10-29 18:13Z baseline (2,063 used), across ALL jobs and runners, plus the tick's worst case would exceed 3,500 |
| Failures | any 401/429/5xx/unmodelled status or transport error stops the run; do not retry blindly; a transport error is booked as charged |
| Expiry | the 761-credit cumulative ceiling (11 prior + up to 750 new), or 2026-10-30 23:59 ET, whichever comes first |
| Storage | price records ONLY in a private directory outside every repository (founder storage decision 2026-10-22); the capture runs on the release owner's machine, never on a GitHub-hosted runner (public logs, no private storage); only the credit ledger (no line, no price) may be committed |
| Output | PRIVATE_RESEARCH, productEligible false; no price, line or book name reaches any public page, export or social graphic; no recommendation, product leg or promotion threshold changes |
| Kill switch | stop the local schedule (no further runs); the receipt refuses on its own after its expiry or ceiling |

Approved by: founder 2026-10-29
