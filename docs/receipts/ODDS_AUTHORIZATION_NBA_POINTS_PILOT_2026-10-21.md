# Founder Odds-API Authorization — NBA player-points pilot, 2026-10-21 slate only

**Provenance:** delivered by the founder in the release-owner session ("GameTimePicks Launch Readiness") on 2026-10-21,
in response to a priced pilot packet (PR #1177). Committed here so the repository carries the receipt the NBA credit
guard (`parseNbaPropsReceipt`, `app/src/lib/sports/odds/nba-props/credits.mjs`) requires before any paid NBA call.
This is a SEPARATE allowance from every other sport's receipt; its own ledger is
`data/internal/research/odds/nba/authorization-ledger.json`. No other ceiling can fund these calls.

## Authorization (verbatim)

> FOUNDER APPROVAL — NBA PLAYER-POINTS PILOT
> Claude, I approve the narrowly scoped NBA points-odds pilot for October 21, 2026, as described in your latest proposal
> for PR #1177.
> Authorization scope:
> * Date: October 21, 2026 only.
> * Sport: NBA.
> * Market: Player points only.
> * Games: Up to 11 scheduled games.
> * Sportsbooks: Only the nine previously verified, licensed and eligible operators.
> * Frequency: Maximum one successful pre-tip capture per game.
> * Total paid API credit limit: 11 credits maximum across the entire pilot, not 11 per game.
> * Output: Private research and shadow evaluation only.
> * Public NBA picks, sportsbook recommendations and product-leg activation remain disabled.
>
> If CI, deployment, provider availability or credit accounting cannot be verified in time, do not make paid requests
> after tip-off or silently extend the pilot to another slate. Report the blocker instead.
>
> Do not automatically enable NBA betting recommendations or alter market-promotion thresholds.

## Operative terms

NBA player props only (`basketball_nba`).

Prop markets authorized: `player_points`

Effective cumulative ceiling: 11 credits

| Term | Value |
|---|---|
| Scope | NBA player props only; the 2026-10-21 ET slate (up to 11 scheduled games); every other sport, market and slate is out of scope |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only (draftkings, fanduel, betmgm, williamhill_us, caesars, betrivers, fanatics, espnbet, betparx); no `regions=` |
| Endpoint | free `/v4/sports/basketball_nba/events` for the join; then per game `/v4/sports/basketball_nba/events/{id}/odds?markets=player_points` |
| Cadence | at most ONE successful capture per game, 20–75 minutes before tip; never at or after tip |
| Credit floor | every paid call requires remaining − 1 ≥ `ODDS_API_MIN_CREDITS_REMAINING` (2000); an unreadable balance stops the run before any paid call |
| Failures | any 401/429/5xx/unmodelled status or transport error stops the run; do not retry blindly; a transport error is booked as charged |
| Expiry | the 11-credit ceiling, or 2026-10-21 23:59 ET, whichever comes first |
| Output | PRIVATE_RESEARCH, productEligible false; no price or book name reaches any public page; no recommendation, product leg or promotion threshold changes |
| Kill switch | repo variable `NBA_PROPS_PILOT` set to `off` (next run makes no paid call); hard stop `gh workflow disable nba-props-pilot.yml` |

Approved by: founder 2026-10-21
