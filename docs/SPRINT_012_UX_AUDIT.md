# Sprint 012 — UX / IA Audit

**Scope:** the whole public app (65 page routes, 5 chrome navigation surfaces).
**Method:** source audit of every nav surface, route file, guard test, entity/badge component — every claim below is anchored to a real file:line and was verified against the code, not inferred.
**Constraint that shaped the recommendations:** navigation structure is pinned by **11 regex-based guard tests** that read component source as raw strings. Restructuring nav is therefore a *coordinated code + test* change, never a cosmetic one. Nothing in this sprint may sacrifice existing correctness for visual change.

---

## 1. Current problems

### 1.1 A nav item that lies about its destination (CRITICAL — fixed this sprint)
`/games` is labelled **"Game Reports"** in both the top nav (`app/src/components/nav.tsx:49`) and the command rail (`app/src/components/command-rail.tsx:42`), but the route is a client redirect:

```
app/src/app/games/page.tsx:15   return <ClientRedirect to="/simulate/" label="Simulate" />;
```

A user clicking "Game Reports" lands on "Simulate" — a second nav item they can already see. This is the single most redundant entry point in the product: one nav slot whose only behavior is to send you to another nav slot.

### 1.2 Five navigation surfaces that disagree
| Surface | File | Items | Renders at |
|---|---|---|---|
| Top nav | `nav.tsx:23-54` (`NAV_ITEMS`) | 11 | **640–1023px only** (parent is `lg:hidden` in `layout.tsx:72`) |
| Mobile top strip | `nav.tsx:184` (`MOBILE_TOP_ITEMS`) | 5 | < 640px |
| Bottom nav | `nav-active-route.ts:47-55` (`MOBILE_NAV_ITEMS`) | 7 | < 768px |
| Command rail | `command-rail.tsx:39-56` (`ITEMS`) | 16 in 5 groups | ≥ 1024px |
| Footer site map | `footer.tsx:59-124` | 13 | all |

Consequences:
- The rail carries five destinations the top nav never shows (`/build`, `/nba`, `/ufc`, `/methodology`, `/about`) and drops one it does (`/sports`).
- **768–1023px** has no bottom nav and no rail — only the 11-item horizontally-scrolling strip.
- Two surfaces both use `aria-label="Primary"` (`command-rail.tsx:105`, `nav.tsx:186`).
- `/research` and `/results/model-audit` exist **only** in the footer.

### 1.3 Duplicate surfaces per user concept
| Concept | Routes competing for it | Evidence |
|---|---|---|
| "the day's games" | `/`, `/today`, `/simulate`, `/games`, `/mlb`, `/board`, `/projections` | `/board`'s own h1 is "Between slates" (`board/page.tsx:161`); `/projections` and `/mlb` render the same player-prop board |
| "build a card" | `/picks`, `/build`, `/parlay-lab`→, `/parlays`→ | `/build` calls itself *"Advanced builder · secondary tool"* and its primary CTA is "Open Picks Lab" (`build/page.tsx:33-40`) — yet it holds a bottom-nav **and** a rail slot |
| "the money story" | `/bank-builder`, `/moonshot`, `/mr-dub`, `/results` | `/mr-dub` re-renders the Bank Builder ladder + per-product wagers (`mr-dub/page.tsx:38`) — a superset of two neighbours |
| "pick a sport" | `/sports`, `/events` | both are sport directories; `/sports:117` links to `/events` |

### 1.4 Compliance copy repeated to the point of blindness
Occurrences in `src/**/*.tsx`: **"paper-only" ×213**, **"educational" ×195**, **"not betting advice" ×73**.
Before a single line of page content, every page already shows **four** simultaneous statements:
`DisclaimerBanner` (`layout.tsx:71`) → command-rail footer strip (`command-rail.tsx:168`) → `Footer` tagline (`footer.tsx:52`) → `Footer` disclaimer (`footer.tsx:147`).
This is not more honest than one clear statement — repetition trains users to ignore all of it, including the load-bearing ones.

### 1.5 Component duplication
- **Three rival player-avatar components** with incompatible APIs: `components/player-avatar.tsx` (`playerId`+`playerName`, ~22 call sites), `components/ui/player-avatar.tsx` (`name`+`photo`, ~17 call sites), `components/mlb/mlb-player-avatar.tsx` (3 call sites).
- **Two team-logo families**: `ui/team-mark.tsx` (6 call sites) and `components/team-logo.tsx` (ESPN CDN, 21 call sites).
- **Five header idioms** doing the same "title + eyebrow + status + note" job: `PicksSurfaceHeader`, `SportOverviewHero`, `PageHero`, `SectionHeader`, `ResultsHero`.

### 1.6 Dead and stale code
- `components/sport-section-tabs.tsx:70-78` renders **nothing** (`void TABS;` keeps it alive); four wrappers still import it.
- `mobile-bottom-nav.tsx:45-126` `NavGlyph` still carries `results` and `sports` cases with no matching items.
- `nav.tsx:64-66` comment claims "Desktop still renders the full NAV_ITEMS spine" — false since the `lg:hidden` wrapper.
- `e2e/navigation.spec.ts:89-103` asserts `/board` and `/parlay-lab` are visible nav links — neither is in any nav; the spec is already wrong.
- `quick-action-rail.tsx:31,49` and `sports-coverage.ts:70-71,82-83` still link the legacy `/board` and `/parlay-lab#suggested`.

### 1.7 Two guard tests that directly contradict each other
```
nav-active-route.test.mjs:23-26   /bank-builder must be BEFORE the divider  (PRIMARY)
product-reset-phase-a.test.mjs:24 /bank-builder must be AFTER the primary spine (SECONDARY)
```
Both pass today only because `/bank-builder` is the item that *carries* `beforeDivider: true` on the same source line (`nav.tsx:47`) — `indexOf` finds the href just before the flag string. **Any reformatting of that one line breaks one of them.** This latent conflict must be resolved before Bank Builder can move into a Strategy Lab group.

---

## 2. Recommended changes

| # | Change | Risk | Status |
|---|---|---|---|
| R1 | Remove `/games` from top nav + rail (it redirects to `/simulate`) | Low — 3 guard tests updated in the same commit; the alias route itself stays | **DONE (Sprint 012)** |
| R2 | Adopt one canonical entity system for teams/players | Low — additive | **DONE (Sprint 012)** |
| R3 | Fix stale comments + the already-broken e2e nav spec | Low | **DONE (Sprint 012)** |
| R4 | Resolve the `/bank-builder` primary-vs-secondary test contradiction | Medium — must land *before* any Strategy Lab regrouping | **DOCUMENTED — prerequisite for R5** |
| R5 | Group `/bank-builder` + `/moonshot` + `/mr-dub` under **Strategy Lab** | Medium — touches 5 guard tests | Deferred (gated on R4) |
| R6 | Retire `/build` from bottom nav + rail (it is self-described secondary and CTAs back to `/picks`) | Medium — pinned by `nav-active-route.test.mjs:45-48` hard count of 7 | Deferred |
| R7 | Collapse `/board` + `/projections` into `/mlb`; `/events` into `/sports` | Medium — routes must stay for `retired-route-discovery.test.mjs:48-56` | Deferred |
| R8 | Consolidate the 4-up disclaimer stack to one banner + one footer line | Low–Medium — must preserve `disclaimer-banner.tsx:46`, `footer.tsx:147`, `/responsible-use` | Deferred (copy review) |
| R9 | Delete dead `SportSectionTabs` + dead `NavGlyph` cases | Low | Deferred |

---

## 3. New information architecture (target)

Organised by **user intent**, not by internal product name:

```
Home            /            → "what should I explore today?"
Today           /today       → today's intelligence (predictions board, top picks)
Simulations     /simulate    → explore games → /games/mlb/<slug>
Picks           /picks       → model-qualified insights
Track Record    /results     → results + receipts
Sports          /mlb /nba /ufc
Learn           /learn /methodology
Strategy Lab    /bank-builder /moonshot /mr-dub      ← R5, gated on R4
```

Principle: **one door per concept.** `/games`, `/parlays`, `/parlay-lab`, `/nba/parlays` remain as redirect aliases (deep links keep working) but never appear as their own nav entries.

---

## 4. Before / after navigation map

| Concept | Before (nav entries) | After (target) |
|---|---|---|
| Daily hub | Today | **Today** |
| Run a simulation | Simulate **+ Game Reports (redirect!)** | **Simulations** (aliases redirect in) |
| Build a card | Picks Lab **+ Build** | **Picks** (Build → in-page advanced mode) |
| Money story | Bank Builder + Moonshot + Daily Dashboard | **Strategy Lab** (3 sub-items) |
| Track record | Results | **Track Record** |
| Sport hubs | MLB + More Sports (+ rail-only NBA/UFC) | **Sports** → MLB · NBA · UFC |
| Trust | How It Works (+ rail-only Methodology/About) | **Learn** → How It Works · Methodology |

Top-nav item count: **11 → 7**. Rail: **16 → 7 groups with sub-items**. Bottom nav: **7 → 5** (Today · Simulations · Picks · Track Record · Strategy Lab).

---

## 5. Component consolidation plan

### 5.1 Entity system (shipped this sprint)
`app/src/components/entity/index.tsx` — the canonical primitives, wrapping the proven ones rather than duplicating them:

| Export | Wraps | Guarantee |
|---|---|---|
| `TeamLogo` | `ui/team-mark` | initials fallback when no logo |
| `PlayerPortrait` | `player-avatar` | **sport-aware**: only MLB/NBA pass an id to a headshot CDN; UFC and everything else fall back to initials — never a guessed photo |
| `EntityHeader` | — | mark + title + subtitle + trailing slot |
| `PlayerCard` | `PlayerPortrait` | portrait + name + team/opponent + market/line/pick + probability (already computed) |
| `GameHeader` | `ui/matchup-identity` | away @ home crests + identity line + status slot |

Guarded by `app/src/lib/entity-system.test.mjs`: exports exist, wraps (no duplicated CDN URLs), sport-aware fallback, **presentational only** (no fetch / no prediction recomputation), null-safe props.

**Adopted at:** `components/today/top-picks-by-category.tsx` (category dashboards) and `components/game/mlb-full-game-report.tsx` (prediction-hero player strip) — the two surfaces that must always agree.

### 5.2 Remaining consolidation (sequenced)
1. Migrate `ui/player-avatar` (17 call sites) and `mlb/mlb-player-avatar` (3) onto `PlayerPortrait` — one call-site family per PR, each with a visual check.
2. Migrate `components/team-logo` (21 call sites, ESPN CDN) behind `TeamLogo` so sport/branding rules live in one place.
3. Collapse `PicksSurfaceHeader` / `SportOverviewHero` / `PageHero` / `ResultsHero` onto `EntityHeader` + `SectionHeader`.
4. Delete `SportSectionTabs` and its four wrappers; drop dead `NavGlyph` cases.

---

## 6. What Sprint 012 actually changed

- **R1** `/games` removed from the top nav and the command rail; its guard tests updated in the same commit to assert the *absence* of the redirect-alias entry (the alias route and its redirect tests are untouched, so deep links still work).
- **R2** Entity system created, guarded, and adopted on both player surfaces.
- **R3** Stale `nav.tsx` comment corrected; the already-failing `e2e/navigation.spec.ts` nav expectations corrected to the real chrome.
- **Simulation Explorer** (Sprint 011, verified here): the report's `SimulationOutcomeCenter` exposes win counts out of 10,000, most-likely final scores + frequencies, and outcome distributions — all read from the canonical artifact, never recomputed in a component (`prediction/sync-guards.test.mjs`).

Everything else is documented above with its blocking dependency, so the next sprint can execute R4→R9 without re-auditing.

---

## 7. Route migration plan (deep links preserved)

Target IA groups, and where every current route lands. **No route file is deleted** — every legacy path keeps resolving, either as a page or as a `ClientRedirect` alias, so existing deep links and shared URLs never 404.

| Group | Destination | Absorbs (kept as alias/redirect or sub-route) | Migration action |
|---|---|---|---|
| **HOME** | `/` | — | Homepage becomes discovery-first (Phase 7) |
| | `/today` | — | Today's intelligence — stays canonical |
| **SIMULATIONS** | `/simulate` | `/games` → already redirects here | ✅ R1 done: `/games` nav entry removed, redirect kept |
| | `/games/[sport]/[gameId]` | — | canonical per-game report |
| **INSIGHTS** | `/picks` | `/parlays`, `/parlay-lab`, `/nba/parlays` (existing redirects), `/build` (→ in-page advanced mode) | R6: drop `/build` from chrome; keep route + add in-page entry from `/picks` |
| **TRACK RECORD** | `/results` | `/results/*` sub-pages, `/results/model-audit` | promote model-audit link out of footer-only |
| | `/bank-builder`, `/moonshot`, `/mr-dub` | — | R5: group as Strategy sub-items (gated on R4) |
| **SPORTS** | `/mlb`, `/nba`, `/ufc` | `/sports`, `/events` (directories), `/board`, `/projections` (boards) | R7: `/board` + `/projections` become `/mlb` sections; `/sports` + `/events` merge to one directory |
| **LEARN** | `/learn`, `/methodology` | `/about`, `/responsible-use`, `/research`, `/market-guide` | promote `/research` out of footer-only |
| **Retired** | `/trends`, `/homer-nukes`, `/world-cup*`, `/world-cup-specials`, `/ipl*` | — | already `noindex` stubs; files must stay (`retired-route-discovery.test.mjs:48-56`) |

**Test-update protocol for each move** (this is what "update tests safely" means here):
1. Change the component (`nav.tsx` / `command-rail.tsx` / `nav-active-route.ts`).
2. In the *same commit*, update every guard that pins the old shape, replacing a positional/presence assertion with an assertion of the **new intended invariant** plus a comment naming the sprint and reason — never by weakening the guard to `.skip` or deleting it.
3. Re-run the full suite; a nav change must leave total pass count ≥ the previous run.
R1 followed exactly this protocol across `nav-active-route.test.mjs`, `nav-three-click.test.mjs`, and `unified-nav-labels.test.mjs`.

---

## 8. User-journey scenarios (Phase 9 baseline)

Measured against the current build (post-R1). "Clicks" = navigation actions from a cold homepage load.

| # | Journey | Clicks | Result | Friction found |
|---|---|---|---|---|
| A | First visit → today's most interesting simulation | 2 (Today → spotlight game) | ✅ | Homepage still leads with explanation rather than the featured sim (Phase 7 target) |
| B | Find a player-prop simulation | 2 (Today → category pick) | ✅ | Now portrait-led and category-grouped (Sprint 010/011); before Sprint 010 this was a flat list |
| C | Understand why a team is favored | 2 (Today → game → Overview) | ✅ | Prediction hero states the answer; the Outcome Center gives win counts + most-likely scores directly beneath |
| D | Review historical results | 1 (Track Record) | ✅ | `/results/model-audit` is footer-only — deep track record is under-discoverable |
| E | Mobile navigation | 1–2 | ⚠️ | 7 bottom-nav items overflow horizontally (`mobile-bottom-nav.tsx:147-152`); target is 5. Blocked by the hard count in `nav-active-route.test.mjs:45` |

No journey exceeds the 3-action budget. The two open frictions (homepage hierarchy, 7-item bottom nav) are R6/R8 and Phase 7 work.
