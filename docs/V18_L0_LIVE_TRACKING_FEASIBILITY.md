# v1.8 — L0: Live Tracking feasibility, owners and contract

**Date:** 2026-09-23 · **Branch:** `v18-live-tracking-l0` · **Base:** `0bd9d310d`
**Status:** discovery + evidence. **No code shipped, no provider activated, no env changed, no public surface added.**

Every claim below was probed against the live feeds today (all free, keyless, read-only) or read out of the
repository. Where something could not be verified, it says so.

---

## 1. The headline: most of L0's deliverable already exists — and one sport is built and dark

L0 was scoped as "design the contract and the join". **Both already exist**, shipped in v1.1 GameTime Live,
and they are better than a greenfield design would have been. What L0 actually found is a *gating* and
*coverage* question, not an architecture question.

| Piece | File | State |
|---|---|---|
| Live envelope contract | `src/lib/live/contract.mjs` | exists — states, competitors, **`makePlayerStat`**, typed refusals |
| Frozen-forecast join | `src/lib/live/forecast-join.mjs` | exists — **NFL player board ↔ live box score** |
| MLB adapter | `src/lib/live/adapters/mlb-statsapi.mjs` | exists — **team-level only** |
| NFL adapter | `src/lib/live/adapters/espn-nfl.mjs` | exists — **3 player markets** |
| Gateway | `app/api/live.mjs`, `app/api/_live-core.mjs` | exists — 20s memo, CDN `s-maxage` |
| Consumers | `/players/[sport]/[slug]`, `game-detail-page`, `live-panel`, `hub-data`, `preview-data`, `my/read-model` | wired |

**🔴 NFL live tracking is fully built and switched off in production.** Probed today:

```
GET /api/live?sport=mlb → {"schemaVersion":1,"sport":"mlb","events":[{...}]}
GET /api/live?sport=nfl → {"unavailable":true,"reason":"UNSUPPORTED_SPORT"}
```

`SUPPORTED_SPORTS = ["nfl","mlb"]`, but `publicSports()` defaults to `["mlb"]` and production's
`LIVE_PUBLIC_SPORTS` does not include `nfl`. **The first L1 increment may be a configuration decision
rather than a build** — and a Production env change is a founder gate (§10).

---

## 2. Ownership contract — preserved, and already enforced by construction

```
PRE-GAME FORECAST   immutable   model-owned        forecastGeneratedAt   never overwritten
LIVE EVENT STATE    ephemeral   provider-owned     fetchedAt             refreshed / cached
FINAL RESULT        canonical   settlement-owned   settledAt             never "live" again
USER PREFERENCES    local / device-owned
DEVICE OBSERVATION  local evidence of prior observation — never sports truth
```

Two existing properties are worth naming because they are enforced structurally rather than by discipline:

- **`forecast-join.mjs` is one-way by absence.** It exposes no function that writes, so a live value cannot
  reach a forecast artifact through it. Rule A is kept by there being no door, not by remembering not to
  use one.
- **The MLB adapter cannot settle.** Its header states it and its exports confirm it: a `FINAL` envelope is
  a live-feed observation, and settlement stays on the settlement path. This matters because StatsAPI
  reports a **postponed** game as `abstractGameState: "Final"` with no scores — already paid for once in
  production (PIT/MIL 2026-07-10), and now mapped from `codedGameState` C/D/U **before** the abstract state
  is consulted.

---

## 3. Feasibility matrix — probed today

All sources below are **free, keyless, and already approved**. No new provider is required for any of this.

| | MLB | NFL | EPL | UFC | NBA |
|---|---|---|---|---|---|
| **Live score** | ✅ public now | ✅ built, **gated off** | ✅ | ✅ | ✅ |
| **Period / clock** | inning, inningState, outs, count, bases | quarter, clock | match clock | **round + clock** (`period`, `displayClock`) | quarter, clock |
| **Team live stats** | runs, hits, errors | score | ✅ **rich** | n/a | ✅ |
| **Player live stats** | ✅ **available, not on the live path** | ✅ **3 mapped, more available** | ✅ **available, no adapter** | 🔴 **none** | ✅ available |
| **Source** | `statsapi.mlb.com/api/v1/schedule?hydrate=linescore,team` (live path) · `…/v1.1/game/{pk}/feed/live` (player stats) | ESPN `nfl/scoreboard` + `nfl/summary?event=` | ESPN `soccer/eng.1/scoreboard` + `summary` | ESPN `mma/ufc/scoreboard` | ESPN `basketball/nba/summary` |
| **Canonical event join** | `gamePk` | **board files are named `<espnEventId>.json`** | `athlete.id` / event id — no canonical map yet | bout = `competitions[]` entry | event id |
| **Canonical player join** | `mlb-person-<personId>` (contract already names it) | **`nfl-athlete-<espnId>` — already shared by board and box score** | `athlete.id` — **no canonical mapping exists** | `athlete.id` | `athlete.id` |
| **Payload size** | **86 KB** whole slate (schedule) · **742 KB per game** (feed/live) | scoreboard + one summary per game | one summary per match | one scoreboard | one summary per game |
| **Cadence / caching** | 20 s memo + CDN `s-maxage`; `MAX_UPSTREAM_BYTES` 3 MB; `UPSTREAM_TIMEOUT_MS` 6 s | same gateway | n/a | n/a | n/a |
| **Cost** | $0 | $0 | $0 | $0 | $0 |

### What each sport actually exposes (verified payloads)

**MLB** — `feed/live` per game carries, per player, `person.id` plus
`pitching.{strikeOuts, outs, inningsPitched, hits}` and
`batting.{hits, totalBases, rbi, runs, baseOnBalls, plateAppearances}`. That covers **pitcher strikeouts,
pitcher outs, hits, total bases, runs, RBI, walks and plate appearances** — every MLB family L0 was asked
about. It is already used by settlement (`scripts/mlb/settle-homer-nukes.mjs`), so it is a proven,
approved call. **The constraint is shape, not permission:** the live path fetches one 86 KB call for the
whole slate; player stats need one 742 KB call *per game*, so a 15-game slate is ~11 MB per refresh
against a 3 MB per-call ceiling and a 6 s timeout. Per-game, on-demand fetching (a game page, a tracked
card) fits; a whole-slate player refresh does not, without a different fetch strategy.

**NFL** — ESPN `summary` returns `boxscore.players[team].statistics[group]`:

| group | labels |
|---|---|
| passing | C/ATT, **YDS**, AVG, **TD**, INT, SACKS, QBR, RTG |
| rushing | **CAR**, **YDS**, AVG, **TD**, LONG |
| receiving | **REC**, **YDS**, AVG, **TD**, LONG, **TGTS** |

Athletes carry ESPN `id` (e.g. `2969939`). **Only three are mapped today** (`receiving:YDS`,
`receiving:REC`, `rushing:YDS`). Passing yards, passing TD, carries, targets and rushing/receiving TDs are
**present in the feed and unmapped**.

**EPL** — `boxscore.teams[].statistics` carries `totalShots`, `shotsOnTarget`, `wonCorners`,
`yellowCards`, `redCards`, `offsides`, `saves`, `possessionPct`, `accuratePasses`, `totalPasses`.
`boxscore.players` is **empty**, but `rosters[].roster[]` carries per-player `stats` —
`totalGoals`, `totalShots`, `shotsOnTarget`, `goalAssists`, cards, fouls — **plus participation state**
(`starter`, `active`, `subbedIn`, `subbedOut`). So EPL player tracking is feasible; the data is in
`rosters`, not `boxscore`, which is the kind of thing that is only knowable by looking.

**UFC — the strict answer is no.** The scoreboard's `competitions[]` **are** the bouts and carry
`competitors[].athlete.id`, `winner`, bout `status` (`STATUS_FINAL`), `status.period` (round) and
`status.displayClock`. But `competitors[].statistics` is **`[]` — structurally present and empty**. No
significant strikes, no total strikes, no takedowns, no control time, no knockdowns anywhere in the
payload. **UFC supports bout status, round and round clock only.** Anything stat-level would need a
different provider, i.e. a founder gate.

**NBA** — full player box score: `MIN, PTS, FG, 3PT, FT, REB, AST, TO, STL, BLK, OREB, DREB, PF, +/-`, with
`athlete.id`, `didNotPlay` and `active`. Everything L0 asked about is available. **NBA stays
`HISTORICAL_ONLY` and internal-only; nothing here changes its registry status or creates a public surface.**

### Not verified

**In-play behaviour.** Every probe above ran against `post`/`Final` events, because no NFL, EPL, UFC or NBA
game was in progress at 04:50 UTC on a Tuesday. The adapters' own headers record an in-play verification for
MLB (2026-09-15, 10 of 15 games Live) and for the ESPN scoreboard shape, but **this session did not observe a
live NFL box score mid-game.** Whether `summary` populates player stats continuously during a game, or only
materialises them at intervals, is the single open question before L1 ships. It is cheap to settle: one
observation during Thursday's ATL @ GB.

---

## 4. Forecast → live → settlement, per sport

```
PREGAME FORECAST (frozen)        IDENTITY JOIN                LIVE FACT              FINAL
────────────────────────────────────────────────────────────────────────────────────────────────
MLB  board + model-qualified  →  gamePk                    →  statsapi schedule   →  settlement
     props                       mlb-person-<personId>        (team) / feed/live      (official box)
NFL  nfl/player-board/            board FILE = <espnEventId>  ESPN summary        →  settlement
     <espnEventId>.json        →  nfl-athlete-<espnId>      →  (3 markets today)      (nfl results)
EPL  epl forecasts            →  ⚠ no canonical player map →  ESPN rosters[]      →  settlement
UFC  ufc bout forecasts       →  athlete.id (unmapped)     →  status/round ONLY   →  settlement
NBA  internal research only   →  athlete.id (unmapped)     →  ESPN summary        →  (internal)
```

**NFL's join needs no mapping table at all.** The player board is written to
`public/data/nfl/player-board/<espnEventId>.json` and its rows are keyed `nfl-athlete-<espnId>` — the same
identity the ESPN box score returns. A verified board row:

```json
{ "playerId": "nfl-athlete-4430807", "name": "Bijan Robinson", "team": "ATL",
  "participation": "AVAILABLE_ROLE_UNCERTAIN",
  "markets": { "player_reception_yds": { "p10": 23.3, "median": 56.9, "p90": 112.7 }, … } }
```

### Failure modes, and where each is already handled

| Failure | Handled today | Where |
|---|---|---|
| postponed reported as FINAL with no score | ✅ | MLB coded-state map, before abstract state |
| pre-game / Warmup reported as Live | ✅ | coded state `P` is not LIVE |
| unmapped player | ✅ null `playerId`, shown as fact, not joined | `makePlayerStat` |
| a row that will not join | ✅ dropped **and counted** (`unjoinedLiveRows`), never fuzzy-matched | `forecast-join` |
| player has not recorded anything yet | ✅ **null, never 0** | `joinNflPlayerBoard` |
| ambiguous event mapping | ✅ typed refusal `AMBIGUOUS_EVENT_MAPPING` | `UNAVAILABLE_REASONS` |
| provider error / malformed | ✅ typed refusals | `UNAVAILABLE_REASONS` |
| doubleheader | ⚠ gamePk is unique so it should hold — **not exercised on the live path** | — |
| stat correction after display | ⚠ **unhandled** — live value is shown, settlement re-grades; no reconciliation story | — |
| UFC fighter replacement / bout identity reuse | ⚠ moot — no in-bout stats to track | — |
| player never enters the game | partially — board `participation` exists; live side would show null | — |

---

## 5. `LiveTrackedForecast` — proposed, as a thin layer over what exists

The existing `LiveEventEnvelope` already owns live state, and `forecast-join` already produces the
comparison. The gap is a **named row type** joining one frozen forecast to one live fact, so Bank Builder,
Moonshot, `/my` and notifications can all read one shape. Proposed, reusing existing vocabulary rather than
minting new lifecycle concepts:

```
LiveTrackedForecast
  schemaVersion
  forecastId            the frozen forecast's own id
  sport · gameId        canonical; gameId = the board's providerEventId for NFL, gamePk for MLB
  entityId · entityType  "nfl-athlete-…" | "mlb-person-…" | team | "PLAYER" | "TEAM"
  market                 existing GameTime market key ("player_reception_yds")
  frozenRange { p10, median, p90 }     ← what GameTime actually published
  frozenLine?            null for NFL props (see §7) — present only where a line was really purchased
  publishedAt            forecastGeneratedAt — immutable
  currentValue           null when the feed has not stated one. NEVER 0.
  period · clock         from the envelope
  eventStatus            reuse LIVE_STATES: PRE | LIVE | FINAL | POSTPONED | CANCELLED | DELAYED | UNKNOWN
  participantStatus      reuse the board's `participation`
  comparison             BELOW | INSIDE | ABOVE | null   ← compareToRange, nothing more
  source · sourceEventId · sourceEntityId · fetchedAt
  freshnessState         reuse lib/live/freshness.mjs
  finalValue?            settlement-owned, absent until settled
  settlementStatus?      settlement-owned
  liveMarketLine? liveMarketOdds?   ← FOUNDER-GATED, absent (§8)
```

Two states in L0's brief are **deliberately not added** because an owner already exists:
`FINAL_PENDING_SETTLEMENT` is already the v1.1 game-lifecycle distinction between provider FINAL and
settlement, and `SOURCE_STALE` is already `freshness.mjs`. `IDENTITY_UNRESOLVED`, `STAT_UNAVAILABLE` and
`UNSUPPORTED` map onto the existing typed refusals rather than becoming a parallel vocabulary.

---

## 6. Factual progress semantics — observational only

`forecast-join` already encodes the rule, and it is stricter than L0 asked for: the comparison is
`BELOW | INSIDE | ABOVE` against the published range, and the copy layer is forbidden from implying
anything else. The screen-reader sentence is deterministic and ends with *"The pregame forecast is frozen
and has not changed."*

Extending it to a progress display:

- **Over a threshold:** `68 / 72 needed` — where 72 is the smallest integer strictly exceeding a half-line.
  Only expressible when a real frozen line exists (§7).
- **Against a range:** `68 · pregame range 23–113` — what NFL can actually say today.
- **Never:** "on pace", "% to hit", "expected remaining", "live edge", "live EV", "live confidence".
- **Integer thresholds.** A half-line has no push; an integer line does. A display that shows
  "N needed" must derive the target from the line's own settlement rule, not by rounding.
- **Unders.** State the current value and the line; do not imply the outcome. An under is not "winning"
  because the clock is running.
- **Corrections.** A live value can be revised downward by an official correction. The tracker is
  observational and settlement re-grades; the display must not treat a live value as a result.
- **Non-participation.** A player who never appears has a null value, not a zero.

---

## 7. ⚠ The brief's example needs one correction

L0's example shows `Frozen line: Over 71.5`. **GameTime does not have frozen NFL player-prop lines.** The
NFL odds receipt is live but **props are out of its scope**, so no prop line is purchased. What the board
publishes is the model's own p10–p90 range.

So the honest NFL display is **live value against the GameTime pregame range**, not against a book line —
which is exactly what `compareToRange` already does. `frozenLine` stays optional in the contract and is
populated only where a line was genuinely purchased. Shipping "Over 71.5" for NFL props would require a
props odds purchase: a founder gate, and a separate one from live odds.

---

## 8. Live odds — founder gate, and no approved source

No currently-approved provider supplies live in-play market lines. The Odds API receipts in force are
pregame, capped, and NFL props are out of scope. **L0 stops at the gap**, as instructed: nothing bought,
nothing wired, nothing scraped.

What a future decision would need to weigh: which sports and which market families, in-play update cadence,
request volume against a credit ceiling (the existing receipts are 500-credit ceilings with documented
worst-case multipliers), normalization burden against existing market keys, and whether live prices would
ever be allowed to touch model surfaces — they must not.

**Live odds are not a prerequisite for L1.** Factual progress against a frozen range needs no market data.

---

## 9. Recommended first L1 sport: **NFL**

On evidence, not preference. MLB is the incumbent public live sport and its season is ending; NFL's is
starting.

| criterion | NFL | MLB |
|---|---|---|
| adapter, contract, join, UI | **already built** | built, team-level only |
| player stats on the live path | **yes, 3 markets** | **no** — needs a new per-game fetch path |
| identity join | **zero mapping** — board file = espnEventId, rows = `nfl-athlete-<espnId>` | gamePk + `mlb-person-<id>`, unbuilt |
| PUBLISHED families with a range | **3** (rush yds, rec yds, receptions) | props are model-qualified; ranges differ |
| payload shape | one summary per game | **742 KB per game** vs a 3 MB cap |
| calendar | **Week 4 starting** | season ending |
| distance to users | **an env flag** (founder gate) | a build |

### L1 — Frozen Forecast Factual Progress (NFL)

**In scope:** `player_rush_yds`, `player_reception_yds`, `player_receptions` — the three families that are
both mapped in the adapter and `PUBLISHED` with a range. Join on `nfl-athlete-<espnId>` within
`<espnEventId>.json`. Live owner: ESPN `summary` through the existing gateway. Display: current value,
period/clock, and `BELOW | INSIDE | ABOVE` against the pregame range, with the frozen-forecast sentence.
Final handoff: settlement, unchanged — provider FINAL never settles. Fail closed: unjoined rows dropped and
counted, null never rendered as zero, typed refusal cards for provider failure.

**Explicitly out of scope:** live probability, live model, live EV, any recommendation change, live odds,
and the unmapped NFL families (passing yards is `ESTIMATE`, TD is `HOLDING` — trackable as fact, but they
have no PUBLISHED range to compare against, and putting a live number beside a held market would read as
the market quietly returning).

**Prerequisite:** one in-play observation of ESPN `summary` during a live NFL game (§3), and the
`LIVE_PUBLIC_SPORTS` env decision.

---

## 10. Founder gates reached

1. **Production env change** — adding `nfl` to `LIVE_PUBLIC_SPORTS` is what makes L1 visible.
2. **Live odds provider** — no approved source; not needed for L1.
3. **NFL player-prop lines** — needed only if a display must show a book line rather than a range.

Nothing else in L0 requires a decision. No provider was activated, no env var touched, no registry or
model status changed, no public surface added, and NBA remains `HISTORICAL_ONLY`.
