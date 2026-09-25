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

---

## AMENDMENT 2 — 2026-09-24 · full-week NFL pregame prop coverage

**Provenance:** founder, in session, 2026-09-24, superseding the deliberately conservative
experimental caps for this scoped NFL rollout. The provider/account hard limit still wins.

> Credit conservation is not the priority for this phase. … You may spend up to 1,000 ADDITIONAL
> Odds API credits during this NFL full-week rollout without asking me again, provided: every paid
> request is accounted for; no blind retries occur; 401/403/422/provider errors remain fail-closed;
> duplicate requests are avoided where the same fresh capture can be reused; requests exist to
> produce or validate useful product data; credits are not burned solely to make a demo look
> populated.

### The operative number

**Effective cumulative ceiling: 1,160 credits** — 160 spent when this amendment was written, plus the
1,000 the founder authorized. This line is what `parseAuthorizationReceipt` reads; it exists because
an appended amendment would otherwise lose to the original term simply by coming second in the file.

### What changes

| Term | Was | Now |
|---|---|---|
| Cumulative ceiling | 500 credits | **1,160 credits** — 160 spent at this amendment, plus the 1,000 authorized |
| Events per prop run | one probe event | **every eligible pre-start event in the active NFL week** |
| Window | 40-hour horizon | the canonical schedule owner's active `(seasonType, week)` |
| Scheduled prop refreshes | none | **up to 4/day** during the active week, *provided the volume stays inside the ceiling* |

Everything else is unchanged: NFL only, `us` region, the same five prop keys, pre-start only, no
blind retries, a 422 or absent market recorded as `NO_MARKET` evidence rather than a retry target.

### ⚠ The cadence is CONDITIONAL, and the arithmetic is the condition

A full-week sweep is 16 events × 5 markets = **80 credits**, plus the 3-credit bulk team call. Four
such sweeps a day is 320/day, and Thursday→Monday at that rate is ~1,500 — **over the authorization**.
So "up to 4/day" cannot mean "4 full sweeps a day", and the schedule must be sized against the
ceiling rather than against the sentence. The cadence actually configured is recorded with its
arithmetic when it is set; the machine ceiling above is what enforces it either way.

---

## CADENCE RECORD — 2026-09-25 · the configured prop-sweep schedule, with its arithmetic

Amendment 2 left the cadence to be "recorded with its arithmetic when it is set". This is that
record. It is not a new authorization: nothing here widens scope, markets, regions or the ceiling.

### What is configured

Six `nfl-event-window.yml` cron entries sweep player props; every other scheduled run is unchanged
and still spends exactly the bulk call's three credits.

| When (ET) | Cron (UTC) | Pre-start events | Credits |
|---|---|---|---|
| Fri 09:00 | `0 13 * * 5` | 15 | 78 |
| Sat 09:00 | `0 13 * * 6` | 15 | 78 |
| Sun 09:00 | `0 13 * * 0` | 15 | 78 |
| Sun 12:30 | `30 16 * * 0` | 15 | 78 |
| Sun 19:00 | `0 23 * * 0` | 2 (SNF, MNF) | 13 |
| Mon 18:00 | `0 22 * * 1` | 1 (MNF) | 8 |
| **Week total** | | | **333** |

Plus the one-off full-week backfill that opens the rollout: **78**. Rollout week = **411** of the
1,000 the founder authorized.

### Why this shape

- **Denser nearer kickoff, because that is where a line moves.** Two of the six sit inside the last
  four hours before the first kickoff.
- **A completed game is never queried.** The capture's window is pre-start events only, so the
  slate empties itself: by Sunday evening thirteen games have started and the sweep costs 13
  credits rather than 78. The taper is a property of the window, not a rule someone must remember.
- **"Up to 4 refreshes/day" is a ceiling on permission, not an instruction.** Four full sweeps a
  day is 312/day and ~1,500 Thursday→Monday — over the allowance. The cadence is sized against the
  arithmetic instead of against the sentence.

### ⚠ These crons recur, and the allowance does not

A later week draws on the same 1,000. At roughly 333/week the allowance funds about three weeks
including this one. Nothing here renews itself: `assertCallAllowed` refuses before the first call
whose worst case would cross **1,160 cumulative**, and that refusal is a DECISION OWED to the
founder, not a broken job — the chain runs on the last committed capture for zero credits either
way.

### Where the cadence lives

In the cron list itself. The odds step identifies a sweep window by the cron expression that fired
it (`github.event.schedule`), so adding or removing a sweep is one edit in one place and the
schedule cannot drift from the arithmetic written beside it. A `workflow_dispatch` input overrides
outright, in both directions.
