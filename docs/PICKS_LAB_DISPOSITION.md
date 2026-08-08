# Picks Lab (`/picks`) — disposition decision

**Decision: MERGE** (partial consolidation), not RETIRE. Program 141 · 2026-08-06.
**Status: decided with evidence; migration NOT executed.** The evidence is below so the next run
executes rather than re-investigates.

---

## What `/picks` actually renders

| Component | Also rendered on | Verdict |
|---|---|---|
| `Top10BoardSection` (the rendered board) | **nowhere else** | Unique to `/picks` |
| `buildTop10Board` (the data) | `/` (count only), `/today` (top **6** slice) | Shared data, different views |
| `PicksExperience` (suggested cards + stake input) | nowhere else | Unique |
| `ParlaysExplorer` (browse published parlays) | nowhere else | Unique |
| `HowToRead` | its own component, reusable | Shared |

**Correction.** An earlier version of this document claimed the Top-10 *board* was "duplicated three
ways" because `buildTop10Board` is imported by `/` and `/today`. That was wrong, and I acted on it
before checking: `/` uses only `top10.overall.length` as a **count**, and `/today` renders its own
**top-6** slice. Neither mounts `Top10BoardSection`. Removing the board from `/picks` therefore
deleted capability rather than a duplicate, and was reverted before shipping. Importing a data
builder is not the same as rendering a component.

Inbound links: **12**, across `learn`, `results`, `results/parlays`, `homepage-trending-tabs` (×2),
`todays-parlays`, and others.

## Why MERGE and not RETIRE

The founder's preference is consolidation, and the decision rule is "keep only if it supports a
distinct job not better served by Market Center or Build". Applying that honestly splits the page:

- **The Top-10 board is PARTIAL overlap, not duplication.** `/today` shows the top 6 of the same
  ranked data in its own presentation; `/picks` shows the full 10 in a dedicated board. That is a
  real overlap worth resolving — but by deciding which surface owns the ranked list, not by deleting
  the only place it is fully rendered.
- **`PicksExperience` / `ParlaysExplorer` pass it.** Browsing *pre-built* cards with a stake input is
  a different job from Market Center (compare model vs market on one matchup) and from Build
  (assemble your own card). Retiring the route would delete a job neither replacement performs.

Retiring `/picks` outright would therefore lose real capability, and 12 inbound links point at it.
MERGE is the defensible outcome: remove the duplication, keep the unique job, and reposition the
page around it.

## Migration plan — exact steps

1. **Decide which surface owns the ranked list**, then make the other defer to it. `/today` showing
   6 and `/picks` showing 10 of the same ranking is the overlap. Do NOT simply delete the board from
   `/picks` — that is the mistake this document already made once; it is the only full rendering.
2. **Reposition the page** around browsing published cards. Retitle it in nav/metadata to something
   naming that job (e.g. "Card Browser") rather than "Picks Lab", which implies a second picks list.
3. **Add "add to Build"** from a browsed card, so the two surfaces compose instead of competing.
4. **Audit the 12 inbound links** — several point at `/picks` meaning "see the day's picks", which
   after step 1 is `/today`. Repoint those; keep the ones that mean "browse published cards".
5. **Keep the route and canonical URL.** No redirect is needed under MERGE, which also means no
   redirect-loop risk and no sitemap churn.
6. **Preserve all shared capability** — `buildTop10Board`, the parlay loaders, and the coverage
   matrix are consumed elsewhere and must not be touched.

**Acceptance:** exactly one surface renders the full ranked list and the other links to it; all 12 inbound links
resolve to the surface matching their link text; route tests and metadata updated; production checked
at desktop and mobile.

## Why it was not executed in this run

Program 141 shipped Phase B (Market Center comprehension) end-to-end and verified it in production.
The migration above touches 12 inbound links across 6 files plus nav, metadata and route tests — it
is a coherent slice in its own right, and a half-applied version would leave links pointing at a page
whose content had moved. It is the next executable slice, not a deferred question: the decision is
made and the steps are specified.

---

## Deployment B — attempted 2026-08-07, REVERTED before push

The retirement was written and then backed out. Production never saw it; `/picks` stayed live
throughout. The work is preserved on branch `deployment-b-wip` (`8a5cc5e3`).

**What went wrong: I retired the route before migrating everything on it — the exact failure this
document was written to prevent, made a second time.**

Deployment A migrated `PicksExperience`. Market Center already covered the ranked list. I treated
that as parity and retired the route. A guard (`june19-coverage-matrix`) then failed because it
asserts the coverage matrix is built on `/picks`, and checking what the page actually rendered
showed two capabilities with no destination at all:

| Component on `/picks` | Destination |
|---|---|
| `Top10BoardSection` | covered — Market Center renders the same `buildTop10Board` data |
| `PicksExperience` | migrated to `/build#suggested-cards` (Deployment A) |
| `HowToRead` | covered — Market Center has its own reading key |
| **`ParlaysExplorer`** | **none — browse published parlays is unmigrated** |
| **`buildCoverageMatrix`** | **none — the coverage matrix is unmigrated** |

Both were listed as "unique to /picks" at the top of this document. I read that table, migrated one
of the two, and retired anyway.

**The lesson, stated so it is checkable rather than remembered:** parity is a property of the
RENDERED COMPONENT LIST, not of the headline capability. Program 141 asserted overlap from an import
list; Program 142 asserted parity from the one component it happened to migrate. Both times the
mistake was reasoning about a page from something other than what the page renders.

### Before Deployment B is retried

1. Migrate `ParlaysExplorer` to a destination and prove it renders there.
2. Migrate `buildCoverageMatrix` and move the `june19-coverage-matrix` assertions with it — that
   guard is the only coverage of the matrix, so it must be repointed, never deleted with the route.
3. Diff the rendered component list of `/picks` against the destinations and require it to be empty:
   `git show <sha>:app/src/app/picks/page.tsx | grep -oE '<[A-Z][A-Za-z0-9]+' | sort -u`
4. Only then repoint links, retire the route, and repoint the remaining guards.

The link-intent map from the reverted attempt is correct and worth reusing: "Open Parlay Lab" /
"Browse them all" → `/build#suggested-cards` (7 links); "View today's picks" / "All picks" →
`/markets` (2); "Build your own in Parlay Lab" → `/build` (1). The four legacy aliases
(`/parlays`, `/parlay-lab`, `/mlb/parlays`, `/nba/parlays`) point at `/picks` today and must be
repointed at the final target in the same change, or they become two-hop chains.
