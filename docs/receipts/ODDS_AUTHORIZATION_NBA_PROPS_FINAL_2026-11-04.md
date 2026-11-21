# Founder Odds-API Authorization — NBA player props, final targeted capture for Bank Builder & Moonshot research selections, 2026-11-04 ET slate

**Provenance:**
- Delivered by the founder directly in the November Program Director session on 2026-11-04 at about 3:25 PM ET.
- It follows the expanded props receipt (`ODDS_AUTHORIZATION_NBA_PROPS_EXPANDED_2026-11-04.md`), whose ledger stands at 95 credits. The same ledger continues (`data/internal/research/odds/nba/authorization-ledger.json`).
- Guard: `parseNbaPropsReceipt` (`app/src/lib/sports/odds/nba-props/credits.mjs`).

## Authorization (verbatim)

> Approved: authorize up to 6 additional Odds API credits for one final player-prop price capture on no more than two selected NBA games, subject to the existing daily, weekly and minimum-credit safeguards. The separately authorized one-credit moneyline refresh remains unchanged.
> At approximately 4:05 PM ET, capture only the necessary fresh prices for the selected candidates.

## Operative terms

NBA player props only (`basketball_nba`), for the 2026-11-04 ET slate.

Prop markets authorized: `player_points`, `player_rebounds`, `player_assists`

Effective cumulative ceiling: 101 credits

| Term | Value |
|---|---|
| Scope | One targeted main-line capture of at most two games that hold the selected Lane B prop candidates. ≤ 3 credits per game. |
| Ceiling | 95 prior + up to 6 new = 101. |
| Sportsbooks | `bookmakers=` the nine eligible-operators@1 keys only. No `regions=` (1 region-unit). |
| Cadence | Once, at about 4:05 PM ET (21:05Z), before tip. No polling, no automatic retries. |
| Daily ceiling | Counts within the BBM V2 receipt's 120-credit daily ceiling together with the moneyline captures. |
| Credit floor | Every paid call requires remaining − cost ≥ 2000. An unreadable balance stops the run before any paid call. The shared 3,500/week budget applies across all jobs. |
| Failures | Any 401/429/5xx, unmodelled status or transport error stops the run. Do not retry blindly. A transport error is booked as charged. |
| Expiry | The 101-credit cumulative ceiling, or 2026-11-04 23:59 ET, whichever comes first. |
| Storage | Price records only in the private directory outside every repository (`~/gtp-private/odds/nba/props/`). Only the credit ledger (no line, no price) is committed. |
| Output | Private research plus the founder-approved display paths only: the site's encrypted display, and Bank Builder & Moonshot graphics under `challengeGraphics`. Never in plain public JSON, a feed or a downloadable file. |
| Kill switch | Do not run the capture. The receipt refuses on its own after its expiry or ceiling. |

Final capture: one pre-publication re-quote per selected game (phase `final`, its own once-per-game slot, separate from the earlier pregame capture), at most two games, same markets, books, ceiling, floor, stop conditions and private storage. A 21:05Z attempt under the pregame phase spent 0 credits (ALREADY_CAPTURED) and did not use this slot.

Approved by: founder 2026-11-04
