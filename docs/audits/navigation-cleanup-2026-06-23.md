# Navigation Cleanup — Public Release Hardening (Phase 1)

_Date: 2026-06-23. Audit + before/after route matrix for the global navigation surfaces._

## Surfaces audited
| Surface | File | Visibility | Items |
|---|---|---|---|
| Desktop command rail | `components/command-rail.tsx` | `hidden lg:flex` (≥1024) | 17 |
| Top nav (desktop row) | `components/nav.tsx` | `hidden sm:flex` (≥640) | 11 |
| Top nav (mobile strip) | `components/nav.tsx` | `sm:hidden` (<640) | was 11 → **now 3** |
| Mobile bottom nav | `mobile-bottom-nav.tsx` + `lib/nav-active-route.ts` | `md:hidden` (<768) | 8 |
| MLB quick-jump (in-page) | `components/mlb/mlb-quick-jump.tsx` | sticky, page-scoped | 5 anchors |
| Sport/section tabs | `components/sport-section-tabs.tsx` | renders `null` (deprecated) | — |

Active state: command rail mirrors `nav.tsx` `isActive()` (pathname + `SPORT_RE`); mobile bottom uses
`resolveMobileNavBucket()` (pathname → bucket); in-page jumps use IntersectionObserver. All use
`aria-current`.

## Findings & resolutions

### 1. Duplicate destinations within a surface — NONE (confirmed, no change)
No route appears twice in any single surface.

### 2. Inconsistent label — FIXED
`/learn` was labelled **"How it works"** in the command rail (`command-rail.tsx:49`) but **"Learn"** in the
top nav + mobile. Unified to the canonical **"Learn"** (used by 2 of 3 surfaces).
- The `/bank-builder` "Bank Builder" → "Bank" variance on mobile is **intentional** (44px thumb target,
  documented in `nav-active-route.ts`) — left as-is.

### 3. Mobile top vs bottom — DE-DUPLICATED (now complementary)
Previously the mobile top strip duplicated **8 of 11** bottom-nav destinations. The top strip now renders
only the items the bottom nav lacks — **Results · Sports · Learn** — via
`MOBILE_TOP_ITEMS = NAV_ITEMS.filter(i => !BOTTOM_NAV_HREFS.has(i.href))` (`nav.tsx`). Result: the
bottom bar owns the 8 core products (thumb access); the top strip carries the 3 utility routes. **Zero
overlap.** Verified live at 390px.

### 4. Dead routes — NONE
Every nav href resolves to a real `app/<route>/page.tsx`. Legacy aliases (`/parlays`, `/parlay-lab`,
`/projections`, `/board`, `/events`) are redirect/active-state targets only, not nav items. No
removed-product ("Diamond/Specials") links remain.

### 5. Active-state consistency — consistent (no change)
Command rail and top nav share identical `isActive()` logic; mobile bottom uses an equivalent bucket map;
in-page jumps use `aria-current` on the visible section. No user-visible inconsistency.

## Before / after route matrix (mobile)

| Route | Mobile TOP (before) | Mobile TOP (after) | Mobile BOTTOM |
|---|:--:|:--:|:--:|
| /today | ✓ | — | ✓ |
| /games | ✓ | — | ✓ |
| /picks (Parlay Lab) | ✓ | — | ✓ |
| /build | ✓ | — | ✓ |
| /bank-builder | ✓ | — | ✓ (label "Bank") |
| /moonshot | ✓ | — | ✓ |
| /homer-nukes | ✓ | — | ✓ |
| /mr-dub | ✓ | — | ✓ |
| /results | ✓ | ✓ | — |
| /sports | ✓ | ✓ | — |
| /learn | ✓ | ✓ | — |

Before: 8 duplicated routes across the two mobile surfaces. After: **0 duplicated** — the surfaces are
complementary (8 core products bottom, 3 utility routes top).

## Desktop (unchanged destinations; one label fix)
Command rail (17) remains the full desktop directory at ≥1024; the top nav row (11) is the product spine.
Only change: `/learn` label unified to "Learn". (The 768px horizontal-overflow of the top-nav row is fixed
separately — see the release-readiness doc, Phase 2.)

## Verdict
Navigation is consistent and de-duplicated: one label unified, mobile top/bottom now complementary, no
duplicate tabs, no dead routes, consistent active-state. No route was removed or made unreachable.
</content>
