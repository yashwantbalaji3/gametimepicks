# UI/UX Audit + Phase Plan — 2026-05-27

Status: audit only · no code changes in this doc

## User feedback (verbatim themes)

- Interface still feels complicated.
- Dates are not visible enough.
- Dark theme is not helping eyes.
- Wants something easier on the eye — possibly champagne/gold-light premium background instead of black/dark blue.
- Navigation should feel simple like FanDuel, but not copied.
- Sports + date navigation should be much clearer.
- Parlay Lab should be easier to understand.
- Results should clearly separate **official** vs **replay** vs **projection audit**.

## Current state — page-by-page pain points

### `/` (homepage)

| Pain | Severity | Notes |
|---|---|---|
| Date is not in the header — buried inside lane cards | **High** | Users land here without knowing what date is shown. |
| Market ticker uses tiny mono labels that disappear visually | Medium | Hard to read on mobile. |
| Lane cards too dense; "Conservative / Balanced / Aggressive / Star Power" labels look identical | Medium | Profile differentiation should be color + icon, not just text. |
| No "Today vs latest available" indicator | **High** | When today has no slate, users don't know if they're looking at today or yesterday. |

### `/projections?date=YYYY-MM-DD`

| Pain | Severity | Notes |
|---|---|---|
| Date selector is a small dropdown in a corner | **High** | Should be a prominent date rail/header. |
| No sports tab persistence — every reload resets to "All" | Low-Medium | |
| 0-props empty state shows "no leans" without telling the user *why* (credit guard, no schedule, no game today, etc.) | **High** | One of the most reported confusions. |
| MLB game cards with 0 props look broken | High | Should explicitly say "props pending" or "props pulled, no edge above threshold". |

### `/parlay-lab`

| Pain | Severity | Notes |
|---|---|---|
| Tabs (Suggested / Custom Generator / Manual Builder / Filters) require horizontal scroll on mobile | **High** | |
| Player chip selector is overloaded — search + filter + sport selector + risk profile all in one card | High | Split into a left rail (desktop) / bottom drawer (mobile). |
| "Mixed" tab semantics unclear — looks identical to "All" until you read the fine print | Medium | Needs a one-line empty state when there are no mixed slips. |
| Custom Generator slip-builder modal stacks on top of filters modal on mobile | High | Single bottom drawer would solve this. |

### `/results`

| Pain | Severity | Notes |
|---|---|---|
| New Daily Audit banner is good, but it sits *above* the lifetime summary, suggesting it's more authoritative than it is | Medium | Move below the lifetime summary, OR clearly separate with a divider. |
| **Replay section (PR #122) lands here.** Risk: blends visually with official sections. | **High** | Use dashed warn-coloured border + chip (already implemented), but consider a horizontal divider before it labeled "Experimental section below". |
| Date sections (newest first) repeat the lane breakdown structure 5+ times | Medium | Could collapse older dates by default. |
| No "today's settled state" tile at top | High | Should answer "did the model post today? are games still being graded?" in one glance. |

### `/results/nba` and `/results/mlb`

| Pain | Severity | Notes |
|---|---|---|
| Long tables of every settled prop are intimidating | Medium | OK as a deep-dive page, but should have a top-line summary card. |
| No filter for date range, market, or confidence tier | Low | Nice-to-have. |

### Mobile (375px) generally

| Pain | Severity | Notes |
|---|---|---|
| Header is too tall — eats vertical real estate | **High** | Sticky compact header would help. |
| Bottom nav doesn't exist; tabs are top-only | High | FanDuel-style bottom nav for Home / Projections / Parlay Lab / Results / Account would dramatically improve thumb-reach. |
| No swipe gestures between dates | Low | Future-nice. |
| Empty states often blank or one tiny sentence | Medium | Should be illustrated + actionable. |

## Theme direction — champagne/gold-light

The user wants to evaluate a gold/light premium theme. Recommendation: **plumb tokens now, don't flip the default yet**.

```
--vault-paper:        #F8F2E6   (champagne base)
--vault-paper-deep:   #EDE0C7   (cards / secondary surface)
--vault-ink:          #1B1408   (primary text — high contrast on paper)
--vault-ink-mute:     #5B4A28
--vault-gold-light:   #C9A958   (accent — replaces vault-gold on light)
--vault-success-on-paper: #2F6B3E
--vault-warn-on-paper:    #B05F18
--vault-rule-on-paper:    #D4C39A
```

Flip via a feature flag `vars.GOLD_LIGHT_THEME=false` (default). Land tokens in PR A; build a side-by-side preview at `/about?theme=gold-light` in PR B; only then flip the default — and even then, behind a per-user toggle in the header.

**Do NOT flip the theme in the same PR that lands navigation changes.** The user has dark-theme muscle memory; a single PR that changes both palette and layout will produce more confusion than improvement.

## Recommended PR sequence (focused, sequential)

### **PR #N — Date visibility + empty-state clarity** ← do this first

Branch: `feature/navigation-and-date-clarity`
Title: `feat(ui): improve date visibility and parlay navigation clarity`

In scope:
1. **`<DateHeader>`** — prominent date display at top of `/projections`, `/parlay-lab`, `/results`. Shows e.g. `Today · Tuesday, May 27` or `Latest available · Saturday, May 25 (1 day behind)`.
2. **Status chips** added to date header: `Today · in progress`, `Today · settled`, `Latest available`, `No games`, `No props`.
3. **Empty-state taxonomy** — replace generic "no leans" with one of 4 patterns:
   - "No games scheduled — slate is dark today."
   - "Games scheduled, props not yet pulled."
   - "Props pulled, no slip cleared the safety filters."
   - "Settlement in progress."
4. **Official / Custom / Replay visual taxonomy:**
   - Official: solid border, gold accent
   - Custom: dashed border, neutral
   - Replay: dashed border, warn (already shipped in PR #122)
5. **Theme tokens** for gold-light direction landed but NOT flipped on (behind `vars.GOLD_LIGHT_THEME=false`).

Out of scope (deferred to follow-up PRs):
- Sports rail (desktop) / bottom drawer (mobile).
- Theme flip.
- HR Longshot lane.
- New prop markets.

Estimated size: ~6 files, ~600 lines (one component for `<DateHeader>`, one for `<EmptyState>`, theme-tokens addition, 3 page wirings).

### **PR #N+1 — Mobile bottom nav + sticky compact header**

Defer until after PR #N lands. Adds bottom nav for Home/Projections/Parlay-Lab/Results, shrinks the desktop header. Not bundled because it touches the global layout and changes muscle memory.

### **PR #N+2 — Sports rail (desktop) + slip drawer (mobile)**

Big restructuring; defer until N+1 settles for a few days.

### **PR #N+3 — Theme flip with per-user toggle**

After tokens have lived in main for a week and users have seen a `/about?theme=gold-light` preview.

### **PR #N+4 — Sportsbook comparison UX**

Each leg already has a sportsbook chip. Build a "compare odds" tooltip showing each book's line for that prop. Foundation for a future "shop the line" feature.

## What NOT to do

- ❌ Do not rebuild navigation, theme, and parlay-lab in one PR. Roll back risk is too high.
- ❌ Do not change date selector semantics without a `<DateHeader>` first — users will lose their reference.
- ❌ Do not move official results below replay or hide the lifetime summary.
- ❌ Do not introduce a "trending picks" or "popular picks" rail. That's social-proof bait incompatible with the honesty contract.
- ❌ Do not add a "guaranteed wins" / "today's lock" / "no-brainer" / similar promo copy anywhere, ever.

## Decision needed

Before opening any UI PR, confirm:
1. Sequence above is acceptable (PR N → N+4).
2. PR N scope is small enough (date visibility + empty states + theme tokens, no nav rebuild).
3. Theme flip is deferred to PR N+3 with feature flag.

Then the first UI PR can be opened against branch `feature/navigation-and-date-clarity` per the original prompt.
