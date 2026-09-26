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

---

## AMENDMENT 3 — 2026-09-26 · NFL in-play team-market capture, and a bounded Phase H pilot

**Provenance:** given by the founder in session on 2026-09-26, answering
[`docs/LIVE_ODDS_DECISION_PACKAGE.md`](../LIVE_ODDS_DECISION_PACKAGE.md).

> ⚠ **The decision package this answers cited the wrong receipt.** It read `ODDS_AUTHORIZATION_P171.md`
> — superseded by THIS document on 2026-09-10 — and therefore reported "3,000 ceiling, 394 spent,
> 2,606 remaining". The operative position is the **1,160-credit effective ceiling above, 394 spent,
> 766 remaining**, and the package also omitted the **333 credits/week** the configured prop cadence
> already commits. The founder's decision is recorded here against the corrected numbers.

### Authorization (verbatim, founder, 2026-09-26)

> Extend P171's permitted purpose to include NFL in-play team-market capture only, using the
> existing provider and existing authorization ceiling.
>
> You are authorized to make one 3-credit probe during a genuinely live NFL game to determine
> whether the provider returns legitimate post-kickoff team-market data.
>
> If the probe succeeds you are pre-authorized to continue autonomously into a limited NFL
> game-level live-odds pilot for Sunday's slate at approximately 30-minute cadence, with a hard
> incremental Phase-H budget of 90 credits for the Sunday slate.
>
> Do not build or purchase live player-prop odds in this phase.

The founder named P171; P171 is superseded, so the extension is applied to the receipt that actually
governs NFL spend. Nothing else about it changes.

### What changes

| Term | Was | Now |
|---|---|---|
| In-play capture authorized | not permitted — "pre-kickoff only" | **YES — NFL team markets only** (`h2h`, `spreads`, `totals`) |
| In-play player props | out of scope | **NO — explicitly refused in this phase** |
| Probe allowance | none | **exactly ONE** call, worst case 3 credits, only while a game is genuinely in progress |
| Phase H incremental budget | none | **90 credits** for the Sunday slate |
| Pilot cadence | none | approximately 30 minutes, live games only, stopping when a game is terminal |
| Cumulative ceiling | 1,160 credits | **1,160 credits — UNCHANGED.** This amendment buys scope, not headroom |

Pre-start capture, the five prop keys, the `us` region, the bulk and per-event endpoints and the
no-blind-retry discipline are all unchanged.

### The live-market truth contract

A probe or pilot response may be recorded as live-market evidence only when all of these hold:

1. the event is already in progress at capture time;
2. the provider's capture instant is after kickoff;
3. sportsbook attribution is preserved (a named book, never an aggregate);
4. market identity is preserved (the provider's own market key, and only the three authorized);
5. the value is **not** merely the frozen pregame snapshot replayed back;
6. the frozen pregame block is untouched by the capture.

Failing any of these the lane is marked unsupported with this provider, and **no further probe is
made to obtain a more favourable result**.

### Three layers, never merged

```
FROZEN PREGAME GAMETIMEPICKS FORECAST   ours, immutable
CURRENT FACTUAL LIVE GAME STATE         the provider's facts
CURRENT SPORTSBOOK MARKET               a third thing, separately owned and separately stamped
```

A later live sportsbook value must never be displayed as though GameTimePicks had seen it before
kickoff. The frozen line, the frozen book, the frozen projection and the original pregame capture
timestamp are immutable.

### ⚠ What 93 credits actually costs, against the real position

| | credits |
|---|---|
| Effective ceiling | 1,160 |
| Spent | 394 |
| **Remaining** | **766** |
| Already committed each week by the configured prop cadence | **333** |
| Phase H probe + pilot | **93** |

At the configured burn there are roughly **two weeks** of season inside the remaining allowance, and
Phase H takes about **28% of one week**. That is affordable and it is not free; a further extension
of the season's pregame cadence is the thing it trades against.
