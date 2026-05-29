# Parlay Lab — Bank Builder + Build My Card Design Audit

**Date:** 2026-05-30
**Author:** Claude (Opus) — design + audit pass, docs-only
**Base SHA:** `d0500c5` (origin/main at time of writing)
**Status:** Design proposal. **No product code is associated with this
document.** It audits the real code on `main` and specs two new
paper-trading surfaces (Build My Card + Bank Builder) plus the PR
sequence to ship them. Get sign-off before any implementation PR lands.

> Companion to `docs/PARLAY_LAB_DESIGN_OPTIONS_2026-05-28.md` (layout
> direction) and the `HANDOFF_2026-05-29_GAMETIMEPICKS_UI_RESULTS_BANK_BUILDER.md`
> at the repo root (§8 product ideas, §6 hard rules). Where the two
> disagree, the handoff's §6 hard rules win.

---

## 0. Why this document exists

The user wants two new framings on top of the existing Parlay Lab:

1. **Build My Card** — let users hand-pick specific suggested parlays,
   enter a bankroll, and allocate **only across the slips they picked**
   (today's Bankroll Plan auto-allocates across *every* eligible slip).
2. **Bank Builder** — an educational $100 → $3,000 ladder, one Daily
   Builder Pick per step, that visibly **resets to $100 on a loss** and
   is screenshot-friendly for X / Reddit.

Both are **paper-trading / educational** framings. No real money, no
affiliate links, no tip-service language. This doc grounds the design in
the actual files so the implementation PRs don't drift.

Everything below maps to code that exists today. File paths are relative
to the repo root; component paths omit the `app/src/` prefix where the
existing handoff does.

---

## 1. Current Parlay Lab audit

### 1.1 Page entry + data flow

`app/src/app/parlay-lab/page.tsx` is a **server component**. It:

- Resolves `today = currentEtDate()`.
- Loads the legacy suggested snapshot (`getSuggestedParlaysForDate`) and
  the optimizer snapshot with a 3-step fallback chain
  (`getOptimizerSnapshotForDate(today)` → `getLatestOptimizerSnapshot()`
  → `getOptimizerSnapshotForDate(suggested.date)`).
- Computes `activeDate`, `isFallback`, per-sport slip counts, and two
  mutually-exclusive status flags:
  - `isActiveSettled` — active date has a graded optimizer file with
    ≥1 unique slip → renders a "Settled · view on Results" chip.
  - `isActivePregame` — active date has a pregame snapshot but no graded
    file yet → renders the **Pregame chip**: "Results update after games
    finish." + "View latest settled →".
- Hands `suggested.slips`, `activeDate`, `source`, `calibrationTable`,
  and `optimizerPayload` to the single client orchestrator
  `ParlayLabBuilder`.

There is no API route involved — slips come from static JSON on disk via
server loaders. This matters for §4: **selection and allocation can be
100% client-side** because the slip pool is already fully materialized in
the page payload.

### 1.2 Modes

`app/src/components/parlay-lab-mode-tabs.tsx` defines the three modes;
the active mode is `useState<ParlayLabMode>("suggested")` inside
`parlay-lab-builder.tsx`:

| Mode key    | Label          | Sub-copy                          | Renders                                   |
| ----------- | -------------- | --------------------------------- | ----------------------------------------- |
| `suggested` | Suggested      | Model-ranked lane spreads         | `RiskSectionSpread` (Low/Med/High/Longshot) |
| `build`     | Build Your Own | Custom slips · not officially tracked | `CustomParlayGenerator` + `CustomParlayBuilder` |
| `bankroll`  | Bankroll Plan  | Educational allocation planner    | `BankrollPlanPanel`                       |

Filters (sport / team / player toolbar, `LabFilters`) render above every
mode **except** `build`. Suggested and Bankroll share the same filtered
pool; Build Your Own runs against the full optimizer snapshot.

### 1.3 Bankroll Plan behavior (the thing being redesigned)

`app/src/components/bankroll-plan-panel.tsx` + the pure allocator
`app/src/lib/bankroll-allocation.ts`.

**Inputs:** bankroll (USD, default `$50`), risk preference
(`lower-variance` · `balanced` · `growth`), Include Swing toggle, Max
slips (`3 / 5 / 8`).

**Pool it allocates over:** in `parlay-lab-builder.tsx`,
`bankrollPoolSlips = filtered.filter(isAllowedOfficialSlip)` — i.e.
**every eligible official slip for the active sport filter**, with the
safe-lane visibility cap removed. The user cannot narrow this to a
hand-picked subset. **This is the core limitation Build My Card fixes.**

**Allocation math (`allocateBankroll`):**
1. Filter out `aggressive` unless Include Swing is on.
2. Group by lane in canonical order
   `conservative → balanced → star_power → aggressive`.
3. Round-robin pick across lanes up to `maxSlips`.
4. Per-lane weights = `DEFAULT_LANE_WEIGHTS × RISK_MULTIPLIERS[pref]`,
   renormalized over the lanes that actually got a slip.
5. Whole-dollar stakes, floored to `minPerSlip` ($1); trims the largest
   stakes a dollar at a time if rounding overshoots; drops tail slips if
   everyone is at the floor; redistributes leftover dollars to the
   highest-weight lanes. Invariants: `totalAllocated ≤ bankroll`,
   `reserve ≥ 0`, no negative stake.
6. Per-slip payout via `projectedPayoutForStake`; **null when any leg
   lacks `oddsForSide`** → renders "—", never a fabricated dollar figure.

**Output:** one `AllocationRow` per slip (risk-section chip, leg count,
combined odds, **editable** stake input, projected payout) + a
`PlanSummary` footer (bankroll · total allocated · reserve · total
potential payout). Per-slip stake edits are kept in a `stakeOverrides`
map keyed by `slipId` so re-allocation doesn't wipe edits.

**Honesty already in place:** `PlanIntro` frames it as "Educational
planning aid… Not financial advice." No banned copy, no "safe"/"safety",
no "guaranteed."

### 1.4 Suggested Parlays card structure

`app/src/components/parlay-ticket-card.tsx` renders a single `ParlaySlip`:

- **Header:** left = risk-section chip (`Low/Medium/High/Longshot` from
  `classifyRiskSection(combinedAmericanOddsFromLegs(legs))`) with an
  optional `· single-game` / `· same-game` suffix; right =
  `CombinedOddsPill` (the largest number on the card). Graded slips
  replace the odds pill with a status pill (Slip hit / missed / push /
  void).
- **Optional chip row:** slate-date chip, origin chip
  (Official / Custom / Replay), sport-bucket chip — omitted on the lane
  spread (the section header carries that context once).
- **Legs:** `TicketLegRow` per leg — avatar, team logo, star badge,
  player name, matchup, right-aligned per-leg American odds (or graded
  result), then market + side/line + book + game time + an optional
  "Form →" affordance when `onLegClick` is provided.
- **Footer (`showStakeFooter`):** editable Stake (USD, default `$10`) +
  Projected payout ("—" when odds missing).

Key props for §5: `slip`, `savedPregame`, `calibrationTable`,
`onLegClick`, `emphasis` (`featured | alternate`), `showStakeFooter`,
`slateDate`, `origin`, `sportBucketLabel`. **There is no selection
affordance today** — adding one is the bulk of PR 2.

`RiskSectionSpread` (`risk-section-spread.tsx`) lays out four sections
(Low/Med/High/Longshot). It prefers server-bucketed
`publicRiskSections.<section>.<sport>` and falls back to a client-side
`groupSlipsByRiskSection` over the visible slips. Each section renders
`ParlayTicketCard` with `emphasis="featured"` and `showStakeFooter`.

### 1.5 Stake / payout behavior

`app/src/lib/parlay-payout.ts`:
- `DEFAULT_STAKE = 10`, `MIN_STAKE = 1`, `MAX_STAKE = 10_000`.
- `projectedPayoutForStake(legs, stake)` → `{ totalReturn, profit }` or
  `null` (any missing leg odds, or non-positive stake).
- `sanitizeStake(input)` clamps to `[MIN_STAKE, MAX_STAKE]`, returns null
  for unusable input.
- Combined odds for display come from `combinedAmericanOddsFromLegs` in
  `parlay-risk-sections.ts` (decimal product → American), which returns
  null if any leg's `oddsForSide` is missing.

**These helpers are the single source of truth for money math. Build My
Card and Bank Builder reuse them verbatim — no new payout formula.**

### 1.6 Public risk sections

`app/src/lib/parlay-risk-sections.ts` is the source of truth:

| Section   | Combined American odds | Legs      |
| --------- | ---------------------- | --------- |
| Low       | under +300             | 2–3       |
| Medium    | +300 to +599           | 3–4       |
| High      | +600 to +999           | 4–5       |
| Longshot  | +1000 and up           | 5–6       |

`classifySlipBySection(odds, legCount)` returns a section **only when
BOTH odds AND leg count fall in range** (else null → excluded from public
display). `classifyOddsSection` is the odds-only intermediate;
`classifyRiskSection` is the back-compat odds-only shim used for the
per-card chip. `RISK_SECTION_ORDER = [low, medium, high, longshot]`.

The pipeline mirror is `generate_public_risk_sections` in
`pipeline/parlay_optimizer.py` (writes `publicRiskSections` into the
snapshot under the strict both-must-match rule, one bucket per
section×sport, diversity-selected).

### 1.7 Slip data shape

Defined in `app/src/lib/parlay-suggested.ts` (client-safe, no `fs`):

- `ParlaySlip`: `slipId` (stable string id — **the selection key**),
  `riskProfile` (`conservative|balanced|aggressive|star_power`), `sport`
  (`nba|mlb|multi`), `status` (`pending|win|loss|push|void`), `legs[]`,
  `score`, `sameGame`, `hasAnomalyLeg`, `singleGame?`.
- `ParlayLeg`: `sport`, `playerName`, `team`, `opponent`, `market`,
  `marketLabel?`, `side`, `line`, `projection`, `edgePct`, `confidence`,
  `bookmaker`, `oddsForSide` (nullable), star metadata, game-time fields.

`OptimizerSlip` (`parlay-optimizer.ts`) is the snapshot-native shape;
`optimizerSlipToParlaySlip(slip, date)` is the lossless adapter the
builder already uses to render optimizer slips through `ParlayTicketCard`.

### 1.8 What is needed for selectable slips

Everything required already exists except the selection layer:

- ✅ **Stable id:** `slip.slipId` (deterministic from the pipeline).
- ✅ **Money math:** `projectedPayoutForStake`, `combinedAmericanOddsFromLegs`.
- ✅ **Null-odds discipline:** payout/odds return null → render "—".
- ✅ **Section classification:** `classifySlipBySection`.
- ❌ **Selection state** — a small client context holding a `Set<slipId>`
  + the resolved `ParlaySlip[]` (new).
- ❌ **A selection affordance on `ParlayTicketCard`** — opt-in prop, see
  PR 2 (new).
- ❌ **A "My Card" tray** showing selected slips + count + "Build
  allocation" CTA (new).
- ❌ **A selection-driven allocator** that splits a bankroll across an
  *arbitrary hand-picked list* (today's `allocateBankroll` is lane-shaped
  and pool-driven; PR 3 adds even-weight + confidence-weight modes).

---

## 2. Build My Card spec

### 2.1 Concept

On the Suggested tab, each `ParlayTicketCard` gains a subtle, opt-in
"Add to my card" toggle. Selected slips collect into a sticky **Selected
Slips** tray. The user enters a paper bankroll and the allocator
distributes it **only across the selected slips** — never the whole pool.
Selection is **local/ephemeral** (no auth, no persistence on day one).

### 2.2 Selection model

- Source of truth: a `Set<slipId>` in a client context
  (`BuildMyCardProvider`), plus a `Map<slipId, ParlaySlip>` so the tray
  can render selected slips even after filters change the visible pool.
- The toggle is **opt-in via a new `ParlayTicketCard` prop** (e.g.
  `selectable?: boolean; selected?: boolean; onToggleSelect?(slipId)`).
  When the prop is absent the card renders exactly as today (Results,
  homepage, Build Your Own are unaffected).
- **Never auto-select.** The user picks every slip explicitly.

### 2.3 Selected Slips tray

- Appears only once ≥1 slip is selected (`My Card (N)` pill / sticky bar).
- Lists each selected slip compactly: risk-section chip, leg count,
  combined odds, remove (×). Shows a running count and combined exposure.
- Primary CTA: **Build allocation** → opens the allocator panel (PR 3).
- Secondary: **Clear selection**.
- **Pending/odds-aware:** if a selected slip is `pending`, the tray shows
  a small "pending" tag (it still counts as a selection but the
  allocator handles it per §2.6). If a slip's combined odds are null
  (missing leg price), the tray shows "—" and the allocator excludes it
  with a visible reason.

### 2.4 Bankroll input + allocation

- Bankroll input mirrors `BankrollInput` from `bankroll-plan-panel.tsx`
  (USD, `sanitizeStake`, `MIN_STAKE`/`MAX_STAKE` bounds).
- Two allocation modes (PR 3):
  - **Even weight** — bankroll split equally across N selected slips,
    whole-dollar, remainder to the first slips (deterministic order by
    selection order or slipId).
  - **Confidence weight** — weight each slip by its optimizer `score`
    (already on the slip), normalized over the selected set. Falls back
    to even weight if scores are missing/equal.
- Output reuses the existing `AllocationRow` look: section chip, legs,
  combined odds, editable stake, projected payout, and a summary footer
  (bankroll · total allocated · reserve · total potential payout). Same
  invariants as `allocateBankroll` (`total ≤ bankroll`, `reserve ≥ 0`).

### 2.5 Prose wireframes

**Mobile (≤ 640px):**

```
┌─────────────────────────────────────┐
│ [Suggested] [Build Your Own] [Bankroll]│   ← mode tabs (scroll)
│ All · NBA · MLB · Mixed   [filters]   │
├─────────────────────────────────────┤
│  LOW RISK · 2–3 legs · under +300     │
│  ┌───────────────────────────────┐    │
│  │ ◔ Low Risk            +245    │    │
│  │ Player · market side line  +110│    │
│  │ Player · market side line  +120│    │
│  │ [ + Add to my card ]           │    │  ← new opt-in toggle
│  └───────────────────────────────┘    │
│  …more sections…                       │
├─────────────────────────────────────┤
│ ▲ My Card (3)              Build → │   │  ← sticky bottom tray
└─────────────────────────────────────┘
   tap tray → expands to selected list +
   paper-bankroll input + allocation
```

**Desktop (≥ lg):**

```
┌───────────────────────────────────────────────┬───────────────┐
│ Suggested sections (2-col card grid)            │  MY CARD       │
│  ┌─────────────┐  ┌─────────────┐               │  3 selected    │
│  │ Low  +245   │  │ Low  +180   │   [✓ added]   │  • Low  +245 × │
│  │ legs…       │  │ legs…       │               │  • Med +410 × │
│  │ [+ Add]     │  │ [✓ Added]   │               │  • Low  +180 × │
│  └─────────────┘  └─────────────┘               │  Paper bankroll│
│  …                                              │  [ $100      ] │
│                                                 │  ( ) Even      │
│                                                 │  ( ) Confidence│
│                                                 │  [ Build → ]   │
└───────────────────────────────────────────────┴───────────────┘
   right rail is sticky; on < lg it collapses to the bottom tray
```

### 2.6 Allocation rules

- Allocate **only** across selected slips. Never include unselected pool
  slips.
- Drop from the allocator (with a visible reason) any selected slip that:
  - has **graded** mid-session (`status !== "pending"`) → "already
    settled" — and never count it as a win/loss in this educational view.
  - has **null combined odds** (missing leg price) → "no price available."
- A `pending` slip is allocatable (it's a pregame plan); the tray and
  allocator surface "pending" honestly — never imply it is locked in.
- Whole-dollar stakes; `totalAllocated ≤ bankroll`; `reserve ≥ 0`.
- Payouts via `projectedPayoutForStake` only — "—" when null.

### 2.7 Empty states

- **No selection:** tray hidden; a one-line hint under the sections
  ("Add slips to build a card and split a paper bankroll across them").
- **Bankroll ≤ 0:** allocator shows "Enter a paper bankroll above."
- **All selected slips dropped** (settled/no-price): allocator shows
  "None of your selected slips can be allocated right now" + per-slip
  reasons. No fabricated fallback.

### 2.8 Null-odds behavior

Identical to the existing card/allocator: combined odds null →
chip/odds/payout render "—"; the slip is excluded from allocation with a
reason. We never invent a price to make a card allocatable.

### 2.9 Educational framing

Reuse `PlanIntro`'s framing: "Educational planning aid… paper bankroll…
Not financial advice." The tray and allocator say **Paper bankroll** and
**Selected Slips** — never "lock," never "safe."

---

## 3. Bank Builder spec

### 3.1 Name + concept

**Bank Builder** — an educational paper-trading **ladder** that starts
at a $100 paper bankroll and climbs through five steps. One **Daily
Builder Pick** per step. On a loss the ladder **visibly resets to $100**.
It is a *learning tool / demonstration*, never a tip service.

### 3.2 Ladder

| Step | Start  | Goal   | Multiplier |
| ---- | ------ | ------ | ---------- |
| 1    | $100   | $200   | 2.000×     |
| 2    | $200   | $400   | 2.000×     |
| 3    | $400   | $800   | 2.000×     |
| 4    | $800   | $1,600 | 2.000×     |
| 5    | $1,600 | $3,000 | 1.875×     |

The multiplier is the **target combined decimal odds** the step's pick
must clear (e.g. step 1 needs combined decimal ≥ 2.00, i.e. ≈ +100
American). Picks come from the **same** publicRiskSections / Suggested
pool that powers `/parlay-lab`, filtered to one slip per step that meets
the step's multiplier target — no new slip generation.

### 3.3 Visual

- A vertical **tower / thermometer** filling **bottom → top**, one
  segment per step ($100 at the base, $3,000 at the crown).
- Each segment shows its start → goal and, once resolved, a hit (filled)
  or a reset marker.
- **Animated fill** as steps complete (CSS transition / Framer-style; no
  data fetch). Respect `prefers-reduced-motion` (instant fill, no
  animation).
- **Reset on loss:** the tower drains back to the base with an explicit
  honest marker: **"Reset after loss — Bet N lost."** The loss is never
  hidden or quietly restarted.

### 3.4 Daily Builder Pick

- "Daily Builder Pick" / "Today's Builder Slip" — one slip per active
  step, chosen by a documented heuristic (default: the
  highest-confidence Low/Medium-section slip whose combined decimal odds
  meet the step's multiplier target). Published **before games start**;
  graded on the existing nightly pipeline.
- Show the **pregame** odds and side. Never edit them retroactively.

### 3.5 Social screenshot / share concept

- A dedicated share-card layout (clean tower + step ladder + honest
  disclaimer footer) sized for X / Reddit. Screenshot-friendly,
  high-contrast, no clipped chips.
- OG image for `/bank-builder` (PR 5). Share card always carries the
  "Educational only… we do not take real money" line so a screenshot
  can't strip the framing.

### 3.6 Honesty rules (critical)

- Framed as educational paper-trading. **No** "guaranteed," "lock,"
  "sure thing," "risk-free." Avoid "safe"/"safety."
- Disclaimer **top + bottom**: "Educational only. Past results do not
  predict future outcomes. We do not take real money."
- On loss: ladder **resets to $100** with a visible "Reset — Bet N lost."
- Never show a Bank Builder hit rate higher than the settled JSON
  supports. Reuse the published graded record; no separate tally.
- Builder picks come from the **same slip pool** and the same risk-section
  gates (§1.6) — Bank Builder is a *filter + presentation*, not a new
  model.

### 3.7 Approved naming

"Bank Builder," "Daily Builder Pick," "Today's Builder Slip," "Builder
Card," "Model Builder Pick," "Ladder reset," "Paper bankroll."

---

## 4. Data + architecture plan

### 4.1 Client-only first

- **Build My Card selection** is ephemeral client state (React context).
  No persistence, no auth on day one. The slip pool is already in the
  page payload, so selection + allocation need zero new fetches.
- **Bank Builder prototype** is read-only and derives entirely from the
  already-published optimizer snapshot + graded JSON. The ladder's
  *current step* and *reset history* are computed from settled results,
  not stored.

### 4.2 What needs persistence later (explicitly deferred)

- Saving a user's card across sessions (would need localStorage first,
  then accounts — **out of scope**, see §6).
- A durable Bank Builder ladder history independent of the graded JSON.
  Day one derives history from the existing settled record; a dedicated
  store is a later, separately-approved step.

### 4.3 Reuse optimizer / publicRiskSections

- Builder picks and selectable cards come from the **existing**
  `optimizerPayload.publicRiskSections` (preferred) and the Suggested
  pool the builder already materializes — via `optimizerSlipToParlaySlip`.
- Section classification stays in `parlay-risk-sections.ts`
  (`classifySlipBySection`). The Bank Builder pick helper lives in
  `app/src/lib/parlay-suggested.ts` (per the handoff §10) and filters the
  existing pool to one slip per step. **No optimizer behavior change.**

### 4.4 Reuse existing grader / results JSON

- Grading already happens in `pipeline/grade_optimizer.py`.
  `grade_optimizer_payload` grades bucket slips **and** the
  `publicRiskSections` slips (sharing a `seen` dedupe), and writes
  `uniqueSlips`. `update_summary()` rebuilds `optimizer-summary.json`
  with `byPublicSection` + `bySportBucket`.
- Because Bank Builder picks are drawn from slips that **already exist**
  in the published snapshot (same `slipId`), they are graded for free by
  the same pipeline. The UI reads results through
  `app/src/lib/parlay-results.ts` (`getOptimizerGradedForDate`,
  `getOptimizerSummary`).

### 4.5 Avoid parallel grading

- **Hard architectural rule:** Bank Builder must reference slips by
  `slipId` from the same published snapshot/graded JSON. **Do not** add a
  second grader, a second settled-leans pipeline, or a Bank-Builder-only
  results file. One settled source of truth (handoff §7.6).

### 4.6 Era + settlement guards

- `PUBLIC_PARLAY_RESULTS_START_DATE = 2026-05-27`
  (`app/src/lib/public-parlay-era.ts`). No backfill, no era-start change
  in these PRs.
- Never settle a date before games are final. May 29 is **not** settled
  as of this doc — leave it to the nightly pipeline.

---

## 5. Proposed implementation PR sequence

Do these in order. PR 1 is this doc.

- **PR 1 (this doc):** design + audit, docs-only. Get sign-off.
- **PR 2 — Selectable Suggested cards + "Selected Slips" tray.**
  Add opt-in selection props to `parlay-ticket-card.tsx`, a
  `BuildMyCardProvider` client context, and a `my-card-tray.tsx`.
  **Selection state only — no allocator logic.** Mobile + desktop
  snapshot tests. Suggested mode wires it in; Results/homepage untouched.
- **PR 3 — Selected-bankroll allocator.**
  New allocator panel that takes the selected slips + paper bankroll and
  outputs stakes, with **even-weight** and **confidence-weight** modes.
  Reuse `projectedPayoutForStake` + the `AllocationRow`/`PlanSummary`
  look. Unit tests on the allocator math (sum ≤ bankroll, reserve ≥ 0,
  null-odds exclusion, settled-slip drop). Bankroll Plan stays as-is
  (additive, not a replacement).
- **PR 4 — Bank Builder prototype (read-only).**
  New route `/bank-builder`: ladder visual + Today's Builder Slip +
  ladder history. Builder-pick helper in `parlay-suggested.ts` filters
  the existing pool to one slip per step. No new pipeline. Honesty copy +
  top/bottom disclaimers in.
- **PR 5 — Bank Builder visual polish + share mode.**
  Tower animation (reduced-motion aware), share-card layout, OG image for
  `/bank-builder`. No new data. Mobile-first.
- **PR 6 — Docs + methodology + results integration.**
  Update `methodology-card.tsx`, add `docs/BANK_BUILDER_RULES.md`, and
  add Bank Builder columns to `/results` **only if** a full ladder has
  settled in the public era.

After PR 6: re-verify hard rules + learning signals before more product
work.

---

## 6. Non-goals (what these PRs will NOT do)

- **No real-money betting / advice.** Paper bankroll only.
- **No account system / login** (and no cross-session persistence in
  PR 1–6; localStorage at most, and only if explicitly approved).
- **No fabricated historical ladder.** Bank Builder history derives from
  the real settled JSON; no invented past runs, no pre-era leak.
- **No "guaranteed growth"** framing or implied certainty of payout.
- **No optimizer-policy consumption.** Audit policy stays out of the
  optimizer unless separately approved/tested.
- **No new sport activation** (cricket stays gone; WNBA / IPL stay
  paused).
- **No May 29 settlement before games are final.** No manual grading.
- **No parallel grader** or Bank-Builder-only results pipeline (§4.5).
- **No FanDuel / DraftKings UI / branding / flow clone; no fake
  sportsbook links; no scraping.**

---

## 7. Copy bank

**Approved (use these):**
Bank Builder · Build My Card · Selected Slips · Daily Builder Pick ·
Today's Builder Slip · Builder Card · Model Builder Pick · Paper
bankroll · Educational challenge · Reset after loss · Ladder reset ·
Results update after games finish.

**Banned (never in user-facing copy):**
lock · guaranteed · free money · risk-free · can't miss · cant miss ·
easy win · easy money · no-brainer · no brainer · sure thing · sharp
money. **Also avoid** "safe" / "safety."

> The word **"lock"** is specifically banned for Bank Builder — use
> "Daily Builder Pick" / "Today's Builder Slip" / "Builder Card" /
> "Model Builder Pick" instead.

---

## 8. Verification checklist (for each implementation PR)

Functional / honesty:
- [ ] No banned copy in rendered output (`lock`, `guaranteed`, `free
  money`, `risk-free`, `can't miss`, `easy win`, `easy money`,
  `no-brainer`, `sure thing`, `sharp money`); no "safe"/"safety."
- [ ] No May 26 replay restored; no pre-era (5/25, 5/26) hit-rate leak.
- [ ] No cricket; WNBA / IPL stay paused.
- [ ] No fabricated odds, payouts, sides, stats, or ladder history —
  null odds render "—".
- [ ] No real-money advice; paper-bankroll framing + disclaimers present.
- [ ] No optimizer behavior change; no settlement triggered; no parallel
  grader.
- [ ] Bank Builder reads results only from the existing graded JSON;
  reset-on-loss visible and honest.

Acceptance criteria (UI):
- [ ] **Mobile (375px):** mode tabs scroll; Selected Slips tray docks to
  the bottom and is tappable; Bank Builder tower renders bottom→top
  without clipped chips; share card fits without horizontal scroll.
- [ ] **Desktop (≥ lg):** My Card rail is sticky; allocator summary sums
  correctly (`total ≤ bankroll`, `reserve ≥ 0`); tower animation respects
  `prefers-reduced-motion`.
- [ ] Selecting/deselecting a slip updates the tray count and the
  allocator pool; deselect removes it from allocation.
- [ ] A `pending` selected slip shows "pending"; a settled one is dropped
  with "already settled"; a null-odds one is dropped with "no price."

Process:
- [ ] `cd app && npm test` green (esp. `lib/learning-signals.test.mjs`
  honesty locks and any new allocator unit tests).
- [ ] `pytest pipeline/tests` green (no pipeline change expected in
  PR 2–5).
- [ ] Production hard-rule scan clean after merge.

---

## 9. Open questions for the user (resolve before PR 2)

1. **Persistence:** OK to keep Build My Card selection purely in-memory
   for PR 2 (lost on refresh), or do you want localStorage from the
   start?
2. **Bank Builder step heuristic:** confirm "highest-confidence
   Low/Medium-section slip meeting the step multiplier" as the default
   pick rule, or specify another.
3. **Bankroll Plan fate:** keep the existing pool-driven Bankroll Plan as
   a parallel mode indefinitely, or retire it once Build My Card is
   solid?
4. **`/bank-builder` placement:** standalone route (assumed) vs a fourth
   Parlay Lab mode tab?

---

End of design audit.
