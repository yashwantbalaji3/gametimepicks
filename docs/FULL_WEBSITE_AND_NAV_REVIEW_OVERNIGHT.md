# Full Website + Navigation Review (overnight, 2026-07-10)

Blunt review of the site's structure against Yash's concern: *"Simulate, Today's Picks, and Game Reports
overlap. Build-a-Pick and Build feel redundant. The sidebar is misleading."* He's right. This documents
the duplication, proposes a safe consolidation, and records what shipped tonight vs what needs a
deploy-reviewed pass. **No routes were deleted** (deep links must not break); nav-label changes are
cross-coupled to `unified-nav-labels.test` so they are proposed here, not rushed overnight.

---

## The real problem: 5 overlapping "do something" entry points

The command rail currently lists, near the top: **Simulate**, **Today's Picks**, **Game Reports**,
**Build-a-Pick**, **Build** — five items that all mean roughly "look at tonight's games / make a pick."
A first-time user cannot tell them apart.

| route | today's label | what it actually is | verdict |
|---|---|---|---|
| `/simulate` | Simulate | the simulation lobby (game cards → run a sim) | **canonical "run a sim"** |
| `/today` | Today's Picks | the daily hub / overview (also the `/` home target) | **canonical "daily hub"** |
| `/games` | Game Reports | per-game model report (folds in `/board`, `/events`, `/projections`) | merge conceptually under Simulate |
| `/picks` | Build-a-Pick | the Parlay Lab (`/parlays`, `/parlay-lab` already redirect here) | **canonical "picks lab"** |
| `/build` | Build | raw eligible-legs inventory (81 legs, incl. WC props) | fold into Picks Lab |

`/games` and `/simulate` are the same mental model (browse a game → see the read); `/picks` and `/build`
are the same mental model (assemble a paper card). The redirects already prove the intent — `/parlays`
and `/parlay-lab` → `/picks`.

## Proposed sidebar (safe: labels + grouping only, routes unchanged)

```txt
Dashboard
  · Today                → /today
Simulate
  · Simulate Games       → /simulate     (game reports live inside a game, not a separate rail item)
Picks & Products
  · Picks Lab            → /picks         (Build-a-Pick + Build consolidated in copy)
  · Bank Builder         → /bank-builder
  · Moonshot / Longshot  → /moonshot
  · Paper Cards          → (internal — NOT public)
Results
  · Track Record         → /results
  · Model Performance    → /results/model-audit
Sports
  · MLB · Soccer · UFC   (UFC labelled "Coming soon" while schedule is empty)
Learn
  · Market Guide         → /market-guide   ← NEW this pass
  · Methodology · About
```

Rationale: 5 daily-loop items collapse to **2** (Today + Simulate Games); Build-a-Pick + Build collapse
to **1** (Picks Lab). `Game Reports` stops being a top-level rail item (it's reached by clicking a game).

## Why it was NOT applied tonight

- Nav labels are enforced identical across `nav.tsx`, `command-rail.tsx`, `mobile-bottom-nav.tsx` by
  `unified-nav-labels.test` — a label change must touch all three + the test, and several other tests
  pin today's labels. That is a focused, reviewable change, not a safe blind overnight edit.
- `/build` and `/games` still have real, distinct pages + inbound links; collapsing them needs a redirect
  + content-merge pass (like the `/parlays → /picks` precedent), verified page-by-page.

## What DID ship tonight (safe, additive)

- **Market Guide** (`/market-guide`) — a new page defining every term (model %, market %, edge, EV,
  confidence, reliability, paper-only, no-play, pending, void, settlement, market-implied, simulation,
  shadow calibration) from a single `lib/glossary.ts`, plus a reusable `<HowToRead>` legend component and
  a link from `/learn`. This directly answers "every tab needs a legend."

## Per-page 10-second-clarity verdicts

| page | clear in 10s? | fix |
|---|---|---|
| `/` (home) | partial — "four ways in" competes | make "Simulate tonight's games" the single primary CTA; demote the rest to secondary |
| `/today` | ok | keep as the daily hub |
| `/simulate` | ok | this is the front door for the sim-first product |
| `/games` | confusing vs /simulate | merge label under Simulate |
| `/build` | raw inventory | add presets (Conservative/Balanced/Moonshot) + the `<HowToRead preset="picks">` legend |
| `/results` | good (Trust Center) | keep |
| `/mr-dub` | risk: paper vs official confusion | ensure paper framing + $0 official exposure copy |
| `/ufc` | fail-closed, honest (0 events now) | label "Coming soon" in nav |

## Recommended next (deploy-reviewed) pass

1. Apply the unified nav relabel (all 3 nav files + `unified-nav-labels.test`).
2. Add the `<HowToRead>` legend to `/picks`, `/build`, `/results`, `/simulate` (one line each).
3. Add product presets to `/build`; then redirect `/build → /picks` once merged.
4. Homepage: single primary CTA + secondary links; stop showing raw top-edges above the fold.
