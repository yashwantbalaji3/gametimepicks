# MLB Release Readiness

_MLB Final Release Sprint — complete product overhaul. Date: 2026-06-23. Builds on PR #581._

This doc has two parts: **Part 1** is the pre-coding architecture audit (written before any changes);
**Part 2** (appended at the end of the sprint) records the work done, QA, and remaining blockers.

---

# Part 1 — Pre-sprint architecture audit

## Money / safety baseline (verified before coding)
- `currentBankroll` **$10,176.17**, `crownBankroll` **$10,376.17**, `record` **10-2-0-0**, `openExposure`
  **0** — read from committed `app/public/data/mr-dub/portfolio.json` at HEAD `e6b9e46b`.
- Working tree: **no** money-file changes. WC Specials / Moonshot / Bank Builder / settlement history
  untouched.
- Gates green at baseline: `tsc --noEmit` clean · **1314/1314** tests pass · `npm run build` clean
  (214 routes).

## Current MLB architecture
- Route `app/src/app/mlb/page.tsx` renders a uniform tabbed **SportShell** (matches /world-cup). Two
  layers:
  1. **Flagship block** — `MlbFlagshipSections` (`components/mlb/mlb-flagship-sections.tsx`), the 5
     sportsbook-order sections.
  2. **Legacy sport shell** — tabs: Overview · Games · Projections · Player Props · Suggested · Results ·
     Methodology, plus `MlbSectionTabs` (`components/mlb/mlb-section-tabs.tsx` → thin wrapper over the
     shared `SportSectionTabs`).
- Data loaders (all read-only, never fabricate): `loadHomerNukes`, `loadMlbPropsBoard`,
  `getMlbBoardForDate`, `getMlbScheduleForDate`, `getMlbLifetimeSummary`, `getSuggestedParlaysForDate`.
- Slate date resolves via `currentSlateDate() ?? currentEtDate()`; flagship reads the freshly-ingested
  daily artifacts independent of the legacy board's `activeMlbDate`.

## Current MLB page IA (flagship block, in render order)
1. Featured Plays — `TopList n=6` by de-vigged market probability
2. Homer Nukes Parlay — `HomerNukesBoard`
3. Best Player Props — `MlbPropsBoard` (batter groups)
4. Pitcher Props — `TopList n=8` (pitcher group)
5. Games — `GamesList` (matchup + prop count only)

Each is a `SectionCard` (tag/title/sub). Honest `GatedSlot` empty states when the slate is empty.

## Current Homer Nukes architecture
- `/homer-nukes` page → `HomerNukesBoard` (`components/mlb/homer-nukes-board.tsx`), also embedded as MLB
  section 2.
- Derived at render time from `mlb/home-run-props/<date>.json` via `loadHomerNukes`
  (`lib/mlb/homer-nukes.ts`) — anytime-HR, provider-backed, one leg/game, 5 legs, flat $20. No generation
  artifact (cannot fabricate).
- Board today: hero (stake / combined odds / potential return / win prob / sources), Partial-Model status
  (0/7 advanced inputs — `homerModelInputStatus()` in `lib/mlb/homer-score.ts`), 5 ranked legs (headshot +
  team logo + odds pill + per-leg confidence), honest WHY ("pending advanced Statcast integration"),
  awaiting-history slot. Per-leg confidence today = 3-tier (`legConfidence`: high/medium/low).
- **Gaps vs target**: hero lacks explicit date + slate size; legs lack opponent logo + "why selected" per
  leg; confidence is 3-tier not the 4-tier Elite/Strong/Playable/Avoid; history is a single placeholder
  (no 7d/30d/ROI/win-rate/units scaffold).

## Current props board architecture
- `components/mlb/props-board.tsx` (client). `BoardProp` shape includes `photoUrl`/`teamAbbr` (from PR
  #581). Loader `lib/mlb/mlb-props.ts` caps PER_GROUP=60.
- Filters today: group pills (All/HR/Hits/Bases/Runs/RBI/Pitchers), player+team search, game, odds range,
  confidence, sort (market%/confidence/odds/player). Sticky filter bar, clear-filters, "N shown".
- Rows: desktop sticky-header table + mobile cards, each with headshot + team-logo overlay + confidence
  pill. Confidence = de-vigged prob bucket (`confOf`).
- **Gaps vs target**: no visible removable filter chips, no active-filter **count** badge, quick filters
  don't include Strikeouts/Outs/Earned Runs as distinct chips (pitcher markets are lumped under
  "Pitchers"), no explicit "Best Price"/"Team"/"Game" sorts, no sportsbook (provider) badge on rows,
  market% shown but not as a distinct styled badge consistently.

## Current Game Explorer architecture
- MLB section 5 today = `GamesList` (in `mlb-flagship-sections.tsx`): a 2-col grid of matchup + prop
  count. Minimal.
- Richer per-game surfaces exist elsewhere: `components/game-card.tsx`, `mlb-game-section.tsx`,
  `per-game-scorecard.tsx`, `settled-game-detail.tsx`, the legacy Games tab, and game-detail routes
  (`lib/game-detail.ts`).
- **Real data available per game** (`mlb/schedule/<date>.json`): `home`, `away`, `matchup`,
  `commenceTime`, `gameId` only. **Derivable**: total props per `gameId`, featured props (top by market%),
  pitchers-with-props per game (pitcher-group props joined by gameId).
- **NO real data source** for: starting pitchers (confirmed), team **records**, **weather**, **park**.
  These must NOT be fabricated. The Explorer will show real fields + honestly omit the rest, documented as
  a blocker.

## Current desktop navigation architecture
- `components/command-rail.tsx` — `hidden lg:flex` left sidebar, 17 items in 4 groups (Today / Bankroll /
  Sports / Learn). Primary desktop nav at `lg+`. Includes `/mlb`.
- `components/nav.tsx` — top nav, 11 product-spine items, visible all breakpoints (mobile = scrollable
  strip). MLB reachable via `/games` hub, not a top-nav item.
- `isActive()` parity: command rail mirrors nav exactly.

## Current mobile navigation architecture
- `components/nav.tsx` mobile mode — stacked brand + horizontally-scrollable link strip.
- `components/mobile-bottom-nav.tsx` — `md:hidden`, 8 product items (items in `lib/nav-active-route.ts`).
  "Bank Builder" → "Bank" (intentional). `/results`, `/sports`, sport hubs excluded by design
  (`resolveMobileNavBucket`).
- Prior audit (PR #581 `navigation-consistency-audit.md`): **no** dead links, **no** duplicate tabs within
  a surface; labels consistent across surfaces; one minor gap (`/sports` top-nav-only).

## Current responsive breakpoints
- Tailwind defaults: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280. Page padding `px-4 sm:px-8`.
- Key responsive switches: props board `hidden lg:block` table / `lg:hidden` cards; command rail
  `hidden lg:flex`; bottom nav `md:hidden`; Homer hero `grid-cols-2 sm:grid-cols-4`; Mr. Dub
  `grid-cols-1 lg:grid-cols-2`.
- PR #581 QA confirmed no overflow at 375/390/430. **Not yet tested**: 320 / 768 / 1024 / 1440 (this
  sprint, Section 7).

## Remaining technical debt (entering this sprint)
1. **No Statcast/park/weather feed** → Homer Score is Partial Model (0/7); Game Explorer can't show
   weather/park/records. External dependency.
2. **Two MLB IA layers** — flagship block + legacy sport shell tabs overlap (both surface Games, Player
   Props, Results). Potential duplication/confusion; consolidation candidate.
3. **`opponent`/`team` null in artifacts** — only `teamAbbr` populated; opponent logos need a teams-map
   enrichment (Section/Task 51).
4. **Props board** lacks chips/active-count/provider-badge/expanded sorts (Section 3).
5. **Game Explorer** is a thin list, not a scannable card grid (Section 4).
6. **Legacy `boards/<date>.json` fallback** warning during build (pre-existing, non-MLB, benign).
7. Settlement history for Homer Nukes requires an operator grading run (grader ready, write gated).

## Scope guardrails for this sprint
Additive / UI-only. Never touch `portfolio.json` / crown / settlement / WC Specials / Moonshot / Bank
Builder. Never fabricate odds / model scores / ROI. Real fields only; honestly mark/omit anything without a
data source. All gates (tsc / tests / build) must stay green; money state must remain byte-identical.

_— end Part 1; Part 2 appended after implementation —_

---

# Part 2 — Sprint results

## Completed work (by section)

**S1 · Homer Nukes redesign** (`homer-nukes-board.tsx`, `homer-nukes.ts`, `confidence.ts`)
- Hero: "$20 Daily Homer Parlay" + real date (`Tue, Jun 23`) + real slate size (`11-game slate · 5 legs`) + Stake / Combined odds / Potential return / **Implied win %** + Sportsbook sources + parlay confidence meter.
- Legs: headshot + team logo + **opponent logo** (resolved from the real teams map) + odds pill + **4-tier confidence** (Elite/Strong/Playable/Avoid) + honest per-leg "Shortest HR price in this game · N% implied".
- Historical performance: 7-day / 30-day scaffold (Record / Win % / ROI / Units) showing `—` with an honest "Awaiting settled history — no ROI shown until then." No fabricated ROI.

**S2 · MLB page restructure** (`mlb-flagship-sections.tsx`, `mlb-quick-jump.tsx`, `mlb/page.tsx`)
- Five visually-distinct anchored sections: `#mlb-featured`, `#mlb-homer-nukes`, `#mlb-player-props`, `#mlb-pitcher-props`, `#mlb-game-explorer`.
- Sticky **quick-jump nav** (Featured · Homer Nukes · Player Props · Pitcher Props · Games) with smooth-scroll + IntersectionObserver scroll-spy; horizontally scrollable on mobile.

**S3 · Props board overhaul** (`props-board.tsx`)
- Sticky controls; **market quick-filter chips** (HR/Hits/Bases/RBI/Runs + Strikeouts/Outs/Earned Runs — only those present in the data render); **removable active-filter chips** with an **active-filter count**; sorts: Highest probability · Best price · Highest confidence · Team · Game.
- Rows (desktop table + native mobile cards): headshot + team logo + **opponent logo** + market % badge + **4-tier confidence badge** + **sportsbook badge**.

**S4 · Game Explorer** (`game-explorer.tsx`)
- Collapsible card per game: team logos (away @ home), first-pitch ET, total props, pitchers-on-board count; expand reveals top featured props + pitcher list. Real data only.
- Weather / park / team records have **no source** in the slate feed → omitted with an in-card honest note; documented blocker (not fabricated).

**S5/S6 · Nav map + visual primitives** (below)

## S5 · Navigation map (verified, no code changes needed)

| Destination | Top nav | Mobile bottom | Command rail (lg+) |
|---|:--:|:--:|:--:|
| Today / Games / Parlay Lab / Build | ✓ | ✓ | ✓ |
| Bank Builder | ✓ ("Bank Builder") | ✓ ("Bank") | ✓ |
| Moonshot / Homer Nukes / Mr. Dub | ✓ | ✓ | ✓ |
| Results | ✓ | — (by design) | ✓ |
| Sports | ✓ | — | — |
| WC Specials / World Cup / MLB / NBA / UFC / Methodology / About | — | — | ✓ |

- **No duplicate tabs** within any surface; **no dead/legacy links** (all hrefs resolve; legacy aliases are redirect-only). Confirmed against PR #581's `navigation-consistency-audit.md`.
- One intentional label variance: "Bank Builder" → "Bank" on mobile (44px tap target). All other labels identical across surfaces.
- The MLB quick-jump is an *in-page* section nav (anchors), distinct from the product navs — no overlap or duplication of destinations.

## S6 · Shared visual primitives created
- **`lib/mlb/confidence.ts`** — one 4-tier confidence system (Elite/Strong/Playable/Avoid + colors/bars) consumed by BOTH the Homer board and the props board, with two honest calibrations (`homerTierFromProb` for HR, `tierFromProb` for favorites-heavy props). Single source of truth for confidence labels/colors.
- **Unified odds pill** (`rounded-[5px]` bordered) and **opponent-logo treatment** reused across Homer legs + props rows + game cards.
- Card radii aligned (sections `rounded-[14px]`, inner cards `rounded-[10px]/[12px]`); badges share the pill shape + `font-mono uppercase` treatment.

## S7 · Responsive QA

| Width | Result |
|---|---|
| 320 | preview clamps viewport to 375 minimum; verified clean at 375 |
| 375 | ✓ no horizontal scroll |
| 390 | ✓ no horizontal scroll |
| 430 | ✓ no horizontal scroll |
| 768 | ✗ 834px doc width — **pre-existing GLOBAL** top-nav overflow (the homepage shows the identical 834px), NOT introduced by MLB. The MLB quick-jump fits (740/768). |
| 1024 | ✓ no horizontal scroll; props table appears (lg breakpoint) |
| 1440 | ✓ no horizontal scroll |

- All **MLB-specific** surfaces (quick-jump, props board, game explorer, homer board) are overflow-clean at every tested width.
- The 768 overflow is the global top nav's full-bleed `-mx-4 sm:-mx-8` + `min-w-max` 11-item strip in the 640–1024 band. **Recommendation (out of MLB scope):** clip horizontal overflow at the app shell / `html,body` globally, then re-QA every route. Not changed here to honor the "additive & safe / never break other products" rule.

## S8 · Performance audit

- `mlb/player-props/<date>.json` raw artifact ≈ **1.0 MB** (1463 props); `home-run-props` ≈ 357 KB. The loader (`loadMlbPropsBoard`) caps to **PER_GROUP = 60 → ~300 props** actually serialized to the page; the board renders ≤ 150 rows and filters client-side. All 300 are needed for filter coverage + game-explorer counts (reducing further would cut functionality).
- `/mlb` First Load JS = **106 KB** (page chunk 7.3 KB) — healthy. The static `/mlb/index.html` is ~2.7 MB, **dominated by the legacy sport-shell** (592 projections + suggested cards + results tabs), not the flagship block. This sprint added only 2 short fields per prop (`opponentAbbr`, `homeAway`) + 11 small game objects — negligible.
- No duplicate network requests introduced; client components use `useMemo` for derived filter/sort state (no unnecessary re-renders). **Recommendation:** consolidate the two-layer MLB IA (flagship block + legacy sport shell) to shed the largest slice of the 2.7 MB — tracked as debt, deferred (structural, beyond a UI-polish pass).

## Remaining blockers / debt
1. **Statcast + park + weather feed** — Homer Score stays Partial Model (0/7); Game Explorer can't show weather/park/records. External dependency.
2. **Homer Nukes settled history** — grader (`mlb-settlement.ts`) ready; history populates after an operator settlement run. Until then the 7d/30d scaffold honestly reads "Awaiting settled history".
3. **768px global top-nav overflow** — pre-existing, global; fix at the app shell with full-site QA.
4. **Two-layer MLB IA** — flagship block + legacy sport-shell overlap; consolidation is the biggest perf + clarity win.
5. **`ODDS_API_KEY` repo secret** — to activate `mlb-daily.yml` production posting (from PR #581).

## Verdict
The MLB flagship experience (Homer Nukes, 5-section IA with sticky quick-jump, overhauled props board, Game Explorer) is **public-ready and overflow-clean on its own surfaces** at all tested widths, with real data only and honest placeholders for every unavailable input. The remaining items are external data dependencies or pre-existing global/structural debt, each documented above.
