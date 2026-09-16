# Retention architecture — identity, preferences, and "since your last visit"

Written 2026-09-16 alongside v1.1.1 (`/live` hub + game lifecycle). It exists so the next
personalization program — Follow Teams/Players, then My GameTime, then Since Your Last Visit — can
build on decisions already made instead of re-deriving them and minting a second identity system.

**Nothing in this document is built yet** beyond what v1.1.1 needed. It is a contract, not a feature.

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

## 3. Local preference contract (for the NEXT session)

Device-local, versioned, id-based. No account, no sync, no server.

```ts
interface GameTimePreferences {
  schemaVersion: 1;
  followedTeams: EntityRef[];
  followedPlayers: EntityRef[];
  /** Saved forecasts REUSE the existing owner (lib/saved/*). Do not duplicate that store. */
  lastSeen: Record<string /* EntityRef id */, { state: string; at: string }>;
  updatedAt: string;
}
```

Rules:
- **Stable ids only**, never display names — a renamed team must not orphan a follow.
- **Versioned with a migration path**; an unreadable or future version resets to empty rather than
  throwing, and a reset is visible to the reader.
- **Clear/reset must exist** and must actually clear.
- **"This device" semantics.** Never imply sync. The copy must not say "your account".
- `localStorage` can throw or return empty (private windows, cleared site data) — every read and
  write is wrapped, and the product works with none of it.

---

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

## 5. What v1.1.1 actually left in place

- `lib/live/lifecycle.mjs` — the shared state machine. A followed-team card should render from this
  rather than re-deriving "is it live" from a score.
- `lib/live/hub-data.ts` — the pattern for joining build-time artifacts to a read-time envelope by
  canonical id. My GameTime is the same join with a different filter.
- `useLiveSlate` — ONE batch request for many cards. A personalized "my live games" view must reuse
  it, not add a second poller; the CDN caches by request url, so per-entity requests do not collapse.
- ⚠ The hub roster carries **no present-tense field**. Personalized surfaces must keep that property:
  store what was SEEN and when, never a stored "isLive".
