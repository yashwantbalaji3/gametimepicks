# DRAFT — NFL Odds-API Authorization Request (2026 regular season)

**THIS IS NOT AN AUTHORIZATION.** Nothing reads this file: the NFL capture reads
`ODDS_AUTHORIZATION_P171.md` only, whose Program-scoped expiry lapsed at Program 171 close, and
`capture-nfl-odds.mjs` has exited `AUTHORIZATION_EXPIRED` (cleanly, zero spend) since. This draft
exists so the decision in front of the founder is priced and exact, the way the EPL and UFC
receipts were (P240 · Release B). To authorize: copy the operative table below into
`docs/receipts/ODDS_AUTHORIZATION_P171.md` (or a successor file the capture is pointed at) with
the founder's own words, in its own commit.

## What it buys

Week 1 kicks off Wed 2026-09-09 20:20 ET (NE@SEA). The capture, join, ledger, ceiling guard and
clean-refusal path are all built and tested (P227: ENGINEERING_COMPLETE, ACQUISITION_GATED); the
scheduled `nfl-event-window.yml` chain (15:00Z/21:00Z/14:30Z) already wires `--receipt` and runs
inside each game's own pre-kickoff window. The only missing input is a current allowance.

## Priced options

| Option | Cost shape | Season projection |
|---|---|---|
| A. Team markets only (`h2h`,`spreads`,`totals`, bulk, `us`) | 3 credits per capture (markets × regions; never hardcode — the guard recomputes) | ~3 captures/week × 18 weeks ≈ **162 credits** |
| B. A + anytime-TD props | per-event route required for props: ~1 credit × ~14 events × capture | **~800–1,000 credits**; player families are all rejected/held today (player-families-public.json), so these prices would fund nothing publishable yet |

Option A is the recommendation: it prices the three families the team model actually publishes,
and the market-comparison column the frozen regular-season evaluation contract requires
(`regular-season-evaluation-contract.json`: the win head must be REPORTED beside the de-vigged
market on identical games). Option B can be a later, separate decision once any player family
passes its own bar.

## Proposed operative terms (Option A)

| Term | Value |
|---|---|
| Scope | NFL only (`americanfootball_nfl`) — every other sport key out of scope, EPL and UFC included |
| Cumulative ceiling | **250 credits** (circuit breaker: ≈1.5× the projected season spend) |
| Markets | **`h2h`, `spreads`, `totals` only** — props and every other market OUT OF SCOPE |
| Regions | `us` — one region; a call costs regions × markets |
| Endpoint | the BULK `/v4/sports/{key}/odds` route only |
| Cadence | up to three captures per game week, pre-kickoff only |
| Expiry | the ceiling |

The `Expiry: the ceiling` row parses as CEILING_ONLY under the committed `expiryTerm()` — no code
change is needed for this receipt to take effect.
