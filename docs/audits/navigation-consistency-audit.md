# Navigation Consistency Audit — top nav · mobile bottom nav · command rail

_Phase F of the Master MLB + Product Polish sprint. Date: 2026-06-23._

Scope: every primary navigation surface, audited for duplicate tabs, inconsistent naming, redundant/dead
routes, and cross-surface coverage gaps. Every claim cites `file:line`.

## Surfaces

| Surface | File | Breakpoint | Items |
|---------|------|------------|-------|
| Top nav | `app/src/components/nav.tsx` | all (mobile = scrollable strip; `sm+` = single row) | 11 |
| Mobile bottom nav | `app/src/components/mobile-bottom-nav.tsx` (items: `app/src/lib/nav-active-route.ts:48`) | `md:hidden` | 8 |
| Command rail | `app/src/components/command-rail.tsx` | `hidden lg:flex` | 17 |

Non-navigation rails (excluded — not primary nav): `quick-action-rail.tsx` (CTA tiles),
`sportsbook-light-rail.tsx` (decoration), `homepage-sports-rail.tsx` (contextual tiles),
`results-section-nav.tsx` (in-page anchors), `board-date-rail.tsx` (date picker).

### Top nav items (`nav.tsx:31–41`)
`/today` Today · `/games` Games · `/picks` Parlay Lab · `/build` Build · `/bank-builder` Bank Builder ·
`/moonshot` Moonshot · `/homer-nukes` Homer Nukes · `/mr-dub` Mr. Dub · `/results` Results · `/sports`
Sports · `/learn` Learn.

### Mobile bottom nav items (`nav-active-route.ts:49–56`)
`/today` Today · `/games` Games · `/picks` Parlay Lab · `/build` Build · `/bank-builder` **Bank** ·
`/moonshot` Moonshot · `/homer-nukes` Homer Nukes · `/mr-dub` Mr. Dub.

### Command rail items (`command-rail.tsx:35–51`)
The 8 product-spine routes above, plus `/world-cup-specials` WC Specials, `/world-cup` World Cup, `/mlb`
MLB, `/nba` NBA, `/ufc` UFC, `/results` Results, `/learn` How it works, `/methodology` Methodology,
`/about` About.

## Findings

### 1. Duplicate tabs within a surface — NONE
No route appears twice within any single surface. The earlier nav-cleanup sprints (de-dup of
sidebar/top/bottom) already removed the prior duplication; this audit confirms it holds.

### 2. Dead / legacy links — NONE
Every `href` across all three surfaces resolves to a real `app/src/app/<route>/page.tsx`. Legacy aliases
(`/parlays`, `/parlay-lab`, `/projections`, `/board`, `/events`) are **not** in the primary navs; they
exist only as redirect routes and active-state mappings. No nav item references a removed product (no
"Diamond"/"Specials" dead links — `/world-cup-specials` resolves).

### 3. Naming inconsistency — ONE, intentional
`/bank-builder` is "Bank Builder" in the top nav (`nav.tsx:35`) and command rail (`command-rail.tsx:39`)
but **"Bank"** in the mobile bottom nav (`nav-active-route.ts:53`). This is a deliberate thumb-width
abbreviation for the 44px mobile tap target (documented at `nav-active-route.ts:43–44`). All other
product labels — Parlay Lab, Moonshot, Homer Nukes, Mr. Dub — are identical across all three surfaces.
**Verdict: acceptable; left as-is.**

### 4. Coverage gaps (present in X, missing from Y)
| Route | Top nav | Mobile | Rail | Note |
|-------|:------:|:-----:|:----:|------|
| `/results` | ✓ | — | ✓ | Excluded from mobile by design (`nav-active-route.ts:126–128`) to avoid clutter / misleading highlight |
| `/sports` | ✓ | — | — | Reachable via `/games`; sport routes map to the "games" bucket. **Minor gap, deferred.** |
| `/world-cup`, `/world-cup-specials` | — | — | ✓ | Seasonal/operator-gated; rail-only is intentional |
| `/mlb`, `/nba`, `/ufc` | — | — | ✓ | Top nav routes to unified `/games`; direct sport hubs on rail only |
| `/methodology`, `/about` | — | — | ✓ | Educational/legal; not part of the product spine |

The only non-intentional gap is `/sports` being top-nav-only. It is low severity (Sports is reachable via
the Games board and the sport hubs on the rail), so it is **documented and deferred** rather than changed
in this release — adding it to the rail/mobile would expand the product spine, which is out of scope for a
polish pass.

### 5. Active-state parity
`command-rail.tsx:54–93` mirrors `nav.tsx`'s `isActive()` exactly, and the mobile nav uses
`resolveMobileNavBucket()` (`nav-active-route.ts:86–130`). Highlighting is consistent across surfaces for
every route, including legacy aliases folded into their canonical bucket (`/parlays`/`/parlay-lab` → Parlay
Lab; `/board`/`/events`/`/projections`/sport hubs → Games).

## Verdict

**Navigation is release-ready.** No duplicate tabs, no dead/legacy links, no redundant routes within any
surface, and labels are consistent across surfaces (the sole "Bank" abbreviation on mobile is an
intentional space accommodation). One minor, low-severity coverage gap (`/sports` top-nav-only) is
documented and deferred. No navigation code changes were required for this release.
</content>
