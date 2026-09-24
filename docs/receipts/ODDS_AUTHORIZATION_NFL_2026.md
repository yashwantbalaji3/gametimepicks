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

---

## AMENDMENT — 2026-09-24 · one-event player-prop probe AUTHORIZED

**Provenance:** founder, in session, 2026-09-24. This amendment narrows nothing and widens the
`Markets` row above for a single, bounded purpose. The original allowance, its NFL-only scope and
its 500-credit season ceiling are unchanged.

### Authorization (founder, 2026-09-24)

> Use the EXISTING paid The Odds API integration/entitlement first. You are authorized to use a
> SMALL, CONTROLLED amount of our existing Odds API credits for real discovery/testing/verification.
> Hard cap for this session: 150 Odds API credits.

and, on the probe specifically:

> DO NOT spend anything until the committed authorization receipt correctly records the
> founder-approved prop probe. DO NOT exceed the 150-credit cap. DO NOT retry absent markets.
> A provider 422 / absent market is evidence of NO_MARKET, not a retry target.

### Why the original exclusion no longer holds

The 2026-09-10 reasoning was: *"every NFL player family is rejected or held today, so those credits
would fund nothing publishable."* That premise has changed. `app/public/data/nfl/model-status.json`
now publishes **three** player families — `player_rush_yds`, `player_reception_yds`,
`player_receptions` — and the held one states its own gate as *"An offered anytime-touchdown market
plus current role evidence."* So a prop market is now a precondition for a published family rather
than funding nothing.

### Operative terms for this amendment

| Term | Value |
|---|---|
| Purpose | DISCOVERY — establish whether the current plan returns NFL player props at all |
| Scope | NFL only (`americanfootball_nfl`), pre-start events only — unchanged |
| Markets added | `player_anytime_td`, `player_pass_yds`, `player_rush_yds`, `player_reception_yds`, `player_receptions` — **these five keys only** |
| Endpoint | the per-event `/v4/sports/{key}/events/{id}/odds` route, for **ONE** event |
| Events | **one** eligible pre-start event per probe run |
| Regions | `us` — unchanged |
| Session cap | **150 credits**, and the dry run's worst case for the run is **8** (3 bulk + 5 prop) |
| Cumulative ceiling | **500** for the season — unchanged, 144 spent at the time of this amendment |
| Absent market | a 422 or an absent market key is **`NO_MARKET` evidence**. It is never a retry target |
| Retries | none. A failed-but-charged call still counts against the ledger |
| Expiry | the ceiling — unchanged |

### ⚠ A term this file states and the code does not enforce

`parseAuthorizationReceipt` validates the NFL-only scope, the cumulative ceiling, the no-floor term,
the no-blind-retry term and the expiry term. **It does not read the `Markets` row.** Its returned
`terms` string has said *"supported props, anytime TD"* throughout, so on 2026-09-24 the code would
have permitted a prop call while this document said props were out of scope — the same shape as the
expiry term whose first half went unread for two programs.

This amendment makes the document and the behaviour agree **for the right reason** — the founder has
authorized the probe — rather than by relying on a term nothing checks. Enforcing market scope in
the parser is a separate, deliberate change and is NOT made here; it is recorded so the next reader
knows the `Markets` row is currently documentation, not a control.
