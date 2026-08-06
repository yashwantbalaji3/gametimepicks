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
