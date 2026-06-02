# Product UX & Sports-Projection Audit (2026-06-02)

> **Audit / docs-first.** This document is the structured product, data, UX,
> and trust audit behind the next product-quality sprint. **It changes no
> product behavior.** It adds two offline, read-only analysis scripts
> (`scripts/shadow-l10-audit.mjs`, `scripts/audit-suggested-section-funnel.mjs`)
> and this report. **No fabricated data; no new sport promoted; no Bank Builder
> L10 wiring; #245 recalibration stays shadow-only; no workflow/optimizer/
> generated-data changes.**

---

## 1. Executive summary

Four pieces of user feedback were each traced to a concrete, evidence-backed
root cause:

1. **Projections shows only the June-3 props-only NBA shell, not June-2/June-1
   MLB.** Root cause is **code, not data**: `buildProjectionsPayload` renders
   **today + future dates only** and drops historical slates, so the real
   actionable MLB slate (June-1, 330 actionable leans) is filtered out, June-2
   has no board (the 9:30 ET run never fired), and the only forward date with
   leans is a **props-only future shell** (June-3, 80 legs, all
   `insufficient_data`). The "80 projections" label counts non-actionable prop
   lines as projections.
2. **High/Longshot Suggested sections are empty.** This is **honest, not
   broken** — and has **two mechanisms**: on the MLB-only fallback slate
   (June-1) #241 volume discipline + exposure caps empty them; on mixed slates
   PR #247 removes the mixed-sport slips that populated them. The fix is UX
   (make emptiness intentional), not loosening bands or padding.
3. **Build a Parlay is confusing.** Two stacked tools ("Generate for me" +
   manual "Build your own") with overlapping controls, a "Mixed" pill, a
   primary DNP-risk toggle, stale "any sport" copy, and **edgePct/confidence
   surfaced on legs** (which #240 proved non-predictive). Needs a stepped
   Quick-Generate / Manual-Build redesign.
4. **Bank Builder needs strong recent-form (L10) support.** A **shadow L10
   audit** (new, offline) shows L10 is **real, 100%-covered, pregame-safe, and
   weakly predictive (not anti-predictive)** — but the "beyond-market" lift is
   small-n and a hard ≥70–80% all-legs gate starves candidates. Recommend L10
   as a **display badge + soft/configurable preference**, not a hard
   performance gate, pending more data.

The recommended rollout is **5 sequenced PRs**, each approval-gated. No code
ships in this PR beyond the audit scripts.

---

## 2. User feedback being addressed

| # | Feedback | Verdict |
|---|----------|---------|
| 1 | Projections shows only June-3 NBA fallback; no June-2 MLB; wants per-sport | Real bug (fallback/label logic) — PR 1 |
| 2 | Suggested shows only Low/Medium; High/Longshot empty; wants clarity | Honest emptiness, poor UX — PR 2 |
| 3 | Build a Parlay is tangled, needs full revamp | Confirmed — PR 3 |
| 4 | Bank Builder revamp using real L10/recent-form (audited first) | L10 audited (shadow); redesign — PR 4 |

---

## 3. Current product state (main `e7698af`)

- Modeled sports: **NBA + MLB only**. Schedule-only: NHL/WNBA/UFC/FIFA/IPL/MLS.
  Coming-soon: EPL. (PR #246 capability gates; PR #247 single-sport official
  Suggested; PR #248 BYO modeled-only legs.)
- Latest settled slate **2026-06-01**. **June-2 morning-projections never fired**
  (cron 13:30 UTC; as of 17:15 UTC the latest morning-projections run is still
  2026-06-01T19:05 — a recurring GitHub Actions scheduled-delivery drop, not a
  code failure; Actions is enabled — auto-refresh ran 16:41 UTC).
- #241 volume discipline live. #245 recalibration shadow-only (overconfident
  model; does not beat market). `audit/policy.json` unconsumed.

---

## 4. Projection availability audit (feedback #1)

**Data on disk (NBA boards = `boards/`, MLB boards = `mlb/boards/`):**

| Date | Board | Games | Sports | Odds/props | Projections (actionable) | Optimizer | Snapshot | Public sections | UI **should** show |
|------|-------|-------|--------|-----------|--------------------------|-----------|----------|-----------------|--------------------|
| 06-01 | NBA empty + **MLB 9g** | 9 (MLB) | mlb | yes (MLB) | **356 leans / 330 actionable** | **yes (64)** | yes | yes | **the actionable MLB slate (latest real)** |
| 06-02 | NBA shell only | 0 | — | no | 0 | **no** | no | no | honest "today not posted yet" empty |
| 06-03 | NBA `Live` shell | 1 (NBA) | nba | props only | **80 leans / 0 actionable** (all `insufficient_data`) | no | no | no | a **prop-lines-pending** state, NOT "80 projections" |
| 06-04 | NBA shell | 0 | — | no | 0 | no | no | no | nothing / coming up |

**Root cause (code):** `app/src/lib/data-projections.ts` →
`buildProjectionsPayload`:
- builds a date for every slate with ≥1 lean or MLB schedule game;
- **`forwardDates = dates.filter(d => d.date >= today)`** (line ~389) — drops
  all historical slates ("/projections is tonight+upcoming; historical lives on
  /results");
- `defaultDate` = today if present, else **first forward date**, else last
  historical.

On 2026-06-02 that yields: June-1 MLB (actionable) is **historical → dropped**;
June-2 has no board; **June-3 (props-only NBA shell) is the only forward date**,
so it becomes the sole pill + default. Its 80 legs are all
`insufficient_data`/`Pass`/`projection: null` (a props-only forward snapshot
from the June-1 evening run), so **"80 projections" is misleading** — they are
prop lines awaiting a projection, not actionable projections.

**Answers to the audit questions:** (1) June-2 board exists but empty; (2) no
MLB games; (3-5) no June-2 optimizer/snapshot/publicRiskSections; (6) the
morning run never fired for June-2; (7) GitHub Actions scheduled-delivery
drop/delay (not a code bug; not dispatched per the no-early-dispatch rule);
(9) UI shows June-3 because of the today+future-only filter; (10) June-3 "80"
are **props-only / insufficient-data**, not real projections; (11) yes, the
label misleads; (12) the page does **not** distinguish scheduled vs prop-lines
vs actionable vs pass/insufficient; (13) with no optimizer today it should show
an honest today-empty state and fall back to the **latest actionable** slate;
(14) tomorrow-props-only should render as "lines posted, projections pending",
never counted as projections; (15) **yes — prefer the latest actionable modeled
slate over a future props-only shell**; (16) yes — per-sport (NBA/MLB) honest
empty states; (17) min product-safe fix = label semantics + fallback
preference (code only); (18) only a *workflow reliability* change (manual
dispatch / retry) would need approval — out of scope here.

---

## 5. Suggested-Parlays section audit (feedback #2)

Reproducible: `cd app && npx tsx scripts/audit-suggested-section-funnel.mjs`.

| Slate | Section | raw(all) | official-only | after #241 caps | Main reason empty |
|-------|---------|---------:|--------------:|----------------:|-------------------|
| **06-01 (MLB-only)** | low | 4 | 4 | 3 | — |
| | medium | 4 | 4 | 2 | — |
| | high | 4 | 4 | **0** | **emptied by #241 volume/exposure caps** |
| | longshot | 4 | 4 | **0** | **emptied by #241 volume/exposure caps** |
| **05-30 (mixed)** | low | 4 | 3 | 3 | — |
| | medium | 4 | **0** | 0 | **all slips were mixed-sport (PR #247 removed)** |
| | high | 4 | **0** | 0 | all mixed-sport (PR #247) |
| | longshot | 4 | **0** | 0 | all mixed-sport (PR #247) |
| **05-28 (mixed)** | low | 4 | 2 | 2 | — |
| | medium/high/longshot | 4 each | **0** | 0 | all mixed-sport (PR #247) — 14 mixed removed |

**Two honest mechanisms empty High/Longshot:**
1. **MLB-only slates:** #241 caps (Low 3 / Med 3 / High 2 / Longshot 1) + the
   exposure limits (per-player ≤2 / per-market ≤4 / per-game ≤3 across the
   published set) — Low+Medium consume the exposure budget, so High/Longshot
   slips (which reuse the same hot players/markets) get trimmed to 0.
2. **Mixed slates:** the optimizer concentrated single-sport slips in Low and
   put mixed-sport slips in the higher-odds sections; PR #247 (single-sport
   official) removes those, emptying Medium/High/Longshot.

Both are **correct** (no padding, no fake cards). The problem is purely UX: a
full-width empty section reads as "broken."

**UX assessment:** (1) technically correct; (2) yes, they feel broken;
(3) **collapse empty sections behind a summary**; (4) add a summary like
"2 of 4 sections have cards · High & Longshot empty after quality/variety
filters"; (5) yes — state we never pad; (6) empty sections should read **"No
qualifying cards after volume & sport filters"**; (7) add a "why empty?"
disclosure; (8) keep the sections for transparency but **collapsed by default**.
Do **not** change odds bands or add cards.

---

## 6. Build a Parlay UX audit (feedback #3)

**Current state (`mode === "build"`):** two tools render **stacked**:
- **`CustomParlayGenerator`** ("Generate for me") — sport pills
  (All/NBA/MLB/🔀 Mixed), risk pills, game/team/player selects, a primary
  DNP-risk toggle, "Generate 5 builds".
- **`CustomParlayBuilder`** ("Build your own parlay") — a search-everything
  leg picker + evaluation card + A–F grade card.

**Problems:** (1) two parallel tools with overlapping controls and no step
structure; (2) duplication (sport/game/team/player exist in both); (3-5)
"generate for me" vs "build your own" distinction is unexplained; (6-8) "Mixed"
and risk labels need plain-English copy; (9-10) "DNP-risk" jargon is primary,
not advanced; (11-12) the manual picker + A–F grade + model rating are dense;
(13) "not officially tracked" is present but easy to miss; (14) Suggested vs
Build difference relies on the mode tab alone; (15) **too many controls at
once**; plus **stale copy** ("Select players from any sport" — BYO is now
modeled-only) and **edgePct/confidence shown per leg** (non-predictive per
#240 — should not be surfaced as quality).

**Proposed redesign (text wireframe):**

```
Build a Parlay                              [Custom] [Modeled sports only] [Not tracked]
"Create a custom card from modeled-sport legs. Custom cards are not official
 Suggested Parlays and are not publicly tracked."

Step 1 · Build type:   ( Quick Generate )  ( Manual Build )
Step 2 · Sport scope:  ( NBA )  ( MLB )  ( Mixed NBA+MLB )
         "Schedule-only sports don't have model legs yet."
Step 3 · Filters:      Game ▾  Team ▾  Player ▾  Market ▾  Risk ▾
         ▸ Advanced: ☐ include DNP-risk legs

Step 4A · Quick Generate → 3–5 cards: legs · sports · markets · grade ·
          "Custom — not tracked" · reasons/warnings · [Use this card]
Step 4B · Manual Build → searchable leg table (player·sport·game·market·line·
          odds·recent form·warnings) + selected-leg tray (max N) + live score

Step 5 · Review & score: payout · informational grade · warnings (mixed /
          not tracked / missing recent form / DNP) · NO win-rate claim
Step 6 · Export/share (copy only; no save-to-official-results)
```

**Component split:** `BuildAParlay` (stepper shell) → `BuildTypeToggle`,
`SportScopePicker` (uses `canUseInBuildYourOwn`), `BuildFilters` (collapsible
advanced), `QuickGeneratePanel` (wraps current generator), `ManualBuildPanel`
(leg table + tray), `ReviewScoreCard`, `ShareCard`. **Data:** all from the
gated `getLegPool` (modeled-only); drop edgePct/confidence from leg display
(replace with recent-form badge + honest grade). **Mobile-first:** one step
visible at a time; sticky selected-leg tray; 375px no overflow. **Tests:** step
flow, sport scope hides unsupported, max-legs cap, mixed labeled untracked,
no banned copy.

---

## 7. Bank Builder audit (feedback #4)

**Current Bank Builder** (`bank-builder/page.tsx`): draws from
`filterOfficialSuggestedSlips(suggested.slips)` → **official-only, single-sport
(PR #247/#248), never mixed**; `selectPlus100BuilderSlip` picks a pending,
fully-unsettled slip near **+100** (2-leg preferred), else an **honest empty
state**; **paper-only**, disclaimers top+bottom, never forces a card, never
shows a settled slip. It is currently empty on the June-1 fallback because no
pending unsettled +100 single-sport slip exists (June-1 is settled).

**Weaknesses:** no recent-form requirement; the empty state explains the +100
miss but not *which* eligibility criteria failed; no per-leg "why this card"
support panel.

---

## 8. L10 / recent-form feasibility + shadow results

Reproducible: `cd app && npx tsx scripts/shadow-l10-audit.mjs`. **L10 hit rate**
= fraction of a leg's stored `recentSeries` (last per-game values) that already
cleared its line in the leg's side; ties excluded; ≥5 decisive games required;
never fabricated. Public-era settled legs only (May 27–Jun 1; May 25/26
excluded; deduped; no same-slate leakage).

**Field availability:** `recentSeries` present on **100%** of the 217 settled
legs (both NBA + MLB), pregame-safe, real (game-log values, not derived from
the projection). `recent10Count` is ambiguous (not a clean L10 count) — **use
`recentSeries`**, not `recent10Count`.

**Results:**
- **Leg hit rate by L10 bucket** (weakly monotonic, **not** anti-predictive):
  <50% → **42%** (n=31) · 50–59% → 53% · 60–69% → 52% · 70–79% → 57% · 80–100%
  → **58%** (n=57).
- **Threshold availability / hit:** ≥50% keeps 86% of legs (55%); ≥60% keeps
  69% (55%); ≥70% keeps 43% (57%); ≥80% keeps 26% (58%).
- **Beyond the market?** Within implied-prob bands, L10≥70% vs L10<70%:
  implied <50% → **67% (8/12) vs 42%** (lift, but tiny n); implied 50–59% →
  45% vs 49% (none); implied ≥60% → 63% vs 61% (negligible). So L10 adds lift
  mainly where the market is skeptical (small n); elsewhere it overlaps the
  market.
- **By market:** REB 83% vs 42%, AST 67% vs 33% (strong but small n); batter_hits
  57% vs 54% (modest, n=108); total_bases / hrr / K noisy (tiny n).
- **Slip-level all-legs-clear (Bank-Builder-style):** ≥50% → 15% (231 slips);
  ≥60% → 18% (107); ≥70% → **23% (only 31 slips)**. Higher threshold lifts
  slip hit rate but **starves candidate availability**.

**Conclusion:** L10 is the **first real, non-anti-predictive, fully-covered**
signal found — promising for Bank Builder. But the sample is thin and the
beyond-market lift is small-n. **Recommendation:** wire L10 as a **display
badge + a soft, configurable preference / tie-breaker**, and optionally a
**conservative hard floor (≈≥60%)** that preserves candidate availability —
**not** a hard ≥70–80% all-legs gate yet (it starves candidates and the lift is
small-n). Keep tracking; **no performance claim**; do not use edgePct/confidence.

---

## 9. Sports projection expansion feasibility

| Sport | Status | Schedule | Odds/props | Stats source | Model | Grading | UI | Projections now? | Parlays now? | Next action |
|-------|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|-------------|
| MLB | modeled | ✅ MLB StatsAPI | ✅ Odds API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | keep |
| NBA | modeled | ✅ nba_api/ESPN | ✅ Odds API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | keep |
| WNBA | schedule-only | ✅ ESPN | ⚠️ in Odds API, not fetched | ⚠️ (WNBA stats available) | ❌ | ❌ | ❌ | ❌ | ❌ | **PR 5 shadow candidate (verify)** |
| NHL | schedule-only | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | hold |
| UFC | schedule-only | ✅ | ⚠️ | ❌ (fight model differs) | ❌ | ❌ | ❌ | ❌ | ❌ | hold |
| MLS | schedule-only | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | hold |
| FIFA/World Cup | schedule-only | ✅ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | hold |
| IPL | schedule-only | ✅ | ✅ (game-level only) | ❌ (no player props) | ❌ | ❌ | ❌ | ❌ | ❌ | hold |
| EPL | coming-soon | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | hold |

**No sport beyond NBA/MLB is ready.** WNBA is the most tractable next candidate
(player-prop markets exist in the Odds API; closest NBA analog) but still needs
a real ingestion + model + grader before any public projection. **Recommend one
sport at a time, shadow-first.**

---

## 10. Recommended product principles

1. **Honesty over coverage** — never pad, never fabricate; an honest empty/
   "pending" state always beats a fake card or a mislabeled count.
2. **Label by actionability** — "scheduled game" ≠ "prop line posted" ≠
   "actionable projection" ≠ "pass / insufficient data". Counts must mean
   actionable.
3. **Market is the trusted signal; model edge is not** (#240/#245). Don't
   surface edgePct/confidence as quality. L10 may be shown as recent-form, but
   only after audit and never as a win-rate claim.
4. **Single-sport official, mixed only in custom** (PR #247/#248) — preserved.
5. **Modeled-sports-only everywhere actionable**; schedule-only/coming-soon stay
   schedule-only/coming-soon until a real pipeline ships.
6. **Bank Builder stays paper-only / educational**; never forces a card.

---

## 11. Multi-PR implementation roadmap

Each PR is approval-gated, with the standard merge gate (real
`Vercel – gametimepicks` + `mergeStateStatus = CLEAN`), tests/tsc/build, and
browser checks (desktop 1280 + mobile 375).

**PR 1 — Projection availability / fallback clarity.** Scope: prefer the latest
**actionable** modeled slate over a future props-only shell; relabel counts
(scheduled / prop lines / actionable projections / pass-insufficient); per-sport
honest empty states; never call props-only "projections". Files:
`data-projections.ts`, `projections/page.tsx`, `projections-experience.tsx`,
`date-status-header.tsx`, tests. Risk: low (display/selection only). Rollback:
revert PR. **No workflow change.**

**PR 2 — Suggested empty-section UX.** Scope: summary line ("N of 4 sections
have cards"), collapse empty sections with honest "No qualifying cards after
volume & sport filters" + "why empty?" disclosure; keep #241; no bands/padding.
Files: `risk-section-spread.tsx`, `parlay-lab-builder.tsx`, small lib for the
summary, tests. Risk: low.

**PR 3 — Build a Parlay redesign.** Scope: stepped Quick-Generate / Manual-Build
(see §6); modeled-only; mixed clearly custom/untracked; drop edgePct/confidence
from leg display; fix stale "any sport" copy; mobile-first. Files: new
`build-a-parlay/*` components, refactor generator/builder, `parlay-lab-builder.tsx`,
tests. Risk: medium (UI surface). Rollback: revert; old components retained
until cutover.

**PR 4 — Bank Builder redesign + L10 (audit-backed).** Scope: eligibility panel
(target odds · modeled-only · official-only · pending-unsettled · recent-form ·
variety · no forced card); L10 as **badge + soft preference** (and/or a
conservative ≥60% floor), per the §8 evidence; itemized "why no card" empty
state. Keep paper-only. Files: `bank-builder/page.tsx`,
`parlay-suggested.ts` selector, `sport-capabilities.ts`/new `recent-form.ts`,
tests. Risk: medium (selection logic) — gate L10 behind the audit; do **not**
make it a hard ≥70–80% gate.

**PR 5 — WNBA shadow pipeline feasibility.** Scope: verify real WNBA odds/stats/
grading; build a **shadow** model only; **no public projections/parlays** until
the readiness checklist passes. Files: `pipeline/wnba/*` (shadow), docs. Risk:
medium-high (data sourcing). Rollback: shadow-only, nothing public.

---

## 12. What must NOT be done

No fabricated data; no fake projections/odds/parlays/results/schedules; no new
sport promoted without a real data+model+grading pipeline; no #245 recalibration
wiring; no `audit/policy.json` consumption; no workflow-schedule change without
approval; no hit-rate/profit/lock/guarantee/performance claims; no May 25/26
public rates; preview PRs #213/#214/#215 untouched; stale PRs #1/#2/#4/#5 not
closed; Bank Builder paper-only; mixed-sport official Suggested stays blocked;
mixed only in Build Your Own from modeled sports, not officially tracked; no
loosening of odds bands or padding of Suggested sections.

---

## 13. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|:--:|:--:|------------|
| Projections fallback change hides a future slate users want | Low | Low | Keep both: latest-actionable default + a clearly-labeled "upcoming (lines pending)" pill |
| Collapsing empty Suggested sections reads as hiding data | Low | Med | Keep sections present, collapsed, with explicit "why empty?" |
| Build-a-Parlay redesign regresses Build My Card / deep links | Med | Med | Reuse existing gated pool + helpers; test step flow + hash modes |
| L10 wired too aggressively starves Bank Builder | Med | Med | Badge/soft-preference first; conservative floor; no hard ≥70–80% gate; keep tracking |
| L10 overfits a 217-leg / 5-day sample | High | Med | Treat as observational; re-run as data grows; no performance claim |
| GitHub Actions schedule keeps dropping the morning run | Med | Med | Separate ops decision (manual dispatch / retry) — approval-gated, out of scope here |

---

## 14. Verification commands

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks
git rev-parse HEAD && gh pr list --state open --limit 30
cd app
npx tsx --test src/lib/*.test.mjs        # expect all pass
npx tsc --noEmit                         # expect clean
npm run build                            # expect green (140 routes)
# audit scripts (offline, read-only):
npx tsx scripts/shadow-l10-audit.mjs
npx tsx scripts/audit-suggested-section-funnel.mjs
```

---

## 15. Next recommended PR

**PR 1 — Projection availability / fallback clarity** (smallest, highest-impact,
lowest-risk; pure display/selection). Then PR 2 (Suggested empty-section UX),
PR 3 (Build a Parlay redesign), PR 4 (Bank Builder + L10), PR 5 (WNBA shadow).
**Pause for operator approval before each.**

*Audit 2026-06-02. main `e7698af`. Latest settled `2026-06-01`. June-2 morning
run not fired. Docs/audit-only — no product behavior changed; #245 shadow-only;
no new sport promoted; no L10 wired.*
