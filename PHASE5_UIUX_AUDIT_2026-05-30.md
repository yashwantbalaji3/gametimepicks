# Phase 5 — UI/UX Audit (2026-05-30)

Screenshot-style audit of the seven primary routes at **desktop 1280×800**
and **mobile 375×812**, served from the live Next.js dev build. Goal: make
the site *easy to navigate* and propose 2–4 focused PRs (not one giant
rewrite). No data/optimizer/settlement changes are made in this audit.

## Method
- `npm run dev` → measured each route via in-page DOM evaluation
  (first-useful-content Y, total scroll height, horizontal overflow,
  heading structure, nav contents) + visual screenshots.
- Banned-copy + leak scans run against rendered `innerText`.

## Measurements

### Desktop 1280×800
| Route | First useful content (Y) | Page height | Screens tall | Overflow-X | Primary heading |
|-------|--------------------------|-------------|--------------|------------|-----------------|
| `/` (home) | 219 (H1) | 6095px | 7.6 | none | "Today's best suggested parlays." |
| `/parlay-lab` | 231 (only heading) | 5357px | 6.7 | none | "Today's suggested parlays." |
| `/results` | 144 (H1) | 7453px | 9.3 | none | "Settled slate: May 29" |
| `/projections` | 170 (date header) | 1454px | 1.8 | none | "Saturday · May 30" (date card) |
| `/bank-builder` | 144 (H1) | 2317px | 2.9 | none | "Bank Builder" |
| `/events` | 144 (H1) | 1566px | 2.0 | none | "Sports Event Hub" |
| `/about` | ~140 (SectionHeader) | n/m | — | none | "Sports projections made simple." |

### Mobile 375×812
| Route | First useful content (Y) | Page height | Screens tall | Overflow-X |
|-------|--------------------------|-------------|--------------|------------|
| `/` (home) | 213 (H1) | 10521px | 13.0 | none |
| `/results` | 163 (H1) | 12454px | 15.3 | none |

No route has horizontal overflow at either breakpoint. Good.

## Findings

### 1. Split-brain navigation (HIGH)
- **Two different navs on mobile.** The desktop top nav (`nav.tsx`,
  7 items) renders on mobile too as a horizontally-scrollable strip
  (Home / Projections / Parlay Lab / Bank Builder / …), **and** the
  fixed bottom nav (`mobile-bottom-nav.tsx`, 4 buckets) sits on top of
  it. A first-time user sees two competing navigations.
- **Naming mismatch for the same destination.** Top nav says
  **"Projections"**; bottom nav says **"Picks"** — both link to
  `/projections`. Top says **"Parlay Lab"**; bottom says **"Lab"**.
- **Coverage gap.** Bank Builder, Events, and About exist in the top
  nav but are absent from the bottom nav (and the bottom-nav resolver
  returns `null` for them, so on those pages nothing is highlighted —
  the user loses their "you are here" anchor).

### 2. Home ≈ Parlay Lab duplication (HIGH)
Both `/` and `/parlay-lab` render the same `<ParlayLabBuilder>`. Home
wraps it in a hero + StatTile strip + DeeperTile grid + newsletter
(13 mobile screens); Parlay Lab wraps it in a `SlateStrip` + settled/
pregame chips + footer pointer. Nothing tells a newcomer why both pages
exist or which one to use — they are ~80% the same surface.

### 3. Duplicate stacked headings on Home (HIGH)
The home fold is:
- eyebrow "TODAY · SUGGESTED PARLAYS"
- **H1 "Today's best suggested parlays."** + 3-line subcopy
- **H2 "Today's suggested parlays."** (the builder's own heading) +
  3-line subcopy

Two near-identical headings + ~250px of redundant intro copy before any
control. On mobile the first *actual parlay card* sits well below the
812px fold — the user scrolls past banner → nav → ticker → eyebrow →
H1 → 3 lines → H2 → 3 lines → filter tabs → filter dropdowns → My Card
tray placeholder before seeing a single suggested slip.

### 4. Inconsistent page-hero pattern (MEDIUM)
Five different header treatments across seven pages:
- Home & About → `SectionHeader` (eyebrow + H1 + sub)
- Parlay Lab → `SlateStrip` chips, *no* page hero (builder supplies H1)
- Results → `ResultsHero` (eyebrow + H1 + lifetime stat row)
- Projections → `DateStatusHeader` (card with big date + status chip + counts)
- Bank Builder & Events → bespoke `<header>` (eyebrow + gold H1 + sub + disclaimer)

There is no single shared "page hero," so each page's top fold looks
like a different product.

### 5. Results dashboard density (MEDIUM)
`/results` is 9.3 (desktop) / 15.3 (mobile) screens, **35 `<section>`
elements, but only 2 semantic headings** (one H1, one H2) — every other
section is titled with a mono-uppercase `<div>`/`<span>`. This hurts
scannability and screen-reader navigation. The section-pill nav
(Overview / Risk Sections / Sport Mix / Slip Details / Prediction Audit
/ Learning Signals) mitigates it but the page still reads as a wall.
Dead code: `FreshEraStatusBlock` is defined in `results/page.tsx` but
never rendered.

### 6. Copy nit: "No locks." (LOW)
Home subcopy contains "**No locks.**" The token "lock(s)" is on the
banned list. It is used here in the *disclaiming* sense ("we don't sell
locks"), not a promotional claim, so it is not a substantive violation —
but it is safer to reword (e.g. "No hype." / "No guarantees.") to avoid
the literal token. No promotional banned copy was found on any page
(Bank Builder scan clean).

### 7. Honesty & contrast — PASS
- **No date leaks.** Results mentions no May 25 / May 26 / May 30. ✓
- **Pending math reconciles.** Results lifetime (public era) shows
  `19.8% · 36W · 146L · 182 decisive · 12 pending`. That 12 = the
  Phase-3 lifetime-optimizer 24 pending minus May 25's 12 pre-era
  pending. ✓
- **Bank Builder** shows "Paper only" disclaimer top *and* bottom, no
  banned copy, payouts from real odds. ✓
- **Contrast** is acceptable (gold/cream on navy); no unreadable text
  spotted. The pervasive 10–11px mono-uppercase labels are on-brand but
  marginally hard for casual readers — a candidate for slight size/case
  softening, not a blocker.

### 8. Transient pre-Phase-4 state (NOT a UI bug)
Projections already shows **May 30** (NBA only: SAS @ OKC, 36 props;
MLB 0 games) from the nightly stub, while Home / Parlay Lab / Bank
Builder still show **May 29** (settled) because the May 30 optimizer +
suggested pool have not been generated yet (awaiting the 13:30 UTC
morning-projections cron). Bank Builder consequently surfaces a settled
May 29 slip with a graded "WIN" leg as "Today's Builder Slip." All of
this reconciles automatically once Phase 4's cron lands May 30 MLB +
optimizer/suggested. Flagged so it is not mistaken for a regression.

## Proposed PRs (4 focused, mapping to runbook Phases 6–9)

**PR A — `fix/ui-page-shell-navigation` (Phase 6).** Fix nav clarity +
hero consistency. (a) One consistent label per destination — use
"Projections" and "Parlay Lab" in *both* navs (drop "Picks"/"Lab"
relabels). (b) On mobile, show one nav, not two — keep the bottom nav
as the primary mobile nav and collapse/hide the redundant scrolling top
nav on small screens (or vice-versa). (c) Introduce a single shared
`PageHero` (eyebrow + title + optional sub + right slot) and adopt it on
Bank Builder, Events, About, and Home so every page top fold is
consistent. (d) De-duplicate Home's stacked headings — render the
builder without its own heading when it sits under a page hero. (e)
Reword "No locks." **No data/optimizer/settlement changes.**

**PR B — Parlay Lab filter/nav revamp (Phase 7).** Add a filter summary
line ("Showing 4 parlays for NYM"), verify the team filter checks *all*
legs (the game filter already does, per #186), confirm the game filter
lists every game, ensure the My Card tray never covers content. Clarify
the Home↔Parlay-Lab relationship (e.g. Home shows a trimmed "preview"
that links to the full Lab, instead of the full builder twice). **No
optimizer changes.**

**PR C — `fix(results): simplify results dashboard` (Phase 8).** Promote
section labels to real headings, tighten the 35-section stack so the top
fold is scannable in ~10s (latest settled slate → risk section → sport
mix → drilldown → learning), keep the pending-reason surface, remove the
dead `FreshEraStatusBlock`. Honesty guards unchanged (no May 30 settled,
no pre-era leak).

**PR D — `fix(bank-builder): polish builder experience` (Phase 9).** The
page is already strong; polish only: ensure "Today's Builder Slip" never
presents a *graded* leg as a live pick (prefer a genuinely-pending pool;
honest empty state when only settled slates exist), keep the
$100→$3000 ladder + share card, concise educational framing, no "lock",
no real-money advice.

## Sequencing note
PR A is the highest-impact, lowest-risk change and unblocks the visual
consistency the other PRs lean on, so it goes first. Phase 4 (May 30
projections) remains gated on the 13:30 UTC cron and is independent of
these UI PRs.
