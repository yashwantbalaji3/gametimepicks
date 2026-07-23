# Product Route Disposition (technical record)

_Classification of every top-level public route into a single disposition, and the implementation diff shipped in the
Adoption Sprint. This is a Code-owned technical record — NOT a second roadmap (strategy/ownership lives in `vp/`).
Grounded in the live route inventory (32 top-level routes) + `src/components/nav.tsx`, `command-rail.tsx`,
`lib/nav-active-route.ts`._

## Disposition legend
- **canonical** — one destination per user concept; kept in nav.
- **secondary** — real + reachable, de-emphasized (after the divider / rail sub-groups / footer).
- **consolidate** — overlapping concept; should redirect to a canonical destination (founder-gated IA decision).
- **archive** — retired/complete; history-only, out of nav (truthful, still reachable by direct link).
- **internal** — not public (pruned from the static export).

## Route table

| Route | Concept | Disposition | Notes |
|---|---|---|---|
| `/` | Home | **canonical** | brand-mark landing |
| `/today` | Daily hub | **canonical (primary)** | the canonical daily MLB destination |
| `/simulate` | Run a simulation | **canonical (primary)** | the core action |
| `/results` | Track record | **canonical (primary)** | settled, honest |
| `/learn` | How it works | **canonical (primary)** | trust entry |
| `/research` | Research/trust status | **secondary → recommend primary** | honest gate progress; footer today |
| `/bank-builder` | Flagship paper product | **secondary** | moved out of primary this sprint |
| `/moonshot` | Paper longshots | **secondary** | moved out of primary this sprint |
| `/mr-dub` | Daily Dashboard (paper journey) | **secondary** | paper-bankroll journey |
| `/games` | Per-game reports | **secondary** | canonical game report = `/games/mlb/<slug>` |
| `/mlb` | MLB sim center | **secondary** | overlaps `/today`; `/today` is the canonical daily entry |
| `/nba` | NBA | **secondary (status-honest)** | HISTORICAL_ONLY / off-season — must not read "live" |
| `/ufc` | UFC | **secondary (status-honest)** | SCAFFOLD_ONLY — "sims live" overclaims FIXED this sprint |
| `/sports` | Sports directory | **secondary** | the multi-sport hub |
| `/methodology` | Methodology | **secondary (Learn/footer)** | trust |
| `/responsible-use` | Responsible use | **secondary (footer)** | trust |
| `/about` | About | **secondary (footer)** | trust |
| `/market-guide` | Market guide | **secondary (footer)** | reference |
| `/board` | MLB board | **consolidate → `/mlb`** | duplicate board view |
| `/picks` | Picks Lab | **consolidate** | overlaps `/build`, `/parlay-lab` — pick one card-builder |
| `/build` | Advanced builder | **consolidate → `/picks`** | "Advanced builder → Picks Lab" already |
| `/parlay-lab` | Parlay builder | **consolidate → `/picks`** | overlapping builder |
| `/parlays` | Parlays | **consolidate → `/picks`/`/results`** | overlapping |
| `/projections` | Projections | **consolidate → `/games`/`/mlb`** | implementation view |
| `/trends` | Trends | **consolidate → `/results`/`/mlb`** | overlapping |
| `/events` | Schedule-only leagues | **secondary/consolidate** | NHL/IPL/WNBA schedule hub |
| `/world-cup` | 2026 World Cup | **archive** | complete; out of nav (already) |
| `/world-cup-specials` | WC Specials | **archive** | retired product |
| `/ipl` | IPL | **archive** | off-season/retired |
| `/nhl` | NHL | **archive/consolidate → `/events`** | schedule-only |
| `/homer-nukes` | Homer Nukes | **archive** | retired landing (already) |
| `/ops` | Ops dashboard | **internal** | noindex; pruned from `out/` |

## Canonical map (one destination per concept)

| Concept | Canonical route |
|---|---|
| Land | `/` |
| Daily slate | `/today` |
| Run a simulation | `/simulate` |
| A game's report | `/games/mlb/<away>-vs-<home>-<date>[-<gamePk>]` |
| Track record | `/results` |
| How it works / trust | `/learn` → `/methodology` · `/research` |
| Flagship paper product | `/bank-builder` |

## Implementation diff shipped this sprint (Phase 2)

1. **Primary nav reduced 5 → 4 clean items** (`nav.tsx`): the simulation-product spine now leads — **Today ·
   Simulate · Results · How It Works** — and the paper-bankroll products (**Bank Builder · Moonshot**) moved to
   SECONDARY (after the divider). No route removed; all reachable; labels unchanged (unified-nav-labels + three-click
   tests pass).
2. **UFC overclaims removed:** command-rail `"Fight simulator · sims live"` → `"Scaffold · not live yet"`; the UFC
   fight-night hero `"Market-implied sims live"` → `"Market-implied preview · not a model"`. UFC is SCAFFOLD_ONLY.

## Recommended next (founder-gated IA — not shipped here)

The **consolidate** rows (`/board`, `/picks`↔`/build`↔`/parlay-lab`↔`/parlays`, `/projections`, `/trends`) collapse
several card-builder / board concepts into one door each. Doing the redirects safely in a static export needs
generated redirect pages (or archive stubs) so a shared legacy link never silently shows the wrong product — a bounded
follow-up. The pruned-IA choice (which single card-builder is canonical, whether `/research` joins primary nav) is the
founder decision already queued in the Cowork tracker (Dept 1). This doc is the technical input for that decision.
