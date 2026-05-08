# UI / UX Audit — Phase 19

Page-by-page critique of the live site as of Phase 18, with concrete next-step priorities. Aimed at an "exciting, premium, royal/futuristic, but trustworthy" finished product.

## Cross-page principles

**What's working:**
- Vault palette (deep navy + gold) is consistent
- Vault hero grid is now used on Home, Board, Parlay Lab, Methodology, Responsible Use
- Pulsing gold pill creates visual signature
- Mono-spaced font for technical metadata reinforces analytical feel
- Active-slate selector prevents stale-data confusion
- "awaiting model leans" copy is honest without being apologetic

**What's still weak:**
- Some pages (Results, Newsletter, Footer) don't yet have hero treatment
- Mobile sweeps haven't happened — filter pills cramp at 375px
- Reveal animations vary in timing across pages
- Status pills use the same gold for "live" / "archived" / "experimental" — needs differentiation

## Home

### Working
- Hero is genuinely premium-feeling
- KPI tiles read as analytical, not promotional
- Eyebrow honestly reflects state ("awaiting model leans" vs "X games tonight")

### Weak
- KPI tiles are visually small for what they communicate
- "Today's slate" section can feel empty when no leans exist
- Newsletter card is plain, not visually rewarding

### Next
1. Newsletter card upgrade — full-width gradient panel with a soft glow CTA button
2. Hero "scroll for slate" cue — subtle arrow / fade indicating there's more below
3. Tiles show last-7-day delta when settled data exists

### Can wait
- Animated background particles
- Custom illustrations

## Model Board

### Working
- Date tabs prevent stale-data confusion
- Filter chips read clean
- Player cards collapse bookmaker rows nicely
- Premium "schedule live · awaiting model leans" hero from Phase 16

### Weak
- Board can feel sparse on slates with 2-3 games
- Trend graphs missing for most players (recent10 coverage gap)
- Filter reset is buried at the right
- Mobile filter strip overflows

### Next
1. Filter reset becomes a prominent button when any filter is active
2. Trend graph empty state styled to match populated state (currently looks broken)
3. Mobile filter strip becomes horizontally scrollable with a fade gradient
4. Confidence-tier color differentiation (currently relies on text)

### Can wait
- Drag-to-reorder leans
- Side-by-side player comparison
- Pin favorites

## Parlay Lab

### Working
- Build mode + Analyze Slip mode tabs are clear
- Active-slate default + archived label (Phase 17) is correct
- Top-3-core-players filter + full-rotation toggle adds trustworthiness
- Risk profile cards visually distinguish Conservative / Balanced / Aggressive

### Weak
- Builder panel feels dense — 7 sections in a 440px column
- Candidates display is functional but not exciting
- No visual indication of correlation in same-game parlays
- "Educational analysis only" disclaimer easy to miss at the bottom

### Next
1. Candidate cards show a "joint probability" bar (once v1 simulation is wired)
2. Same-game correlation indicator: visual grouping of legs that share a game
3. Sticky disclaimer at top of candidates section instead of bottom of left panel
4. Section headers in builder panel collapse/expand

### Can wait
- Drag legs between candidate parlays
- "Save this parlay" feature
- Export to image

## Results

### Working
- Empty state is honest: "no settled slates yet"
- Will become real after operator runs first settlement

### Weak
- Almost everything — currently just the empty state
- No design exists for the populated state at scale
- No filter/sort design once we have multiple slates
- No calibration curve

### Next
This page needs a real design pass once we have 5+ settled slates. **Block until data exists.** Premature design here wastes effort.

After data exists:
1. Date-range tab strip (last 7 days, last 30, all time)
2. Hit rate by confidence tier — bar chart
3. Hit rate by market — small multiples
4. Calibration curve — once v1 sim is wired
5. Biggest hits / biggest misses panel — humanize the data
6. Per-player rollup, click-through to player history

### Can wait
- Heat map of hit rate by day-of-week / opponent
- Comparison vs sportsbook implied probability
- Personal "watchlist" hit rate

## Methodology

### Working
- Phase 18 vault-hero-grid treatment looks strong
- Content is clear and educational
- "Transparent by design" eyebrow is on-brand

### Weak
- Long page; no in-page navigation
- Visual variety is low (mostly text blocks)
- No diagrams of the pipeline flow
- Doesn't show example projections

### Next
1. Sticky in-page TOC on the right
2. Pipeline diagram — Schedule → Odds → Model → Settlement → Display
3. Worked example: "How a single PTS Over 20.5 lean is generated"
4. "What we don't do" section — explicit list of things we deliberately avoid

### Can wait
- Interactive parameter sliders
- Methodology video walkthrough

## Responsible Use

### Working
- Phase 18 vault-hero-grid is consistent
- Block-by-block honest
- "Educational only" eyebrow is the right framing

### Weak
- Reads as legalese in places
- Easy to skim past without absorbing
- Doesn't link out to actual help resources

### Next
1. Add 1800-GAMBLER and similar resource links in a clearly demarcated panel
2. Soften legalese into plainer English where possible
3. Add a "what we'll never do" mini-list (won't sell picks, won't show locks, won't claim profitability)

### Can wait
- Icons per block
- Animation between blocks

## Newsletter signup

### Working
- Provider-agnostic foundation
- Buttondown wiring via env var is operationally clean
- Honest copy: "free daily NBA slate alerts", "educational analytics only"

### Weak
- Visually plain — looks like a generic form
- No social proof (subscriber count, etc.)
- No preview of what a typical email looks like

### Next
1. Premium card treatment — gradient border, soft glow, golden submit button
2. Once 50+ subscribers: show subscriber count
3. Sample-email preview as a tiny inline thumbnail

### Can wait
- Multiple newsletter tiers (daily, weekly)
- Preferences (only PTS, only star players, etc.)

## Footer

### Working
- Freshness pill is honest
- Brand strict
- Consistent across pages

### Weak
- Visually dense
- Links could be better grouped
- No newsletter inline opt-in

### Next
1. Visual reorganization: brand left, links center, freshness right
2. Inline newsletter mini-form in footer
3. Subtle gold gradient at the very bottom edge

### Can wait
- Social icons (we don't have social yet)
- Site map
- Multi-language

## Mobile

### Working
- Layout doesn't break catastrophically
- Reading flow is acceptable

### Weak
- Filter pills overflow on Board page
- Parlay Lab builder panel stacks awkwardly
- Hero typography is sometimes too large for narrow viewports
- Touch targets on filter chips are smaller than 44px in places

### Next
1. Audit every page at 375px width
2. Filter pills become horizontally scrollable on Board
3. Parlay Lab builder collapses to single-column with section accordions on mobile
4. Hero h1 sizes scale down more aggressively below 600px viewport

### Can wait
- Bottom-sheet modals for filters
- Pull-to-refresh
- Native app

## High-impact UI improvements (do these first)

In rough impact order:

1. **Newsletter card visual upgrade** — visible on home page; first thing users see
2. **Mobile filter strip horizontal scroll** — current overflow looks broken
3. **Confidence tier color differentiation** — currently leans on text, should be visual
4. **Methodology pipeline diagram** — single biggest perception lift
5. **Footer reorganization + inline newsletter** — converts more visits

## Animation / graphics ideas (use sparingly)

- Subtle gold gradient that slowly drifts on hero panels (very slow, easy to disable)
- Number counter animation when KPI tiles render (50ms duration max)
- Pulsing dot for "live" status pills
- Reveal-on-scroll for cards below the fold (already partially in place)

**Hard rule:** every animation respects `prefers-reduced-motion`. No exceptions.

## Accessibility notes

- Color contrast: gold-on-navy is borderline at smaller text sizes — audit with WCAG checker
- Focus rings: currently inconsistent — needs a sweep
- Skip-to-content link: missing
- Form labels: newsletter input has placeholder-only — needs visible label
- Heading hierarchy: a few pages skip levels (h1 → h3)
- Trend graph SVGs: need accessible descriptions / data fallback for screen readers
- Filter chips: keyboard navigation works but focus order is sometimes weird

These are next-quarter polish items, not immediate. The site doesn't currently fail to function for keyboard or screen-reader users; it just isn't optimized for them.
