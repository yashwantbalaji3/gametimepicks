# Founder Odds-API Authorization — NFL 2026 regular season (NFL only)

**Provenance:** given by the founder in chat on 2026-09-10 (Program 256 · Task 7), answering the
question "authorize one small odds test to unlock betting-market comparisons for more sports?".
Recorded verbatim below, in its own commit, applied to the priced options in
`DRAFT_ODDS_AUTHORIZATION_NFL_2026_REGULAR.md`. It replaces `ODDS_AUTHORIZATION_P171.md` as the
receipt the NFL capture reads; that one lapsed at Program 171 close and has refused every capture
since (`AUTHORIZATION_EXPIRED`, zero spend).

## Authorization (verbatim, founder, 2026-09-10)

> We are not even using 30-40% of the credit limit we get per month - so we can afford to be lavish
> on spending API credits

## How it is applied

Option A of the draft — team markets — because it funds exactly what the site publishes: the
market-comparison column the frozen regular-season contract requires beside the win head. Player
props (Option B) stay out of scope: every NFL player family is rejected or held today, so those
credits would fund nothing publishable. "Lavish" sets the ceiling at roughly three times the draft's
162-credit season projection rather than its 1.5×. Provider balance on 2026-09-10: 16,044 credits
(CI usage header on the MLB team-markets ingest).

## Operative terms

| Term | Value |
|---|---|
| Scope | NFL only (`americanfootball_nfl`) — every other sport key out of scope, EPL and UFC included |
| Cumulative ceiling | **500 credits** for the 2026 NFL regular season (a circuit breaker, not scarcity) |
| Remaining-balance floor | **NONE** for this allowance — the shared MLB floor (`ODDS_API_MIN_CREDITS_REMAINING`) still protects the rest of the account |
| Markets | `h2h`, `spreads`, `totals` only — props and every other market OUT OF SCOPE |
| Regions | `us` — one region; a call costs regions × markets |
| Endpoint | the BULK `/v4/sports/{key}/odds` route only |
| Cadence | the scheduled `nfl-event-window.yml` captures, pre-kickoff only |
| Expiry | the ceiling |
| Discipline | cumulative private credit ledger per response; failed charged calls count; do not retry blindly; stop before any call whose worst-case cost breaches the ceiling; redact + self-scan every receipt |

## Ledger continuity

The capture keeps one cumulative ledger (`data/internal/research/odds/nfl/p171-ledger.json`), which
already records 69 credits spent under Program 171. They count against this ceiling too — the
conservative direction for a circuit breaker.
