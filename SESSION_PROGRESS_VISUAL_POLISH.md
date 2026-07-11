# GameTimePicks — Visual Polish Session Log (2026-05-14)

**Start:** 2026-05-14 22:34 EDT
**Starting branch:** `main`
**Starting HEAD:** `2477082` — feat(ui): add "how to read these projections" educational disclosure on /board (#28)
**Working tree at start:** clean except two expected untracked docs (`SESSION_HANDOFF_2026-05-14_FULL.md`, `SESSION_PROGRESS_2026-05-14_3HR_AUTOWORK.md`).

## Goal

Push GameTimePicks visually from "functional analytics dashboard" toward "premium Vegas sportsbook / NBA model lab". One or more focused UI-only PRs. **Do not merge automatically** — operator wants visual review.

## Absolute constraints (operator-stated)
- UI / graphics / nav / a11y only
- No `pipeline/*`, no `app/public/data/*`, no `.github/workflows/*`, no `app/src/lib/*`
- No paid API, no workflow triggers
- No new npm deps unless absolutely necessary
- No data / scoring / model / provider changes
- No "lock" / "guaranteed" / "best bet" / "free money" / "can't miss" / "no room for error" / "provider failed" / "odds provider" / "schedule provider" / "trends_pending" in public copy
- Preserve a11y (contrast, keyboard, focus, reduced-motion)
- Preserve educational + responsible-use framing

## Phase log

### Phase 0 — Orient ✅
- Branch `main`, HEAD `2477082`
- Tree clean
- Created this log

### Phase 1 — Live-site review ✅

(WebFetch can read static HTML / chrome but doesn't always hydrate client state; treated as supplemental to source.)

- **Homepage** (`/`): plain "GP" mark + "GametimePicks" wordmark. Hero "Transparent model leans on NBA player props." reads as a sober analytics site, not a sportsbook lounge. Trending tabs (Projections / Parlays / Upcoming) work. KPI strip honest about empty state ("—" for settled hit rate). No real broken bits.
- **/board?date=2026-05-15**: WebFetch only captured chrome — couldn't render hydrated date-tab state. Data is there per prior work (163 leans / 31 anomalies).
- **/parlay-lab**: Build mode tabs working. 3 candidate cards rendered at +909 / +1136 / +1198. Section labels (1️⃣ Slate, 2️⃣ Builder mode...) already polished from PR #27.
- **/results**: Honest empty state ("Results coming online · no settled slates yet"). Acceptable but visually thin.
- **/methodology**: Section-numbered explainer (01..05). Already coherent; mostly leave alone.
- **/responsible-use**: Somber tone preserved. Must stay that way.

Visual gap to close: site feels like a Bloomberg terminal, not a Vegas sportsbook lounge. The vault navy/gold palette is right; we just need more theatrical lighting on top of it.

### Phase 2 — Source inspection ✅

- **No logo / brand asset exists.** `app/public` only holds data files. `public/` at repo root is empty. No SVG / PNG / favicon. The "GP" mark + "GametimePicks" wordmark in `nav.tsx` is the entire brand surface.
- **Existing primitives** (in `globals.css`): `vault-shell`, `vault-page-shell`, `vault-data-orbit`, `vault-ambient-orbit`, `vault-edge-fade`, `vault-deluxe-card`, `vault-display-h1/h2/h3`, `vault-section-heading`, `vault-quiet-label`, `vault-pill`, `vault-hero-grid`, `vault-hero-eyebrow`, `vault-glow-hover`, `vault-rise`, `vault-pulse`, `vault-tab-active`, `vault-glass`. Solid foundation; need to **add** sportsbook lighting on top, **not** replace.
- **Nav**: 64px tall, sticky, dark navy with backdrop-blur. "GP" gradient-gold square + sentence-case wordmark. Active-state gold underline. No LED rail on the underside.
- **Disclaimer banner**: calm gold-tinted strip, mute-tone. Don't touch the compliance copy.
- **Footer**: 2-col + quiet status row + © line.
- **Homepage hero**: already uses `vault-data-orbit + vault-ambient-orbit + vault-display-h1`. Can layer more without competing.
- **Board hero**: `vault-hero-eyebrow + vault-data-orbit + vault-display-h2`. Already strong; needs subtler enhancement.
- **Parlay Lab hero**: already uses `vault-data-orbit + vault-display-h1`. Same.

### Phase 3 — Design plan

**A. Audit findings → what to fix now**

| Finding | Where | Plan |
|---|---|---|
| "GP" mark is too quiet for the brand | nav | Build a `<BrandMark>` component with a premium "GTP" monogram in a beveled gold-glass tile + "GameTime" / "Picks" two-tone wordmark with a subtle neon underglow on hover |
| Nav lacks the "sportsbook header" feel | nav | Add a thin animated **LED light rail** strip under the nav (CSS-only, prefers-reduced-motion safe) |
| Hero is honest but lacks theater | `/`, `/board`, `/parlay-lab` heroes | Add `.neon-rim` corner brackets + a subtle scanline `.line-scan` overlay; never compete with content |
| Deluxe cards feel flat (PR #26 went 80% there) | board player cards, parlay candidate cards, empty states | Add `.casino-glow-card` opt-in class that layers a soft neon rim on hover **on top of** `.vault-deluxe-card` (additive, not replacing) |
| Tiny mono uppercase still scattered | board hero confidence pill, results dashes, footer status | Spot-replace where it doesn't change semantics |
| Results page empty state is visually thin | `/results` | Wrap in `vault-deluxe-card` + light hero treatment so it's not just text on dark |
| Footer feels too sleepy | `footer.tsx` | Add a brand line at the top of the footer (mirror nav lockup) + a sportsbook-style "house rules" callout above the © row |

**Deferred** (not in this PR):
- Mobile QA pass (don't have mobile device in shell; rely on existing `clamp()` ramps + `auto-fill minmax` grids)
- `vault-filters.tsx` (operator said leave it)
- A real raster logo asset (operator said no new deps; CSS wordmark only)

**B. Brand / logo plan**

No real logo exists. Build a CSS-based `<BrandMark>` component (new file):
- **Monogram tile**: square `36×36` with rounded corners, gold radial gradient with darker gold rim, a thin inner highlight ring, and a stylized "GTP" wordmark in display font. Pulse on hover.
- **Wordmark**: "GameTime" (bright cream) + "Picks" (mute gold) in `font-display`, optical-aligned with the monogram. On the brand-lockup variant, add a soft golden bottom-glow at small intensity (sportsbook-marquee feel).
- Variants:
  - `lockup` — nav, footer, hero
  - `compact` — mobile / small contexts
  - `monogram` — favicon-equivalent if needed elsewhere

Replace the "GP" inline div in `nav.tsx` with `<BrandMark variant="lockup" />`. Add a smaller `<BrandMark variant="compact" />` to the footer.

**C. Casino/sportsbook visual plan (new CSS primitives, all additive)**

To be added in `globals.css`:

```
.casino-floor              — fixed body-level radial lights (deep navy → faint gold/cyan)
.sportsbook-light-rail     — horizontal LED strip with slow gradient sweep
.neon-rim                  — corner-rim accent for hero/card edges
.neon-corner-bracket       — four-corner LED bracket overlay
.line-scan                 — subtle horizontal scanline overlay (low opacity)
.casino-glow-card          — additive hover glow stacked on top of .vault-deluxe-card
.sportsbook-board          — LED-board surface texture for chip rows / panels
.neon-wordmark             — wordmark with two-tone glow + soft animated drift
.neon-pulse-soft           — slow opacity pulse (gentler than vault-pulse)
.vegas-marquee             — marquee strip with running gold dots (used sparingly)
```

All animations wrapped in `@media (prefers-reduced-motion: reduce) { ... }` — animations disabled, static fallback retained.

**D. Route-by-route plan**

| Route | Plan |
|---|---|
| `/` | Replace nav GP with `<BrandMark>` (cascades to all routes). Hero: keep `vault-display-h1` + `vault-data-orbit`, layer `.neon-corner-bracket` overlay + small `.line-scan` for sportsbook-board feel. KPI strip: add subtle gold neon corner accents on each tile. Explainer cards: apply `.casino-glow-card` so hover gives a soft rim. |
| `/board` | Wrap the hero in the same `.neon-corner-bracket`. Keep the confidence-pill disclosure. Add `.sportsbook-light-rail` under the date-tab strip. Apply `.casino-glow-card` to each player card (additive). |
| `/parlay-lab` | Wrap hero in `.neon-corner-bracket`. Apply `.casino-glow-card` to candidate cards. Section-label pills already there from PR #27 — no further change. |
| `/results` | Empty state currently sits on plain dark. Wrap in `vault-deluxe-card` + `.neon-rim` + the same hero eyebrow pattern from /board so it feels intentional, not unfinished. |
| `/methodology` | Light touch only: brand-line callout at top, otherwise keep the systematic feel. |
| `/responsible-use` | **No casino styling.** Stays somber. Maybe a small `.neon-rim` divider but never any glow on a helpline link. |
| Nav | `<BrandMark>` + add `.sportsbook-light-rail` strip beneath the header line. |
| Footer | `<BrandMark variant="compact">` at the top of the column grid. |
| Disclaimer banner | Leave copy unchanged. Optional 1px gold sheen accent. |

**E. Files expected to change**

- `app/src/app/globals.css` (additive primitives — append, don't rewrite)
- `app/src/components/nav.tsx` (use BrandMark + add LED rail)
- `app/src/components/footer.tsx` (use BrandMark compact)
- `app/src/components/brand-mark.tsx` (NEW)
- `app/src/components/sportsbook-light-rail.tsx` (NEW, tiny presentational)
- `app/src/components/neon-corner-bracket.tsx` (NEW, tiny presentational)
- `app/src/app/page.tsx` (add corner-bracket overlay around hero, polish KPI / explainer tiles)
- `app/src/app/board/page.tsx` (add corner-bracket overlay around hero; small visual polish around date tabs)
- `app/src/app/parlay-lab/page.tsx` (add corner-bracket overlay around hero)
- `app/src/app/results/page.tsx` (wrap empty state in deluxe card)
- `app/src/components/vault-player-card.tsx` (add `casino-glow-card` to article)
- `app/src/components/parlay-builder-client.tsx` (add `casino-glow-card` to candidate card)

NO touch list: `app/src/lib/*`, `pipeline/*`, `app/public/data/*`, `.github/workflows/*`, `package*.json`.

Proceeding.

### Phase 4 — Implementation ✅

**New CSS primitives (appended to `globals.css`):**
- `--gtp-neon-cyan` / `--gtp-edge-light` / `--gtp-deep-navy` accent tokens
- `.sportsbook-light-rail` — thin LED rail with slow horizontal sweep (mobile 2px / desktop 3px)
- `.neon-corner-bracket` + `.gtp-bracket-{tl,tr,bl,br}` — four L-shaped gold corner accents
- `.gtp-line-scan` — soft horizontal scanline overlay (3% opacity gold stripes at 4px pitch, masked to fade at the edges) + safety rule so direct children sit above
- `.casino-glow-card` — additive hover-glow ring layered on top of `.vault-deluxe-card`
- `.gtp-neon-wordmark` + `.gtp-word-strong` / `.gtp-word-soft` — two-tone GameTimePicks wordmark with marquee drop-shadow
- `.gtp-monogram` — beveled gold tile for the "GTP" lockup token, with inner highlight ring + soft gold drop
- `.gtp-brand-lockup:hover .gtp-monogram` — lift + intensified glow on lockup hover
- `.gtp-house-rules` + `.gtp-dot` — neon-dot separator for footer pill
- `.gtp-neon-pulse` — gentler pulse than `vault-pulse` for ambient dots
- `.gtp-vegas-marquee` — running gold-dot strip used once, at the top of the footer

Every animation has a `@media (prefers-reduced-motion: reduce)` fallback.

**New presentational components (no logic, no deps):**
- `app/src/components/brand-mark.tsx` — `<BrandMark variant="lockup" | "compact" | "monogram" />` with optional `marker` prop. Real text wordmark — screen readers always read "GameTimePicks".
- `app/src/components/sportsbook-light-rail.tsx` — wraps `.sportsbook-light-rail` with `aria-hidden`.
- `app/src/components/neon-corner-bracket.tsx` — four positioned spans inside a `.neon-corner-bracket` parent.

**Wired into existing files (UI-only):**
- `nav.tsx` — "GP" tile replaced with `<BrandMark variant="lockup" />`; added `<SportsbookLightRail />` between the desktop header row and the mobile nav row; `aria-label="GameTimePicks home"` on the home link.
- `footer.tsx` — added a brand row at the top (`<BrandMark variant="compact" marker="model lab" />` linking home) plus a quiet tagline. Inserted `.gtp-vegas-marquee` above the existing gold edge accent.
- `app/page.tsx` (home) — hero gains `neon-corner-bracket gtp-line-scan` + `<NeonCornerBracket />` overlay. `ExplainerCard` upgraded from flat `surface p-6` to `.vault-deluxe-card .casino-glow-card` with a numbered gold pill instead of plain mono text.
- `board/page.tsx` — same hero corner-bracket + scanline treatment.
- `parlay-lab/page.tsx` — same hero corner-bracket + scanline treatment.
- `results/page.tsx` `ResultsEmptyShell` — empty state now sits inside the same `vault-data-orbit neon-corner-bracket gtp-line-scan` hero treatment with a `vault-display-h2` headline (previously plain text on dark).
- `vault-player-card.tsx` — added `casino-glow-card` to the article (additive on top of existing `vault-deluxe-card`).
- `parlay-builder-client.tsx` — added `casino-glow-card` to the candidate-card container.

**Files NOT changed** (verified via `git status`):
- `app/src/lib/*`, `pipeline/*`, `.github/workflows/*`, `app/public/data/*`, `package*.json` — all untouched.
- `responsible-use/page.tsx`, `methodology/page.tsx` — left somber / systematic per design plan; the new shared brand chrome (nav lockup + LED rail) still applies via the layout cascade, so they pick up the brand polish without any page-level edits.
- `disclaimer-banner.tsx` — left alone; compliance copy preserved verbatim.

### Phase 5 — Verification ✅

| Check | Result |
|---|---|
| `app/npm run typecheck` | PASS |
| `app/npm run build` | PASS (sizes essentially flat: `/` 6.5 kB, `/board` 16.1 kB, `/parlay-lab` 9.66 kB) |
| `python3 pipeline/public_copy_test.py` | PASS |
| Forbidden-copy grep | only matches inside code comments / CSS class names, no public copy |
| Scope check (`git status --short`) | exactly 9 modified UI files + 3 new presentational components; no data / pipeline / lib / workflow / package changes |

### Phase 6 — Self-review

1. **Brand / logo** — built `<BrandMark>` with three variants (`lockup`, `compact`, `monogram`) using two new CSS utilities (`.gtp-monogram` and `.gtp-neon-wordmark`). Replaced the inline "GP" tile in nav; added a compact lockup to the top of the footer with a "model lab" marker. No raster assets added.
2. **Global atmosphere** — added casino/sportsbook primitives (LED rail, corner brackets, scanline overlay, casino-glow card, vegas marquee, neon pulse, neon wordmark). All animations respect `prefers-reduced-motion`.
3. **Homepage** — hero is now framed with gold corner brackets + scanline; explainer cards use the deluxe + glow surface; everything below the hero is structurally unchanged.
4. **Board** — hero gets the same corner-bracket + scanline treatment; each player card picks up `casino-glow-card` (additive).
5. **Parlay Lab** — hero gets the same treatment; candidate cards pick up `casino-glow-card`.
6. **Results** — empty state is now a real hero with corner brackets, scanline, and a display headline instead of plain text on dark.
7. **Methodology / Responsible Use** — unchanged at the page level. Inherit the new nav lockup + LED rail via the root layout. Responsible Use stays somber by design.
8. **Buttons / links** — all existing nav links preserved verbatim. Brand link `aria-label="GameTimePicks home"` on both nav and footer. No new routes, no deleted routes.
9. **A11y / reduced-motion** — `aria-hidden` on every decorative element (corner brackets, light rail, scanline, marquee). Every keyframed animation paired with a `prefers-reduced-motion` rule that disables it. Brand wordmark is real text so screen readers always read "GameTimePicks".
10. **What remains rough** — see "Remaining" in the final report.

---

## Iteration 2 — deeper visual pass

**Trigger:** Operator reviewed PR #29 first pass, said the primitives + corner brackets + glow were too shallow. Wants real composed visual modules.

### Iteration 2 — Phase 1 diagnosis (deeper visual QA via preview URL)

Pulled the canonical preview (`https://gametime-picks-git-featu-094f21-...vercel.app`) and asked for harsh art-director-level feedback on `/`, `/board?date=2026-05-15`, `/parlay-lab`, `/methodology`.

**Universal themes that came back:**
- "Reads like a GitHub README styled as a website."
- Heroes have text + small CTAs but no **visual centerpiece** — no status board, no chart, no scoreboard panel.
- KPI strip looks like "debug output" — unlabeled "163" and "97" without scoring story.
- Trending tabs feel like "CSV dump with dark theming" — no visual differentiation between High / anomaly / clean.
- Board page reads "stalled" — date tabs are plain text, no "live" or "lit-up" energy.
- Parlay Lab is "a form with sections" — control panel doesn't visually group as a "console", candidate odds aren't prominent.
- Methodology reads as "internal documentation republished" — no callout cards per step.

**Per-route audit scores (1–5) before iteration 2:**

| Route | Brand | Atmosphere | Hierarchy | Nav | CTA | Card depth | Motion | Mobile | RU tone | Broken |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 3 | 2 | 2 | 4 | 3 | 2 | 2 | 3 | n/a | none |
| `/board?date=2026-05-15` | 3 | 2 | 3 | 4 | 3 | 3 | 2 | 3 | n/a | none |
| `/board?date=2026-05-13` | 3 | 2 | 3 | 4 | 3 | 3 | 2 | 3 | n/a | none |
| `/parlay-lab` | 3 | 2 | 3 | 4 | 3 | 2 | 2 | 3 | n/a | none |
| `/results` | 3 | 2 | 3 | 4 | 3 | 2 | 1 | 3 | n/a | none |
| `/methodology` | 3 | 2 | 3 | 4 | n/a | 2 | 1 | 3 | n/a | none |
| `/responsible-use` | 3 | 2 | 4 | 4 | n/a | 2 | 1 | 3 | **5 ✓** | none |

The first pass moved Brand from 2 → 3 (BrandMark + LED rail), but Atmosphere and Card Depth still floor at 2. Need real **composed modules** this iteration.

### Iteration 2 — Phase 3 plan

**Strategy:** Stop styling existing rectangles. Build new presentational modules that compose existing data into sportsbook-style panels.

**New presentational components:**

1. `app/src/components/sportsbook-status-board.tsx` — homepage hero side panel. Renders a glassy navy panel with:
   - "MAY 15 SLATE · LIVE" eyebrow + pulsing dot
   - 2 LED-style game rows (DET @ CLE 7:00 PM, SAS @ MIN 9:30 PM)
   - 3 stat cells (Projections / High confidence / Model anomalies) all sourced from the props already in scope on `/`
   - "Guardrails: ACTIVE" indicator
   - "Open the wall →" CTA into `/board?date=<latestScoredDate>`
   Server component (no JS), all data via props.

2. `app/src/components/odds-ticker-rail.tsx` — narrow horizontal scroller that displays the latest scored slate's top-5 leans as "ticker" entries (player · market line · edge%). Mounted just above the trending tabs section. Uses the data already passed to the homepage. CSS marquee animation, `prefers-reduced-motion` halts it.

3. `app/src/components/vegas-section-shell.tsx` — opinionated wrapper that gives a section a "sportsbook board" feel: vault-deluxe-card surface + corner brackets + a top eyebrow line + section heading + slot for an action link on the right. Replaces the ad-hoc `<section><div class=eyebrow>...</div><h2>` pattern with a real composed shell.

4. `app/src/components/neon-stat-panel.tsx` — small KPI tile that actually looks premium: 3px gold top-rule, sentence-case caption, large display number, sub-label, optional accent (success / warn / mute). Replaces the flat `.surface` KpiTile on the homepage.

**Per-route plan:**

**Home (`/`)** — biggest delta needed:
- Restructure the hero into a 2-column layout on desktop: left = existing copy + CTAs; right = `<SportsbookStatusBoard>` showing real May 15 data. On mobile the status board stacks below the copy.
- Replace flat KPI strip with `<NeonStatPanel>` x 4. Use the existing labels but add proper visual treatment.
- Inject `<OddsTickerRail>` between the KPI strip and the Trending tabs so the homepage gets a "live ticker" beat.
- Wrap Trending tabs section in `<VegasSectionShell>` with `Trending · model intelligence` eyebrow.
- Wrap explainer cards section in `<VegasSectionShell>` with `How it works · 3 steps` eyebrow.

**Board (`/board?date=...`)**:
- Add a `<SportsbookStatusBoard variant="compact">` strip just under the date-tab strip showing: "Selected date · X games · Y projections · Z anomalies · last refreshed" sourced from the already-loaded board.
- Upgrade `slate-tabs.tsx` to render each date tab as a small panel with a pulsing dot when populated, a static dot when empty. Make the active tab feel "selected" via a clearer gold edge + glow.
- Keep player cards but improve their internal hierarchy with a stronger top divider between header / metrics / footer (additive CSS).

**Parlay Lab (`/parlay-lab`)**:
- Wrap the entire builder grid in a "Parlay Console" `<VegasSectionShell>` with a sub-eyebrow "Build mode · model-assisted".
- Improve the control panel internal feel: thin gold rule between section labels (`Slate · 1 · 2 · 3 · 4`).
- Candidate card header: make Combined odds the **right-side visual centerpiece** (large display number in a gold neon chip).

**Results (`/results`)**:
- Wrap settled-results state in `<VegasSectionShell>` so it stops feeling like a tacked-on page.
- Empty state already polished in iteration 1; minor refinement only.

**Methodology (`/methodology`)**:
- Wrap each numbered step (01–05) in a `vault-deluxe-card` panel with the gold numbered pill from PR #28 explainer cards.
- Keep all formulas, all section copy.
- This is the lightest touch — keep editorial feel but lift each step to a proper card.

**Responsible Use (`/responsible-use`)** — DO NOT add casino chrome.
- Lightly improve the typography hierarchy on each block (already there from layout cascade with new brand). No changes.

**Nav (`nav.tsx`)** — improvements:
- The brand wordmark currently shows "GameTime" + "Picks" + (no marker). Already good.
- Active-state underline is OK but kind of subtle. Strengthen the active state with a small inline gold bullet on the left of the active label.
- On mobile, the lockup wraps with a 38×38 monogram + ~140px wordmark = ~190px wide. That's fine in 390px viewport with 24px gutters.

**Footer** — small additions:
- Add a `<small>` data-source attribution line that links each source as a sportsbook-style chip row rather than a plain bulleted list.

### Iteration 2 — Expected new files

- `app/src/components/sportsbook-status-board.tsx` (NEW)
- `app/src/components/odds-ticker-rail.tsx` (NEW)
- `app/src/components/vegas-section-shell.tsx` (NEW)
- `app/src/components/neon-stat-panel.tsx` (NEW)

### Iteration 2 — Modified files

- `app/src/app/globals.css` (more primitives if needed)
- `app/src/app/page.tsx` (homepage composition)
- `app/src/app/board/page.tsx` (status board strip)
- `app/src/app/parlay-lab/page.tsx` (vegas shell)
- `app/src/app/results/page.tsx` (vegas shell)
- `app/src/app/methodology/page.tsx` (numbered step cards)
- `app/src/components/nav.tsx` (active-state polish)
- `app/src/components/footer.tsx` (data-source chip row)
- `app/src/components/homepage-trending-tabs.tsx` (LeanRow polish)
- `app/src/components/slate-tabs.tsx` (state dots)

Proceeding to implementation.

### Iteration 2 — Phase 4 implementation summary

**Commit:** `1c5ba1c` on `feature/brand-visual-polish`, pushed to PR #29.

**New components:**
- `sportsbook-status-board.tsx` — 200+ LOC server component, two variants
- `odds-ticker-rail.tsx` — marquee ticker
- `neon-stat-panel.tsx` — premium KPI tile
- `vegas-section-shell.tsx` — composed section wrapper

**Files modified:**
- `globals.css` — +336 lines of additive primitives
- `app/page.tsx` — hero 2-column with status board, ticker rail, neon KPI strip, vegas shell for explainer
- `app/board/page.tsx` — compact status-board strip below metadata
- `app/methodology/page.tsx` — numbered step blocks → deluxe cards with gold pills
- `components/footer.tsx` — data sources → chip row
- `components/homepage-trending-tabs.tsx` — LeanRow / Parlays panel / Upcoming games all picked up `.casino-glow-card`
- `components/slate-tabs.tsx` — active tab now "lit up" with gold-dim wash + soft top inner-glow

### Iteration 2 — Phase 5 verification ✅

| Check | Result |
|---|---|
| typecheck | PASS |
| build | PASS (homepage 6.49 kB / board 16.1 kB / parlay-lab 9.66 kB — bundle sizes essentially flat) |
| public_copy_test | PASS |
| Forbidden-copy grep | matches only in code comments + CSS class names |
| Scope check | only allowed UI files; no data/pipeline/lib/workflow/package |
| Both Vercel deploys (canonical + duplicate) | PASS, mergeStateStatus CLEAN |
| WebFetch read-only QA on canonical preview | confirmed new elements rendering: ticker visible, status-board content present, KPI labels updated, explainer "House rules · how it works" section present (WebFetch can't evaluate CSS styling — that's for operator visual review) |

PR #29 left open per operator's standing instruction: "do NOT merge automatically".

---

## Iteration 3 — headliners, bullet reasoning, filter console (2026-05-15)

**Operator feedback after iter 2:** May 15 board live, but Anthony Edwards "appears missing", semicolon reason text feels shabby, star players should rank near the top, board needs more on-site reasons to stay.

### Phase 0 — Reconfirm ✅
- Branch `feature/brand-visual-polish`, HEAD `1c5ba1c`
- PR #29 OPEN / CLEAN / MERGEABLE / 2 commits
- Tree clean except untracked progress docs

### Phase 1 — May 15 active-date audit ✅

The active-slate logic is already correct: `currentEtDate()` returns May 15 after hydration, and `selectActiveSlate` returns `kind: "today"` with `selectedDate: "2026-05-15"`. The Vercel rebuild on any push picks up May 15 as the prerendered "today". **No date-logic edits required.**

### Phase 2 — Anthony Edwards investigation ✅

**Conclusion: he is in the data. He has 6 leans on MIN:**
- AST Under 4.5 — **High conf, +7.07% / +8.79%** (clean, two books)
- REB Under 5.5 — Low conf, +25-26% (R5_suspicious_edge anomaly)
- PTS — No Play (projection sits on the line)

The reported "missing" perception is a **sort/ordering issue**, not a data issue. Cards are ranked by `maxAbsEdge desc`, and his max edge (26.22 from REB anomaly) is below Jenkins/Duren/Cade etc. He is **buried, not absent**.

**Adjacent data issues found (out of scope, flagged for future):**
- "James Harden" rendered as CLE (he plays for LAC) — looks like a player_resolver name mismatch in `pipeline/player_resolver.py`
- "Dennis Schroder" rendered with team `?` — same family of resolver issue

These cannot be fixed in this UI PR. Filed as future pipeline work.

### Phase 3 — Star headliner section ✅

New component `app/src/components/featured-headliners.tsx`:
- Curated `STAR_PRIORITY` list (Anthony Edwards, Wembanyama, Mitchell, Cade, Mobley, Allen, Duren, Randle, Gobert, Fox)
- Each star has a primary team so the "props missing" callout only fires when the player's team is actually on tonight's slate
- Renders the matching `<VaultPlayerCard>` for each loaded star, in priority order, in a 320px-min responsive grid
- Honest "Not in feed · X, Y" callout for stars whose team is on the slate but who have no loaded props
- Returns `null` when neither loaded stars nor missing-on-slate notes apply
- Headliner section gated behind `!dirty` — disappears as soon as the user applies any filter so it never blocks browsing
- Star cards are **filtered out of the main grid below** to prevent duplication; the main grid section heading becomes "All projections · model board" when the headliner strip is visible

### Phase 4 — Bullet projection reasoning ✅

Rewrote `MarketRowView` in `vault-player-card.tsx` to replace the raw semicolon-joined reason string with structured bullets via a new `buildLeanReasonBullets()` helper.

**Bullets, in order of relevance (only emitted when the data supports them):**
1. Projection vs line (uses `lean.projection`, `lean.line`)
2. Recent form parsed from the reason fragment (`last-5 avg X.X`, `last-10 avg X.X`)
3. Minutes trend (only when "minutes trending up/down" appears in the reason)
4. Home/away context (uses `lean.homeAway`, `lean.opponent`)
5. Thin sample callout when "thin sample (N games)" appears
6. Guardrail explanation: R1 / R2 / R3 / R4 / R5 each get a human sentence, including the original confidence in parens when known
7. No-play clarification

**Never fabricates.** Returns an empty array if nothing matches; falls back to the original string only as a last-resort neutral bullet.

Visually rendered as a "Why this lean" eyebrow + bulleted list with gold pulse-dot bullets, replacing the previous flat paragraph.

### Phase 5 — Free data source plan ✅ (no code changes)

**Currently flowing on each lean / card:**
- player + team + opponent + home/away + tipoff
- market, line, oddsOver/Under, bookmaker
- projection, modelProjection, modelProbability, impliedProbability, edgePct
- confidence, lean, pickType, reason
- `_guardrail`, `_originalConfidence`, `_guardrailAt`, riskFlags
- recent10 sparkline (last 10 games for the market)
- sourceReliabilityScore, newsSignals, newsAction

**Not currently in the data:**
- Injuries / availability status
- Quarter / period splits
- Teammate / usage / lineup context
- On-off / playoff series state
- Real-time line movement

**Feasibility for future pipeline PRs (none in this UI PR):**

| Context | Source | Feasibility |
|---|---|---|
| Injury status | ESPN scoreboard (already integrated) — has injury notes per player | Medium. Need new fetch step + cache. Low risk, free. |
| Minutes trend | Already derivable from `recent10` shapes | Easy. Could surface a "Minutes: trending up/down/flat" badge from the sparkline. |
| Playoff series state | nba_api `playoffpicture` endpoint | Medium-low. Stats.nba is rate-flaky. |
| Quarter splits | nba_api `playergamelog` already pulled, but per-game only | Hard. Would need `boxscoretraditionalv2` per game. Many credits. |
| Usage / teammate | nba_api `boxscoreadvancedv2` per game | Hard. Same as above. |
| Real-time line movement | The Odds API historical or another paid feed | **Paid-only** — out of scope. |

**Recommended next data-side PR (separate, not this one):** add an injuries fetch via ESPN at the daily refresh, attach `injury` field per player to leans. UI then surfaces an inline "Out / Questionable / Probable" chip. ~100 lines pipeline + 10 lines UI.

### Phase 6 — Filter console polish ✅

Upgraded `vault-filters.tsx` container surface from plain `var(--vault-panel)` to `.vault-deluxe-card` with `var(--vault-border-strong)`. The filter panel now reads as a powered-on console (gold-edge gradient + soft drop + refined hover) instead of a flat box. No structural changes to the controls themselves.

### Phase 7 — Verification ✅

| Check | Result |
|---|---|
| typecheck | PASS |
| build | PASS (`/board` 16.1 → 17.7 kB, +1.6 kB for headliner section + bullet reasoning) |
| public_copy_test | PASS |
| Forbidden-copy grep | only matches inside code comments + `<Block` component names |
| Scope check | 3 modified UI files + 1 new component; no data/pipeline/lib/workflow/package |

---

## Iteration 4 — overnight deep pass (2026-05-15 03:00 EDT)

**Operator brief:** 3-6 hour window. Continue PR #29 with a real visual/product iteration. Make board easier to scan, star players easier to find, reasoning bullets polished, Parlay Lab feel like a console, site-wide casino atmosphere stronger. May merge PR #29 if checks are green and scope is UI-only. Do not assume James Harden on CLE is a bug.

### Iteration 4 — Phase 0 ✅
- Branch `feature/brand-visual-polish`, HEAD `6e7dd9b`
- PR #29 OPEN / CLEAN / MERGEABLE / 3 commits / 22 files
- Tree clean except untracked progress docs

### Iteration 4 — Phase 1 visual QA ✅

Preview routes captured via WebFetch:

**Homepage** — works as designed. Status board renders with real May 15 data ("Fri May 15 · schedule live · DET@CLE 7:00 pm ET · SAS@MIN 9:30 pm ET · 163 projections · 97 High conf · 31 anomalies · Open the wall →"). Ticker rail rendering. Trending tabs working. House rules section panelled. Verdict: not bland anymore, but still a few rough edges (ticker duplicates from 2 books, role players top the Projections tab by edge).

**Board /board?date=2026-05-15** — Featured Headliners section visible with 10 star cards (Anthony Edwards, Wembanyama, Mitchell, Cade, Mobley, Allen, Duren, Randle, Gobert, Fox). Main grid heading "All projections · model board". Wembanyama PTS sample card rendering with bullet "Why this lean" list. Disclosure "How to read these projections" intact. Verdict: solid, but 10 full duplicate cards is heavy.

### Iteration 4 — Phase 2 player audit ✅

All 12 star players present in 2026-05-15 board:
- Anthony Edwards (MIN) — clean **AST Under 4.5 High +8.8%**, anomaly REB Under 5.5 +26%
- Victor Wembanyama (SAS) — clean **AST Over 3.5 High +17.5%**, PTS Over 26.5 +15.7%
- Donovan Mitchell (CLE) — **AST Over 3.5 High +22.7%**, PTS Over 26.5 Medium +4.6%
- Cade Cunningham (DET) — REB Under 5.5 High +14%, PTS Under 27.5 anomaly +37.6%
- **James Harden (CLE)** — PTS Over 19.5 High +12.2%. *Operator says this is current data, not a bug. Treating as valid.*
- Jalen Duren (DET) — PTS Over 10.5 anomaly +43.6%
- Rudy Gobert (MIN) — REB Over 8.5 anomaly +39.6%
- Julius Randle (MIN) — PTS Over 16.5 anomaly +33.6%
- Evan Mobley (CLE) — REB Over 8.5 High +18%
- Jarrett Allen (CLE) — REB Over 6.5 High +17.1%
- De'Aaron Fox (SAS) — REB Over 3.5 High +5.4%
- Stephon Castle (SAS) — REB Over 5.5 High +21.9%

Dennis Schroder team=`?` (resolver mismatch, but flagged as current data per operator's instruction).

### Iteration 4 — Phase 3 compact Headliner Rail ✅

`featured-headliners.tsx` refactored from full-card duplication into a compact tile rail:
- Each `HeadlinerTile` is a 240px-min summary anchor (`href="#card-{cardKey}"`)
- Pulls the "best loaded lean" via `pickBestLean()` priority: High-clean → Medium-clean → Low-clean → anything (anomalies last)
- Shows: player name + matchup line + best market + side+line + edge% + confidence pill + anomaly chip if applicable
- Anchor scroll lands on the full `VaultPlayerCard` lower in the grid (added `id="card-{cardKey}"` + `scroll-mt-24`)
- Star cards now appear in the main grid below (no longer filtered out)
- New `.gtp-headliner-tile` CSS adds gold underrim, hover lift, focus halo
- "Not in feed · X, Y" callout still surfaces if a star's team is on the slate but their props were not loaded
- 12-star priority list now includes James Harden (CLE), Stephon Castle (SAS) — both have real props

### Iteration 4 — Phase 4 polished bullet reasoning ✅

`buildLeanReasonBullets()` now returns `ReasonBullet[]` with `{label, text, tone}` instead of plain strings. Each bullet has a mono uppercase label so the reasoning reads as a sportsbook readout:
- **Projection** — 29.8 — 3.3 above the 26.5 line.
- **Recent form** — last-5 34.6 · last-10 29.5 PTS.
- **Minutes** — Trending up across the recent window.
- **Context** — Playing on the road at MIN.
- **Sample** — Only 5 recent games informed the model. *(when thin)*
- **Calibration watch** — Edge is unusually wide (≥25%). Confidence is capped at Low — the raw model said High. *(R5)*
- **Verdict** — Model passes — the edge does not clear the threshold. *(no-play)*

New `.gtp-reason-list` + `.gtp-reason-eyebrow` + `.gtp-reason-label` CSS gives the bullet rows visual rhythm (mono labels, gold-pulse markers, warn-tone markers on calibration callouts).

### Iteration 4 — Phase 5 board UX nudges ✅

- Trends disclosure button now uses `.gtp-disclosure-trigger` with proper focus halo
- VaultPlayerCard article gets `id="card-{cardKey}"` and `scroll-mt-24` so headliner tile anchors land cleanly under the sticky nav

### Iteration 4 — Phase 6 Parlay console eyebrow ✅

Build-mode control panel sidebar gets a small "Parlay console · build mode" eyebrow with pulsing dot at the top, separated from the steps by a thin gold rule. Reads as a single illuminated console rather than a generic form sidebar.

### Iteration 4 — Phase 7 nav active-state polish ✅

Active nav item now reads as "illuminated":
- Gold-dim wash background (180deg gradient)
- Text shadow with soft gold glow
- Existing gold underline preserved
- `aria-current="page"` for screen readers
- Applied to both desktop and mobile nav rows

### Iteration 4 — Phase 8 future-data plan (read-only)

| Context | Source | Effort | Action |
|---|---|---|---|
| Injury notes | `manual_overrides/news_signals.json` already supports this; UI just needs to render it | LOW | Future small UI PR — surface news-signal injury notes on the player card |
| Auto injury fetch | ESPN scoreboard `competitions[*].competitors[*].statistics` | MEDIUM | Future pipeline PR — free, but spotty. `sportsdata_provider` exists for paid alternative |
| Minutes-trend chip | Already in pipeline `score_model.py` reason; could surface as a dedicated chip | LOW | Could move from bullet to a card-header chip |
| Playoff series state | `nba_api.stats.endpoints.commonplayoffseries` | MEDIUM | Future pipeline PR — fetch series record per game, attach `playoffSeries` field to game |
| Quarter splits | `nba_api.stats.endpoints.boxscoretraditionalv2` per game | HIGH | Many credits, slow |
| Teammate / on-off | `nba_api.stats.endpoints.leaguedashlineups` | HIGH | Requires lineup-window analysis; non-trivial |
| Real-time line movement | The Odds API historical (paid) | PAID | Out of scope |

**Recommended next data-side PR (separate from this UI iteration):** ESPN injury auto-fetch + per-player attach, surfaced as a "Status · Out / Questionable / Probable" chip on the player card. Highest UX leverage, lowest risk, completely free.

### Iteration 4 — Phase 9 verification ✅

| Check | Result |
|---|---|
| typecheck | PASS |
| build | PASS (`/board` 17.7 → 18.4 kB +0.7 kB; `/parlay-lab` 9.66 → 9.74 kB +0.08 kB; `/` essentially flat) |
| public_copy_test | PASS |
| Forbidden-copy grep | matches only inside code comments + `<Block />` component names |
| Scope check | 7 UI files modified (incl. globals.css); no data/pipeline/lib/workflow/package |

