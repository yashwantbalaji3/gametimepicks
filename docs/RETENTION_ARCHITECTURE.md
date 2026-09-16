# Retention architecture — identity, preferences, and "since your last visit"

Written 2026-09-16 alongside v1.1.1 (`/live` hub + game lifecycle). It exists so the next
personalization program — Follow Teams/Players, then My GameTime, then Since Your Last Visit — can
build on decisions already made instead of re-deriving them and minting a second identity system.

**Status (2026-09-16):** §3 Following is **BUILT (v1.1.2)**. §5 My GameTime is **BUILT (v1.1.3) — PUBLIC AND VERIFIED** (`4f2dda004`; CI `35139580684` success on `97a0811d2`; production serves `97a0811d2`, verified 19:40Z).
Since Your Last Visit (§4) is still a contract only.

---

## 1. The four owners

v1.1 established three owners of sports truth. Personalization adds a fourth, and it is not one of them.

```
PRE-GAME FORECAST      LIVE EVENT STATE      FINAL RESULT          USER PREFERENCES
immutable              ephemeral             canonical             local / device-owned
model-owned            provider-owned        settlement-owned      never sports truth
forecastGeneratedAt    fetchedAt             gradedAt              savedAt (device clock)
```

⚠ **No object may merge these.** A "game" that carries a forecast, a live score, a graded result and
a follow flag in one mutable record is how each of them starts overwriting the others. v1.1.1 keeps
them apart by construction: the lifecycle state machine takes the first three as separate INPUTS and
returns a presentation verdict; it owns none of them and writes none of them.

---

## 2. Canonical entity identity — already decided, do not re-mint

Every id below already exists and is already load-bearing in shipped code. Favorites must reuse
them. Minting a `favorite-team-17` would create a second namespace to reconcile forever.

| entity | canonical id | provider lineage | where it already works |
|---|---|---|---|
| MLB event | StatsAPI `gamePk` (string) | same | `/games/mlb/<slug>` via `gameHrefByMatchId`, live envelope `eventId`, graded rows |
| MLB team | StatsAPI team id + abbreviation | same | schedule + board artifacts, live envelope competitors |
| NFL event | ESPN event id | same | `/nfl/game/[eventId]`, forecasts, player boards |
| NFL player | `nfl-athlete-<espnAthleteId>` | ESPN athlete id | `nfl/player-board/<event>.json`, live box-score join |
| lineage of record | — | `providerAliases: [{provider, id}]` | `lib/events/read-model.ts` — the future v1.2 owner |

⚠ **MLB has no canonical PLAYER id in public product data.** The only per-player MLB artifact is a
bookmaker price list keyed by NAME with `team: null`. This is why MLB Live ships no player rows, and
it is the reason "follow a player" is NFL-first or blocked on v1.2, not a UI question.

### The smallest forward-compatible reference

If and when a shared type is needed, this is the shape — versioned, node-free, id-only:

```ts
interface EntityRef {
  schemaVersion: 1;
  sport: "MLB" | "NFL" | "EPL" | "UFC";
  entityType: "team" | "player" | "event";
  id: string;           // the canonical id above, never a display name
}
```

**Not added in v1.1.1**, deliberately: nothing in the hub or the lifecycle needed it, and a type with
no consumer is a guess. Add it with its first real user.

---

## 3. Following — BUILT in v1.1.2

### Owners

| concern | owner |
|---|---|
| pure contract (schema, parse, migrate, dedupe, ops) | `lib/follow/follow-schema.mjs` |
| storage adapter (injected Storage — testable failures) | `lib/follow/follow-browser.mjs` |
| React hook (read / write / cross-tab sync) | `lib/follow/follow-store.ts` → `useFollowing()` |
| canonical ids + labels from published artifacts (server) | `lib/follow/entity-registry.ts` |
| control | `components/follow/follow-toggle.tsx` (`compact` / `labeled`) |
| management | `/following` → `components/follow/following-manager.tsx` |

### The document

```ts
// localStorage key: gtp.follow.v2
{
  schemaVersion: 2,
  followed: Array<{ sport: "MLB" | "NFL"; entityType: "team" | "player"; id: string; label?: string }>,
  updatedAt: string | null   // PREFERENCE time only — never evidence that sports data changed
}
```

`schemaVersion: 2` because P251's unversioned name array under `gtp.follow.v1` was generation 1.

### Identity — canonical ids, never display names

| kind | id | source of truth |
|---|---|---|
| MLB team | `mlb-team-<statsapiTeamId>` | `mlb/statsapi-schedule/*.json` (30 clubs) |
| NFL team | `nfl-team-<espnTeamId>` | `nfl/rosters/latest.json` `providerTeamId` (32 clubs) |
| NFL player | `nfl-athlete-<espnAthleteId>` | `nfl/player-board/<event>.json` `playerId` |
| **MLB player** | **not supported** | MLB publishes no canonical public player id |

The prefix namespaces an EXISTING provider id; nothing is minted. Unique key is `(sport, entityType, id)`,
casing canonicalized at the boundary, stored in canonical order. `label` is a display HINT: never identity,
never used to dedupe; `/following` prefers the current name from the registry.

⚠ **NFL team ids are ESPN's numeric ids, not abbreviations.** Abbreviations differ between sources
(ESPN `WSH`/`LAR` vs nflverse `WAS`/`LA`); the registry resolves ESPN's and refuses `WAS`.

### Policies

- **Migration.** P251 names under `gtp.follow.v1` are migrated into v2 where a name resolves to exactly
  one id (the 32 NFL clubs — the old board's only write path). The v1 key is **never written or
  deleted**, so a rollback to older code finds its own data intact. Unresolvable names are reported, not
  dropped. Migration runs on `/today`, `/nfl` and `/following`; every other page reads v2 directly.
- **Future schema.** A `schemaVersion` above 2 reads as `UNSUPPORTED_VERSION`: not interpreted, **never
  overwritten**, controls disabled with an honest message.
- **Corruption.** Malformed JSON or wrong shapes recover to empty; the next follow repairs the store.
- **Storage failure.** A read or write that throws reports `UNAVAILABLE`. A failed write does NOT
  advance state, so the UI never shows "Following" for something that would vanish on refresh.
- **Cap.** No product cap (P251's 12 silently dropped the 13th). A structural bound of 500 only.
- **Cross-tab.** `storage` events re-read the store — their `newValue` is never trusted as data. Every
  operation re-reads before writing, so a stale tab cannot overwrite a fresh follow. Same-tab consumers
  sync through the `gtp:follow` event.
- **Hydration.** Every reader starts from `LOADING`; storage is read in an effect, never during render,
  so static HTML is identical for everyone.
- **Privacy.** Nothing is transmitted. The privacy notice (draft) says "the teams and players you
  follow", and the storage-disclosure guard detects the injected-storage style.

### Where Follow appears

MLB game pages (both clubs) · NFL game pages (both clubs) · NFL weekly boards (team chips) · NFL
per-game player board (each player once per tab) · `/following`. `/live` and `/today` **mark** followed
clubs; nothing reorders.

## 4. "Since your last visit" — what it may truthfully say

A delta may be claimed **only when GameTimePicks holds evidence of both the before and the after**.

✅ **Valid**
- a locally stored last-known state for a game moved `PRE → LIVE` or `LIVE → FINAL` (the device saw
  the earlier state and can name it);
- a saved forecast's canonical settlement status changed (the settlement owner says so);
- a followed team has a newly available canonical result;
- a forecast artifact's stored version/hash/timestamp differs from the one the device recorded.

❌ **Invalid**
- inferring a projection "changed" merely because the reader has been away;
- claiming a game "finished since your last visit" with no prior local snapshot and no trustworthy
  transition timestamp — absence of a visit is not evidence of a transition;
- comparing a provider live-final to model settlement as though they were the same owner — **they are
  hours apart** (measured 2026-09-16: FINAL 05:14Z, graded 09:58Z), which is exactly why
  `FINAL_PENDING_SETTLEMENT` exists;
- inventing player performances for a sport with no canonical player data (see §2's MLB note).

The rule in one line: **a delta needs two observations, and one of them has to be ours.**

---

## 5. My GameTime — BUILT in v1.1.3

**Route `/my`** · title "My GameTime" · `noindex` (like `/saved` and `/following` — a crawler has no follows)
· secondary nav (rail + footer + Menu sheet) and links from `/following` and `/saved`. Five primaries unchanged.

A **view, not a truth owner**. If `/my` disappeared, every underlying surface would be unaffected.

### Module owner matrix

| module | truth / persistence owner | sports | include | order | empty / failure |
|---|---|---|---|---|---|
| Live now | `useLiveSlate` (the `/live` batch owner) + Follow | MLB | envelope `competitors.*.teamId` → `mlb-team-<id>` is followed, state LIVE/DELAYED | start, then event id | *mounts only for an MLB team follow*; "none of your teams is playing" ≠ "no MLB games live" ≠ "live data unavailable" |
| Up next | build-time read model: `mlb/statsapi-schedule`, `nfl/schedule/latest.json` | MLB, NFL | followed team id on either side AND known start **> reader's now** | start, then game id · max 4 | "no upcoming games … in the published schedule"; unknown start excluded |
| Your NFL players | `/data/my/nfl-players.json` (from `nfl/player-board`, PUBLISHED families only) | NFL | `nfl-athlete-<id>` followed | kickoff, name, id | absent player → "no current published forecast", never zeroes; fetch failure isolated |
| Saved forecasts | `useSavedForecasts` (the Saved owner) | all | the owner's items | the owner's own order · max 4 | omitted when none |
| Recent results | MLB `mlb/results/game-predictions-graded.jsonl` (settlement) · NFL `loadCurrentNflResults` (FINAL-only settlement adapter) | MLB, NFL | followed team id AND integer scores | newest first (unknown last), then id · max 4 | "no recent final results yet" |
| Following | `useFollowing` (`gtp.follow.v2`) | — | counts by kind | — | hidden if the follow store is unavailable / newer schema |

### Invariants — pinned in `lib/my/*.test.mjs`

- **Request count.** Zero MLB team follows ⇒ the Live module never mounts ⇒ **0 Live requests**. One or
  twenty followed MLB teams ⇒ the same **one** batch request. Following, unfollowing and saving never
  refetch Live. NFL follows never create a Live request (public NFL Live stays impossible).
- **Exact ids only.** Every inclusion is a canonical-id join. NFL result team ids are attached from the
  capture rows **by provider event id**, never via the abbreviation. Rows without ids are counted
  (`coverage.*Unidentified`, 0 today), never matched by name.
- **Provider FINAL is not a result.** Recent Results reads only canonical owners; the Live feed never
  reaches it.
- **Public read model.** The static page carries public product data only — no preference, no
  present-tense flag. "Upcoming" is decided on the reader's clock (re-ticked each minute).
- **Payload.** Inline read model ~35 KB. Player rows (~104 KB) moved to `/data/my/nfl-players.json`,
  fetched only for a reader who follows an NFL player (measured: inline they were 108 KB of a 142 KB
  payload).
- **Isolation.** A broken Follow store hides team modules but not Saved; a failed player fetch does not
  blank Up Next; nothing renders "empty" until both local stores have been read.
- **MLB totals stay PAUSED** — `projectMlbForecast` omits them; no totals anywhere on the page.

### Why Since Your Last Visit is still separate

My GameTime shows **current state only**. It stores nothing, so it holds no "before" — and §4's rule is
that a delta needs two observations, one of them ours. v1.1.4 must add an explicit, versioned local
snapshot owner (a new key, never inside `gtp.follow.v2` or `gtp.saved.v1`) before any "changed" claim.

## 6. What v1.1.1 actually left in place

- `lib/live/lifecycle.mjs` — the shared state machine. A followed-team card should render from this
  rather than re-deriving "is it live" from a score.
- `lib/live/hub-data.ts` — the pattern for joining build-time artifacts to a read-time envelope by
  canonical id. My GameTime is the same join with a different filter.
- `useLiveSlate` — ONE batch request for many cards. A personalized "my live games" view must reuse
  it, not add a second poller; the CDN caches by request url, so per-entity requests do not collapse.
- ⚠ The hub roster carries **no present-tense field**. Personalized surfaces must keep that property:
  store what was SEEN and when, never a stored "isLive".
