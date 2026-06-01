# UI structural concept previews — 2026-06-01

**Design exploration only. No concept is merged to production.** No data /
pipeline / optimizer / settlement / generated-file / business-logic changes —
every concept reuses the same loaders, the same `ParlayLabBuilder` /
`ParlayTicketCard`, and the same honesty/guardrails. The difference is
**information architecture, navigation, page composition, and user flow** —
not just colors.

## Links

| Version | Where | Preview URL |
|---|---|---|
| **Current (production)** | `gametimepicks.yashwantbalaji.com` | https://gametimepicks.yashwantbalaji.com |
| **A — Command Center** | PR #213 | https://gametimepicks-git-previe-68fe9e-yashwantbalaji33-7164s-projects.vercel.app |
| **B — Social Story** | PR #214 | https://gametimepicks-git-previe-7665da-yashwantbalaji33-7164s-projects.vercel.app |
| **C — Guided Flow** | PR #215 | https://gametimepicks-git-previe-a65588-yashwantbalaji33-7164s-projects.vercel.app |

> Preview URLs are Vercel deployment-protected (401 to the public). Open the
> PR on GitHub and click the Vercel bot's **Visit Preview** link while signed
> into Vercel as the project owner, or open it from the Vercel dashboard
> (project `gametimepicks` → Deployments → the `preview/structural-*` branch).

### Superseded
The earlier CSS-only concepts — **PRs #209 / #210 / #211** (doc #212) — were
theme overrides only. They are **closed, not merged**, and superseded by these
structural concepts.

## The three directions

- **A — Command Center / Analytics OS** — for the engaged/power user. A
  persistent **left-rail navigation** + a **status bar** (today · active slate
  settled/pregame · latest settled · paper bank), and a **modular dashboard
  grid** home (main "Suggested slips" panel + Track Record / Bank Builder /
  Projections / Events modules). Cool slate + teal.
- **B — Social Story / Daily Feed** — for growth/social. A single-column
  **vertical story feed** of big, screenshot-friendly blocks (slate hero →
  featured slip → honest record recap → bank ladder → in-feed browse-all →
  game teasers). Vibrant indigo + magenta/violet, big rounded cards.
- **C — Guided Beginner Flow** — for first-timers. The home is an explicit
  **3-step wizard** (pick sport → pick comfort → review matching cards), one
  decision at a time, plain English, strong next-step actions; filters are
  steps, not dropdowns. Calm light theme.

## Comparison matrix

| | Current | A — Command Center | B — Social Story | C — Guided Flow |
|---|---|---|---|---|
| **Information architecture** | flat: top nav + one long page | OS: rail + status bar + module grid | feed: single scroll column of blocks | funnel: step-by-step wizard |
| **Navigation style** | horizontal top nav | **left rail** (desktop) + status bar | top nav + feed | top nav + in-page stepper |
| **Home structure** | hero → builder → stat strip | **dashboard tiles** (panel + sidebar modules) | **vertical story feed** | **3-step wizard** |
| **Projections** | inherits | inherits shell/theme | inherits | inherits |
| **Parlay Lab** | grid + dropdown filters | same builder, in a module panel | same builder, in a feed block | reached after the wizard / "Build my own" |
| **Results** | dashboard | inherits (rail + status bar) | linked from "honest record" recap | linked from "what next" |
| **Bank Builder** | own page | a dashboard **module** | a big **ladder teaser block** | a wizard **next-step** + walkthrough copy |
| **Mobile** | top strip + bottom nav | rail hidden → existing mobile nav; status bar persists | single-column feed (native fit) | single-column wizard (native fit) |
| **Desktop** | full-width stack | rail + multi-column dashboard | centered feed column | centered wizard column |
| **Strongest page** | — | **dashboard / Results** | **Home / Bank Builder** | **Home onboarding** |
| **Weakest page** | — | About/Events (sparse in a dashboard) | **Results** (dense data under glow) | data-dense ticket cards on light |
| **Implementation risk** | — | **medium** (new shell affects every route) | **low–medium** (home only + theme) | **medium** (new client wizard + light flip) |
| **Productionization work** | — | restyle deeper pages as true modules; mobile rail drawer | tune glow on dense pages; bespoke share cards | migrate hardcoded-navy panels to tokens for the light theme; more steps |
| **Best audience** | mixed | engaged / power users | growth / social sharing | first-time / beginners |

## Product-design reasoning
The current UI is "everything at once": a single flat nav and a long home that
shows the ticker, hero, full builder, and a stat strip together — strong data,
but no sense of *where you are in a flow*, and intimidating for newcomers. Each
concept solves that for a different user:

- **A** treats the engaged user like an operator: persistent state (the status
  bar) + a rail you never lose + modules you can scan. It's the most "serious
  analytics product," and the rail/status bar are reusable across every route.
- **B** treats the home as content: a scrollable feed of self-contained cards
  that each stand alone in a screenshot — the path to social reach, while
  staying honest (the featured card shows its real result).
- **C** treats the newcomer gently: it refuses to dump the builder and instead
  asks three plain questions, then shows real matching cards with honest empty
  states. Lowest cognitive load.

## Honest scope note
These previews focus the structural change where it has the most signal —
**global navigation + the home composition + the user flow** — which propagate
across the whole app. Deeper interactive pages (the Parlay Lab builder,
Results) render inside each new shell/flow but keep their existing internals;
re-laying-out those cell-by-cell is the productionization work listed above.
Each concept builds clean (`tsc`, 562 lib tests, `npm run build`), is verified
at 1280 + 375 with no overflow / console errors / banned copy, and preserves
Bank-Builder-paper-only + schedule-only Events + Results honesty.

## Recommendation (not a final pick)
- Most **premium / serious** and most **reusable shell** → **A**.
- Best **social / shareable** → **B**.
- Easiest for **beginners** / lowest cognitive load → **C**.
- Lowest implementation risk → **B** (home-scoped). Biggest productionization
  effort → **C** (clean light theme needs per-component token migration).

A pragmatic production path could combine **A's status bar + reusable shell**,
**B's big featured-slip card** on the home, and **C's guided entry** for new
visitors — but pick one direction first; do not merge these previews.
