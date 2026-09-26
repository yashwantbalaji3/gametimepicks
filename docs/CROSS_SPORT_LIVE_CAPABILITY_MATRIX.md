# Cross-Sport Live Capability — Matrix (Phase K)

**Date:** 2026-09-26
**Status:** capability audit. **No surface was widened, no sport was enabled, nothing was purchased.**
Every row was measured tonight against the live free endpoints.

---

## 0. What is public today, and what this is for

NFL and MLB factual live state are public. EPL and UFC are not, and the gateway refuses them by name:

```js
export const SUPPORTED_SPORTS = Object.freeze(["nfl", "mlb"]);
```

The purpose here is to say what each sport's provider **can actually support**, so that any later
decision to widen is made against evidence rather than against the feeling that data must be there.

**Fake parity is the failure mode this avoids.** Two sports having a "live" tab does not mean the two
are equally knowable, and a sport that can show a score but not a participant identity should not be
dressed as one that can.

---

## 1. The matrix

| | **NFL** | **MLB** | **EPL** | **UFC** |
|---|---|---|---|---|
| Public today | **yes** | **yes** | no | no |
| Canonical gateway owner | yes — `espn-nfl.mjs` | yes — `mlb-statsapi.mjs` | **none** | **none** |
| Live event status | yes | yes | yes *(with a caveat, §2)* | **yes** — per bout |
| Live score | yes | yes | yes | n/a — bouts, not scores |
| Clock / period / inning / round | quarter + clock | inning + half | minute | `format` gives rounds; no live clock |
| Stable event id | ESPN event id | `gamePk` | ESPN event id | ESPN event id + per-bout id |
| Stable participant id | `nfl-athlete-<espnId>` | `mlb-person-<personId>` | ESPN athlete id | **competitor id** ⚠ *not* `athlete.id` |
| Useful live player stats | **3 PUBLISHED families** | **none by design** *(§3)* | untested | **none available** *(§4)* |
| Final result | yes | yes | yes | yes — `winner` flag per bout |
| Settlement-quality evidence | yes — prop ledger | yes — StatsAPI box scores | scores yes; players untested | result yes; method untested |
| Provider cost | free (ESPN) | free (StatsAPI) | free (ESPN) | free (ESPN) |
| Historical replay | yes | yes | yes | yes |
| Availability truth | yes | yes — confirmed lineups | **yes, newly** — FPL, see the [availability matrix](EPL_AVAILABILITY_PROVIDER_MATRIX.md) | roster/card only |

---

## 2. ⚠ EPL — the soccer scoreboard's default window is NOT "now"

Measured at `2026-09-26T08:27Z`:

```
GET /sports/soccer/eng.1/scoreboard        → day.date: 2026-09-20, four events, all `post`
GET /sports/soccer/eng.1/scoreboard?dates=20260926 → 0 events
```

The plain call returns the **last matchday**, six days stale, with four finished fixtures. The dated
call correctly returns nothing, because there are no EPL fixtures today — the league is in an
international break until **2026-10-10**.

**A naive live read would therefore publish six-day-old finished matches as the current slate.** Any
EPL live work must pass an explicit `dates=` and treat the default window as "last matchday", never
as "now". This is the same class as the odds feed whose event list is not a pregame list.

EPL is otherwise the best-placed of the two unsupported sports: stable ESPN ids already in our corpus,
a confirmed XI in the match summary, and — as of tonight's research — a free official availability
feed. What it lacks is a gateway adapter and the pre-kickoff XI timing test.

---

## 3. MLB has no live player stats **by design**, and that is not a gap to close

The gateway deliberately carries `playerStats: null` for MLB, and the reason is not the feed:

> A live comparison needs a published GameTime range on the other side. MLB has none per player —
> `full-game-simulations` emits no per-player output even on a `ready` game, and `player-props` is a
> bookmaker price list, not a GameTime forecast.

So a live MLB player stat would sit either beside nothing or beside a market price dressed as our
projection. **Adding one would create the appearance of parity with NFL without the forecast that
makes NFL's version meaningful.** Closing this means publishing an MLB per-player range first, which
is a modelling decision and not a live-capability one.

---

## 4. ⚠ UFC — bout state yes, live striking statistics no

Tonight's card (`600061266`, *UFC Fight Night: Rosas Jr. vs. Barcelos*, 2026-09-26T21:00Z) carries
**12 bouts**, each with its own id, a typed status, a `format` giving the round structure, and a
`winner` flag per competitor. That is a genuine live-bout capability: scheduled → in progress →
final, with a result.

What it does **not** carry is statistics. The summary endpoint returns an error object:

```
GET /sports/mma/ufc/summary?event=600061266 → { code, message }
```

No boxscore, no statistics, no play-by-play. **So live striking numbers are not available and must
not be invented** — the round-by-round significant-strike counts a viewer sees on a broadcast are not
in this feed.

⚠ One identity detail for whoever builds this: the fighter id is on `competitor.id` (e.g. `4683395`),
**not** on `competitor.athlete.id`, which is undefined here. Reading the NFL/MLB way returns nothing.

---

## 5. What could be added, and what it would cost in truth

Ordered by evidence, not by appeal.

**1. UFC bout state — the cleanest.** Stable ids, typed status, a real result, free, and a card
tonight. It needs a gateway adapter and a `SUPPORTED_SPORTS` entry. It publishes bout state and
result only; anything about how a fight is going stays out.

**2. EPL match state — close behind, with one correction first.** Everything is present except a
gateway adapter, and the explicit-`dates=` rule from §2 must be built in from the first line rather
than discovered later. Best done after 2026-10-10, when the XI timing question can also be answered.

**3. MLB player stats — not a live problem.** See §3.

---

## 6. ⚠ The hub is a product decision, not a consequence of this audit

`/live` and `/my` read `useLiveSlate("mlb")` and are labelled **"MLB · beta"** in the navigation. That
label is **truthful today**, and it stayed truthful when NFL live shipped, because NFL live lives on
the game page rather than in the hub.

Widening the hub because a backend can serve another sport would be the wrong order. A multi-sport
hub needs its own decisions about state ownership, filtering, nav and what a reader is promised — and
a second batch request per reader is a real cost. **Nothing here proposes changing it**; this document
exists so that when someone does, the capability side is already answered.
