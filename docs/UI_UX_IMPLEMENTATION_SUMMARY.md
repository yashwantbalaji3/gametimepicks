# UI/UX Implementation Summary — Unified Nav Relabel (2026-07-10)

The relabel that was spec'd-and-deferred last pass is now **shipped and rendered**. The overlapping
product names are gone; every nav surface + the Today modules + the Results trust center + all coupled
tests carry the new labels. No routes deleted, no formulas/money/picks changed (md5 `affe6b21…`, 19-14,
$0; suite **2057/2057** green; build clean; 0 stale labels in the built output).

---

## Labels shipped (every surface, consistently)

| route | old | **new** |
|---|---|---|
| `/today` | Today's Picks | **Today** |
| `/picks` | Build-a-Pick | **Picks Lab** |
| `/moonshot` | Longshot Lab | **Moonshot** |

Applied across **all four nav surfaces** — top nav (`nav.tsx`), command rail (`command-rail.tsx`), mobile
(`nav-active-route.ts` `MOBILE_NAV_ITEMS`), footer (`footer.tsx`) — plus the user-facing body copy that
renders these names: the Today status modules (`status-modules.tsx`: "Picks Lab" / "Moonshot" titles +
CTAs), the Today at-a-glance + secondary-link cards (`today/page.tsx`), and the Results trust center
(`trust-center.tsx`). The `/simulate` label stays "Simulate" (already clear); `/games` stays "Game
Reports" (reached from a game).

## Coupled tests updated (the coordinated part)

`unified-nav-labels` (UNIFIED map + the hardcoded `/picks` block), `nav-active-route` (primary-spine +
mobile-spine assertions), `footer-identity` (footer link regex), and `today-hub` (test 7 — flipped from
"public label is Longshot Lab / no Moonshot body copy" to "public label is Moonshot / no Longshot Lab in
rendered copy"). All green; a broad `out/` sweep confirms **0** pages still render the old product labels.

## Also shipped (prior pass, still live)

- **Command-rail descriptions** — each item has a one-line descriptor.
- **Legends** — `<HowToRead>` on `/simulate` + `/picks`; the `/market-guide` glossary; link from `/learn`.

## Deferred (honest — real component/route changes, budget)

- **Route consolidation** `/games → /simulate` and `/build → /picks` (redirect/alias). Both routes still
  work; `/games` renders the same `SimulateLobby`, `/parlays`+`/parlay-lab` already redirect to `/picks`.
  A redirect in a static export needs care (client redirect or an alias page) — next focused change.
- **Homepage single-CTA restructure** — `home-restructure` pins the current hero; a real component pass.
- **Picks Lab presets** (Conservative/Balanced/Moonshot) + legends on `/today` `/results` + product pages.
- **Asset-coverage audit** + fallback polish; **flagship/UFC-nav** clarity docs.

## Guardrail proof

md5 `affe6b21…` unchanged · 19-14 · $0 · forensic PERFECT · health HEALTHY · no card activated · no
prediction/formula change · internal artifacts still 404 · Generate gate intact (legends are static). The
nightly settle-bot drift (`6ee98c66`) was verified money-clean and fast-forwarded before work.
