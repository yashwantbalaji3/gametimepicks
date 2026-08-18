# Founder Odds-API Authorization — UFC / MMA only

**Provenance:** delivered by the founder in session on 2026-08-18, in response to a request that
named the cost of each option before it was chosen. Committed here so the repository carries the
receipt the credit-guard contract requires before any paid UFC call. This is a SEPARATE allowance
from `ODDS_AUTHORIZATION_P171.md` — that receipt is NFL-only and explicitly could not fund a fight
card; this one cannot fund an NFL slate.

## Authorization (verbatim)

> yes authorize the UFC odds.

Operative terms selected by the founder in the same exchange, from options priced in advance:

> **Ceiling — 500 credits.** ~3 years of Tue/Thu/Sat bulk captures at 1 credit each. Tight enough
> that a runaway loop or an accidental per-event call trips it within days, loose enough it never
> blocks normal operation.
>
> **Market scope — h2h only.** Fight-winner prices only. It is also the only UFC market our model
> publishes a validated read for (the winner head passed its preregistered bar; method and round
> were rejected), so anything else buys prices nothing can use.

## Operative terms

| Term | Value |
|---|---|
| Scope | UFC/MMA only (`mma_mixed_martial_arts`) — every other sport key out of scope, NFL included |
| Cumulative ceiling | **500 credits** (circuit breaker, not scarcity) |
| Markets | **`h2h` only** — method-of-victory, round and prop markets are OUT OF SCOPE |
| Regions | `us` — one region; the multiplier on every call is regions × markets |
| Endpoint | the BULK `/v4/sports/{key}/odds` route only. The per-event route is out of scope: the July 2026 capture used it and paid 20 credits for one card that bulk prices for 1 |
| Cadence | the existing fight-week cron — Tuesday, Thursday and Saturday mornings (7am ET) |
| Permitted purposes | preflight · the fight-week bulk h2h capture · a pre-card refresh on the day of the event |
| Discipline | cumulative private credit ledger per run, separate from the NFL ledger; failed charged calls count; do not retry blindly; stop before any call whose worst case would breach the ceiling; redact and self-scan every receipt |
| Expiry | the 500-credit cumulative ceiling |

## What this receipt does NOT authorize

- Any NFL call. The NFL allowance is `ODDS_AUTHORIZATION_P171.md` and has its own ceiling and ledger.
- Any market other than `h2h`, including the method and round markets our own model was refused
  permission to publish.
- The per-event odds endpoint, at any volume.
- Changing the subscription, or placing any wager. Nothing on this site places wagers.

## Consumption ledger

Maintained privately per run at `data/internal/research/odds/ufc/authorization-ledger.json`
(request purpose, events, market keys, regions, status, credits used, provider-reported remaining).
The key, the account and raw provider payloads are never recorded.

**Cumulative UFC spend at this commit: 0.**
