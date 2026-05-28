# Parlay Lab Product Audit — 2026-05-28

> Source-of-truth audit for the upcoming `feature/parlay-lab-*` PR
> sequence. Anchors the design direction in measured DOM data from
> the current production (`83643ae`, post-PR #137 compact slate hero)
> rather than vibes. Each problem listed here has a specific PR slot
> in §5.

---

## 1. Current production state (`83643ae`)

- Refined-dark theme is live (PR #133, reverted hybrid pilot in PR #136).
- Compact slate strip 45px replaces the prior 120px DateStatusHeader card on `/parlay-lab` (PR #137).
- Slip chips render at 11px @ 6.05+:1 (PR #134).
- Custom-parlay grade card lives below the manual builder (PR #130).
- Settled May 27 public parlay record on `/results`: 9W · 21L · 30.0% on decisive, no pre-era leak (PR #131).
- May 28 data live on disk + `/data/...` endpoints; static page rebuild pending until a non-`[skip ci]` commit lands (this audit doc IS that commit).
- No banned copy, no cricket / WNBA / IPL in production HTML.

## 2. Measured layout (desktop 1280×800, mobile 375×812)

Numbers below are live `getBoundingClientRect()` reads taken on `83643ae`.

| Region | Desktop height | Mobile height | Notes |
|---|---|---|---|
| Disclaimer banner | ~24px | ~24px | Compressed in PR #136. |
| Top nav | 58px | 98px | Mobile keeps the two-row pattern (brand row + nav strip). |
| Market ticker | ~28px | ~28px | Single horizontal scroll strip. |
| Slate strip (PR #137) | 45px | 99px (wraps to 4 lines) | `aria-label="Slate overview"`. |
| H1 + subcopy block | ~110px | ~140px | Single `<header>` with display headline + max-width 680. |
| Filter card (sport pills + team + player) | ~150px | ~200px | The widest visual block before any slip card. |
| Section eyebrow ("OFFICIAL SUGGESTED PARLAYS · 2026-05-27 · LATEST AVAILABLE") | ~50px | ~50px | Adds another ~50px of pre-card chrome. |
| First slip card | y = **629px** | y = **866px** | Above the 800px desktop fold; just below the 812px mobile fold. |
| Sport rail (desktop only) | width 64px, height = viewport | hidden | Sits at left edge inside `vault-shell`. |

Contrast samples (from the same probe pass):

| Element | Foreground | Background | Ratio |
|---|---|---|---|
| Card body text | `#F5E7C4` cream | `#161E3E` charcoal | ~12.5:1 |
| Chip slate "Latest available · May 27" | `#B7A77C` mute | `#0F1326` rail | 7.74:1 |
| Chip official | `#6EE7A8` emerald | `#0F1326` | 11.97:1 |
| Section eyebrow | `#6EE7A8` | `#0B0F1F` body | 12.39:1 |
| H1 headline | `#F5E7C4` | `#0B0F1F` body | ~13.4:1 |

No element on the current desktop or mobile view falls below AA. Contrast is **not** the remaining UX problem.

## 3. UX problems (ordered by visible impact)

### 3.1 Filter card looks like raw form controls

- "All teams" and "All players" render as Tailwind-defaulted `<select>` controls inside a 150px-tall card.
- They sit between the sport pills and the section eyebrow and dominate the pre-card vertical space.
- Most users don't filter at all — but the controls take the same real estate as a fully-engaged filter UI.

### 3.2 Section eyebrow + slate strip overlap in meaning

- The slate strip says "Wed · May 27 · 64 slips · NBA 0 · MLB 32 · Mixed 0 · Latest available".
- The section eyebrow says "● OFFICIAL SUGGESTED PARLAYS · 2026-05-27 · LATEST AVAILABLE".
- Date and status repeat in two places. The section eyebrow's subcopy ("Saved before games, graded after. Capped at 4 legs per slip.") is the only new information.

### 3.3 Leg rows are dense and repeat truncated text

- Each `TicketLegRow` packs player + team chip + market label + side/line + book-aware odds onto a single horizontal line.
- "Calibration watch" is repeated on most legs as a small chip; rarely informative at the per-leg level.
- "View form →" is truncated to "View fo…" on narrower cards.
- At 1280px laptop width the leg row reads as dense; at 375px mobile it must wrap, which compromises the alignment.

### 3.4 Sport rail is too thin to be useful

- 64px wide, glyphs only (basketball / baseball / mixed icons via SVG `currentColor`).
- No labels visible on hover, no active-state strength.
- At 64px it neither reads as "rail navigation" nor sits invisibly out of the way.

### 3.5 Three competing custom/manual sections at the bottom

- Below the official lane grid the page renders, in order:
  1. `Custom Parlay Builder` (full leg pool + grade card)
  2. `Custom Parlay Generator` (auto-pick from the same pool)
  3. Their explanatory `SectionEyebrow`s
- They aren't clearly demarcated as "secondary / not officially tracked" — visually they look like a continuation of the official lane grid.

### 3.6 Mobile-specific issues

- Mobile slate strip wraps to 4 lines (99px). Better than a 120px card but could be a 2-line grid (date · counts on line 1, status chip on line 2) for ~70px.
- Filter card wraps to ~200px on mobile — the "All teams" / "All players" stacked dropdowns push real content below the fold.

## 4. Target design direction

### 4.1 Compact slate strip (already shipped in PR #137)

✔ Live. Could be tightened on mobile in a small follow-up.

### 4.2 Professional filter toolbar

- Single horizontal bar at ~48px tall on desktop.
- Sport pills `[ All | NBA | MLB | Mixed ]` as semi-rounded chip buttons with strong active state.
- Team and Player become a single combined `Filter` disclosure (`+ Filter`) that opens an inline panel only when used. Default collapsed.
- Lane / risk filters stay where they already are (the existing pill row above the slip grid).

### 4.3 Cleaner section eyebrow

- Drop the duplicated date from the eyebrow ("● OFFICIAL SUGGESTED PARLAYS" alone is enough — date already in the slate strip).
- Keep the one-line subcopy.

### 4.4 Two-line leg row

```
Line 1:   ★ James Wood          WSH @ STL          -173
Line 2:   Hits Over 0.5 · DraftKings          View form →
```

- Line 1 = player · team @ opponent · book odds (right-aligned).
- Line 2 = market + side/line · book · per-leg drawer link.
- "Calibration watch" badge promoted to a dot indicator next to the market label (not a separate chip).
- Truncation only on the player name with `text-overflow: ellipsis`, never mid-word.

### 4.5 Sport rail simplification

Two options:
- **A — widen to 76-88px** with text labels below the glyph + clearer active accent.
- **B — remove the rail** and let the sport pills in the filter bar carry sport navigation.

Recommend **A** for desktop differentiation. Keep mobile bottom nav unchanged.

### 4.6 Custom / manual hierarchy

- Wrap custom-generator and manual-builder in a single `<aside class="opt-in">` with a small "Not officially tracked — exploratory tools" eyebrow once.
- Collapse the manual builder by default on mobile.

## 5. PR implementation plan

| PR | Branch | Scope |
|---|---|---|
| **PR #3** | `feature/parlay-lab-filter-rail-polish` | Filter toolbar redesign + sport rail widen-or-remove. Single horizontal filter bar, sport pills as primary, Team/Player as a `+ Filter` disclosure. |
| **PR #4** | `feature/parlay-slip-card-redesign` | Two-line leg row, market chip cleanup, "Calibration watch" → dot indicator, profile/lane treatment. |
| **PR #5** | `feature/parlay-lab-section-restructure` | Drop duplicated section-eyebrow date. Wrap custom + manual into one "opt-in" aside with a single explanatory eyebrow. Collapse manual builder by default on mobile. |
| **PR #6** (optional) | `feature/results-projections-slate-strip` | Apply the same `<SlateStrip>` to `/results` and `/projections` for consistency. |

Each PR is sized to land independently. Each must satisfy the 13-point auto-merge gate (scope match · tests · build · browser desktop+mobile · banned copy · cricket/WNBA/IPL · secrets · pre-era leak · replay).

## 6. What this audit deliberately does NOT change

- Model logic, settlement, grading, projection math — all stay untouched.
- Data files for 5/28 stay as generated by the morning workflow.
- Public parlay tracking era constant (`PUBLIC_PARLAY_RESULTS_START_DATE = 2026-05-27`) stays.
- May 26 replay removal stays.
- The pre-era leak filter (PR #131 loader fix) stays.
- No cricket, no WNBA, no IPL.
- No banned phrasing.

---

*This document is the direction-of-record for PR #3 through PR #5 (and the optional PR #6) in the 2026-05-28 rebuild sequence.*
