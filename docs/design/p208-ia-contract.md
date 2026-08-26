# P208 — Target Information Architecture Contract

Committed before implementation (charter Phase 0C). The canonical nav list stays
`app/src/lib/navigation.ts`; this document is the decision record it will be changed to match.
Findings + baseline: `data/internal/uiux/p208-findings.json`, screenshots `data/internal/uiux/p208-baseline/`.

## 1 · Six primary destinations

| Public label | Route | Job | Notes |
|---|---|---|---|
| Home | `/` | Orientation and launchpad | NEW nav entry — today it exists only behind the logo |
| Today | `/today` | Daily cross-sport decision center | unchanged |
| Simulate | `/simulate` | Choose an event, open its report | unchanged |
| **Picks** | `/markets` | Filterable model selections vs market | label change from "Market Center"; route retained (it owns ranked+key markets since the P-Lab merge; `/picks` already one-hop redirects here). The model-vs-market explanation stays on the destination. |
| **Parlay Center** | `/build` | Suggested cards + guided custom construction | label change from "Build"; route retained. Two modes, below. |
| Results | `/results` | Independent records and settled receipts | unchanged |

Sports is a **secondary discovery system**: compact rail group + `/sports` directory + direct
MLB/EPL/UFC/NFL hubs. Learn/Methodology/Glossary/About/System Status stay secondary support.

## 2 · Parlay Center modes (Release A)

- `/build` — **Suggested Parlays** (default: novice-friendly; entry-intent evidence inconclusive, per charter 4A). Risk-ladder cards + every optimizer card + other-lane links, each with record and a **Customize** action.
- `/build/custom` — **Build Your Own**: the leg-pool builder (search/filters/leg list/persistent card summary) + the advanced marketplace disclosure.
- Mode = real sub-route: URL-stable, refresh-safe, shareable, static-export-true (no hydration-only mode state). Header tabs are plain links.
- **Start/Customize This Card**: `/build/custom?card=<slipId>` resolves the suggested card's legs against the same eligible-leg pool by immutable leg identity and preloads them as the editable draft. Missing legs are disclosed, never silently dropped. One engine: same selection state, stake/return math, conflict/correlation rules, grade eligibility.
- Records stay separately owned (lab record vs saved slips vs signature products). No new record is created by the merge.
- Legacy links: `/build?sport=…&game=…` (deep links from game pages) repoint to `/build/custom?…`; `/build#advanced-builder` renders an in-place signpost to `/build/custom`. One hop, by intent.

## 3 · Navigation contract per surface

| Surface | Carries | Change |
|---|---|---|
| Desktop rail | Primary six first (Home, Today, Simulate, Picks, Parlay Center, Results) → compact Sports group → Products group → Record/Learn group | Add Home; relabel; move Results up into primary block |
| Top strip | Date/slate + freshness ONLY | Remove Paper-record/Peak money chips (canonical figures stay on /results, /mr-dub, /bank-builder) |
| Tablet/top nav | Same six labels/order as rail primary | relabel only |
| Mobile bottom bar | Home · Today · Simulate · Picks · Parlay + **Menu** (labelled sheet: Results, Sports, hubs, products, Learn) | today: Today/Simulate/Market/Build/Sports/Results, no Home |
| Footer | Full derived sitemap (unchanged mechanism) | labels follow canonical list |
| Breadcrumbs | Home › Sport › Event on depth pages | already present on game pages; keep |

Label rules: one label per job everywhere; no bare Open/View/Enter CTA — action + destination
("Simulate this game", "Review all picks", "Customize this card", "Open Parlay Center").

## 4 · Homepage order (Release B)

1. Hero: one value sentence, 3 primary actions — **See Today's Picks → /today**, **Simulate a Game → /simulate**, **Open Parlay Center → /build** — plus Results proof link; compact slate/freshness strip.
2. Live sports (Simulation Hub, current-content sports only) · 3. Today's best picks preview →
/markets · 4. Parlay Center preview → /build · 5. Signature products · 6. Recent results →
/results · 7. How it works. Inactive/off-season sports stay in the secondary strip. Every preview
figure derives from its destination's owner (already true; must remain true).

## 5 · Ownership boundaries (unchanged by P208)

Model, settlement, product-day, risk-tier, qualified-leg, record and public/private boundary owners
are untouched. UI presents canonical truth; it never recomputes it. Nightly-settle remains the ONE
settlement writer. Suggested-parlay record ≠ model-pick record ≠ signature-product records ≠ reader
draft behaviour.

## 6 · Release plan (dependency order)

| # | Release | Scope | Acceptance |
|---|---|---|---|
| A | Unified Parlay Center | `/build` two modes, shared draft engine, Customize-this-card, mobile slip fix (F1, F4), legacy links one-hop | parity + engine unity + refresh/back/share proofs, 3 engines × 4 widths |
| B | Nav contract + homepage launchpad | navigation.ts relabel + Home + mobile Menu sheet + top-strip slimming (F2, F3, F5); homepage hero/actions/order | six-surface label agreement guard; core tasks ≤ 2 actions; homepage figures = owners |
| C | Shared sport-hub shell | SportHubShell + section nav + capability registry for MLB/EPL/UFC/NFL (F6) | every capability 1 action from hub; semantics preserved |
| D | Today/Simulate/Picks/Results | distinct first screens, cross-links, filter deep-links (F7 partial) | no duplicated owners; payload budgets hold |
| E | Visual system | token consolidation on measured floors; graphics/motion (F8) | ratchets lowered to verified floors only |
| F | Comprehension | copy pass, glossary at point of need, novice script re-run | five journeys pass without prose walls |
| G | Responsive/a11y matrix | 3 engines × 4 widths × states | zero real failures, zero P0/P1 a11y |
| H | Perf/SEO/resilience | budgets incl. new Home/hub/Parlay Center | within committed budgets |
| I | Operator alignment | /launch Product Experience panel + final assurance | operator sees IA truth; boundaries clean |

Each release ships with focused guards, canonical suite, typecheck, build, browser proof, push, CI
verdict, production ancestry + cache-bypass verification.
