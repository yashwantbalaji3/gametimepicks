# GameTime Live — architecture, providers, cost and runbook (v1.1)

One document, seven sections. Written 2026-09-15/16, the session that built the first Live vertical
slice. Everything stated as verified here was measured in that session and the measurement is named.

> **v1.2 note.** The internal Data Platform (`docs/GAMETIME_DATA_PLATFORM.md`) stores schedule/result FACTS by
> canonical id. It never persists Live state and a platform `FINAL` is not a settlement — the three-owner contract
> in §2 is unchanged.

## CURRENT STATE — read this before any older section

| | |
|---|---|
| **MLB Live** | **PUBLIC AND VERIFIED.** Activated 2026-09-16T05:03:35Z (build `7190ee9b9`), verified 05:14–05:30Z |
| **`/live` hub** | **PUBLIC** (v1.1.1) — today's MLB games grouped Live now / Starting soon / Final today |
| **Game lifecycle** | **PUBLIC** (v1.1.1) — the same MLB URL serves PRE, LIVE, FINAL-pending-settlement and SETTLED |
| **NFL Live** | **INTERNAL ONLY.** Built, tested, refused publicly by the server allowlist |
| **EPL / UFC Live** | **NOT BUILT** |
| **MLB totals** | **PAUSED** — absent from every Live surface |
| **MLB player Live rows** | **NONE** — MLB publishes no per-player forecast range to compare against |
| **Following** | **PUBLIC** (v1.1.2) — `/following`; MLB teams, NFL teams, NFL players by canonical id. `/live` marks followed clubs, never reorders or refetches |

⚠ **Everything below is the record of how this was built, in order.** Sections describing Stage 1
("preview only") and Stage 2 ("awaiting env vars") are HISTORICAL SNAPSHOTS, preserved because their
incident write-ups are still useful. The table above is the only current-state claim.

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
| production enabled | **YES** — public since 2026-09-16 (this row was "NO" at Stage 1; see CURRENT STATE at the top) | **NO** — internal only, refused by the server allowlist |

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
| MLB slate (15 games) | 89,785 B | **7,948 B** (11.3×) |
| MLB single game | (shared with the slate call) | **665 B** |
| NFL slate (16 events) | 158 KB | **8.3 KB** (19×) |
| NFL event + player stats | 567 KB | **6.2 KB** (92×) |

### ⚠ The upstream memo — measured, and the reason it exists

The CDN caches by REQUEST url, and every MLB game has its own (`…&event=824307`, `…&event=823980`).
All of them resolve to the **same** upstream slate call, so a CDN-only design pulls the full ~90 KB
schedule once per game per TTL to answer a question one call already answers.

Measured on the real handler, 10 different games requested individually:

| | upstream calls | upstream bytes |
|---|---|---|
| before the memo | 10 | 898,700 B |
| after the memo | **0** | **0** |

The memo is process-local and lives only as long as a warm function instance. ⚠ A memo hit carries
the **payload's own** `fetchedAt`, never a fresh one — refreshing it would hand an older observation
a fresh-looking age and the freshness badge would lie in exactly the way Rule B exists to prevent.

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

## 6a. Production activation — evidence (2026-09-16)

**Activated:** production build `7190ee9b9`, `builtAt 2026-09-16T05:03:35.641Z`. All twelve checks pass.

| # | check | evidence |
|---|---|---|
| 1 | gateway returns real MLB data | `/api/live/?sport=mlb` → **15 events**, 14 FINAL + 1 LIVE, 7,841 B |
| 2 | NFL refused, no ESPN contacted | `sport=nfl`, `NFL`, `+event`, `+players&date`, `nba`, `epl` → **all `UNSUPPORTED_SPORT`**; refusal precedes URL construction, and the browser contacted no ESPN host |
| 3 | game page renders Live beta | `/games/mlb/mia-vs-az-2026-09-15/` renders "Live game state · LIVE BETA" |
| 4 | LIVE vs PREGAME visibly separate | three aria regions — wrapper, **"Live now"**, **"Pregame GameTime · frozen"** — distinct DOM nodes |
| 5 | MLB totals stay PAUSED | `totalRuns` / `over/under` / `Total runs` absent from the live chunk **and** from the rendered module |
| 6 | no MLB player projection UI | rendered module contains no "pregame range" row and no "on pace"/"on track" |
| 7 | FINAL stops polling | **58 s elapsed, exactly 1 request, at t=0**; per-event policy `{ttl 3600, clientIntervalMs null, TERMINAL}` |
| 8 | freshness truthful | LIVE showed "updated 5 sec ago"; while the tab was hidden it **aged to "1 min ago"** rather than claiming currency; no freshness line on FINAL |
| 9 | v1.0 healthy | 13/13 routes **200** |
| 10 | responsive QA | 375 / 390 / 768 / 1024 — no horizontal overflow, **no console errors** |
| 11 | provider isolation | browser contacted only our origin; the two external hosts are pre-existing image CDNs (`mlbstatic.com/team-logos`, `midfield.mlbstatic.com` headshots). Gateway contacts `statsapi.mlb.com` only |
| 12 | no preview, no `/live` | `/preview/live/` **404**, `/live/` **404**, **0** `/live` nav entries |

### First production sample — measured

| measurement | value |
|---|---|
| gateway response, whole slate | **7,841 B** (15 games) |
| gateway response, single game | **761 B** LIVE · **667 B** FINAL · 300 B on the wire (compressed) |
| ✅ CDN behaviour | 6 rapid requests → **1 MISS then 5 HITs**; an earlier probe held `age` 14–15 s across 6 HITs — **one origin invocation serves many readers** |
| polling cadence | LIVE `clientIntervalMs 30000` · FINAL `null` |
| terminal stop | **1 request in 58 s** on a FINAL game |
| hidden-tab backoff | 0 requests in 40 s while hidden |
| upstream hosts | `statsapi.mlb.com` only |

⚠ **No monthly Vercel cost is claimed.** Production evidence covers a single late-evening slate whose
games were nearly all final; it does not support a monthly figure. Re-measure across a full daytime
slate before making one.

⚠ **The activation itself had a blocker worth remembering.** Vercel binds env vars at BUILD time, and
`vercel-ignore-build.sh` skips builds with no `app/` diff — so a dashboard redeploy of the same commit
bound the *function* env but reused the static export, leaving `NEXT_PUBLIC_LIVE_ENABLED` un-inlined
and the UI dark. Diagnosed by the deployed chunk still containing the literal variable NAME (it is
absent once inlined). `VERCEL_FORCE_BUILD=1` now exists for exactly this.

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

### Stage 2 flag configuration — the EXACT settings

Four controls. Every one defaults closed, so a forgotten variable yields less capability, never more.

| variable | where | MLB-only public beta | internal NFL preview | meaning |
|---|---|---|---|---|
| `LIVE_GATEWAY_ENABLED` | Vercel env (function) | `1` | `1` | unset/`0`/`false` → every request answers `FEATURE_DISABLED`, no upstream call |
| `LIVE_PUBLIC_SPORTS` | Vercel env (function) | **unset** (= `mlb`) | `mlb,nfl` | the server allowlist — the gate that actually holds |
| `NEXT_PUBLIC_LIVE_ENABLED` | Vercel env (build) | `1` | `1` | unset → `LivePanel` renders `null`: no markup, no polling |
| `NEXT_PUBLIC_LIVE_SPORTS` | Vercel env (build) | **unset** (= `mlb`) | `mlb,nfl` | which sports the build may render a panel for |

**To enable the MLB public beta: set `LIVE_GATEWAY_ENABLED=1` and `NEXT_PUBLIC_LIVE_ENABLED=1`, and
leave both `*_SPORTS` variables unset.** Unset means MLB; writing `mlb` explicitly is equivalent, and
neither opens NFL.

**To roll back:** unset `LIVE_GATEWAY_ENABLED`. Effective on the next invocation — no rebuild, no
model artifact regenerated. To remove the UI too, unset `NEXT_PUBLIC_LIVE_ENABLED` and rebuild.

**To enable NFL later (needs decision 1 below):** set both `*_SPORTS` to `mlb,nfl`. Nothing else
changes — adapter, fixtures, identity join and player-stat mapping are all in place and still tested.

### Why NFL cannot be reached while the allowlist says MLB

- The gateway refuses `sport=nfl` with `UNSUPPORTED_SPORT` **before a socket is opened**, so a
  hand-crafted `/api/live?sport=nfl` in production contacts nobody. Verified against the real handler.
- A refused sport is indistinguishable from an unsupported one — the refusal reveals nothing about
  what else exists.
- The ESPN **adapter** is not in the client bundle: a built-export guard proves ESPN's own vocabulary
  (`STATUS_RAIN_DELAY`, `shortDownDistanceText`, …) appears in no shipped file, and that no shipped
  **script** contains a provider host.
- ⚠ Honest scope note: a few NFL **constants** from the shared join module do ship (market keys, the
  `espn-public` source label), because `LivePanel` serves both sports. They are inert strings — no
  URL, no adapter, no capability. The gate is the server allowlist, not the bundle.
- ⚠ Provider hosts DO appear in shipped **prose**: `/ufc` cites "Settled from ESPN MMA scoreboard
  (site.api.espn.com…)" as provenance, and that predates Live. A citation is not a call, which is why
  the guard is scoped to scripts.

### Open founder decisions

1. **ESPN usage posture for a public, continuously polled live surface** — the only thing gating NFL
   Live. Technical access is proven and the repository already uses this source class for schedules,
   results, rosters and injuries, but a public live surface on an uncontracted endpoint is a business
   call, not an engineering one. MLB StatsAPI carries no such question, which is why Stage 2 shipped
   MLB.
2. **A top-level `/live` hub.** Not built; Stage 2 forbids a nav entry. The gateway's batch
   `scoreboard` mode already exists and is tested, so this is a surface, not new architecture.
3. **Re-measure cost under real public traffic** once the beta has run a full slate day (§6).

**Not decided by this session, deliberately:** no model was promoted, MLB totals remain PAUSED, no
paid provider was contacted, and no public surface changed.
