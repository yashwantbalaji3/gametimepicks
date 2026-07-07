# Parlay Lab / Results / Projections — Design Options
**Date:** 2026-05-28 · post-PR #141 (`431ef04`)
**Author:** Claude Opus 4.7 (1M context)
**Status:** Direction-setting document — pick one option before any further UI PRs land.

> No code is associated with this document. PR #141 (filter + rail polish) is
> already merged and production-verified. Everything below is a **design
> proposal** — choose Option A / B / C and one color system, then I will
> spec the next PRs against the chosen direction.

---

## 1. Current UI problems still visible after PR #141

These are the things that remain "developer-y" or that compete for the eye on `/parlay-lab` today (2026-05-28, `431ef04`, production-verified):

1. **Three stacked sections wear the same uniform.** Official / Manual Builder / Custom Generator each get a `SectionEyebrow` with a small dot and identical typography. There is no visual hierarchy that says "this block is the product; these two are exploration."
2. **The slate strip and the "Official suggested parlays · 2026-05-27" eyebrow surface overlapping date info, and the dates disagree.** Slate strip reads "Thu · May 28 · TODAY"; the section eyebrow inherits the legacy snapshot date and reads "2026-05-27 · LATEST AVAILABLE" because `ParlayLabBuilder` receives `date={suggested.date}` instead of `optimizerForDate.date`. Pre-existing data-flow bug, not introduced by #141, but it makes the page look broken.
3. **Slip cards are tall but the hierarchy is flat.** Inside one card: status row + "LATEST AVAILABLE · MAY 27" chip + "OFFICIAL" chip + "MLB-ONLY" chip + 2–4 leg rows + footer. Six visually competing chips, nothing dominates.
4. **Leg rows look like log lines, not picks.** Each row has `MLB · ⭐ · Player Name · Hits Over 0.5 · BOS · Calibration wa...` — truncated, monospaced, every leg shows the same "Calibration watch" chip so the chip stops conveying anything.
5. **Odds are the smallest thing on a slip card.** `+103` / `−196` is right-aligned in a faint font color. On a "suggested parlay" surface, odds should anchor the reader's eye.
6. **The High Variance toggle feels tacked on.** A single `[ ▸ Show high variance ]` button below the 3-lane grid, no real visual structure around it.
7. **The Market Ticker is decorative.** It surfaces "91 NBA projections live · MLB board active · 6 games" — three flavors of "we have data," none of which the user can act on.
8. **Three call-to-action surfaces in the same `<select>` shape.** Team filter, Player filter, Manual Builder's add-leg, Custom Generator's pool selector — they all use the same `SearchableSelect` button, so the page reads as "many dropdowns" rather than "one builder + two exploratory tools."
9. **The desktop sports rail still competes with the top nav.** PR #141 made the rail legible (76px, labels, active accent bar), but `Home / Projections / Parlay Lab / Results / About` at the top *plus* `All / NBA / MLB / Mixed / Results / Custom` on the left = two navigation systems on the same screen. They overlap at "Results."
10. **`/results` is a long vertical stack of tiles.** Hero, fresh-era block, daily audit banner, lifetime tile, by-profile, by-sport, per-date — every row is the same width, every row is full-bleed. No second column, no progressive disclosure, no clear "this is what just happened today" callout.
11. **`/projections` repeats the same dark-card-on-dark-shell rhythm.** Per-sport board strips that look like the parlay cards but aren't actionable in the same way.
12. **There is no single sentence on `/parlay-lab` that tells a new visitor what GameTimePicks *is*.** The H1 is "Today's suggested parlays." — that explains the page, not the product. A first-time visitor sees data without a frame.

---

## 2. Three layout directions

For each option I describe the same surfaces in the same order: page structure → navigation → slip card → leg row → filters → mobile → pros → cons → risk.

### Option A — Compact analytics dashboard

The Stripe / Linear / Vercel-Observability vibe. Multiple zones on one screen, dense info, sortable tables, sidebars that stay put.

**Page structure (desktop ≥ lg)**
```
┌───────┬──────────────────────────────────┬──────────────┐
│ Sport │ Slate header (date + KPIs)       │ Right rail   │
│ rail  ├──────────────────────────────────┤              │
│       │ Filter toolbar (PR #141 style)   │ Today's      │
│       ├──────────────────────────────────┤ projection-  │
│       │ Lane tabs:                       │ level hit    │
│       │ [Conservative | Balanced | Star] │ rate         │
│       │                                  │              │
│       │ Slip table (sortable rows)       │ Lifetime     │
│       │  ⌃ profile · odds · grade        │ public-      │
│       │  ⌃ legs (expandable)             │ parlay W/L   │
│       │                                  │              │
│       │ [ Show high variance ▸ ]         │ Last 7-day   │
│       ├──────────────────────────────────┤ sparkline    │
│       │ Exploration tools (collapsed)    │              │
│       │   ▸ Manual builder               │ Audit pointer│
│       │   ▸ Custom generator             │              │
└───────┴──────────────────────────────────┴──────────────┘
```

**Navigation model.** Top nav becomes thin route nav (`Lab / Results / Projections / About`). Left rail stays for sport filters and becomes the primary sport switcher (removes the duplication noted in §1.9). Right rail is a contextual KPI pane that follows you across `/parlay-lab`, `/results`, and `/projections`.

**Slip card structure.** Slips become **rows in a table**, not cards. Each row is a single line at rest: `[profile chip] [American odds, large] [legs · 3] [grade] [▸]`. Click to expand into a panel with leg detail + recent-form drawer link + per-leg book odds.

**Leg row structure.** Inside the expanded panel, legs live in a clean 2-column grid: left column = player / team / book / side, right column = projection vs line + edge bar + recent form sparkline.

**Filters.** A persistent inline toolbar (the PR #141 toolbar) sits below the slate header. Sport pills + Team/Player + Clear. Nothing new vs today.

**Mobile.** Collapses to a single column. Sport rail moves into the mobile bottom nav. Right-rail KPIs collapse into a "Today" accordion at the top. Slip rows stay as rows, just narrower.

**Pros.**
- Maximum information density — power users see everything in one screen.
- A single sortable table is honest about ranking: edge × confidence × stability is something you can *sort by*.
- Right rail makes Results/Projections data reusable without context-switching.
- Smallest disruption to existing pipeline output shapes.

**Cons.**
- Dense layouts feel "developer-y" — the exact thing the user flagged.
- A sortable table feels less like a product and more like an admin tool.
- 3-column layouts collapse poorly on mid-width viewports (1024–1280px).
- Loses the "magazine"-quality polish a consumer product needs.

**Risk:** Medium. Doubles down on the "developer dashboard" complaint if not designed with restraint.

---

### Option B — Sportsbook-inspired, GameTimePicks-original layout

The Pinnacle / Sportsbook-but-not-FanDuel vibe. Familiar betslip-style cards, prominent odds, bold accents — but built from our own brand tokens so we never trip the "don't copy FanDuel/DraftKings exact branding, layout, color scheme, copy, logos, or user flow" hard rule.

**Page structure**
```
┌──────────────────────────────────────────────────────────┐
│ Top brand strip + thin top nav                           │
├──────────────────────────────────────────────────────────┤
│ Slate hero: "Thu, May 28 · 6 MLB games · 32 slips"       │
│  + tab strip: [ TODAY ] [ TOMORROW ] [ RESULTS ]         │
├──────────────────────────────────────────────────────────┤
│ Sport sub-tabs:  [ All ] [ NBA ] [ MLB ] [ Mixed ]       │
├──────────────────────────────────────────────────────────┤
│ Lane carousel (horizontal scroll on mobile):             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│  │ CONSERV  │ │ BALANCED │ │ STAR PWR │                  │
│  │  ticket  │ │  ticket  │ │  ticket  │                  │
│  └──────────┘ └──────────┘ └──────────┘                  │
├──────────────────────────────────────────────────────────┤
│ "Build your own" — only one inline manual builder        │
│ (Custom Generator becomes a sub-tab inside it)           │
└──────────────────────────────────────────────────────────┘
```

**Navigation model.** Top nav stays thin. Tab strip (`TODAY / TOMORROW / RESULTS`) is the primary time switcher. Sport sub-tabs are the primary sport switcher. Desktop sports rail is **removed** — the sub-tabs cover sport navigation cleanly, eliminating the duplication noted in §1.9.

**Slip card structure.** Each lane gets a single hero ticket: tall card with the lane name as a banner, then leg list, then bold American odds and projected payout. Alternate slips per lane sit behind a small `▸ See 3 more conservative slips` link.

**Leg row structure.** Each leg is a single horizontal row:
- 32px team logo or avatar
- Player name (bold) + market (regular) on line 1
- Side / line + book + form link on line 2
- Right-aligned: odds in a large gold pill

**Filters.** Sport sub-tabs replace the sport pill cluster. Team and Player become a single `+ Filter` disclosure that opens an inline panel — collapsed by default. Reduces toolbar to a single chip at rest.

**Mobile.** Tab strips work natively on mobile. Lane carousel becomes horizontal-snap scroll (one ticket per swipe). Bottom nav unchanged.

**Pros.**
- Familiar information architecture for anyone who has used a sportsbook — low cognitive cost.
- Lane carousel is friendlier than a 3-up grid on mobile (one ticket at a time).
- The "TODAY / TOMORROW / RESULTS" tab strip naturally absorbs the date-clarity problem in §1.2.
- Resolves the navigation duplication problem in §1.9.

**Cons.**
- Sportsbook IA is the closest GameTimePicks should get to FanDuel/DraftKings without crossing the "do not copy layout" hard rule. Requires constant restraint and review.
- Lane carousel hides the "show me everything" comparison view that power users want.
- The "TODAY / TOMORROW / RESULTS" strip needs real "TOMORROW" data, which is only sometimes populated.

**Risk:** **High** on the hard-rule side. The "do not copy FanDuel/DraftKings exact branding, layout, color scheme, copy, logos, or user flow" line is in §3 of the handoff. Anything sportsbook-shaped will need careful design review every PR.

---

### Option C — Premium card-based research terminal

The Apple Sports / Stripe Atlas / Notion-template vibe. Each lane is a magazine-quality "spread" rather than a stack of dense rows. Editorial typography. Generous white-space. Restrained color. The product reads as **analysis**, not as a betting menu.

**Page structure**
```
┌─────────────────────────────────────────────────────────┐
│ Top brand bar + thin top nav                            │
├─────────────────────────────────────────────────────────┤
│ Editorial slate intro:                                  │
│   "Thursday, May 28"                                    │
│   "Six MLB games. Three lanes of suggested slips."      │
│   [date · sport · count chips]                          │
├─────────────────────────────────────────────────────────┤
│ Lane "spreads" — vertical stack, one per lane:          │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ◆  CONSERVATIVE                  85.7% all-time     │ │
│ │    Two safer legs · star-driven                     │ │
│ │ ┌──────────────────────────┬────────────────────┐   │ │
│ │ │ Featured slip            │ Alt slip #2        │   │ │
│ │ │  + 2 large leg rows      │  + 2 leg rows      │   │ │
│ │ │  + edge bar              │                    │   │ │
│ │ │  + recent form spark     │                    │   │ │
│ │ │  +103 (american)         │ -120               │   │ │
│ │ └──────────────────────────┴────────────────────┘   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ (same spread for Balanced, Star Power)                  │
│                                                         │
│ Quiet "High variance" reveal                            │
├─────────────────────────────────────────────────────────┤
│ "Want to research yourself?" — single exploration card  │
│   contains both manual builder and custom generator     │
│   behind two tabs                                       │
└─────────────────────────────────────────────────────────┘
```

**Navigation model.** Top nav is the primary route switcher. **No desktop sports rail.** A single sport-filter chip cluster sits under the slate intro. The result: one navigation system, not two.

**Slip card structure.** Each lane gets a "spread" — wide card with the lane name as an editorial header (icon + lane name + lane's lifetime hit-rate badge). Inside the spread, the **featured slip** is rendered at 1.5× and the **alternate slip** at 1×. Each slip shows: leg rows + an edge-vs-line bar + recent form mini-sparkline + American odds in a single large pill bottom-right.

**Leg row structure.** Generous vertical rhythm:
- Line 1: 28px team avatar · player name (16px, semibold) · spacer · American odds (right-aligned, 16px, gold)
- Line 2: market label · side/line · book · `Form →` chip (12px, muted)
- Edge bar: thin 4px gold→navy gradient bar under each leg showing model edge

No more "Calibration watch" chip on every leg. Calibration becomes a small dot indicator next to the market label (green / amber / grey), with a tooltip explaining.

**Filters.** A single floating chip group above the lanes: `[ All ] [ NBA ] [ MLB ] [ Mixed ] · ⊕ Filter`. The `⊕ Filter` opens a small popover for Team / Player. Less than 40px tall at rest.

**Mobile.** Lanes stack vertically (already the natural behavior). Within each lane, featured and alternate slips stack instead of sitting side-by-side. Sport chips remain at the top. Bottom nav unchanged.

**Pros.**
- Reads as a **premium product** rather than a dashboard. Solves the "developer-y" complaint at its root.
- Editorial intro sentence solves §1.12 (no framing copy for new visitors).
- Lane "spreads" give each profile real visual identity, addressing §1.3.
- Removing the desktop sports rail solves §1.9 cleanly.
- Featured-slip-larger-than-alternate gives the page a natural rhythm.
- Leg rows breathe; calibration dot replaces the noisy chip from §1.4.

**Cons.**
- More vertical scroll than Option A — power users may grumble.
- Editorial layouts are harder to get right than dashboards; typography, spacing, and rhythm all have to be intentional.
- Featured-slip-larger pattern means alternates can feel demoted even when their grade is similar.
- More work per slip card to redesign properly (Option B is closer to existing structure).

**Risk:** Low–medium. No hard-rule conflicts. Existing data shapes carry over unchanged. The work is presentation, not plumbing.

---

## 3. Three color systems

### 1. Refined dark (today, post-PR #136)

| Token | Value |
|---|---|
| `--gtp-bg` (body) | `#0A0F1E` (deep navy) |
| `--gtp-card` | `#161E3E` (elevated charcoal) |
| `--gtp-card-elevated` | `#1B2349` |
| `--vault-text` | `#F5E7C4` (warm cream) |
| `--vault-text-mute` | `#B7A77C` (sand) |
| `--vault-gold` | `#D4AF37` (lane chips, active dots) |
| `--vault-gold-bright` | `#F0C75E` (active pills, focus) |
| `--vault-success` | `#6EE7A8` (conservative, win) |
| `--vault-warn` | `#F2A65A` (longshot, attention) |

**Vibe:** confident, contained, analytics-with-warmth. Already shipped in #133/#136 with measured contrast ≥ AA across all sampled elements. **Safest pick — least risk of a regression.**

### 2. Dark + gold vault

Same dark base as #1, but push gold further as a *structural* element rather than only an accent.

| Token change | Effect |
|---|---|
| Section dividers | hairline gold `rgba(212,175,55,0.20)` instead of grey rules |
| Lane chip outlines | full gold border on Conservative/Balanced/Star Power |
| Slip card border | gold-tinted on hover/focus |
| Slate header underline | 1px gold rule |
| Active sport pill | gold gradient instead of solid gold |

**Vibe:** luxury sportsbook. Reads more like "high-end private club" than "analytics lab."

**Risk:** crosses into "casino premium" territory. The handoff hard rule about not copying sportsbook branding is about copying *exact* brand identity, but pushing gold this far makes the product feel like it's marketing a betting experience, which is exactly what GameTimePicks is **not** trying to be ("educational analytics, not betting advice" is the global disclaimer banner).

### 3. Clean light professional

Cream canvas (the cream pilot reverted in #133/#136, but redone with discipline).

| Token | Value |
|---|---|
| Body bg | `#FAF6EE` (warm cream, slightly darker than #133 attempt) |
| Card bg | `#FFFFFF` |
| Text | `#141C38` (deep navy) |
| Text mute | `#5E6A8C` |
| Gold accent | `#A07A1C` (deeper gold for contrast on light) |
| Success | `#1F8A5F` |
| Warn | `#B0571A` |

**Vibe:** Stripe / Linear / a high-end newsletter. The product reads as **journalism + data**, not a betting product. Restrained accent gold for active states only.

**Pros:** strongest "this is not a sportsbook" signal. Highest contrast for reading dense projection tables.

**Cons:** the cream pilot already failed once (PR #129, reverted in #136). Doing this right means rebuilding **every** card surface, not just flipping the body background. It is the most expensive color choice.

**Risk:** medium–high. The user's stated preference after the #129 revert was that "the original dark theme baseline was acceptable; the cream pilot was the regression."

---

## 4. Combination matrix and recommendation

|  | Refined dark (1) | Dark + gold vault (2) | Clean light (3) |
|---|---|---|---|
| **A — Compact analytics dashboard** | Power-user terminal (Linear/Vercel) | Bloomberg-on-gold (heavy) | Stripe docs-style |
| **B — Sportsbook-inspired GTP-original** | Pinnacle-adjacent (legal risk) | High-end sportsbook (highest risk) | Sportsbook on a newsletter (incoherent) |
| **C — Premium card-based research** | Premium dark research (Apple Sports dark) | Editorial-with-gold-rules | Editorial-light (Stripe Atlas) |

### Recommendation: **Option C + Color System 1 (refined dark)**

**Why this combination:**

1. **Solves the most stated problems with the fewest hard-rule conflicts.** Option C addresses §1.3, §1.4, §1.5, §1.6, §1.9, §1.12 directly. Color system 1 inherits the contrast measurements already documented in `globals.css`, so there's no theme-regression risk.

2. **Avoids the FanDuel/DraftKings-shaped trap.** Option B is the closest match to user expectations from sportsbook usage, but the hard-rule constraint about not copying sportsbook layout/branding makes it the riskiest direction — every PR would need design review against that rule. Option C's editorial framing keeps the product visually distant from sportsbooks while still presenting actionable picks.

3. **Doesn't repeat the cream-pilot regression.** Color system 3 has more upside as a "this is not a sportsbook" signal, but it failed once and rebuilding every card surface for it triples the size of the next 3 PRs. We can revisit light theme later as a `.gtp-canvas` opt-in for `/results` if it earns it.

4. **Keeps power-user density available without leading with it.** Option A's right-rail KPIs and sortable rows are not lost — they can come back as a `/parlay-lab?dense=1` view or as enhancements to `/results` once Option C ships. Option C is **additive-compatible** with Option A's right-rail in a later phase.

5. **The work is presentation-only.** Optimizer payload, leg pool, era filter, settlement flow, and audit policy all stay untouched. The PRs become bounded, testable, and reversible. That matches the 13-gate merge discipline.

### Proposed next PR sequence (only if you approve Option C + System 1)

| PR | Branch | Goal |
|---|---|---|
| **B' — Lane spread + slip card redesign** | `feature/lane-spread-slip-cards` | Replace `RiskGrid` 3-col grid with one "spread" per lane (featured + alt). Redesign `ParlayTicketCard` to the editorial structure in §2.C. Remove repeated "Calibration watch" chip; replace with a calibration dot next to the market label. |
| **B'' — Leg row redesign** | `feature/leg-row-editorial` | Two-line leg row, large right-aligned American odds pill, edge bar, `Form →` chip. |
| **C' — Section restructure + nav simplification** | `feature/lab-section-restructure` | Wrap Manual Builder + Custom Generator in one "Research yourself" card with internal tabs. Remove the desktop sports rail (sport chip cluster covers it). Fix the date pass-through in §1.2 by passing `optimizerForDate.date` into `ParlayLabBuilder`. |
| **D' — Editorial slate intro + framing copy** | `feature/lab-editorial-intro` | One-sentence framing copy for new visitors (§1.12). Slate intro becomes the editorial header described in §2.C. |
| **E' — `/results` two-column premium layout** | `feature/results-editorial` | Hero KPI card + sparkline on the left; per-date breakdown on the right. Reuse lane-spread component for "this week's parlay results." |
| **F' — `/projections` editorial board** | `feature/projections-editorial` | Apply the same editorial cadence to the per-sport projection board. Per-game cards become editorial "game cards" rather than dense strips. |

Each PR is independently scoped, fits inside one 13-gate merge cycle, and can be paused between PRs without leaving the product in an inconsistent state. PR B' is the natural starting point because it changes the most-seen surface (`/parlay-lab` slip cards) without touching navigation.

---

## 5. What you should answer before I write any more code

1. **Which layout option?** A (dashboard), B (sportsbook-inspired), C (editorial — recommended)
2. **Which color system?** 1 (refined dark — recommended), 2 (dark + gold vault), 3 (clean light)
3. **Are there any non-negotiables I should hard-code into the spec?** (e.g. "must keep DesktopSportsRail" — that would change Option C significantly)
4. **Is the date pass-through in §1.2 in-scope for the next PR, or do you want it broken out as its own fix first?**

Once those four are answered, I'll spec the next PR against the chosen direction and start implementing.
