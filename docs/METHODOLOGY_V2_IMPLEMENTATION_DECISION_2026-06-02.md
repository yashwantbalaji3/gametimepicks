# Methodology v2 — Implementation Decision Memo (2026-06-02)

> **Docs-only decision memo. Changes NO product behavior.** No live v2 wiring;
> no risk-section, daily-target, Bank Builder, or volume-cap change; no
> optimizer/workflow/generated-data change; `#245` recalibration stays
> shadow-only; `audit/policy.json` not consumed; `edgePct`/`confidence` not used
> as quality signals. June-1 untouched; June-2 not settled.
>
> **Recommendation up front: do NOT wire live v2 yet. Keep v2 shadow-only and
> gather more settled slates (Option A/G).** The data-plumbing blocker is fixed
> and June-2 is regenerated, but the rules with a real signal (L5 5/5, Low) are
> still small-sample (N=17 / N=14), the broad "4/5+" rule shows **no** edge, and
> the ~15-card target conflicts with the `#241` exposure caps. No narrow live
> increment clears the bar today — notably, **Bank Builder already matches the
> user's desired direction** ($100 paper-only, L10 as a soft "ideally 8/10"
> preference, no forced card), so there is nothing safe to add there now.

---

## 1. Executive summary

Across `#256`–`#258` we shadow-audited Methodology v2, fixed the `recentSeries`
recency-window bug at the pipeline source, and regenerated the June-2 optimizer
so its persisted recent form is now correct (0 truncation flips, was 28). v2's
rules are now **measurable on correct data**. But "measurable" is not
"supported": the only rules with a positive historical signal are too thin to
be conclusive, the broadest rule (the 4/5+ gate used by Medium/High/Longshot)
adds no lift, and the daily-card target can't be met without relaxing the
exposure caps in a way that increases concentration. The safe move is to keep v2
**shadow-only** and let more public-era slates settle before any live wiring.

---

## 2. Status after PR #258

- **`#256`** — v2 shadow audit + spec (`scripts/shadow-parlay-methodology-v2.mjs`,
  `SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md`). Shadow-only.
- **`#257`** — fixed the optimizer `recentSeries` recency window
  (`last_n_recent_values` → `series[-10:]`; was `series[:10]` = oldest 10).
  Forward-generation only.
- **`#258`** — regenerated the June-2 optimizer offline (recentSeries-only diff;
  0 odds/projection/score/selection changes). Truncated-vs-true gap **closed**.
- **Data-plumbing blocker: RESOLVED for June-2.** Persisted Low / L5-5/5 / Bank
  counts now equal the board-sourced TRUE counts.
- **v2 remains shadow-only.** Nothing wired.

---

## 3. Corrected v2 audit summary (re-run on June-2 corrected data)

`cd app && npx tsx scripts/shadow-parlay-methodology-v2.mjs`

**June-2 candidate availability (true L5/L10, MLB-only slate):**

| Metric | Count |
|--------|------:|
| Total candidate legs | 454 |
| L5 5/5 | 38 |
| L5 4/5 | 101 |
| L5 4/5+ (Med/High/Longshot pool) | 139 |
| L10 8/10+ (Bank pool) | 69 |
| **Low eligible** (5/5 & ≤−150 & len≥5) | **21** |
| Bank Builder eligible | 69 |
| Truncated-vs-true Low-eligibility flips | **0** (was 28) |

Only **4** MLB markets exist (HRR 189 / Hits 159 / Total Bases 85 / K 21) — a
structural concentration constraint.

**June-2 daily-target feasibility (heuristic greedy):**

| Section | Target | Built (live `#241` caps) | Built (relaxed caps) |
|---------|------:|------:|------:|
| Low | 5 | 3 | 5 |
| Medium | 5 | 3 | 5 |
| High | 2–3 | 2 | 3 |
| Longshot | 2–3 | 0 | 3 |
| **Total** | ~15 | **8** | **16** |

**Bank Builder (June-2):** 69 L10≥8/10 legs; 25+ in-band (+60…+180) all-eligible
2-leg cards → a qualifying card exists.

**Historical settled comparison (2026-05-27 … 06-01, MLB, true L5; 25/26 excluded):**

| Leg group | Hit rate | N (decided) |
|-----------|------:|------:|
| All (model-selected) legs | 52% | 166 |
| **L5 5/5** | **71%** | **17** |
| L5 4/5 | 47% | 60 |
| **L5 4/5+** | **52%** (no lift) | 77 |
| L5 3/5 or worse | 53% | 89 |
| **Low-eligible (5/5 & ≤−150)** | **79%** | **14** |
| **Bank-eligible (L10 ≥8/10)** | **63%** | 64 |

Current **published** cards (graded publicRiskSections): leg **60%**, **slip win
15%** (8W / 47L). So v2's 5/5 (71%) and Low (79%) beat the published *leg* rate
but on tiny samples; v2's 4/5+ (52%) does **not** beat the published leg rate.

---

## 4. Remaining blockers

1. **Thin settled sample for the high-signal rules.** L5 5/5 N=17, Low N=14 —
   below a usable threshold; one slate swings the rate by ~10–20pp.
2. **The "4/5+" rule shows no edge** (52% = baseline; 4/5-only is 47%, worse).
   It is the gate Medium/High/Longshot would rely on, so three of four sections
   would gate on a non-signal.
3. **`#241` cap vs ~15-card target.** Live caps (`totalMax=9`, per-section
   3/3/2/1) yield ~8 cards; reaching ~15 needs relaxed caps.
4. **Concentration.** With only 4 MLB markets, hitting ~15 cards forces
   maxMarket exposure up to ~16 (relaxed run) — in tension with v2's own
   cohesion goal (avoid repeated markets/players/games).
5. **Selection-bias caveat.** The 52% "baseline" is *already model-selected*
   legs; the true universe baseline may differ, so the 5/5 lift is suggestive,
   not proven.

---

## 5. Decision matrix

Legend for **Recommendation**: ✅ recommended now · 🟡 possible with approval ·
⛔ not recommended yet.

| Option | Live behavior changed? | Impl. effort | Data/evidence risk | UX impact | No-padding compatible? | June-1 unchanged? | June-2 labelable v2? | Rollback | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| **A — Keep v2 shadow-only, gather slates** | No | None | Low (waiting reduces risk) | None (honest current surfaces) | Yes | Yes | N/A (not live) | N/A | **✅ recommended now** |
| **B — Bank Builder-only live increment** | Maybe | Low–Med | Med (hard L10 8/10 ≈ the ≥80% gate `#249` showed *starves*) | Could empty more often | Yes (no forced card) | Yes | No | Revert one lib/page diff | **🟡 possible w/ approval — but largely a NO-OP:** $100 + soft "ideally 8/10" + no-forced-card already match the desired direction; a *hard* 8/10 gate is the risky part and is not advised |
| **C — Low-Risk-only v2 filter** | Yes (Suggested Low) | Med | High (Low signal N=14; changes a public surface) | Fewer Low cards on thin days | Yes (honest empty) | Yes | Partial (Low section) | Revert filter + label | **🟡 possible w/ approval — evidence still thin** |
| **D — Full v2, keep `#241` caps** | Yes (all sections) | Med–High | High (4/5+ no edge; thin 5/5) | ~8 cards, not ~15 | Yes | Yes | Yes | Revert pipeline+UI | **⛔ not recommended yet** |
| **E — Full v2, relaxed caps → ~15** | Yes (all + caps) | High | High (thin evidence + concentration) | More cards, more repetition | At risk (volume pressure) | Yes | Yes | Revert pipeline+UI+caps | **⛔ not recommended yet** |
| **F — Raise caps only (no L5 gate)** | Yes (caps) | Low | High (more cards, *no* quality gate) | More, lower-quality/repetitive cards | **No** (pure volume) | Yes | No | Revert caps | **⛔ not recommended** (directly against the no-padding / quality intent) |
| **G — Data-collection period + tracking** | No | Low (docs/automation note) | Low | None | Yes | Yes | N/A | N/A | **✅ recommended now** (pairs with A) |

**Net:** A + G are the only options that clear the bar today. B is effectively a
no-op for the safe parts and risky for the hard-gate part. C is the least-unsafe
*if* the operator wants a live step, but its evidence is still thin. D/E/F are
premature.

---

## 6. Approval gates for any future live v2

A live v2 (or any live increment) must satisfy ALL of:

1. **recentSeries fixed in the generated artifacts it reads** (done for June-2;
   regenerate any other consumed slate first).
2. **No May 25/26 leakage** (public era starts 2026-05-27).
3. **June-1 retained historically** (immutable; never re-graded/hidden).
4. **June-2 labeled v2 only if live v2 is approved** (and tagged with the
   effective date in the data model so v1/v2 results never mix).
5. **Daily counts are targets only** — never guaranteed, surfaced as
   "target vs qualified shown".
6. **No padding / no fake cards** — honest empty states when short.
7. **No unsupported sports** (MLB/NBA only; WNBA etc. stay schedule-only).
8. **Official Suggested single-sport only**; mixed → Build Your Own (modeled).
9. **Bank Builder paper-only**, $100 default, no forced card, no perf claim.
10. **No `edgePct`/`confidence`** as quality signals.
11. **Minimum sample threshold** before any hit-rate-adjacent framing: target
    ≥ ~40 decided legs per gated bucket (L5 5/5 and Low) — currently 17 / 14.
    Even then, **no win-rate claim** publicly.
12. **Cap-vs-target decision** made explicitly by the operator (raise `#241`
    caps vs accept fewer cards) — with the concentration trade-off acknowledged.
13. **Browser verification** at desktop 1280 + mobile 375 on `/`, `/projections`,
    `/parlay-lab#suggested`, `/parlay-lab#build`, `/bank-builder`, `/results`,
    `/events`.
14. **Rollback plan** — a single revertable PR; no irreversible data rewrite.

---

## 7. Recommended next operator decision

**Choose Option A + G: keep v2 shadow-only and gather ~7–14 more settled
public-era slates, re-running the shadow audit per slate, until L5 5/5 and Low
samples reach ~40 decided legs each (or clearly fail).** Defer the cap-vs-target
decision until the evidence is conclusive. Do not wire any live v2 increment in
the meantime — including Bank Builder, which already matches the desired
direction.

---

## 8. Exact prompts for each possible next choice

- **Continue shadow-only (recommended):** follow
  [`METHODOLOGY_V2_SHADOW_TRACKING_RUNBOOK.md`](./METHODOLOGY_V2_SHADOW_TRACKING_RUNBOOK.md).
  After each nightly settle run
  `npx tsx scripts/shadow-parlay-methodology-v2.mjs --write-report` (auto-discovers
  newly-settled slates, excludes banned May 25/26, refreshes
  `docs/audits/methodology-v2-shadow-latest.md`), and stop. Re-decide when L5 5/5
  / Low reach ~40 decided legs. Do not wire live behavior.
- **Bank Builder review (low value):**
  > "Audit whether Bank Builder already enforces $100 + treats L10 8/10 as a soft
  > 'ideally' preference with no forced card. If it does, change nothing and
  > report. Do NOT add a hard L10 gate (it starves per #249)."
- **Low-Risk-only v2 (needs approval, still thin):**
  > "Implement a Low-Risk-only v2 *display* filter: Low requires all legs L5 5/5
  > (board-sourced) + odds ≤ −150; show fewer cards with honest target-vs-
  > qualified copy; Medium/High/Longshot unchanged; Results history unchanged.
  > Tests + browser verify. Shadow-audit first; pause before merge."
- **Full v2 (not recommended now):**
  > "Only after L5 5/5 and Low samples reach ~40 decided legs and the operator
  > sets the cap-vs-target policy: implement full v2 with the agreed caps."

---

## 9. What must NOT be done

- No full v2 wiring; no relaxed caps to force ~15; no padding/fake cards.
- No hard Bank Builder L10 gate (starves, `#249`); no Bank Builder perf claim.
- No new/promoted sports; no mixed official Suggested; no paper→real Bank Builder.
- No `edgePct`/`confidence` quality gates; no `#245` wiring; no
  `audit/policy.json` consumption.
- No May 25/26 rates; no June-1 rewrite; no premature June-2 settlement.
- No workflow-schedule change; no manual dispatch without approval.
- No banned betting copy (lock, guaranteed, free money, risk-free, can't miss,
  easy win/money, no-brainer, sure thing, sharp money; avoid user-facing
  "safe/safety" except CSS `safe-area-inset-bottom`).

---

## 10. Is live v2 recommended now?

**No.** The data plumbing is fixed and June-2 is correct, but the evidence for
the rules that matter is thin (L5 5/5 N=17, Low N=14), the 4/5+ rule shows no
edge, and the ~15-card target conflicts with the exposure caps. **Keep v2
shadow-only (Option A/G) and revisit once more slates settle.** No narrow live
increment clears the bar today.

*References: `SUGGESTED_PARLAY_METHODOLOGY_V2_2026-06-02.md`,
`MODEL_AND_OPTIMIZER.md`, `MODEL_AUDITS_INDEX.md`, `DATA_PIPELINES.md`, and the
read-only `scripts/shadow-parlay-methodology-v2.mjs`.*
