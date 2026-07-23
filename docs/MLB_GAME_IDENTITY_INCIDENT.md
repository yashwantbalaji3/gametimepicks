# MLB Public Game Identity Incident

_Forensic audit of how a public MLB (and NBA) game URL can map to more than one real game, and the canonical
identity that fixes it. Artifact-backed: collision counts are computed from the live board
(`app/public/data/mlb/boards/2026-07-22.json`)._

## Root cause

The public game slug is built from the **team pair + date only**, with no game-unique component:

```
// app/src/lib/game-detail.ts
export function gameSlug(home, away, date) { return `${slugify(home)}-vs-${slugify(away)}-${date}`; }
// boardDetails(): slug: gameSlug(away, home, date)   ← MLB & NBA, no gamePk
```

Two games with the **same teams on the same date** (a doubleheader) therefore produce an **identical slug**.
Everything downstream resolves a game by that slug:

- `getGameDetail(sport, slug)` → `buildAllGameDetails().find(d => d.slug === slug)` — returns the **first** match.
- `gameDetailParams()` → `map(d => ({ sport, gameId: d.slug }))` — emits **duplicate** params; Next.js dedupes them,
  and with `dynamicParams = false` only **one** static route is generated per colliding slug.
- `getDetailForTeams()` / `detailHrefForTeams()` — look a game up by **team pair alone**, returning the first match.

So for every doubleheader, one game is **unreachable** (no route generated) and the shared URL renders whichever game
is first in array order.

## Collision count (current slate)

`boards/2026-07-22.json`: **17 games → 15 unique base slugs → 2 collisions → 2 games hidden.**

| Base slug | gamePks | games | hidden |
|---|---|---|---|
| `pit-vs-nyy-2026-07-22` | 823518, 823519 | 2 | 1 |
| `bal-vs-bos-2026-07-22` | 824735, 824732 | 2 | 1 |

The gamePks are **not ordered** (824735 before 824732), so a positional `g1/g2` scheme cannot be derived reliably — the
disambiguator must be the stable **gamePk** itself.

## Affected routes / helpers

| Location | Problem |
|---|---|
| `app/src/app/games/[sport]/[gameId]/page.tsx` | `[gameId]` segment actually receives the slug; one static page per colliding slug |
| `game-detail.ts` `getGameDetail` / `gameDetailParams` | slug-keyed resolve + duplicate params |
| `game-detail.ts` `getDetailForTeams` / `detailHrefForTeams` | **team-pair-only** lookup → arbitrary doubleheader game |
| `app/mlb/page.tsx:129`, `app/nba/page.tsx:124` | link each board game via `detailHrefForTeams(team,team)` (team-only) |
| `components/games/simulate-lobby.tsx:118,167` | **reconstruct** the base slug via `gameSlug(...)` instead of using the detail's slug |
| MLB sim artifact (`game-simulations/<date>.json`) | its games carry the same base slug (`mlb-generator.ts makeSlug`) — harmless because the runtime join is by gamePk first, but the slug→gameId map is collision-prone as a fallback |

## Test matrix (identity cases)

| Case | Current behavior | After fix |
|---|---|---|
| Unique regular game | one URL, resolves | unchanged (base slug, no churn) |
| Doubleheader game 1 & 2 | share one URL; one hidden | distinct URLs `…-<gamePk>` each |
| Same teams, same date (any cause) | collide | disambiguated by gamePk |
| Resumed / suspended / rescheduled game | new gamePk ⇒ would collide on old scheme | distinct (gamePk differs) |
| Neutral-site game | slug has no venue ⇒ fine if gamePk unique | unchanged |
| Postseason series (same matchup, different dates) | date differs ⇒ no collision | unchanged |
| Provider gameId change | slug ignores id ⇒ silent swap risk | slug pinned to gamePk on collision |
| Ambiguous legacy bare slug | silently renders game 1 | disambiguation page (never a silent pick) |
| Unknown gameId | notFound | notFound |

## User impact

- One doubleheader game's report is **unreachable**; the shared URL may render the **wrong** game — and the
  provenance line shipped last mission ("Scheduled first pitch 7:05 PM ET") makes the mismatch visible.
- Share links / bookmarks to a doubleheader are ambiguous.
- **Artifact-mismatch risk is LOW in the rendered page** (sim, Game Center, and player props all join by gamePk, so
  the game that *does* render is internally consistent) — but it is not necessarily the game the URL implied, and the
  sibling game cannot be opened at all.

## SEO / share-link impact

Two distinct games collapse to one indexable URL with an ambiguous canonical. A link intended for the night game may
resolve to the day game. Fixing the identity gives each game its own canonical URL and its own OpenGraph title.

## Recommended canonical identity

- **Unique on the slate:** `{away}-vs-{home}-{date}` (unchanged → zero churn for the ~99% non-doubleheader case).
- **Doubleheader (base shared by ≥2 games):** every colliding game becomes `{away}-vs-{home}-{date}-{gamePk}`, where
  `gamePk` is the **official MLB Stats API game id** — public, stable, human-safe (used on MLB.com / ESPN), never an
  opaque internal filename.
- The bare ambiguous slug (`pit-vs-nyy-2026-07-22`) is **not** assigned to any game; visiting it renders a
  **disambiguation page** listing both games (links to their canonical URLs) — never a silent pick.
- One gameId ↔ one URL; one URL ↔ one gameId; no lookup by team/date alone when multiple matches exist.
