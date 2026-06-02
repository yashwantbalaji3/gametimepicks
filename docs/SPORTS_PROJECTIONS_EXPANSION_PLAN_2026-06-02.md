# Sports Projections / Parlays Expansion Plan (2026-06-02)

> **Foundation + plan doc.** **PR A** added a typed sports **capability gate**
> layer + tests + docs (no live behavior change). **PR B** (now implemented)
> wires those gates into the UI: **official Suggested Parlays are single-sport
> only — the "Mixed" pill is removed and mixed cards are filtered out of every
> Suggested section including "All"**; the same filter feeds Home + Bank
> Builder; mixed-sport stays in Build Your Own (modeled sports only). **PR C**
> (now implemented) gates the Build Your Own candidate pool (`getLegPool`) to
> modeled-sport legs only — schedule-only / coming-soon / unknown / missing
> legs can never be selected; mixed NBA+MLB customs stay allowed + untracked.
> Still **no new sport projections, no fake data, no
> optimizer/workflow/generated-data changes.** PR D (one new sport,
> shadow-first) remains approval-gated.

> **PR B + PR C status (implemented):** see §8 (PR B) and §9 (PR C) — DONE.

---

## 1. User goal

Every supported sport should eventually have (1) individual-sport
projections, (2) individual-sport **Suggested Parlays**, and (3)
individual-sport filtering/navigation. **Mixed-sport parlays must exist ONLY
in "Build Your Own" for today — never as official Suggested Parlays.** And
the non-negotiable: **no fabricated projections, odds, schedules, props,
parlays, or results.** A sport without a real data + grading pipeline stays
**schedule-only** or **coming-soon**.

## 2. Current state (audited 2026-06-02, main `e0f3d14`)

- **Modeled (full pipeline):** NBA, MLB only — real projection model
  (`pipeline/score_model.py`, `pipeline/mlb/mlb_model.py`), optimizer
  (`pipeline/parlay_optimizer.py`), grading (`settle_results.py`,
  `pipeline/mlb/settle_mlb_results.py`), and graded results on disk.
- **Schedule-only:** NHL, WNBA, UFC, FIFA/World Cup, IPL (cricket), MLS —
  real attributed schedules, **no** odds/projections/parlays/results.
- **Coming-soon:** EPL — nothing published.
- **Optimizer is sport-agnostic** but **wired to NBA+MLB only**
  (`snapshot_optimizer.py` loads `load_nba_leans` + `load_mlb_leans`; grading
  `_SPORTS = ("nba","mlb","multi","all")`; `settle_results.SUPPORTED_MARKETS
  = ("PTS","REB","AST")`). **No unsupported-sport data leak** exists at the
  pipeline level (cricket boards are game-level only, never enter the
  optimizer; cricket is unwired from the UI per PR #113).
- **Mixed-sport IS currently surfaced as official Suggested Parlays.** The
  data model carries a `"multi"` bucket and the Parlay Lab builder shows a
  **"Mixed" sport pill** (`ALL_SPORTS` includes `{key:"multi",label:"Mixed"}`)
  backed by `publicRiskSections.multi`. **This conflicts with the user rule**
  (mixed should be Build-Your-Own only). See §7/§8 — fixing it is **PR B**.

## 3. Readiness checklist — a sport may become "Projections + Parlays" only if ALL are true

1. Real schedule source exists (attributed).
2. Real odds / prop-market source exists.
3. Real stat / projection inputs exist (game logs etc.).
4. A projection model exists (`projection → P(over) → edge`).
5. Projection outputs are **pregame-safe** (no same-slate leakage).
6. The optimizer can construct **sport-specific** slips for it.
7. A settlement / grading pipeline can grade **all** its published markets.
8. Results can display its settled outcomes correctly.
9. `publicRiskSections` can be generated for it (volume-disciplined).
10. Volume discipline (#241) applies per sport.
11. The UI can filter by that sport.
12. No unsupported sport ever gets a fake card.
13. Docs (`sports-coverage.ts`, `SPORTS_COVERAGE_POLICY.md`, this plan) are
    updated.

If **any** item is missing → the sport stays **schedule-only** (if a real
schedule exists) or **coming-soon** (if not). Promotion is by shipping a real
`pipeline/<sport>/` + flipping its `level` in `sports-coverage.ts` — never by
UI change alone.

## 4. Sport-by-sport feasibility (evidence-based; nothing claimed without real inputs)

| Sport | Schedule | Odds/props | Projection model | Grading | Optimizer-compat | Data on disk | Verdict |
|-------|:--:|:--:|:--:|:--:|:--:|:--:|---------|
| **MLB** | ✅ MLB StatsAPI | ✅ Odds API (4 mkts) | ✅ `mlb_model.py` | ✅ `settle_mlb_results.py` | ✅ | ✅ boards/parlays/results | **Modeled (keep)** |
| **NBA** | ✅ nba_api/ESPN | ✅ Odds API (PTS/REB/AST) | ✅ `score_model.py` | ✅ `settle_results.py` | ✅ | ✅ boards/parlays/results | **Modeled (keep)** |
| **IPL (cricket)** | ✅ ESPN | ✅ Odds API (h2h/totals, **game-level**) | ❌ no player props | ❌ none | ❌ never loaded | game-level boards only | **Schedule-only** (player-prop model + grading needed first) |
| **WNBA** | ✅ ESPN snapshot | ⚠️ in Odds API, **not fetched** | ❌ | ❌ | ❌ | schedule only | **Schedule-only** → best PR-D candidate (closest analog to NBA) |
| **NHL** | ✅ NHL/ESPN | ❌ not fetched | ❌ | ❌ | ❌ | schedule only | **Schedule-only** |
| **UFC** | ✅ ESPN snapshot | ⚠️ in Odds API, not fetched | ❌ (fight model is a different shape) | ❌ | ❌ | schedule only | **Schedule-only** |
| **FIFA/World Cup** | ✅ official 104-match | ❌ | ❌ | ❌ | ❌ | schedule only | **Schedule-only** |
| **MLS** | ✅ ESPN fixtures | ❌ | ❌ | ❌ | ❌ | schedule only | **Schedule-only** |
| **EPL** | ❌ no sourceable fixtures | ❌ | ❌ | ❌ | ❌ | none | **Coming-soon** |

**Conclusion:** No sport beyond NBA/MLB is ready for Projections+Parlays
today. WNBA is the most tractable next candidate (player-prop markets exist in
the Odds API and the NBA model is a close analog), but it still needs a real
model + grader before promotion (PR D, shadow-first).

## 5. Final desired product behavior

- **Projections:** sport tabs for all sports; modeled sports show real
  projections; schedule-only/coming-soon show schedule/coming-soon copy (never
  fake projections); honest empty/clock-gated states; clearly distinguish
  *projections available / schedule only / coming soon / no board yet today*.
- **Suggested Parlays:** **sport-specific** (one section/tab/filter per
  modeled sport); **official suggested are single-sport only — never
  cross-sport**; empty sections show honest copy after #241 volume discipline;
  no padding; no unsupported-sport cards.
- **Build Your Own:** may allow **mixed-sport** for today, **user-directed**,
  clearly labeled **Custom / not an officially tracked Suggested Parlay**;
  combines legs from **modeled sports only**; never schedule-only/coming-soon;
  never fabricated odds/projections; preserves "Custom Builder slips are not
  officially tracked."
- **Bank Builder:** conservative, **paper-only**; no mixed-sport cards unless
  explicitly approved later; prefers single-sport / current qualifying pool;
  never forces a card.
- **Results:** based on saved/generated public slips only; per-sport suggested
  slips trackable only if generated pregame + graded after final; mixed-sport
  Build-Your-Own customs do **not** pollute official public results unless a
  real save/track/grade pipeline exists.
- **Sports & Events:** keep honest schedule-only / coming-soon; on graduation,
  update this page + coverage policy.

## 6. What PR A implemented (this change)

- **`app/src/lib/sport-capabilities.ts`** — a typed capability layer
  **derived from** the canonical `sports-coverage.ts` registry (one source of
  truth). Per sport: `status` (`modeled` / `projections_only` /
  `schedule_only` / `coming_soon`) and flags `hasSchedule`, `hasOdds`,
  `hasProjections`, `hasSuggestedParlays`, `hasBuildYourOwn`, `hasGrading`.
- **Pure gates:** `canShowProjections`, `canShowSuggestedParlays`,
  `canUseInBuildYourOwn`, `canGradeSport` (fail-closed for unknown sports).
- **Mixed-sport rules:** `isOfficialSuggestedParlayAllowed` (single modeled
  sport only) and `isBuildYourOwnParlayAllowed` (mixed OK, but every sport
  must be modeled), plus slip-level helpers and `filterOfficialSuggestedSlips`
  / `filterBuildYourOwnSlips` / `unsupportedSportsInOfficialSections` guards.
- **`app/src/lib/sport-capabilities.test.mjs`** — 16 tests proving: NBA/MLB
  can show projections+parlays; schedule-only + coming-soon cannot; BYO uses
  modeled sports only; **mixed is BYO-only, never official suggested**;
  unsupported/mixed sports can't leak into `publicRiskSections`; the
  capability table stays in sync with `sports-coverage.ts`.
- **Docs:** this plan + canonical-doc updates.

## 7. What PR A did NOT implement (deliberately)

- **No live behavior change.** The Projections page, Parlay Lab Suggested
  spread, Build Your Own, Bank Builder, and Results render exactly as before.
- **The gates are not yet wired into the live surfaces.** They are pure,
  tested helpers ready for PR B/C to consume.
- **The "Mixed" Suggested pill is still present.** Removing mixed from
  official Suggested Parlays is **PR B** (a deliberate UI restructure with its
  own tests), per the rule "report + propose PR B; don't do a large UI rewrite
  in PR A." It is real NBA+MLB data (not a fabrication/unsupported-sport
  leak), so it is sequenced, not hot-fixed.
- **No new sport** was modeled, scheduled differently, or graduated.

## 8. PR B — sport-specific Suggested Parlays — **DONE (2026-06-02)**

**Implemented:**
- Removed the **"Mixed" pill** from the Parlay Lab sport toolbar (`ALL_SPORTS`
  in `parlay-lab-builder.tsx`). Suggested pills are now `All · NBA · MLB`
  (modeled sports present that day).
- Wired `filterOfficialSuggestedSlips` into every Suggested data path: the
  server-bucketed `sportSections` (incl. the **"All"** union bucket), the
  client-side `filtered`/card path, and the team/game/player dropdown source.
  Verified on real mixed slates: 2026-05-28 "All" bucket 14/16 mixed → **0
  mixed after filter**; 2026-05-30 13 mixed → **0 after**.
- Removed the now-misleading "Mixed parlays also available" cross-lane hint
  and the "Show Mixed" empty-section quick action.
- #241 volume discipline still applies (it runs on the now-filtered, official
  single-sport sections); the "Showing N" count derives from the filtered set.
- **Home** preview/featured/Guided and **Bank Builder** pool now use the same
  `filterOfficialSuggestedSlips` (no mixed featured/preview/Builder card; Bank
  Builder still renders its honest empty state, never forced).
- **Results** keeps its historical **Mixed** sport-mix row (real graded
  record) with an added caption that it is a historical/generated record and
  official Suggested is now single-sport. Settlement/grading unchanged.
- Build Your Own unchanged (already modeled-sports-only via the optimizer
  payload; mixed NBA+MLB customs remain allowed + labeled "not officially
  tracked"). Leg-level BYO gating is PR C.

**Not changed:** optimizer, pipeline, workflows, generated data files,
settlement/grading. The pipeline still emits a `multi` bucket internally;
it is simply never surfaced as official Suggested (optionally stop emitting it
in a later pipeline PR).

### Original PR B plan (for reference)

- **UX:** replace the Suggested-mode sport pills `All · NBA · MLB · Mixed`
  with **per-modeled-sport** sections/tabs (NBA, MLB, …) + an "All" view that
  is the **union of single-sport** sections (still no cross-sport card).
  **Remove the "Mixed" pill from Suggested** (it moves to Build Your Own).
- **Data shape:** keep `publicRiskSections` but treat its `multi` bucket as
  **non-official** (not rendered in Suggested). Optionally stop emitting
  `multi` into the public sections in the pipeline (separate, optional).
- **Grouping:** `publicRiskSections` grouped by `{sport}` then risk section;
  the official Suggested view iterates modeled sports and renders each sport's
  Low/Medium/High/Longshot.
- **Volume discipline:** apply #241 caps **per sport** (Low 3 / Med 3 / High 2
  / Longshot 1, total ≤9, exposure caps) so each sport gets honest, capped
  output independently.
- **Empty states:** per-sport honest empty copy ("No NBA suggested parlays
  today …"); no padding; no fallback to a mixed card.
- **Results linkage:** ensure each saved suggested slip carries its single
  `sport` so Results can attribute it; mixed customs never enter official
  results.
- **Enforcement:** wire `filterOfficialSuggestedSlips` at the official
  Suggested boundary; add a test asserting `unsupportedSportsInOfficialSections`
  returns `[]` for the rendered sections.
- **Tests:** Suggested renders single-sport only; Mixed pill absent from
  Suggested; per-sport caps honored; empty states honest.

## 9. PR C — mixed-sport Build Your Own leg-gating — **DONE (2026-06-02)**

**Implemented:**
- Added leg-level gates in `sport-capabilities.ts`: `getLegSport`,
  `canUseLegInBuildYourOwn`, `filterBuildYourOwnLegs`, and the
  `unsupportedSportsInBuildYourOwn` detector.
- Gated the Build Your Own candidate pool at the single chokepoint —
  `getLegPool` in `custom-parlay.ts` now runs `filterBuildYourOwnLegs`, so the
  custom generator AND the manual builder only ever see modeled-sport legs. A
  schedule-only / coming-soon / unknown / missing-sport leg can never be
  selected (fail-closed). Mixed NBA+MLB customs remain permitted.
- Framing unchanged: "Custom · not officially tracked"; mixed customs never
  enter official Results (no save/track/grade pipeline exists).
- **Tests:** BYO allows NBA-only / MLB-only / mixed NBA+MLB; rejects WNBA /
  NHL / EPL / unknown / missing-sport legs; `getLegPool` fixture proves only
  NBA+MLB Over/Under legs survive the pool gate. 617 lib tests pass.

**Not changed:** optimizer, pipeline, workflows, generated data, settlement/
grading. Suggested remains single-sport (PR B); Bank Builder remains
official-only + paper-only; Results unchanged.

### Original PR C plan (for reference)

## 10. PR D plan — one sport at a time modeling pipeline (NOT in this PR; approval-gated)

- Pick **one** sport after the feasibility audit (**WNBA** is the leading
  candidate). Build, in order: schedule+odds ingestion → projection model
  (transparent, like `mlb_model.py`) → **shadow** outputs first → grading
  (`settle_<sport>_results.py`) → Results display → only THEN flip its
  `level` to `full` in `sports-coverage.ts`.
- No fake or incomplete data at any step; shadow/observe before enabling
  public projections/parlays.

## 11. Risks

- **Sequencing risk:** the live "Mixed" Suggested pill remains until PR B —
  documented openly here; it is real NBA+MLB data, not fabrication.
- **Source risk:** no free, reliable player-prop API for several
  schedule-only sports — sourcing is the real blocker, not code.
- **Overfit/quality risk:** new-sport models inherit the calibration caveats
  in `MODEL_AND_OPTIMIZER.md` (#240/#245) — shadow-first is mandatory.
- **Two-source drift:** mitigated — capabilities are **derived from**
  `sports-coverage.ts` and a test asserts they stay in sync.

## 12. No-fabrication policy (restated)

No fabricated projections, odds, schedules, props, parlays, or results. A
sport without a real data+model+grading pipeline stays schedule-only or
coming-soon. Unsupported sports never get picks. Mixed-sport never appears as
an official Suggested Parlay. No performance/hit-rate claims. `audit/policy.json`
is not consumed. #245 recalibration remains shadow-only.

## 12b. Product-quality sprint (supersedes the immediate next step)

New-sport modeling (PR D / §10) is **paused** in favor of a product-quality
sprint driven by user feedback — see
[`PRODUCT_UX_AND_SPORTS_PROJECTION_AUDIT_2026-06-02.md`](./PRODUCT_UX_AND_SPORTS_PROJECTION_AUDIT_2026-06-02.md).
Its 5-PR roadmap (Projection fallback clarity → Suggested empty-section UX →
Build a Parlay redesign → Bank Builder + L10 → WNBA shadow) is the active plan.
WNBA (this doc's PR D) becomes that sprint's PR 5, shadow-first.

## 13. Next decision point

PR A is foundation-only and safe to merge. **Before PR B** (removing the Mixed
Suggested pill + per-sport Suggested UI), operator approval is required. PR C
(mixed BYO) and PR D (WNBA modeling, shadow-first) follow only on explicit
approval, one at a time.

*Plan 2026-06-02. main `e0f3d14`. PR A adds capability gates + tests + docs
only — no live behavior change, no new sport projections, no fabricated data.*
