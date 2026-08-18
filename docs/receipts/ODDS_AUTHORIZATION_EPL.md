# Founder Odds-API Authorization — Premier League only

**Provenance:** delivered by the founder in session on 2026-08-18, in response to a request that
priced each option before it was chosen. Committed here so the repository carries the receipt the
credit-guard contract requires before any paid EPL call. This is a SEPARATE allowance from
`ODDS_AUTHORIZATION_P171.md` (NFL) and `ODDS_AUTHORIZATION_UFC.md` (UFC/MMA); none of the three can
fund another's calls.

## Authorization (verbatim)

> yes authorize the EPL odds

Operative terms selected by the founder in the same exchange, from options priced in advance:

> **Ceiling — 500 credits.** At ~3 captures per matchweek across 38 matchweeks that is roughly two
> seasons with totals included — comfortably past the point where the calibration verdict is known.
>
> **Markets — match result and total goals.** Unlike UFC, where method and round were rejected on
> their preregistered bars, both of these are real model outputs that have never been tested against
> a market (1X2 logLoss 1.0017 vs 1.0986 uniform, draw ECE 0.0262, totalMAE 1.316). Buying both
> gives two independent chances to find a validated read, or to refuse one honestly.

## Why this receipt is the gate the model asked for

The committed EPL model card states its own objective as *"private pre-event 1X2 + exact-score +
total-goals distributions for EPL fixtures; research comparison against three-way no-vig markets
**only after an authorized snapshot exists**"*, and carries `publicActivation: "OFF"`. This receipt
creates that snapshot. It does not activate anything: the comparison is the calibration bar, and
three MLB markets and two NFL models have already been rejected at exactly that step.

## Operative terms

| Term | Value |
|---|---|
| Scope | Premier League only (`soccer_epl`) — every other sport key out of scope, NFL and UFC included |
| Cumulative ceiling | **500 credits** (circuit breaker, not scarcity) |
| Markets | **`h2h` and `totals` only** — Asian handicap, cards, corners, scorer and every other market are OUT OF SCOPE |
| Regions | `us` — one region; the cost of a call is regions × markets |
| Endpoint | the BULK `/v4/sports/{key}/odds` route only. The per-event route is out of scope at any volume — it costs one credit per fixture where the bulk route prices the whole matchweek for two |
| Cadence | up to three captures per matchweek, pre-kickoff only |
| Permitted purposes | preflight · pre-kickoff matchweek captures · the model card's no-vig research comparison |
| Discipline | cumulative private credit ledger per run, separate from the NFL and UFC ledgers; failed charged calls count; do not retry blindly; stop before any call whose worst case would breach the ceiling; redact and self-scan every receipt |
| Expiry | the 500-credit cumulative ceiling |

## What this receipt does NOT authorize

- Any NFL or UFC call. Those allowances are separate receipts with their own ceilings and ledgers.
- Any market beyond `h2h` and `totals`.
- The per-event odds endpoint, at any volume.
- Publishing an EPL read. Prices may be quoted and graded; a model claim requires passing the
  calibration bar first, and nothing here presumes it will.
- Changing the subscription, or placing any wager. Nothing on this site places wagers.

## Consumption ledger

Maintained privately per run at `data/internal/research/odds/epl/authorization-ledger.json`
(request purpose, events, market keys, regions, status, credits used, provider-reported remaining).
The key, the account and raw provider payloads are never recorded.

**Cumulative EPL spend at this commit: 0.**
