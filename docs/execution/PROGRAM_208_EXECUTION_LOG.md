# PROGRAM 208 — Execution Log & Final Report

**Verdict: PROGRAM_208_MATERIAL_PROGRESS** — every P0/P1 finding closed and deployed with
production proof; two named P2 backlogs remain (F7 internal-vocabulary sweep, F8 component-family
token migrations), and Release E's component-family migrations are the exact unmet acceptance
criterion. Nothing else in the charter's verdict list is open.

## Window & anchors
- Start: 2026-08-25 20:47 EDT / 2026-08-26 00:47 UTC. Close: 2026-08-26 ~02:40 UTC.
- Start tip: c960ad8b0 (local=origin=production; reported P207 tip f3fe0c397 proven an ancestor —
  31 legitimate automation commits preserved, none overwritten).
- Releases (register = `app/src/lib/launch/release-history.mjs`, rendered on /launch):
  | Release | Commit | Rollback parent | Production proof |
  |---|---|---|---|
  | Phase-0 | ec358f5bf | c960ad8b0 | pushed with R-A |
  | R-A Parlay Center | fc97b01d1 | ec358f5bf | prod cache-bypass: mode tabs + Customize live |
  | CI fix | bf88f884f | fc97b01d1 | main green again |
  | R-B nav contract | ea762aa9c | bf88f884f | prod: Home/Picks/Parlay Center labels live |
  | R-C hub shell | c655a5f0b | d26a51181 | prod serving this tip, verified `verify:deployment` |
  | R-DHI | c006ae4c2 | 8f0d6e57d | pushed; CI + Vercel deploy chained |
  | Final assurance | b23cedb38 | c006ae4c2 | CI success 32923511695; production served b23cedb38, cache-bypass verified (robots 200, sitemap 37 urls, Customize live, hub nav live). Row corrected by P209 Phase 0 — it was written pre-push while the commit was in flight. |

## Gates (authoritative, fresh at close)
- Canonical suite: **5,126 tests · 5,122 pass · 0 fail · 4 named skips** (grew +16 from new guards).
- Browser matrix (chromium + webkit + firefox-a11y): **425 pass · 0 fail · 6 named skips**.
- Typecheck clean; build clean; structural accessibility **0 findings** (was 1: the builder search
  input's missing label — fixed, not skipped).
- Health gate (`health-check.mjs`): HEALTHY, 19 passed, 1 known warning (portfolio generatedAt age
  — by design; re-stamping breaks the md5 guard).
- Page-weight budgets: /results 4500KB · / 600 · /today 1200 · /build 900 · /build/custom 500 ·
  /mlb 3000 · /markets 3000 (one module: `src/lib/uiux/page-weight-budgets.mjs`).
- Colour ratchet LOWERED on measured emission: 1170→1166 literals, drift 1066→1062, reachable
  752→748.
- Paid spend this window: zero paid provider requests. Secrets/PII scan of the export: clean;
  /ops /launch /preview pruned. Money record untouched: 19–14 · $19,065.40 · crown $20,465.40.

## Before → after information architecture
- Six primaries on every surface, one canonical list (`src/lib/navigation.ts`): **Home** (new — no
  surface carried it), Today, Simulate, **Picks** (was "Market Center", route /markets kept),
  **Parlay Center** (was "Build", route /build kept), Results.
- Mobile bar: Home · Today · Simulate · Picks · Parlay + labelled **Menu** sheet (derives
  rail-minus-bar: 19 destinations, grouped, current-section marked). The old complement top strip
  removed structurally (it had revived itself as a second mobile nav).
- Top strip: date/slate/freshness only — Paper-record/Peak money chips moved to their owners
  (/results, homepage Recent-results strip, product pages).
- Retired labels: "Market Center", "Picks Lab", "Parlay Lab" (as destination names), bare
  "Enter →" CTAs. /picks and friends stay one-hop redirects; six stale in-app call sites repointed
  to real destinations.

## Parlay Center parity (Release A)
- One destination, two REAL routes: /build (Suggested Parlays, default) + /build/custom (Build
  Your Own) — URL-stable, refresh-safe, shareable, static-export-true.
- ONE draft engine: the slip store is the draft; ONE leg identity
  (`src/lib/slip/leg-identity.ts`: sport|player|market|side|line normalised — the old
  matchup-bearing key gave one selection two identities across surfaces; stored slips migrate and
  dedupe on read). Odds math consolidated onto odds-math.
- "Customize this card" on ladder cards seeds the shared draft from the published slip
  (server-resolved, disclosed skips). Browser-proven: 2 legs seeded, combined +235 equals the
  published card, refresh persists, back preserved.
- Zero-leg floating pill removed; drawer yields to the builder on /build/custom; every legacy
  anchor (#suggested-cards, #advanced-builder) and deep link lands in one hop; no capability
  dropped (marketplace + coverage moved with the builder).
- Records remain separately owned; nothing new settles into money.

## Homepage + hubs (Releases B, C)
- Hero: value sentence, three named actions (Simulate Today's Games → /simulate, See Today's
  Picks → /markets, Open Parlay Center → /build), Results proof link; verified at 390×812 the
  headline and all three actions sit in the first viewport (was: badges + 4 chip rows).
- Recent-results proof strip on home from the same owner /results renders.
- Shared SportHubNav + one section registry on MLB/EPL/UFC/NFL: in-page anchors + capability
  links (Picks, Parlay Center, per-sport Results, card lanes) — every capability one action from
  hub top; conditional sections filtered so no strip item is dead; self-consistency guard over the
  built bytes on any slate (`src/lib/sports/hub-shell.test.mjs`).

## Five novice journeys — before → after
Recorded with method + evidence in `data/internal/uiux/p208-findings.json` (journeys +
journeysAfter). Summary: J1 one label/one destination (wrong-turn source removed) · J2 named hub
CTAs · J3 mobile 3→2 actions to a hub, in-hub 1 action to any capability · J4 suggested→editable
draft exists (was a dead end) · J5 builder above the fold with a visible record path.

## Findings ledger
F1–F6 (both P0s, all four P1s) resolved with release stamps + resolution tests. F7 (copy
vocabulary) and F8 (token migrations) are P2 backlog with owner + acceptance in the findings
artifact and on the /launch Product Experience panel.

## Sport/product truth unchanged (proof)
Activation gates unchanged at close: MLB 12/12 LIVE_ELIGIBLE · EPL 11/12 · UFC 10/12 · NFL 9/12 ·
NBA schedule-only. Product truth 11 facts / 0 contradictions; route inventory 61 routes / 0
findings (was 60 — /build/custom added); closure queue 0 engineering-ready. The redesign altered
no model, settlement, product-day, or record owner.

## Operator alignment (Release I)
/launch gains the Product Experience panel (anchor registered in the launch IA contract): nav
contract DERIVED from navigation.ts, findings with resolutions, payload budgets from the one
budgets module, screenshot sets (p208-baseline 48 · p208-final 52). Operating record regenerated,
PDF-verified and repackaged at each release (final: 123 rows at the close stamp).

## Remaining work, partitioned
- ENGINEERING (P2): F7 copy sweep; F8 component-family token migrations at the pinned-class
  contract; optimizer-card legs lack decomposed identity in `daily/cards/latest.json` (a generator
  change would let those cards seed drafts like ladder cards — currently browse+stake only).
- REALITY / FOUNDER / OFF_SEASON: unchanged from the activation-gap artifact (7 reality watches,
  5 founder gates) — none touched by this program.
