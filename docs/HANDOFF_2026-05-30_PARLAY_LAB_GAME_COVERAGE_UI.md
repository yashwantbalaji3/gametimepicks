# Handoff — Parlay Lab game-coverage & sitewide usability pass (2026‑05‑30)

**Author:** automated session (Claude)
**Date:** 2026‑05‑30
**Branches merged this cycle:** `fix/parlays-improve-sport-and-game-browsing` → PR #199;
`feat/parlays-game-coverage` → PR #200.
**Main after this cycle:** `96bb00e` (PR #200) on top of `022c224` (PR #199) / `c1ed745` (PR #198).

Scope was a **website‑wide usability + completeness pass**, focused on the Parlay
Lab issue where selecting a sport or game could leave sections empty without a
clear, honest reason. No optimizer behavior, settlement, or data generation was
changed. May‑30 remains the active (unsettled) slate.

---

## 1. What shipped

### PR #199 — `fix(parlays): improve sport and game browsing` (merged)
Suggested‑mode browsing clarity (already documented in the prior handoff, summarized
here for continuity):
- Honest empty‑section copy that names *why* a section is empty (single‑game NBA
  cap, sport filter starved the pool) and points at a real alternative lane only
  when that lane actually carries the section.
- Per‑section quick‑action buttons ("Show Mixed with this game" / "Show All for
  this game" / "Clear game filter" / "Clear sport filter"), rendered only when the
  target lane has content (`buildSectionEmptyActions`).
- Filter summary line + cross‑lane hint ("Mixed parlays with NBA legs are also
  available…").

### PR #200 — `fix(parlays): populate Mixed‑tab filters, curate dropdown sources by section` (merged)
Two display‑only fixes in `app/src/lib/parlay-suggested.ts` +
`app/src/components/parlay-lab-builder.tsx`:

1. **Curated dropdown sources.** The Team / Game / Player dropdowns were sourced
   from the raw optimizer pool, which carries slips for games that never made the
   curated top‑N‑per‑section cut. Selecting one of those "ghost" games rendered
   four empty risk‑section boxes. New `browsablePool` memo + `flattenSectionSlips`
   helper derive the dropdowns from the slips that **actually render** in
   `publicRiskSections.<sport>`, with a raw‑pool fallback for legacy snapshots.
   Every offered option now lands on real content.

2. **Mixed‑tab fix.** The dropdown helpers guarded on
   `slipContainsSport(slip, "multi")`, which is **always false** (no leg is ever
   sport `"multi"`), so the Mixed tab's dropdowns showed only the "All …"
   placeholder. New shared `slipMatchesSportTab` predicate mirrors
   `filterSlipsBySportTeamPlayer`: `"multi"` = slip carries ≥2 sports;
   `"nba"/"mlb"` = single‑sport of that sport; `"all"` = no filter. This also stops
   the NBA/MLB tabs from offering options drawn from Mixed slips that the filter
   would then exclude.

**Tests:** `app/src/lib/parlay-suggested.test.mjs` gained a regression test proving
Mixed‑tab dropdowns populate and single‑sport tabs exclude multi‑only options.
Full lib suite: **562 pass**. `tsc --noEmit` clean. `npm run build` succeeds.

---

## 2. Verification (May‑30 slate, dev server)

### Parlay Lab — Suggested mode dropdown coverage (game picker)
Browser‑verified the game dropdown count now matches rendered section coverage:

| Sport tab | Games offered | Matches lane coverage |
|-----------|---------------|-----------------------|
| All       | 7             | ✓ |
| NBA       | 1 (OKC vs SAS)| ✓ (single NBA game) |
| MLB       | 10            | ✓ |
| **Mixed** | **8**         | ✓ (was **1 — broken** before #200) |

### Suggested‑mode section population (`publicRiskSections`, May‑30)
```
          all  nba  mlb  multi
low        4    4    4    4
medium     4    0    4    4
high       4    0    4    4
longshot   4    0    4    4
```
NBA medium/high/longshot are honestly empty: a single‑game NBA slate
(SAS @ OKC) can only yield 2‑leg Low slips under the same‑game cap. The empty
states explain this and offer the Mixed‑with‑this‑game / All quick actions.

### Bank Builder (May‑30, active)
- Daily Builder Pick drawn from the published May‑30 pool, **2‑leg MLB**, combined
  **+136** (inside the +100…+140 ideal band), $100 paper stake → ~$236.
- Pending, with honest "results update after games finish — never edited after
  games start" copy; loss‑reset to $100 base always shown.
- No regression → no Bank Builder fix needed.

### Build My Card tray
- Clicking "Add to my card" toggles the card to "✓ Added to my card" and the
  MY CARD tray reflects the selection (stake input + projected payout). Works.

### Results / settlement integrity
- May‑30 is **absent** from `graded/` and `optimizer-graded/` (latest settled =
  May‑29). Results correctly treats May‑30 as active/pending. **No May‑30
  settlement performed.**

---

## 3. Sitewide review (Phase 6)

All 7 primary routes render full content and return 200: `/`, `/parlay-lab`,
`/results`, `/projections`, `/bank-builder`, `/events`, `/about`.

- **Nav** (`components/nav.tsx`): all 7 routes linked; honest active‑state logic
  (Projections lights up on legacy `/nba`, `/mlb`, `/world-cup`, … routes; Parlay
  Lab on `/<sport>/parlays`; About on methodology / responsible‑use / model‑audit).
  Desktop single‑row + mobile scroll strip + bottom nav. Comprehensive — no gap.
- **Home**: live ticker (May‑29 graded results, 95 NBA projections, MLB board
  active), CTAs to every section. No May‑30 leak.
- **Events**: compliant schedule‑only hub (WNBA / UFC / FIFA, "NO ODDS · NO
  PROJECTIONS"). No projections/parlays/grading — matches the schedule‑only rule.
- **About**: complete explainer with working links to methodology, responsible‑use,
  model‑audit.

**Banned‑copy compliance scan (repo‑wide, user‑facing src):** clean. Every match
is either the guardrail word‑list itself (`lib/market-ticker.ts`), a code comment
documenting the rule, or a user‑facing **negation** ("No locks, no guarantees",
"never sold as a sure thing", "no card is graded as a sure thing"). No hype copy.

**Conclusion:** site is mature and complete; **no `fix(ui)` PR was warranted.**

---

## 4. Risk‑quality shadow (Phase 7 — observational only)

Inert calibration check computed from the two most recent fully‑graded slates that
carry `publicRiskSections` (May‑28 + May‑29), deduped by `slipId` per slate,
`decisiveHit = win / (win + loss)`, pending excluded. **Not** fed back into the
May‑30 optimizer; no code wired.

```
          n   win loss pend  decisiveHit (decisive n)
low       18   5   10   3    33%  (15)
medium    12   1    7   4    13%  (8)
high      12   0   10   2     0%  (10)
longshot  12   0   11   1     0%  (11)
OVERALL decisive: 6W / 38L = 14% over 44 slips
```

**Reading (honest):**
- The risk taxonomy is **directionally calibrated** — decisive hit rate decreases
  monotonically Low → Medium → High ≈ Longshot, the expected ordering.
- Absolute rates are low and this is a **2‑slate cold stretch** (14% overall). The
  sample (44 decisive slips) is **too small to assert calibration vs. implied
  probability** — treat as a watch signal, not a conclusion. Do **not** act on it
  to change May‑30.
- May‑27 is legacy (no `publicRiskSections`) and contributes nothing here.

---

## 5. Follow‑ups (not done — deliberate)

1. **Optimizer game‑coverage diversification (deferred).** Phase 3 considered a
   Python‑side change to `generate_public_risk_sections` to spread curated slips
   across more games (4 "ghost" games — KC·TEX, ATL·CIN, HOU·MIL, BOS·CLE — have
   qualified candidate slips but lost the top‑N‑per‑section cut; HOU·MIL has a
   medium‑section candidate scoring ~1.05). This is a **selection‑concentration**
   trait, not a data gap. Per the runbook ("if implementation risky, don't change
   the optimizer; document"), the safe display‑only dropdown fix was shipped
   instead. If you later want ≥1 card per qualified game, gently diversify in the
   generator using **only** qualified `legPool` legs, preserving the section
   odds/leg bands and the no‑duplicate‑player rule, add tests, and regenerate the
   May‑30 optimizer **only** while it is still pregame.

2. **Risk‑quality sample size.** Re‑run the §4 shadow once 3–4+ graded slates carry
   `publicRiskSections` to get a sample worth calibrating against. Keep it inert
   until there's an explicit operator decision to wire results into the optimizer.

---

## 6. Guardrails honored this cycle

- No May‑30 settlement; no use of any final result to alter same‑slate pregame
  suggestions.
- No fabricated parlays/odds/stats/schedules/hit rates/learning signals; every
  number above is computed from committed data.
- Display‑only changes; optimizer, settlement, era filter, and audit policy
  untouched.
- No banned copy; no sportsbook scraping/links/branding; Events stayed
  schedule‑only; Bank Builder stayed paper‑trading/educational.
- Only deliverable files staged per PR; ~52 untracked root working notes left
  untracked.

---

## 7. Key files

- `app/src/lib/parlay-suggested.ts` — `flattenSectionSlips`, `slipMatchesSportTab`,
  `buildSectionEmptyActions`, and the three `getAvailable*FromSlips` dropdown
  sources.
- `app/src/components/parlay-lab-builder.tsx` — `browsablePool` memo,
  `sectionAlternatives`, `crossLaneHint`, `handleEmptyAction`.
- `app/src/components/risk-section-spread.tsx` — section empty states + quick
  actions.
- `app/src/lib/parlay-suggested.test.mjs` — 562 passing lib tests.
- Data (unchanged): `app/public/data/parlays/optimizer/2026-05-30.json`.
