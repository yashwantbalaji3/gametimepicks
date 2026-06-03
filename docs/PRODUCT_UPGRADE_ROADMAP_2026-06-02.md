# Product Upgrade Roadmap — Chatbot Assistant, Mobile-First UX, Sports Taxonomy, Visual System (2026-06-02)

> **Docs-only roadmap/spec. Changes NO product behavior.** No chatbot
> implemented; no LLM/API keys; no server routes added; no unsupported sports
> enabled; no methodology/model/data/workflow change; Methodology v2 stays
> shadow-only; `edgePct`/`confidence` not used as quality signals. This document
> is the plan for a multi-PR sprint — each PR stays small and focused, verified
> and merged on green/CLEAN. Audit basis: read-only review of routes,
> navigation, theme, `package.json`, `next.config.mjs`, the sports registry, and
> the parlay/leg-pool libraries.

---

## 1. Executive summary

GameTime Picks is already an honest, calibrated analytics product with a solid
component base (~120 components), a rich dark **navy + gold "vault"** token
system, decent accessibility (focus rings, `aria-current`, `prefers-reduced-motion`),
and honest empty states. The upgrade goal is **not a rewrite** — it is to (a)
make core goals reachable in 1–2 taps with clearer labels and a tidier
information architecture, (b) add a **rule-based parlay assistant** that builds
custom cards from **real** in-repo data only, (c) introduce a **categorized
sports taxonomy** with icons/status, and (d) raise visual richness and mobile
readability **using what's already installed** (no heavy new deps).

The single most important architectural finding: **the app is a fully static
export** (`next.config.mjs → output: "export"`). That means **no server API
routes, no server actions, and no server-side LLM call are possible** without a
deployment-model change. Therefore the assistant MVP must be a **pure
client-side, rule-based parser over already-loaded data** — which is also the
safest design and exactly what the guardrails prefer. An LLM-assisted variant is
a separate, approval-gated, architecture-first effort.

**Recommended immediate next PR:** *Navigation + mobile-first Home IA foundation*
(labels, quick actions, sport-availability summary, an "Assistant — coming soon"
placeholder) — UI-only, no data/model change. See §17.

---

## 2. Current product audit (read-only)

### Routes / IA
- **Primary (in nav):** `/` Home · `/projections` · `/parlay-lab` (`#suggested` / `#build`) · `/bank-builder` · `/results` · `/events` · `/about`.
- **Legacy / secondary (not in primary nav, deep-linked or orphaned):** `/mlb`, `/nba/*`, `/nhl/*`, `/ipl/*`, `/world-cup/*`, `/board`, `/trends`, `/methodology`, `/responsible-use`, `/results/{mlb,nba,parlays,model-audit,date/[date]}`. This is real IA sprawl — many per-sport board/parlays/power/results routes coexist with the unified surfaces.
- **Navigation:** desktop **CommandRail** (232px left sidebar, grouped items with glyph icons) + a top horizontal nav; **mobile bottom nav** with **5** inline-SVG-icon items (Home · Projections · Parlay Lab · Results · Sports). `aria-current="page"`, semantic `<Link>`, `aria-label`s present.
- **Status bar (`slate-status-bar.tsx`):** today · active slate (date + pregame/settled) · latest settled · `$100 paper`. Honest, server-rendered.
- **Home:** 5 "path cards" (Straight Bets · Suggested Parlays · Build Your Own · Bank Builder · Results) + featured slip + Bank Builder preview + sports-coverage grid + suggested preview + track record + a **Guided Start** onboarding module + newsletter. Most core goals are **1 click** from Home.

### Theme / dependencies
- **No icon library, no animation library, no class-utility, no charting lib** — only `next`, `react`, `tailwindcss`, `typescript`, `@playwright/test`. All icons are emoji (🏀 ⚾) or hand-coded SVG; all animations are CSS `@keyframes` (9 defined, all gated by `prefers-reduced-motion`).
- **Tokens:** a mature `:root` system — `--vault-bg #070B1A`, `--vault-panel #0E1530`, `--vault-gold #D4AF37` / `--vault-gold-bright #F0C75E`, `--vault-text #F5E7C4`, semantic `--vault-success/warn/danger`, plus `--gtp-*` radii/shadows. Contrast hand-verified to WCAG AA.
- **Type:** Geist (display) + JetBrains Mono (data) via Google Fonts `@import`. Base **15px**. **Heavy monospace** for data (105× `text-[11px]`, 119× `text-[10px]`) — a mobile readability risk.

### Sports registry
- `sports-coverage.ts`: 9 entries — **MLB, NBA** (`full`); **NHL, WNBA, UFC, FIFA World Cup, IPL, MLS** (`schedule`); **EPL** (`coming-soon`). Fields: `key`, `label`, `longLabel`, `level`, `blurb`, `links`. **No `icon`, `color`, or `category`.** Flat list.
- `sport-capabilities.ts`: per-sport gates (`hasProjections/Suggested/BuildYourOwn/Grading`); `MODELED_SPORT_KEYS = ["nba","mlb"]`; `isOfficialSuggestedParlayAllowed` (single-sport) / `isBuildYourOwnParlayAllowed` (modeled mixed). Fail-closed.

### Chatbot-relevant infra
- **`output: "export"`** (static) → no API routes (`app/src/app/api/**` absent), no `"use server"`, no LLM dependency anywhere. Data is baked JSON under `public/data/`.
- Pure, client-safe building blocks exist: `getLegPool`, `filterBuildYourOwnLegs`, `generateCustomParlaysFromPool`, `evaluateCustomParlay`, `computeCombinedAmericanOdds`, `classifyOddsSection`, `slipRecentFormSummary`, `canShowSuggestedParlays`, `canUseInBuildYourOwn`, `MODELED_SPORT_KEYS`, risk vocab.

---

## 3. Key pain points

1. **IA sprawl + label drift.** Legacy per-sport routes (`/mlb`, `/nba/*`, …) duplicate the unified surfaces; the same route shows different labels ("Projections" in nav vs "Straight Bets" on cards; "Sports" vs "Sports & Events"). First-timers can't tell which is canonical.
2. **Mobile readability.** Pervasive 10–11px monospace labels and 15px base are dense on a 375px screen; tap targets are mostly OK but text scanning is hard.
3. **Flat, icon-less sports taxonomy.** No categories (basketball/baseball/…), no per-sport icon/color → the Sports hub and any sport pickers look plain and are harder to scan.
4. **Visual richness is uneven.** Strong hero/vault polish in places, but many lists/empty states are text-only (emoji as icons), with no consistent icon set or empty-state illustrations.
5. **No assistant.** Users must learn the Build-a-Parlay UI; there's no "ask in words" entry point.
6. **Component repetition.** Styling is inline Tailwind everywhere; no small primitives layer (Icon/Chip/Button/Card/EmptyState), so visual consistency relies on copy-paste.

---

## 4. Target product experience

- **One-line value, one-tap goals.** From Home, a first-timer immediately understands "model projections + paper parlays for NBA/MLB (educational)" and reaches any core goal in 1–2 taps.
- **Ask-in-words assistant.** "Make me a balanced 3-leg NBA parlay for the next slate" → a **validated custom card** built only from the real leg pool, clearly labeled *custom / informational / not officially tracked*, with an honest empty state when nothing qualifies.
- **Scannable sports hub.** Category cards (Basketball, Baseball, Hockey, Soccer, Combat, Cricket) with per-league icons + status chips ("Modeled", "Schedule only", "Coming soon"), never implying picks for unmodeled leagues.
- **Calmer, richer visuals.** Consistent icon set (inline SVG), bigger/legible mobile type, tasteful micro-interactions (reuse existing keyframes), empty-state illustrations — no flashy gambling effects.

---

## 5. Mobile-first priorities (do these first)

1. Bump body to **16px** base on mobile; reserve monospace for true numeric/tabular data, use the sans family for labels/copy; min 12px for any visible label.
2. Keep the **5-item bottom nav**; tighten labels + ensure 44–48px targets (already close).
3. Home: a compact **"What can I do here?"** strip + **quick-action grid** (already partly present via path cards + Guided Start) tuned for thumb reach.
4. **Sport availability summary** card (MLB/NBA modeled; others schedule-only/coming-soon) above the fold.
5. Reduce per-card density; increase vertical rhythm/section spacing on small screens.

---

## 6. Navigation restructure proposal

- **Keep routes stable** (avoid breakage); improve **labels** and **discoverability**:
  - Primary nav order (desktop rail + top + bottom): **Home · Picks (Projections) · Parlays (Parlay Lab) · Bank Builder · Results · Sports · Assistant**.
  - Resolve label drift: pick one user-facing name per route and use it everywhere (e.g., **"Projections"** everywhere, or **"Straight Bets"** everywhere — choose one; recommend "Projections" as the route is `/projections`). **"Sports"** everywhere for `/events`.
  - Add an **"Assistant"** entry as a **disabled / "Coming soon"** placeholder until the MVP ships (no dead links).
- **Tame legacy routes:** keep them reachable (deep links from Sports/Results) but **out of the primary nav**; consider lightweight redirects from `/mlb`,`/nba` → the unified surfaces in a later PR (evidence-gated; verify no inbound links break).
- **Mobile bottom nav:** 5 items max; if "Assistant" is added, it can live on Home as a prominent quick-action rather than a 6th bottom-nav item (keep bottom nav ≤5 for thumb ergonomics).

---

## 7. Sports / league categorization proposal

Add a **pure, additive taxonomy layer** that **extends** the registry **without
touching capability gates** (no behavior change, fail-closed preserved):

- New `app/src/lib/sports-taxonomy.ts` mapping each existing `key` →
  `{ category, icon, accentColor, shortLabel }`. Categories:
  **Basketball** (NBA, WNBA), **Baseball** (MLB), **Hockey** (NHL),
  **Soccer** (FIFA World Cup, MLS, EPL), **Combat** (UFC), **Cricket** (IPL),
  **Other / Coming soon** (catch-all).
- Status badge stays driven by the registry `level`
  (`Modeled` / `Schedule only` / `Coming soon`) — single source of truth.
- Per sport/league surface: **icon · short label · full label · status badge ·
  supported-features chips** (schedule / projections / suggested / build-your-own
  / bank builder / results, read from `sport-capabilities.ts`) · user-facing
  explanation · disabled/coming-soon state.
- **UI:** a Sports hub with **category cards**, a **status matrix**, league
  cards with icons, and **mobile horizontal category filters**. Unavailable
  states read **"Schedule only"**, **"Projections not modeled yet"**,
  **"No suggested cards for this league yet"** — never implying picks exist.
- **Guardrail:** icons/colors are cosmetic; **capability gates remain the only
  thing that decides whether picks render.** No unsupported sport ever gets a
  pick.

---

## 8. Visual design system proposal

The token system is already strong; **formalize and lightly extend** it (no new
deps):

1. **Color tokens** (already present, document as the canonical set):
   `--vault-bg/panel/panel-elevated`, `--vault-border*`, `--vault-text/-mute/-faint`,
   `--vault-gold/-bright`, `--vault-success/warn/danger`. **Add** semantic
   aliases: `--surface`, `--surface-raised`, `--accent`, `--accent-hover`, and
   **sport accent** + **risk-section** color vars (Low/Med/High/Longshot) so
   cards theme consistently.
2. **Typography:** mobile base **16px**; heading scale (e.g., 28/22/18/16);
   line-heights 1.4–1.6; **reduce monospace** to numeric/tabular contexts;
   labels in the sans family ≥12px.
3. **Layout:** keep `--max-width: 1280px`; mobile gutter 16px; consistent card
   padding (16px) + section spacing (24–32px).
4. **Components (primitives):** `Chip`/`Badge`, `Button` (primary/outline/ghost),
   quick-action card, sport card, risk card, **EmptyState** — as small reusable
   components to replace inline-class repetition.
5. **Icons:** **no new package** — build an inline-SVG `Icon` component + a small
   set (nav, sports, actions, status). (If the operator later approves a curated
   set, `lucide-react` is the lightest option — but default to inline SVG.)
6. **Graphics:** simple inline-SVG sport-category glyphs, empty-state
   illustrations, an assistant avatar mark, and reuse the existing Bank Builder
   tower + sparkline components.
7. **Animations:** reuse existing keyframes (`reveal-up`, hover lift, shimmer for
   skeletons); add subtle tab/route fade; **respect `prefers-reduced-motion`**;
   **no flashy gambling-style effects**.
8. **Accessibility:** maintain AA contrast, visible focus rings, keyboard nav,
   semantic headings, button labels.

---

## 9. Icons / graphics / animation strategy

- **Icon system:** a typed `Icon` React component rendering inline `<svg>` from a
  small internal registry (`name` → path), `currentColor`-themed, `aria-hidden`
  when decorative, with an accessible label when interactive. Zero runtime deps.
- **Sport/league icons + category glyphs:** inline SVG keyed off
  `sports-taxonomy.ts`.
- **Empty-state illustrations:** lightweight inline SVG (no raster assets), one
  per surface (no data yet / projections pending / no qualifying card).
- **Micro-interactions:** card hover/press, tab underline, skeleton shimmer on
  load, reveal-on-mount — all CSS, all reduced-motion-safe.
- **Assistant avatar:** a simple SVG mark (not a mascot), neutral and on-brand.

---

## 10. Chatbot feasibility & recommended architecture

**Constraint (decisive):** static export → **no server routes / no server-side
LLM**. So:

- **Option A — Rule-based, client-side parser MVP (RECOMMENDED, first):** a pure
  function parses common prompts into a structured intent, then calls the
  existing **pure** generators/validators over the **already-loaded** leg pool.
  No server, no LLM, no API key, no new heavy dep. Lowest risk; fully testable.
- **Option B — LLM-assisted intent parsing (approval-gated, architecture-first):**
  an LLM only extracts structured intent (sport/date/risk/legCount/filters);
  **all leg selection + validation stays rule-based on our data.** Requires
  **removing `output: "export"`** (or adding a separate serverless endpoint) +
  an API key + a privacy/security plan. **Do NOT wire this session.** Design
  first, stop, get approval.
- **Option C — Full conversational agent:** not recommended now.

### Option A design

**Prompt parser → intent schema:**
```
{ sport: "nba"|"mlb"|"mixed"|null,
  date: "today"|"tomorrow"|"weekend"|"YYYY-MM-DD"|null,   // resolved to a real slate
  riskLevel: "low"|"medium"|"high"|"longshot"|"conservative"|"balanced"|"aggressive"|null,
  legCount: 2|3|4|5|null,
  mode: "official"|"custom",
  filters: { player?, team?, game?, market?, oddsMin?, oddsMax? } }
```

**Assistant response schema:**
```
{ status: "ok"|"empty"|"unsupported"|"pending_projections",
  message: string,                 // honest, no banned copy, no perf claims
  cards: CustomCard[],             // each built ONLY from the real leg pool
  emptyReason?: string,
  unsupportedReason?: string,
  sourceSlate?: "YYYY-MM-DD",
  label: "official"|"custom-not-tracked",
  disclaimers: string[] }          // paper-only / informational
```

**Validation gates (every response):** modeled sport only · the resolved slate
actually has projections (else `pending_projections`) · the leg pool exists ·
**no invented legs/games/odds/projections** (only real pool entries) · official
vs custom labeled correctly · single-sport for any "official" framing, mixed →
custom Build-Your-Own only · **no banned language**, no win-rate/ROI/guarantee
claims · honest empty response when nothing qualifies.

**Reuse (no new logic invented):** `getLegPool` · `filterBuildYourOwnLegs` ·
`generateCustomParlaysFromPool` · `evaluateCustomParlay` ·
`computeCombinedAmericanOdds` · `classifyOddsSection` · `slipRecentFormSummary` ·
`canShowSuggestedParlays` / `canUseInBuildYourOwn` · `MODELED_SPORT_KEYS`.

**UI:** an assistant panel (dedicated `/assistant` page or a mobile bottom-sheet
on Parlay Lab) with **suggested prompt chips**, a results area rendering the
universal `parlay-ticket-card` (clearly marked custom/not-tracked), a
**source/explanation** line (which slate, why these legs), and honest
empty/unsupported states.

**Phasing:** (1) pure `parser.ts` + `intent` types + tests (no UI); (2)
`assistant-engine.ts` adapter over the generators + tests; (3) read-only UI panel
with suggested prompts; (4) polish. Each its own small PR.

---

## 11. Chatbot guardrails (must hold in every phase)

The assistant must **never** invent legs, games, odds, projections, or results;
**never** use unsupported sports (explain "schedule-only / not modeled yet"
instead); **never** give real-money betting advice or claim to improve hit rate;
**always** label generated cards as **custom / informational / not officially
tracked** unless they are genuinely official Suggested cards; **only** use the
modeled-sport leg pool from repo data; if a future slate has prop lines but no
projections, say **projections are pending**; if nothing qualifies, return an
**honest empty** response; mixed cards are **custom Build-Your-Own only**, never
official Suggested; **no external LLM/API/keys** without explicit approval (and
if needed, **design first and stop**); **prefer the rule-based MVP**. No banned
betting copy (lock, guaranteed, free money, risk-free, can't miss, easy
win/money, no-brainer, sure thing, sharp money; avoid user-facing "safe/safety"
except CSS `safe-area-inset-bottom`).

---

## 12. Component-system proposal

Introduce a tiny primitives layer (incremental; no behavior change):
- `cn()` — a ~10-line class-merge helper (no `clsx`/`tailwind-merge` dep).
- `Icon` — inline-SVG icon by name (`currentColor`, a11y-aware).
- `Chip` / `Badge`, `Button` (primary/outline/ghost), `Card`/`CardHeader`,
  `SportBadge` (icon + status), `EmptyState` (illustration + reason + CTA).
- Migrate **incrementally** (new surfaces first; refactor hot components as
  touched) — never a big-bang refactor.
- Keep the universal `parlay-ticket-card` as the slip renderer.

---

## 13. Accessibility checklist

- [ ] AA contrast on all text/icon-on-surface (already largely verified).
- [ ] Visible `:focus-visible` rings on every interactive element.
- [ ] Full keyboard navigation (nav, tabs, assistant input, card actions).
- [ ] `prefers-reduced-motion` respected by every new animation.
- [ ] Semantic headings + landmarks; one `<h1>` per page.
- [ ] Accessible names for icon-only buttons; `aria-hidden` on decorative SVG.
- [ ] Touch targets ≥44px; hit-area padding on small controls.
- [ ] Assistant input labeled; results announced (`aria-live="polite"`).
- [ ] Color never the only signal (status uses icon + text).

---

## 14. Performance checklist

- [ ] Static export stays static (no accidental server coupling in Option A).
- [ ] Prefer `next/font` over the Google Fonts `@import` (removes a render-blocking request).
- [ ] Inline SVG icons (no icon-font/raster); keep illustrations small.
- [ ] Code-split the assistant panel; lazy-load below-the-fold modules.
- [ ] Watch JS bundle deltas per PR; avoid heavy deps (none today — keep it that way).
- [ ] Images `unoptimized` (export) → keep raster assets tiny; prefer SVG.
- [ ] No layout shift: reserve space for async/empty states (skeletons).

---

## 15. Suggested PR roadmap (small, sequenced)

| PR | Scope | Risk | Data/behavior change? |
|----|-------|------|----------------------|
| **1 (next)** | Navigation + mobile-first Home IA: labels, quick actions, sport-availability summary, "Assistant — coming soon" placeholder | Low | No |
| 2 | Visual tokens + typography/readability pass (mobile 16px, monospace reduction), `cn()` + `Icon` + `Chip`/`Button`/`EmptyState` primitives | Low–Med | No |
| 3 | `sports-taxonomy.ts` (additive) + Sports hub category cards + status matrix + feature chips | Low | No (cosmetic; gates unchanged) |
| 4 | Empty-state illustrations + micro-interactions (reduced-motion-safe) | Low | No |
| 5 | Assistant **MVP part 1**: pure `parser.ts` + intent types + tests (no UI) | Low | No |
| 6 | Assistant **MVP part 2**: `assistant-engine.ts` adapter over existing generators + tests | Low–Med | No (reuses pure generators) |
| 7 | Assistant **MVP part 3**: read-only assistant UI panel + suggested prompts + honest empty/unsupported states | Med | No (client-only, static-safe) |
| 8 | Accessibility + performance polish (`next/font`, focus pass, bundle check) | Low | No |
| (later, approval-gated) | LLM-assisted intent (Option B): architecture/security design **first**, then a separate decision | — | Deployment-model change |

Each PR: tests (`npx tsx --test src/lib/*.test.mjs`) + `tsc` + `npm run build` +
browser QA at 1280/375 + merge on `Vercel – gametimepicks` green / CLEAN.

---

## 16. What must NOT be built

- No live Methodology v2; no risk-section/daily-target/Bank Builder-rule change;
  no workflow-schedule change; no manual settlement.
- No fabricated odds/projections/parlays/results/schedules; no unsupported-sport
  picks; no promoting WNBA/other unsupported sports.
- No `edgePct`/`confidence` as quality signals; no `#245` wiring; no
  `audit/policy.json` consumption; no May 25/26 rates; no June-1 rewrite.
- **No LLM/API keys / server routes this session** (static export); if Option B
  is pursued, **design first and stop** for approval.
- No performance/profit/ROI/hit-rate/guarantee/"best bet" claims; no
  gambling-action language; no banned betting copy. Bank Builder stays
  paper-only; official Suggested stays single-sport; mixed stays Build-Your-Own.
- No big-bang theme rewrite or route deletion in a single PR.

---

## 17. Recommended immediate next PR

**"Improve home navigation and mobile quick actions"** — UI/navigation only, no
data/model/methodology change, **no chatbot implementation**:
1. Home quick actions: View Suggested · Build a Parlay · **Ask Assistant
   (disabled / "coming soon")** · View Projections · Bank Builder · Results.
2. Resolve route-label drift (one user-facing label per route); keep routes
   unbroken.
3. Mobile bottom-nav labels/icons tidy (icons already inline SVG).
4. **Sport availability summary** card (MLB/NBA modeled; others schedule-only/
   coming-soon) using the registry — no unsupported picks.
5. A concise **"What can I do here?"** onboarding card on Home (extends the
   existing Guided Start).
6. Tap-target + spacing tuning; **all data behavior unchanged**.
7. Tests for any new pure helper/component; browser-verify `/`, `/projections`,
   `/parlay-lab(#suggested/#build)`, `/bank-builder`, `/results`, `/events` at
   desktop 1280 + mobile 375 (no overflow, no console errors, no banned copy, no
   unsupported picks).

> **Sequencing note:** the first implementation PR should only start once PR #261
> is unblocked/merged and Vercel is no longer rate-limited, so it can pass the
> green/CLEAN gate and browser QA. Until then, this roadmap is the deliverable.

*References: `PRODUCT_REQUIREMENTS.md`, `SPORTS_COVERAGE_POLICY.md`,
`PRODUCT_UX_AND_SPORTS_PROJECTION_AUDIT_2026-06-02.md`,
`SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md`,
`METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md`. Audit basis:
`sports-coverage.ts`, `sport-capabilities.ts`, `next.config.mjs`,
`tailwind.config.ts`, `globals.css`, `command-rail.tsx`, `mobile-bottom-nav.tsx`,
`custom-parlay*.ts`.*
