# UI/UX Rebuild Direction — 2026-05-28

> One source of truth for the PR #3 → PR #5 rebuild. Audit, chosen
> direction, token map, typography, spacing, and what NOT to do.
> This doc supersedes the older `UI_UX_AUDIT_2026-05-27.md` for the
> theme-rebuild work; the older doc's empty-state taxonomy and date-
> header notes still apply unchanged.

---

## TL;DR

- **Current premium-gold pilot (PR #129) is broken at the component
  layer.** It overrode token values but most cards use hard-coded
  `background: "rgba(7,11,26,0.40)"`. On the cream-themed page the
  deep-ink body text (#1B1408) falls onto near-dark card surfaces
  and ends up at **1.1:1 contrast — unreadable.** This is what the
  user is seeing.
- **Choose Option C — Hybrid:** dark premium app shell (header /
  nav / sports rail / mobile bottom nav / footer) + a warm neutral
  content surface with off-white cards and deep-navy text. Sport
  rail and ticker stay dark; content area becomes light. This is
  the smallest delta that genuinely fixes readability without
  abandoning the premium feel.
- **Add real card / surface tokens.** The token-only override in
  PR #129 only worked for surfaces that already read tokens.
  Components with hard-coded RGBs need a small refactor in PR #3.
- **Revert the premium-gold pilot** on `/parlay-lab` as part of
  PR #3; the new Hybrid theme replaces it across the whole app
  (or starts page-scoped if rollout safety wins, but the cream
  pilot itself goes away).
- **Keep all data, settlement, parlay-grading, market-diversity,
  and slip-card structure work in PRs #126–#131.** This rebuild is
  purely visual.

---

## 1. Audit findings (2026-05-28, desktop 1280 + mobile 375)

### 1.1 Contrast measurements

Live probe on `/parlay-lab` after PR #131 settlement was merged.

| Element | Foreground | Background (walked-up opaque ancestor) | Ratio | Verdict |
|---|---|---|---|---|
| Slip chip "MAY 27" (9px) | `#5B4A28` deep bronze | `#06070A` body dark | **2.35:1** | ❌ AA fail |
| Slip chip "MLB-ONLY" (9px) | `#5B4A28` | `#06070A` | **2.35:1** | ❌ AA fail |
| Slip chip "OFFICIAL" (9px) | `#1E7A4A` emerald | `#06070A` | 3.78:1 | ⚠ borderline |
| **Grade card label (13px)** | `#1B1408` deep ink | `#06070A` body dark | **1.1:1** | 💀 invisible |
| Grade card label, mobile | `#1B1408` | `rgba(7,11,26,0.4)` dark card | **~1.5:1** | 💀 invisible |
| Eyebrow "Conservative" | `#1E7A4A` | `#F8F2E6` cream | 4.78:1 | ✓ AA |

Three of seven sampled text elements fail AA. One is functionally
invisible. This is the source of the "rookie / messy / unreadable"
feedback.

### 1.2 Root cause

The PR #129 premium-gold pilot did three things:

1. Set `data-theme="premium-gold"` on the `/parlay-lab` root.
2. Re-defined every `--vault-*` token inside that scope to its
   cream/champagne/deep-ink equivalent.
3. Wrapped the page in a full-bleed `background: var(--vault-bg)`
   div so the cream filled the viewport.

What it did NOT do — and what breaks the page:

- **It did not change any component's hard-coded card background.**
  Cards in `parlay-ticket-card.tsx`, `custom-parlay-grade-card.tsx`,
  the date-status block on `/results`, the empty-state cards in
  `parlay-lab-builder.tsx`, and many others all use
  `background: "rgba(7,11,26,0.40)"` or similar inline-style
  literals. These were chosen for the original dark theme and do
  not read any token.
- **It did not change any component's hard-coded text colors that
  weren't already tokenized.** Some chips use `color: "white"` or
  RGB literals; those ignore the theme.
- **The new `--vault-text` value (#1B1408) is correct for cream
  backgrounds**, but cards stayed dark, so the deep-ink text fell
  onto dark and became unreadable.

The premium-gold pilot was the right idea (data-attribute scope is
clean, reversible, no JS). The execution was incomplete because the
component layer wasn't refactored to read a card/surface token.

### 1.3 Other audit observations (not just contrast)

| Area | Problem |
|---|---|
| Typography | Font-mono uppercase used **everywhere** — eyebrows, chips, lane headings, badges, tooltips. Loses hierarchy. 9-10px is the most common chip size — too small at laptop reading distance. |
| Card hierarchy | Slip cards, grade cards, empty states all blend together. No clear "this is more important than that." |
| Slip card density | 15 cards visible at once on desktop with no grouping. Looks like a wall, not a curated set. |
| Sports rail (PR #128) | 64px-wide column with 6 glyph+label anchors. Glyphs are abstract (basketball + cross-hatch motif for MLB). Labels are 9px font-mono uppercase. Hard to scan. |
| Mobile bottom nav (PR #128) | 4 buckets render OK at 375px but the inline SVG glyphs blend with the dark background and label tone. |
| Page background pattern | Body has `vault-shell` with `gtp-floor-lights` decorative element. Pre-existing; not actively harmful, but noisy on a busy page. |
| Color scheme | Currently mixing 3 partially-applied themes: original "premium dark vault" (most pages), PR #124 unused light-mode tokens, PR #129 cream pilot. The mix produces the "feels like a prototype" effect. |
| Mobile contrast | Same hard-coded card backgrounds; mobile is no worse than desktop but also no better. |

### 1.4 Pages most affected
- `/parlay-lab` — worst, because the cream pilot is active and the page is dense with cards/chips.
- `/` — the home parlay rail uses the same `parlay-ticket-card.tsx`; readable on the dark page but inherits the same hard-coded card style for future theming work.
- `/results` — readable on dark, but `DateStatusHeader` and
  `parlay-results-summary` tiles need the same card/surface
  token treatment in PR #3.

---

## 2. Chosen direction — Option C (Hybrid)

**Why Hybrid:** The user is asking for "premium, readable,
professional" without copying any specific sportsbook. A dark
shell + light content area is the smallest, lowest-risk move that
visibly upgrades the product and fixes the readability problem.

- The dark app shell preserves the "premium / model lab" identity
  GameTimePicks already has (vault gold accents work in the header
  and on stats badges).
- The light content area gives cards real contrast — off-white
  cards on warm-neutral page background, deep-navy text. This is
  where users read complex info (slip legs, grades, results).
- Sports rail and mobile bottom nav stay dark — they're shell
  surfaces, not content.

**Why not Option A (refined dark):** A polished dark theme would
work, but the gradient of dark-on-dark gradients we already ship
makes hierarchy hard to read for dense data (slip cards inside a
slip carousel inside a section inside a page). Light content is a
bigger win for the data-density problem.

**Why not Option B (all light):** A fully-light app on a sports-
analytics product looks like an LLM dashboard, not a premium tool.
The dark shell signals "this is a precision tool" — keep it.

---

## 3. Visual principles

1. **Honesty first.** Every chip / tile / banner shows a number
   the user can verify. No banned copy ever.
2. **Contrast ≥ AA for body text.** ≥ 4.5:1 for text under 14px or
   under 700 weight. ≥ 3:1 for ≥ 14px @ 700 weight or ≥ 18px.
3. **One typeface per role.** Display, body, mono. Stop using mono
   uppercase as a default chip style.
4. **Cards are the unit.** Slip card, grade card, result card,
   audit card, empty card. Same shadow + border + radius + padding
   scale.
5. **Spacing is rhythmic.** 4 / 8 / 12 / 16 / 24 / 32 / 48. Pick
   from this scale only.
6. **One accent does the work.** Vault gold for primary accent.
   Success / warn / danger semantic tokens are the ONLY other
   accent colors. No purple, no teal, no lime, no rose.

---

## 4. Token map (PR #3 will implement)

All tokens live in `app/src/app/globals.css`. Existing `--vault-*`
tokens stay (for backwards compat) but new `--gtp-*` semantic
tokens are the new source of truth. Component refactors in PR #3
read the `--gtp-*` set.

### 4.1 Surface tokens

```css
/* Hybrid theme — DEFAULT (no data-theme attribute required). */
:root {
  /* Shell surfaces — dark premium */
  --gtp-shell:           #0B0F1F;  /* app body bg */
  --gtp-shell-elevated:  #131830;  /* sticky nav bg */
  --gtp-shell-rail:      #0F1326;  /* desktop sports rail */
  --gtp-shell-overlay:   rgba(11, 15, 31, 0.92);
  --gtp-shell-border:    rgba(212, 175, 55, 0.18);
  --gtp-shell-rule:      rgba(212, 175, 55, 0.10);

  /* Content surfaces — warm light */
  --gtp-canvas:          #F4EFE4;  /* main content page bg */
  --gtp-canvas-edge:     #ECE5D2;  /* subtle gradient stop */
  --gtp-card:            #FAF6EE;  /* default card */
  --gtp-card-elevated:   #FFFFFF;  /* prominent card */
  --gtp-card-sunken:     #ECE5D2;  /* nested / muted card */
  --gtp-card-border:     rgba(20, 28, 56, 0.10);
  --gtp-card-border-strong: rgba(20, 28, 56, 0.20);
  --gtp-card-shadow:     0 1px 0 rgba(20, 28, 56, 0.04),
                         0 6px 18px rgba(20, 28, 56, 0.08);
}
```

### 4.2 Text tokens

```css
:root {
  /* On dark shell */
  --gtp-on-shell:        #F5E7C4;  /* gold-cream — 13.4:1 on shell */
  --gtp-on-shell-muted:  #B7A77C;  /* 6.8:1 */
  --gtp-on-shell-faint:  #8C7E5A;  /* 4.2:1 — AA-large only */

  /* On light card */
  --gtp-on-card:         #14182E;  /* deep navy — 14.0:1 on card */
  --gtp-on-card-muted:   #4A5276;  /* slate — 6.4:1 */
  --gtp-on-card-faint:   #7B82A0;  /* 4.5:1 — body min */
}
```

### 4.3 Accent + semantic tokens

```css
:root {
  --gtp-gold:            #D4AF37;  /* primary accent on dark */
  --gtp-gold-on-light:   #9A7B1F;  /* primary accent on cards — 4.2:1 */
  --gtp-gold-soft:       rgba(212, 175, 55, 0.14);

  --gtp-success:         #1B6F44;  /* deep emerald on cards — 5.8:1 */
  --gtp-success-soft:    rgba(27, 111, 68, 0.10);
  --gtp-warn:            #8E6310;  /* deep amber on cards — 4.8:1 */
  --gtp-warn-soft:       rgba(142, 99, 16, 0.10);
  --gtp-danger:          #9A2B28;  /* deep red on cards — 5.6:1 */
  --gtp-danger-soft:     rgba(154, 43, 40, 0.10);

  /* Inverse versions for use on the dark shell */
  --gtp-success-on-dark: #6EE7A8;
  --gtp-warn-on-dark:    #F0C75E;
  --gtp-danger-on-dark:  #F08A8A;
}
```

### 4.4 Typography scale

```css
:root {
  --gtp-text-2xs: 11px;  /* eyebrows, chips, micro labels */
  --gtp-text-xs:  12px;  /* secondary body, captions */
  --gtp-text-sm:  13px;  /* default body on cards */
  --gtp-text-base:14px;  /* preferred body */
  --gtp-text-md:  16px;  /* section subtitles */
  --gtp-text-lg:  20px;  /* card titles */
  --gtp-text-xl:  28px;  /* section headlines */
  --gtp-text-2xl: 40px;  /* page hero */
  --gtp-text-3xl: 60px;  /* marketing hero (rare) */

  --gtp-leading-tight:  1.15;
  --gtp-leading-snug:   1.30;
  --gtp-leading-normal: 1.50;
}
```

**Rules:**
- Body text: **never below 13px** on cards. Currently many chips
  are 9-10px — bump to 11-12px minimum.
- Mono uppercase: only for **section eyebrows** and **stat labels**
  ("WINS", "DECISIVE"). Not for body, not for tooltips, not for
  card titles.

### 4.5 Spacing scale

```css
:root {
  --gtp-space-1:  4px;
  --gtp-space-2:  8px;
  --gtp-space-3:  12px;
  --gtp-space-4:  16px;
  --gtp-space-5:  24px;
  --gtp-space-6:  32px;
  --gtp-space-8:  48px;
  --gtp-space-10: 64px;
}
```

Card padding: `var(--gtp-space-4)` minimum on mobile,
`var(--gtp-space-5)` on desktop. Stop using `p-3` for content
cards — too tight at 12px.

### 4.6 Radius + border tokens

```css
:root {
  --gtp-radius-sm: 6px;
  --gtp-radius:    10px;   /* default card */
  --gtp-radius-lg: 14px;   /* hero card */
  --gtp-radius-pill: 9999px;

  --gtp-border:    1px solid var(--gtp-card-border);
  --gtp-border-strong: 1px solid var(--gtp-card-border-strong);
  --gtp-border-shell:  1px solid var(--gtp-shell-border);
}
```

---

## 5. Component direction

### 5.1 App shell (dark premium)
- **Body bg**: `--gtp-shell`. Keep `gtp-floor-lights` but lower its
  opacity by half — pure decoration, not visual noise.
- **Top nav**: `--gtp-shell-elevated`, `--gtp-shell-border` bottom.
  Brand mark left-aligned at desktop, centered at mobile. Active
  link uses the `--gtp-gold` underline.
- **Desktop sports rail**: `--gtp-shell-rail`, vertical, 72px wide
  (up from 64). Glyphs grow to 18px. Labels become 11px regular
  weight (not uppercase) under each glyph. Active anchor gets a
  full-height gold left-edge accent.
- **Mobile bottom nav**: same dark, glyphs grow to 22px, labels
  11px. Larger tap target.
- **Footer**: `--gtp-shell`, faint `--gtp-on-shell-muted` text.
- **Market ticker**: `--gtp-shell-elevated`. Item chips become
  `--gtp-shell-rail` with gold left border. No banned copy.

### 5.2 Content area (warm light)
- **Main**: `--gtp-canvas` background. Each route renders inside a
  centered max-width column.
- **Page hero**: 28px display headline (`--gtp-text-xl`),
  `--gtp-on-card` color, no uppercase.
- **Section eyebrow**: 11px mono uppercase
  (`--gtp-on-card-muted`), gold dot prefix for primary sections.
- **Section subtitle**: 14px regular, `--gtp-on-card-muted`.

### 5.3 Cards
- **Slip card** (`ParlayTicketCard`): `--gtp-card` bg,
  `--gtp-border`, `--gtp-card-shadow`, `--gtp-radius`, 24px
  padding. Header row: profile pill + odds. Sub-header chip row
  (PR #125) becomes 12px regular text (slate / origin / sport
  bucket). Legs use a striped 1-line grid: team-logo · player ·
  market · side · odds · book.
- **Grade card** (`CustomParlayGradeCard`): same card spec, but
  the A/B/C/D/F chip pops with `--gtp-gold-on-light` or semantic
  color. Top positives + warnings rendered as 12px body text in
  two columns. Factor breakdown stays collapsed by default.
- **Result card / Date section**: `--gtp-card-sunken` bg for
  collapsed slips, `--gtp-card` for the active group. Status
  chips use semantic tokens with `*-soft` backgrounds.
- **Empty state**: `--gtp-card-sunken`, 1px dashed
  `--gtp-card-border-strong`, deep-navy body text.

### 5.4 Chips + badges
- Status chips ("Win", "Loss", "Pending"): semantic token text
  on `*-soft` bg. 12px regular.
- Identity chips ("MLB", "MLB-only", "Conservative"): mono
  uppercase but at **11px not 9px**, deep-navy on card, no glow.
- Slate date chip: 11px regular, gold-on-light when "Today",
  muted when older.

### 5.5 Buttons
- Primary: deep-navy bg, gold-cream text. Used sparingly.
- Secondary: transparent bg, deep-navy text, deep-navy border.
- Tertiary (rare): underlined link style.

---

## 6. What NOT to do

1. **Do not keep the cream + dark-card pilot.** PR #3 reverts
   `data-theme="premium-gold"` on `/parlay-lab` and replaces it
   with the Hybrid implementation. The cream pilot's data-attribute
   pattern can be re-purposed for a future "ultra light" mode but
   not in this PR.
2. **Do not rewrite every page top-to-bottom.** PR #3 lands the
   shell + content tokens and refactors the most visible
   components only (parlay card, grade card, date header, results
   tiles, empty states). Lower-traffic surfaces (legacy parlay
   page, deep audit pages) ship as-is and inherit the new shell.
3. **Do not flip colors mid-card.** No "dark header on a light
   card" or "light section on a dark card." Cards are always
   light-on-canvas. Shell is always dark.
4. **Do not introduce additional accent colors.** Gold + semantic
   trio only.
5. **Do not regress mobile readability.** 12px floor for body,
   11px floor for eyebrows. No 9px text anywhere.
6. **Do not break any data behavior.** No changes to settlement,
   grading, audit, optimizer, market diversity, custom parlay
   grading. UI-only PRs from here.
7. **Do not copy any sportsbook brand.** No FanDuel/DraftKings/
   BetMGM colors, logos, copy, layout, or user-flow lifts. The
   inspiration boundary: "this is a sportsbook-style product
   shell with dark nav and light content, that's it."

---

## 7. PR rollout plan

| PR | Branch | Scope |
|---|---|---|
| **PR #2 (this)** | `feature/ui-rebuild-direction` | Direction doc only |
| **PR #3** | `feature/theme-rebuild-professional` | Hybrid theme tokens in `globals.css`. Refactor most-visible components to read tokens. Revert cream pilot from `/parlay-lab`. App-wide shell + content surfaces land. |
| **PR #4** | `feature/parlay-lab-layout-rebuild` | `/parlay-lab` layout: slate overview header, sections (Official / Custom / Manual), card density cut, sport-filter pills polished, empty states refined. |
| **PR #5** | `feature/results-page-cleanup` | `/results` cleanup: post-era-only public parlay results card, projection audit visually separated, mobile readability pass. |

---

## 8. Accessibility / contrast requirements

- **AA (or better) for every text element shipped to prod.** PR #3
  will add a unit test against the contrast of every semantic
  token combination it ships, mirroring the live probe used to
  produce §1.1.
- Tap targets ≥ 44 × 44 px (WCAG 2.5.5) on mobile.
- `aria-current="page"` everywhere a nav anchor matches the route.
- Focus rings stay visible — never `outline: none` without an
  explicit replacement.
- `prefers-reduced-motion` respected — no animations needed for
  this rebuild; reduce or skip any future ones.

---

## 9. Acceptance for PR #3 (theme rebuild)

- Every text element on `/parlay-lab`, `/results`, `/projections`,
  `/` measures ≥ 4.5:1 contrast on desktop and mobile.
- Premium-gold pilot removed from `/parlay-lab`.
- No `rgba(7,11,26,0.x)` literal in any TSX component (all card
  backgrounds use `var(--gtp-card)` or `var(--gtp-card-sunken)`).
- TS + Python tests pass unchanged.
- npm run build clean.
- No data file changes.
- No banned copy.
- No cricket / WNBA / IPL.

---

*This document is the direction-of-record for PR #3 → PR #5.
Subsequent PRs link back here.*
