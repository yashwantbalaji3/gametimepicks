# Premium UI/UX Audit (latest)

> Honest audit of the user-facing app for a premium "sportsbook board" feel.
> No data/model/grading/workflow changes. Compliance preserved (educational /
> paper-only; no safe/lock/guaranteed/V2/edge copy).

## Baseline reality
The app already ships a deliberate, sophisticated premium dark theme — a 4,343-
line `globals.css` with a navy (#070B1A) + champagne-gold (`--vault-*`/`--gtp-*`)
token system, layered/elevated cards, gradients, glows, refined borders, mono +
display type. It is NOT amateurish. The single biggest *objective* gap vs a real
sportsbook board: the four risk tiers were **mono-accent** — Low used green but
Medium/High/Longshot were all shades of gold/amber (high == longshot ==
`--vault-warn`), so the lanes blurred together.

## Implemented now (this increment — safe, high-impact, layout-untouched)
- **Risk-tier accent color system** (`--risk-low/medium/high/longshot` + dim):
  emerald → brand-gold → orange → violet. A risk *escalation* read; gold stays
  the global brand anchor. Repointed `SECTION_DISPLAY.accentVar`, so it flows to
  every consumer: Parlay Lab section headers, **per-card risk chips + dots**,
  Results risk tables, drilldown, Bankroll panel.
- **Card top-rule keyed to risk tier for pregame slips** (settled cards keep
  win/loss/push color) — the "color-coded lane" ticket feel.
- Copy: implies risk LEVEL only, never likelihood of winning.

## Verified
0 console errors; 0 horizontal overflow at 375 & 1280 (past-edge elements are
only the intentional marquee/scroll-chip strips); all four accents render
(emerald/gold/orange/violet across headers, chips, dots); honest empty states,
no-padding copy, MLB-only badge, PREGAME/settled labels all preserved.

## Deferred (recommend iterating WITH live feedback — subjective + higher blast radius)
- Subtle page-shell radial gradient (depth vs flat navy) — global bg, verify contrast first.
- Sport accent chips (MLB/NBA/Mixed) to match the risk-lane system.
- Card "glass" refinement + hover/selected micro-states.
- Home hero restructure; Projections card-on-mobile layout; Results mini-bars.
- Build-Your-Own bet-slip-tray polish.
Each is reversible and best validated against the user's eye rather than shipped
blind on a working, shareable product.

## Hard rules honored
No projection/optimizer/grading/data/workflow change; no V2 wiring; no banned
copy; real data only; honest empty states.
