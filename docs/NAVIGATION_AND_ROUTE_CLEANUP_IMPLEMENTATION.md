# Navigation + Route Cleanup — Implementation (2026-07-10)

The deploy-reviewed UX pass on Yash's #1 complaint: *"Simulate, Today's Picks, Game Reports, Build-a-Pick,
and Build overlap; the sidebar is misleading."* This records what shipped (safe, additive clarity + page
legends) and why the full unified-label relabel is a separate, carefully-tested step. **No routes deleted,
no deep links broken, no formulas/money/picks changed** (md5 `affe6b21…`, 19-14, $0; suite 2057 green).

---

## The overlap is real (confirmed in code)

- **`/simulate` and `/games` render the SAME component** (`SimulateLobby`) — they are literally the same
  lobby. "Simulate" vs "Game Reports" is a labelling artifact, not two products.
- **`/picks` (Build-a-Pick) and `/build` (Build)** are both "assemble something" — redundant naming.
- `/parlays` and `/parlay-lab` already **redirect to `/picks`** — the consolidation intent exists.

## What shipped this pass (safe, additive)

| change | file | effect |
|---|---|---|
| **Command-rail descriptions** — a one-line descriptor under every rail item | `command-rail.tsx` | the sidebar now explains itself ("Simulate → Pick a game, run its report"; "Build-a-Pick → Build a paper parlay card"; "Build → Browse eligible legs"; "UFC → Coming soon"). Labels are **unchanged**, so `unified-nav-labels.test` stays green. |
| **`/simulate` legend** | `app/simulate/page.tsx` | `<HowToRead preset="simulate">` — market-implied / simulation / model % / paper-only |
| **`/picks` legend** | `app/picks/page.tsx` | `<HowToRead preset="picks">` — eligible leg / odds / edge / reliability / paper-only / no-play, with the plain-English "explore model-qualified legs, build a paper-only card" title |
| **Market Guide** (prior pass) | `/market-guide` | the full glossary, linked from `/learn` |

Together these directly answer "I feel lost": the rail says what each item does, and the two most-confusing
pages now carry a "how to read this" legend.

## Why the full unified relabel was NOT applied here

Measured the blast radius before touching labels. Each nav label (e.g. `Build-a-Pick`, `Today's Picks`,
`Longshot Lab`) is referenced in **~13 source files + ~9 test files** — not just the 4 nav surfaces, but
body copy across `home/*`, `today/*`, `results/trust-center`, and pinned by `unified-nav-labels`,
`nav-active-route`, `today-hub`, `home-restructure`, `footer-identity`, `today-casino-layout`,
`ladder-visibility`, `june23-readiness-settlement` tests.

A relabel is therefore a **coordinated multi-file change** that must update nav + body copy + all pins
together, with the suite run per label. Doing it blind overnight would risk the trusted 2057-test suite.
It is the right *next* focused change, not a safe same-pass edit — so it's specified below instead.

## The unified relabel to apply next (spec)

Update in `nav.tsx` + `command-rail.tsx` + `nav-active-route.ts` (`MOBILE_NAV_ITEMS`) + `footer.tsx` +
the `UNIFIED` map in `unified-nav-labels.test`, then sweep body-copy references + their tests:

| route | today | → proposed | why |
|---|---|---|---|
| `/today` | Today's Picks | **Today** | drops the "Picks" overlap |
| `/simulate` | Simulate | **Simulate Games** | clarifies it's the game lobby |
| `/picks` | Build-a-Pick | **Picks Lab** | clearer product name; kills the "Build" collision |
| `/build` | Build | **Browse Legs** (or redirect `/build→/picks`) | it's raw inventory, not a second builder |
| `/moonshot` | Longshot Lab | **Moonshot** | matches how it's referred to elsewhere |
| `/games` | Game Reports | *(drop from rail; reached from a game)* | same component as /simulate |

Then: add product **presets** to `/build` (Conservative/Balanced/Moonshot), redirect `/build→/picks`
once merged, and make the homepage a single "Simulate today's games" CTA.

## Routes: kept / relabeled / redirected / deferred

- **Kept, unchanged routes:** all of them (no deletions).
- **Relabeled:** none at the nav-label level this pass (descriptions added instead).
- **Redirected:** none new (`/parlays`, `/parlay-lab` → `/picks` already exist).
- **Deferred:** the unified relabel + `/build→/picks` merge + homepage single-CTA restructure (spec above).

## Tests

`unified-nav-labels`, `nav-active-route`, `home-simulate-flows`, `today-hub` all green (labels unchanged).
Legends render in the built output (`/simulate`, `/picks`) and leak no pre-Generate predictions (they are
static definitions).
