# Founder Odds-API Authorization — NBA player props, PRIVATE capture, 2026-10-28 → 2026-10-31

**Provenance:** delivered by the founder in the release-owner session ("GameTimePicks Launch Readiness") on 2026-10-28,
after the NBA lines plan (`GameTimePicks_Launch_Program_2026-10-28/NBA_LINES_PLAN.md`, draft PR #1279). Committed so the NBA
credit guard (`parseNbaPropsReceipt`, `app/src/lib/sports/odds/nba-props/credits.mjs`) has a current receipt before any paid
NBA call. Its ledger is `data/internal/research/odds/nba/authorization-ledger.json` (the 2026-10-21 pilot's 11 credits are
already on it; the ceiling below counts them).

## Authorization (verbatim)

> 1. Approve private NBA odds capture
> You may enable and run the existing NBA odds capture workflow using our current Odds API subscription, subject to the
> existing monthly credit allowance.
> * Keep capture private and read-only.
> * Do not enable public sportsbook-price display or redistribution until provider terms are verified.
> * Do not commit raw odds or private capture files to the public repository.
> * Record credits consumed, coverage, provider/bookmaker, market, timestamp and capture failures.
> * Do not purchase additional credits or enable a paid service without my separate approval.

## Operative terms

NBA player props only (`basketball_nba`).

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`, `player_threes`, `player_points_rebounds_assists`, `player_points_rebounds`, `player_points_assists`

Effective cumulative ceiling: 1,011 credits

| Term | Value |
|---|---|
| Scope | NBA player props only; the seven official model families above; every other sport, market (incl. game lines) and product is out of scope |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only (draftkings, fanduel, betmgm, williamhill_us, caesars, betrivers, fanatics, espnbet, betparx); no `regions=` |
| Endpoint | free `/v4/sports/basketball_nba/events` for the join; then per game `/v4/sports/basketball_nba/events/{id}/odds` with the markets above |
| Cadence | at most ONE successful capture per game, 20–75 minutes before tip; never at or after tip |
| Credit floor | every paid call requires remaining − cost ≥ `ODDS_API_MIN_CREDITS_REMAINING` (2000); an unreadable balance stops the run before any paid call |
| Failures | any 401/429/5xx/unmodelled status or transport error stops the run; do not retry blindly; a transport error is booked as charged |
| Expiry | the 1,011-credit cumulative ceiling, or 2026-10-31 23:59 ET, whichever comes first |
| Storage | price records ONLY in a private directory outside every repository (founder storage decision 2026-10-22); the capture runs on the release owner's machine, never on a GitHub-hosted runner (public logs, no private storage); only the credit ledger (no line, no price) may be committed |
| Output | PRIVATE_RESEARCH, productEligible false; no price, line or book name reaches any public page, export or social graphic; no recommendation, product leg or promotion threshold changes |
| Kill switch | stop the local schedule (no further runs); the receipt refuses on its own after its expiry or ceiling |

Approved by: founder 2026-10-28
