# GameTime Live — architecture, providers, cost and runbook (v1.1)

One document, seven sections. Written 2026-09-15/16, the session that built the first Live vertical
slice. Everything stated as verified here was measured in that session and the measurement is named.

**Status: Stage 1 — internal preview. Public rollout is OFF and needs a founder decision (§7).**

---

## 1. Architecture decision

### Decision

Live state is served by **one Vercel serverless function beside the untouched static export**:
`app/api/live.mjs`, reached at `/api/live`. The Next app keeps `output: "export"` exactly as before.

### Why this is safe — it is not a new capability

The repository **already runs serverless functions beside the static export**. Project-root
`app/api/*.mjs` is Vercel's own function convention (the Next app lives under `src/`, so `api/` is
not Next's app directory), and three functions plus two crons have shipped this way since Program
092. Verified in production 2026-09-15:

```
GET https://gametimepicks.yashwantbalaji.com/api/collect/     -> 204   (the function ran)
GET https://gametimepicks.yashwantbalaji.com/api/zzz-not-real/ -> 404  (nothing else answers there)
```

So the answer to "where can runtime live data execute without breaking static v1.0" is: **in a place
that already exists and is already proven**. No `output: export` change, no SSR migration, no second
project, no new service.

### Alternatives rejected

| option | why not |
|---|---|
| **A · separate live gateway project** | Solves a problem we do not have. The static project already hosts functions; a second project means a second deploy, a second env surface and a cross-origin hop for zero benefit. Reconsider only if live traffic needs independent scaling. |
| **C · browser fetches the provider directly** | Fails the cost model outright: upstream volume would scale with READERS, not with events. Also puts an undocumented provider schema one `JSON.parse` from a React component, and depends on provider CORS we do not control. |
| **rebuild-to-publish (cron → artifact)** | The prohibited shortcut. Forecast artifacts are built; live state is not. A static artifact that asserts something about the present is precisely the Phase 6 release blocker. |
| **drop `output: export`** | Explicitly out of scope, and unnecessary — see above. |

### Rollback

Two independent switches, neither of which rebuilds a model artifact:

- `LIVE_GATEWAY_ENABLED` (server) — unset and every request answers `FEATURE_DISABLED` on the next
  invocation. No upstream call is made. **Default is OFF.**
- `NEXT_PUBLIC_LIVE_ENABLED` (build) — unset and `LivePanel` renders `null`: no markup, no polling.
  **Default is OFF**, so the current production build contains no live UI at all.

---

## 2. The lifecycle truth contract

Three owners, never collapsed into one mutable object:

```
PRE-GAME FORECAST         LIVE EVENT STATE             FINAL RESULT
immutable                 ephemeral                    canonical
model-owned               provider-owned               settlement-owned
forecastGeneratedAt       fetchedAt                    settledAt
never overwritten         refreshed / cached           never "live" again
```

**Rule A — one frozen pregame truth.** A forecast is generated at a named instant and never changes
after kickoff. Enforced structurally: `lib/live/forecast-join.mjs` exports six read-only functions
and nothing that writes, so there is no call through which a live value could reach an artifact. A
test enumerates that export surface, so adding a writer is a visible test change.

**Rule B — the present is recomputed on the reader's clock.** Freshness is derived from `fetchedAt`
against `Date.now()` at render, never frozen into the payload. One cached envelope is FRESH to a
reader at +10s, DELAYED at +60s and STALE at +300s — pinned with injected clocks.

**A live FINAL is not a settlement.** The live path contains no call into settlement and writes no
file; a test asserts both over every file on the path.

---

## 3. Normalized schema and provider boundary

`app/src/lib/live/contract.mjs` — `schemaVersion: 1`, owned by GameTime, loaded by both the function
and the browser (no Node imports).

```
LiveEventEnvelope
  schemaVersion · eventId · sport · provider · providerEventId
  startTime · state · stateDetail
  sourceUpdatedAt · fetchedAt
  period? · competitors{home,away} · situation? · playerStats?
```

- `state` ∈ `PRE | LIVE | FINAL | POSTPONED | CANCELLED | DELAYED | UNKNOWN`. `UNKNOWN` is a real
  answer, never a guess at one of the others.
- **Absent is `null`, never `0`.** A postponed game exposes no score; a blank box-score cell is
  absent; a genuine `0` from the feed IS reported. All three are pinned.
- A refusal is envelope-shaped (`unavailable: true` + typed `reason`), so no caller models
  "sometimes null", and every reason has reader-facing copy (asserted).

**No component ever sees a provider field name.** The adapters are pure parsers — no `fetch`, no
`fs`, no URL in executable code (asserted). Only `api/_live-core.mjs` may build a provider URL.

---

## 4. Provider matrix

| | MLB | NFL |
|---|---|---|
| source | MLB StatsAPI `schedule?sportId=1&hydrate=linescore,team` | ESPN public `.../nfl/scoreboard` + `summary?event=` |
| registry entry | `mlb_statsapi` — free, no credentials, PUBLIC_DISPLAY | `espn_scoreboard`, `espn_site_api_nfl` — free, no credentials, PUBLIC_DISPLAY |
| cost | $0 | $0 |
| verified (2026-09-15) | 200 · 86 KB · 15 games, **10 live** | scoreboard 200 · 158 KB · 16 events · summary 200 · **567 KB** |
| fields verified | gamePk · abstract/coded/detailed status · gameDate · inning + ordinal + inningState · outs/balls/strikes · runs/hits/errors · batter/pitcher · bases | event id · date · status.type.{state,name,detail,completed} · period · displayClock · competitors{homeAway,score,team} · situation (live only) · boxscore.players[].statistics[].athletes[] |
| identity join | `gamePk` **is** the GameTime MLB event id | ESPN event id **is** `/nfl/game/[eventId]`; ESPN athlete id **is** `nfl-athlete-<id>` |
| batch? | ONE call serves the whole slate, in both scoreboard and single-event mode | scoreboard is one call per slate; `summary` is per event and opt-in |
| player stats | **none in v1.1 — deferred on principle, see below** | rushing / receiving yards / receptions, mapped by column LABEL |
| production enabled | **NO** — Stage 1 preview only | **NO** — Stage 1 preview only |

### Caveats, stated rather than smoothed over

- **Neither provider publishes a source timestamp.** `sourceUpdatedAt` is therefore `null` for both,
  and freshness is stated from FETCH age. That is a weaker claim than "the provider updated 12s ago"
  and the UI makes the weaker claim.
- **ESPN is not a contracted developer API.** It is a public, key-free JSON surface this repository
  already reads for schedules, results, rosters and injuries. Technical access is not a commercial
  licence; that is the founder decision in §7. The adapter is replaceable precisely because of this.
- ⚠ **ESPN's scoreboard defaults to the CURRENT week**, and its `dates=` parameter is the event's
  **ET date, not its UTC date**. Verified: DET @ BUF kicks off `2026-09-18T00:15Z` and is returned by
  `dates=20260917`, while `dates=20260918` returns zero events. Found in the preview, where three
  Week 3 games read "no live data source covers this game" with their data one parameter away.
- ⚠ **StatsAPI reports a postponed game as `abstractGameState: "Final"` with no scores.** Coded
  states C/D/U are mapped to CANCELLED/POSTPONED/DELAYED **before** the abstract state is consulted,
  so a postponed game can never render as a 0–0 final. (The same trap was already paid for once in
  settlement, PIT/MIL 2026-07-10.)
- ⚠ **MLB has no live player stats because it has no published per-player FORECAST, not because the
  feed is missing.** A comparison needs a GameTime range on the other side, and MLB has none:
  `full-game-simulations/<date>.json` emits no per-player output even on a `ready` game (verified
  2026-09-15, gamePk 824307), and `player-props/<date>.json` is a **bookmaker price list** — American
  odds, provider names, the player identified by NAME with `team: null` and an opaque hashed gameId.
  A live MLB player stat would therefore sit beside nothing, or beside a market price dressed as a
  GameTime projection. A test pins both facts and fails if per-player simulation output ever appears.
- ESPN's `situation` block is absent on finished games — read defensively, never defaulted.
- No secret, key or credential exists anywhere on the live path (asserted over every file).

---

## 5. Identity contract (the v1.2 seed)

**Nothing new was minted.** Every id Live needs already existed and already functions as canonical:

| entity | canonical GameTime id | provider alias | where it already lives |
|---|---|---|---|
| NFL event | ESPN event id, e.g. `401872931` | same | `/nfl/game/[eventId]`, `nfl/forecasts/*`, `player-board/<id>.json` |
| NFL player | `nfl-athlete-<espnAthleteId>` | ESPN athlete id | `player-board/<event>.json` `players[].playerId` |
| MLB event | StatsAPI `gamePk` | same | `/games/mlb/{away}-vs-{home}-{date}[-gamePk]`, `full-game-simulations/<date>.json` |
| MLB team | StatsAPI team id + abbreviation | same | schedule + board artifacts |
| lineage of record | — | — | `lib/events/read-model.ts` (`providerAliases[]`) and `lib/sports/source-registry.mjs` |

Consequences, deliberately:

- **No database was created.** A typed mapping layer was sufficient, so §9's "do not build a database
  service merely for v1.1" is satisfied by not having built one.
- **No public route id was renamed** to make a schema tidier.
- **Ambiguity fails closed.** Two events answering one id returns `AMBIGUOUS_EVENT_MAPPING` and shows
  "Live data unavailable". Neither provider's id space can produce this today, which is exactly why
  it is checked rather than assumed.
- **Unjoined live rows are counted, never fuzzy-matched.** A renamed player joins to nothing.

**Growing into v1.2:** the alias lineage belongs in `events/read-model.ts`, which already carries
`providerAliases: [{provider, id}]` per event. v1.2 promotes that from a read model over artifacts to
a stored entity table; the ids above do not change, so nothing built in v1.1 has to be revisited.

---

## 6. Cache, polling and the cost receipt

### The mechanism

```
provider  ──one refresh per TTL──▶  /api/live  ──s-maxage──▶  Vercel CDN  ──▶  many readers
```

Upstream volume scales with **active events × time**, not with concurrent readers.

`Cache-Control: public, max-age=0, s-maxage=<ttl>, stale-while-revalidate=<2×ttl>`

⚠ `max-age=0` is load-bearing. Without it a browser applies heuristic freshness and can serve a stale
response from its PRIVATE cache — observed 2026-09-15, when a reader held a stale "live data
unavailable" for a game whose feed had recovered, while a cache-bypassing fetch of the same URL
returned the event. A stale refusal is indistinguishable from a real one.

### TTL and client cadence by state

| state | gateway TTL | client re-ask | note |
|---|---|---|---|
| LIVE / DELAYED | 25 s | 30 s | tighten below this only with evidence of provider cadence |
| PRE, within 2 h | 60 s | 60 s | an UNKNOWN start is treated as imminent — fail toward noticing kickoff |
| PRE, beyond 2 h | 300 s | 300 s | |
| FINAL / POSTPONED / CANCELLED | 3600 s | **stops** | `clientIntervalMs === null` — halted, not slowed |
| hidden tab | — | ≥ 120 s | re-checks immediately on becoming visible |

### Payload reduction (measured)

| path | upstream | served to a reader |
|---|---|---|
| MLB slate (15 games) | 86 KB | **8.6 KB** (10×) |
| NFL slate (16 events) | 158 KB | **8.3 KB** (19×) |
| NFL event + player stats | 567 KB | **6.2 KB** (92×) |

### Worst-plausible daily upstream volume

A busy autumn day: ~15 MLB games (~4 h live) + ~16 NFL games (~3.5 h live).

- MLB is ONE batch call for the entire slate in every mode. At 25 s for 4 h: **~576 calls/day**.
- NFL scoreboard is one call per slate date. At 25 s for 3.5 h: **~504 calls/day**.
- NFL per-event summary is opt-in and only for an event a reader has open. Worst case, all 16 games
  viewed continuously for 3.5 h at 25 s: **~8,064 calls/day**, ~4.6 GB upstream. Realistically far
  lower, since it is fetched only while a live module is on screen.
- Pregame/overnight: ≤ 300 s, and terminal events cost **nothing**.

**Upstream ≈ 1,000–9,000 requests/day, entirely from free endpoints. Sports-data cost: $0.**

### Vercel footprint

Function invocations scale with CDN misses, not readers: roughly one per TTL per (sport, date,
event-with-players) actually being viewed — the same ~1k–9k/day order, plus whatever the CDN serves
directly. Egress per response is 6–9 KB.

This is comfortably inside Vercel's included allowances on the current plan, and materially smaller
than the existing static site's own asset egress. **It is not expected to approach the founder's
+$20/month review threshold.** An exact billing figure is deliberately NOT asserted: it cannot be
derived from the repository, only from the live plan, and this is the number to re-measure with real
traffic before any public rollout.

---

## 7. Runbook, and what is NOT decided

### Operating

| situation | behaviour | action |
|---|---|---|
| provider down / slow | last confirmed state retained, badged with its true age; after 120 s in-play it reads FEED STALE | none — self-healing; no retry storm by construction |
| provider returns garbage | `PROVIDER_MALFORMED`, refusal card, forecast untouched | check the adapter against a fresh payload |
| event not in the slate | `EVENT_NOT_FOUND` | almost always a missing/incorrect ET `date` — see §4 |
| live feed wrong or misleading | — | unset `LIVE_GATEWAY_ENABLED` (server) — takes effect on the next invocation, no rebuild |
| live UI must disappear entirely | — | unset `NEXT_PUBLIC_LIVE_ENABLED` and rebuild — no model artifact is regenerated |
| gateway entirely down | v1.0 is unaffected: forecasts, reports and results are static and never call it | none |

### Open founder decisions — public rollout is blocked on these

1. **ESPN usage posture for a public live surface.** Technical access is proven and the repository
   already uses this source class for schedules, results, rosters and injuries. Whether a
   continuously polled PUBLIC live surface is a posture the founder wants to adopt on an
   uncontracted endpoint is a business call, not an engineering one. MLB StatsAPI carries no such
   question. **This is why Stage 2 is one sport (MLB) if the founder prefers the narrow path.**
2. **Where Live appears.** No navigation entry was added and none should be until (1) is answered.
3. **Cost re-measurement under real traffic** before enabling NFL per-event player stats publicly.

**Not decided by this session, deliberately:** no model was promoted, MLB totals remain PAUSED, no
paid provider was contacted, and no public surface changed.
