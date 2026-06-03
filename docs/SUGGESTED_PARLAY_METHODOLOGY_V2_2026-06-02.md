# Suggested Parlay Methodology v2 — Shadow Audit + Specification (2026-06-02)

> **Shadow-only / docs-first. This document and its companion script change NO
> product behavior.** It adds one offline, read-only analysis script
> (`app/scripts/shadow-parlay-methodology-v2.mjs`) and this report. No fabricated
> data; no fake odds/projections/parlays/results; no new sport promoted; no
> optimizer/workflow/generated-data changes; `#245` recalibration stays
> shadow-only; `audit/policy.json` not consumed; `edgePct`/`confidence` not used
> as quality signals. June-1 results are **not** rewritten or hidden. June-2 is
> **not** settled here.
>
> **Bottom line up front:** the v2 rules are *computable* and Bank Builder L10
> support is feasible, **but v2 must NOT be wired live yet.** A blocking
> data-integrity bug (the published `recentSeries` is the player's **oldest** 10
> games, not their most recent) means v2's L5/L10 leg quality would be measured
> on the wrong games if implemented on the current path. The only rule with a
> real predictive signal (L5 5/5) also has too small a settled sample to be
> conclusive, and the broad "4/5+" rule shows no edge over the existing pool.
> **Recommendation: ship this audit + spec; fix the data plumbing as a separate
> evidence-gated change before any live v2.** See §15–§16.

> **UPDATE (`fix/optimizer-recentseries-recency`, follow-up PR):** the data
> plumbing fix is **landed for forward generation** — `normalize_lean` /
> `_lean_from_payload` persist the recent tail (`last_n_recent_values`,
> `series[-10:]`) instead of the oldest 10.

> **UPDATE 2 (`regen/june2-recentseries`, this PR):** the **June-2 optimizer
> artifact has been regenerated** offline from the committed board
> (`python -m pipeline.snapshot_optimizer --date 2026-06-02`). The diff is
> **isolated to `recentSeries`** (433/454 legPool legs + 56 publicRiskSections
> legs corrected; **0 legs changed odds / projection / edge / score / slipId**;
> only `generatedAt` bumped). Rerunning this shadow audit now shows the
> **truncated-vs-true gap CLOSED: 0 Low-eligibility flips (was 28)** — persisted
> Low/L5-5/5/Bank counts now equal the board-sourced TRUE counts
> (21 / 38 / 69). The remaining preconditions before any live v2 are now: (1)
> **thicker settled samples** (L5 5/5 N=17, Low N=14 are still too thin), (2)
> the `#241` cap-vs-target reconciliation, and (3) regeneration of any other
> slates a future live v2 would read. **The snapshot file is unchanged — it
> does not persist `recentSeries`; Bank Builder enriches from the now-corrected
> optimizer legPool.** v2 **remains shadow-only**; no methodology wired; no
> settlement; June-2 not settled.

> **DECISION (`docs/v2-implementation-decision`):** the implementation options
> were weighed in
> [`METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md`](./METHODOLOGY_V2_IMPLEMENTATION_DECISION_2026-06-02.md)
> (7-option matrix + approval gates). **Recommendation: keep v2 shadow-only and
> gather ~7–14 more settled slates (Option A/G)** until L5 5/5 / Low samples
> reach ~40 decided legs. No narrow live increment clears the bar today —
> Bank Builder already matches the desired direction ($100, soft L10, no forced
> card), and a hard L10 gate would starve (`#249`). No live v2 wired.

---

## 1. Executive summary

Suggested Parlay Methodology v2 (per operator requirements, effective
**2026-06-02 onward**) replaces the current **odds-only** risk-section
definitions with **per-leg recent-form quality gates** (L5 / L10) plus a
**per-section odds cap** and revised **daily card targets**:

- **Low** — last-5 hit rate **5/5** *and* American odds **≤ −150**, 2 legs.
- **Medium / High / Longshot** — last-5 hit rate **4/5 or 5/5**, increasing leg
  counts.
- **Bank Builder** — `$100` paper bankroll (already the default), legs with
  last-10 hit rate **≥ 8/10** where possible.
- **Daily target** — 5 Low · 5 Medium · 2–3 High · 2–3 Longshot · ~15 total.
  **Targets, not guarantees. No padding, no fake cards.** Fewer cards + honest
  empty states when candidates don't qualify.

A read-only shadow audit (`app/scripts/shadow-parlay-methodology-v2.mjs`,
deterministic) evaluated these rules against the **settled public-era slates
2026-05-27 … 2026-06-01** (May 25/26 excluded; 05-31 has no graded file) and the
**active, unsettled** 2026-06-02 candidate pool. Three findings drive the
recommendation:

1. **Blocking data bug (the headline).** The `recentSeries` persisted on
   optimizer / snapshot / `publicRiskSections` / graded legs is
   `full_season_series[:10]` — the **OLDEST 10 games** for the ≈**88%** of MLB
   legs with >10 games played. The projection model uses the recent tail
   (`series[-3:]/[-10:]`) correctly, but the optimizer keeps the wrong end.
   Computing v2's L5/L10 from that field measures the wrong games. On June-2
   alone, **28 legs flip Low-eligibility** between the true source (board full
   series) and the truncated field (true Low-eligible **21** vs truncated
   **11**; true L5 5/5 **38** vs **22**; true Bank-eligible **69** vs **39**).
2. **The "4/5+" rule has no historical edge; the "5/5" rule's sample is too
   small.** Over 166 decided MLB legs: baseline **52%**, **L5 4/5+ = 52%** (no
   lift; 4/5-only is **47%**, worse), but **L5 5/5 = 71%** and **Low-eligible
   (5/5 & ≤−150) = 79%** — promising yet only **N=17** and **N=14** decided
   legs. Bank-eligible (L10 ≥8/10) = **63%** (N=64), a modest, better-sampled
   positive.
3. **Targets are reachable from the real pool but conflict with the live
   volume caps.** June-2 has enough eligible legs (Low 21, Med/Hi/Ls 139, Bank
   69) that a relaxed-cap simulation builds **16/16** target cards — but under
   the live `#241` caps (`totalMax=9`, per-section 3/3/2/1) it builds only
   **8**, and reaching ~15 forces heavy market concentration (only **4** MLB
   markets exist), which is in tension with v2's own cohesion goals.

**Verdict: SHADOW-ONLY.** Do not wire v2 live until (a) the `recentSeries`
truncation is fixed at the pipeline source and (b) more settled slates grow the
L5 5/5 / Low samples. The companion script is the reusable measurement harness.

---

## 2. Why v2 exists

The current public risk sections (`app/src/lib/parlay-risk-sections.ts`,
`pipeline/parlay_optimizer.py::generate_public_risk_sections`) classify a slip
**purely by its combined American odds + leg count**:

| Section | Combined odds | Legs |
|---------|--------------|------|
| Low | < +300 | 2–3 |
| Medium | +300 … +599 | 3–4 |
| High | +600 … +999 | 4–5 |
| Longshot | ≥ +1000 | 5–6 |

Nothing about an individual leg's **recent form** or **price** gates which legs
go into a Low card. A "Low Risk" card today can contain +110 / −116 legs (it
does on June-2). The operator's intent for v2 is that **Low** specifically means
*heavily-favored legs that have been hitting* — encoded as **L5 5/5 + odds
≤ −150** — with recent-form quality (not odds alone) defining each tier, and a
larger daily slate of cards.

---

## 3. June-1 failure context

June-1 published slips went **1W / 47L (2.08%)** while single legs went
**152W / 154L (49.67%)** with **0 pending** (`MODEL_AUDITS_INDEX.md`, June-1
failure section). The parlay layer destroyed value that the legs themselves did
not — the standing evidence that **combining legs is where the risk compounds**,
and that `edgePct`/`confidence` (anti-/non-predictive, `#240`) cannot be trusted
to pick legs. v2 is the operator's response: gate legs on **real recent form**,
cap Low to heavy favorites, and keep cards cohesive.

The shadow audit reproduces this difficulty independently: across the settled
public era the **published slip win rate of decided slips is 15%** (8W / 47L)
even though the **published leg hit rate is 60%**.

---

## 4. June-1 remains historical truth

June-1 results are **immutable historical record**. v2 does **not** rewrite,
hide, downplay, or re-grade June-1. The new methodology applies **2026-06-02
onward only**. `/results` continues to show June-1 (and the historical Mixed
sport-mix row) with its honest caption. This audit reads June-1 only as settled
*input* to historical analysis; it writes nothing.

---

## 5. v2 effective date: 2026-06-02

v2 is specified to take effect **2026-06-02**. Because June-2 is **unsettled**
at audit time (`optimizer-graded/2026-06-02.json` absent), the audit uses June-2
for **candidate availability only** (no outcomes) and uses **2026-05-27 …
2026-06-01** for settled outcome analysis. Any future live v2 must be tagged
with its effective date in the data model so v1 and v2 results are never
conflated (§13).

---

## 6. L5 / L10 definitions (and the data source that makes them honest)

- **`recentSeries`** = a player's real per-game stat values for a market
  (e.g. hits, total bases, K). It is **real, pregame-safe**, never fabricated.
- **L5 hit count** = number of the player's **last 5** games that cleared the
  posted line in the leg's side (Over: value > line; Under: value < line; a
  value == line is a **push** and counts as a non-hit within the fixed 5-game
  window — you cannot be "5/5" if a game pushed). Requires ≥ 5 games (fail
  closed otherwise).
- **L10 hit count** = same over the **last 10** games. Requires ≥ 10 games.

> **Critical sourcing rule (the bug).** "Last 5 / last 10" must come from the
> **board full season series** (`app/public/data/mlb/boards/<date>.json` →
> `leans[].recentSeries`), which is the **complete** series in chronological
> order **oldest → newest** (verified: the model's projection equals a
> `series[-3:]`-based calc, e.g. Jack Flaherty 6.07). True L5 = `series.slice(-5)`,
> true L10 = `series.slice(-10)`.
>
> The `recentSeries` stored on **optimizer / snapshot / `publicRiskSections` /
> graded** legs is `series[:10]` — the **OLDEST 10** games for any player with
> >10 games (≈88% of June-2 MLB legs; `pipeline/parlay_optimizer.py` ~L482
> `recentSeries=tuple(recent_values[:10])`). Using it for L5/L10 measures the
> wrong games. The existing L10 badge/audit (`#249`, `#253`,
> `scripts/shadow-l10-audit.mjs`) read this truncated field, so the current L10
> "recent form" is, for most legs, the **oldest** 10 games. **This must be fixed
> at the source before any live L5/L10 gate.** (NBA board ordering is **not**
> verified here; the audit fails NBA closed for L5/L10. June-2 is MLB-only.)

---

## 7. Odds threshold definitions

- **American odds ≤ −150** = heavier favorites only. **Allowed:** −150, −160,
  −175, −200. **Disallowed:** −149, −120, +100, +120 (anything greater than
  −150, including all positive prices). Helper semantics:
  `oddsForSide ≤ −150` (a finite number). Source: the leg's `oddsForSide`
  (real book price; no fabricated odds).

---

## 8. Low Risk rules

- Target **5** cards/day **if** qualified candidates exist.
- **2 legs** preferred.
- Every leg: `recentSeries` length **≥ 5**.
- Every leg: **L5 5/5** (true, board-sourced).
- Every leg: odds **≤ −150** (no + odds).
- Avoid repeated players; avoid excessive same-game / same-market concentration.
- If not enough legs qualify, **show fewer cards** (honest empty state). No
  padding.

**June-2 availability:** 21 Low-eligible legs (true source). Reachable to 5
cards only under relaxed exposure caps; live `#241` per-section cap holds it to
3. **Settled signal: 79% (11/14) — promising but N=14 (inconclusive).**

---

## 9. Medium Risk rules

- Target **5** cards/day if qualified candidates exist.
- **2–3 legs** preferred.
- Every leg: `recentSeries` length **≥ 5**, **L5 4/5 or 5/5**.
- At least one **5/5** leg preferred where possible.
- Odds may be broader than Low. Avoid excessive repeats/concentration.

**Settled signal: L5 4/5+ = 52% = baseline (no lift).** The "≥1 5/5 leg"
preference is the only part with positive signal, and it is small-sample.

---

## 10. High Risk rules

- Target **2–3** cards/day if qualified candidates exist.
- **3–4 legs** preferred.
- Every leg: **L5 4/5 or 5/5**.
- Higher combined payout comes from **leg count / odds**, never from weak recent
  form. Avoid excessive repeated players/games/markets.

**Settled signal: same 4/5+ pool — no edge over baseline.**

---

## 11. Longshot rules

- Target **2–3** cards/day if qualified candidates exist.
- **4–5 legs** preferred.
- Every leg: **L5 4/5 or 5/5**.
- Higher payout from leg-count/combination, **not** from weak-form filler legs.
  Avoid excessive repeats/concentration.

**June-2 availability:** plenty of 4/5+ legs (139), but under live caps the
total budget (`totalMax=9`) is exhausted by Low/Med/High first → 0 Longshot
built. Reachable (3/3) only with relaxed caps.

---

## 12. Bank Builder rules ($100 / L10 8/10)

- Default bankroll **$100** (already the case; paper-only).
- Official **published-card pool** only; **pending/unsettled** only; never
  forces a card.
- Every leg: `recentSeries` length **≥ 10**; **L10 ≥ 8/10** where enough
  candidates exist.
- If no card qualifies → **show no card with the exact reason** (no forced
  card).
- L10 is **transparent recent-form support, not a prediction or win-rate
  claim**.

**June-2 availability:** 69 Bank-eligible legs (true L10 ≥8/10); 25+ in-band
(+60…+180) all-eligible 2-leg cards → a qualifying card exists. **Settled
signal: 63% (40/64) vs 52% baseline — modest positive, best-sampled of the v2
rules** (consistent with `#249`: L10 weakly monotonic, not anti-predictive).
**Same caveat: must be sourced from the board full series, not the truncated
field** (the live Bank Builder L10 badge currently uses the truncated field — a
soft tie-breaker only, no hard gate, so it is not wrong-facing, but a hard L10
gate on the truncated field would be).

---

## 13. Daily targets vs the no-padding rule

The daily counts (5/5/2–3/2–3 ≈ 15) are **targets, not guarantees**. v2 may show
**fewer than 15** cards. **No section is ever padded; no fake/weak-filler card
is created to hit a number.** When a section can't fill, it renders an honest
empty state with the real reason. v1 vs v2 must be **tracked separately** and v2
results **tagged with the 2026-06-02 effective date** so historical comparisons
never mix methodologies.

---

## 14. Cohesion / exposure rules

v2 keeps cards cohesive using **real pregame-safe factors only**: avoid
unnecessary player repetition; avoid excessive same-game concentration; avoid
excessive repeated-market concentration. Official Suggested stays
**single-sport**; mixed stays **Build Your Own** (modeled sports only). The
existing `#241` discipline (`parlay-volume-discipline.ts`:
`maxPlayerExposure=2`, `maxGameExposure=3`, `maxMarketExposure=4`,
per-section 3/3/2/1, `totalMax=9`) already encodes this — **but those caps
conflict with the ~15-card target** (§16, blocker 2): hitting ~15 cards needs
relaxed caps, and with only 4 MLB markets that concentrates markets, which v2's
own cohesion goal discourages. The cap reconciliation is an explicit
**operator decision**, not something this audit silently changes.

---

## 15. Shadow audit results

Script: `app/scripts/shadow-parlay-methodology-v2.mjs` (read-only,
deterministic). Reproduce: `cd app && npx tsx
scripts/shadow-parlay-methodology-v2.mjs`.

### A. June-2 candidate availability (true vs truncated source)

| Metric | True (board) | Truncated (optimizer field) |
|--------|------:|------:|
| Total candidate legs | 454 | 454 |
| L5 5/5 | 38 | 22 |
| L5 4/5 | 101 | — |
| L5 4/5+ (Med/High/Longshot pool) | 139 | — |
| L10 8/10+ (Bank pool) | 69 | 39 |
| **Low eligible** (5/5 & ≤−150 & len≥5) | **21** | **11** |
| Medium / High / Longshot eligible | 139 | — |
| Bank Builder eligible | 69 | 39 |
| Low-eligibility **flips** true vs truncated | **28 legs** | |

Only **4** MLB markets exist (batter_hits_runs_rbis 189, batter_hits 159,
batter_total_bases 85, pitcher_strikeouts 21) — a structural concentration
constraint.

### B. June-2 construction feasibility (heuristic greedy, shared exposure ledger)

| Section | Target | Built (live `#241` caps) | Built (relaxed caps) |
|---------|------:|------:|------:|
| Low | 5 | 3 | 5 |
| Medium | 5 | 3 | 5 |
| High | 2–3 | 2 | 3 |
| Longshot | 2–3 | 0 | 3 |
| **Total** | ~15 | **8** | **16** |

Eligible legs suffice to hit the target (relaxed → 16/16); the **live caps**
(`totalMax=9`, per-section) hold it to 8. (The greedy is a labelled heuristic
lower bound, not the production selector.)

### C. Historical settled comparison (2026-05-27 … 2026-06-01, MLB, true L5)

Leg hit rate = wins / (wins+losses); pushes & pending excluded.

| Leg group | Hit rate | N (decided) |
|-----------|------:|------:|
| All (already model-selected) legs | **52%** | 166 |
| L5 5/5 | **71%** | 17 |
| L5 4/5 | 47% | 60 |
| L5 4/5+ | **52%** | 77 |
| L5 3/5 or worse | 53% | 89 |
| Low-eligible (5/5 & ≤−150) | **79%** | 14 |
| Bank-eligible (L10 ≥8/10) | **63%** | 64 |

Current **published** cards (graded `publicRiskSections`, where present):
**64 slips**, leg hit rate **60% (122/202)**, slip outcomes **8W / 47L / 9
pending** → **15% slip win rate of decided**.

### D. Bank Builder (June-2)

- Bank-eligible legs (true L10 ≥8/10): **69**.
- In-band (+60…+180) all-eligible 2-leg cards: **25+** → a qualifying card
  exists; no forced card needed.

### E. Verdict

**Feasible to *measure*; NOT recommended to *wire live* yet.** Outcome **D**
(data plumbing missing — the truncation bug) is primary, compounded by Outcome
**C** (the 4/5+ rule shows no edge; the 5/5/Low signal is real but
small-sample) and a cap-reconciliation decision (Outcome **B**-style rule
adjustment).

---

## 16. Whether implementation is recommended

**Not yet. Shadow-only.** Things that must change before a live v2 is safe:

1. **Fix the `recentSeries` truncation at the source** — ✅ **DONE
   (forward-generation)** in `fix/optimizer-recentseries-recency`:
   `normalize_lean` / `_lean_from_payload` now persist the **recent tail**
   (`last_n_recent_values`, `series[-10:]`), documented order oldest→newest,
   locked by `RecentSeriesRecencyWindowTests`. **Still pending:** a one-time
   **data regeneration** of existing committed artifacts (they still carry the
   stale oldest-10 window) — a separate, approval-gated step — and a **rerun of
   this shadow audit** on the corrected data to confirm the truncated/true gap
   closes.
2. **Grow the settled sample.** The only rules with positive signal (L5 5/5
   N=17; Low N=14) are below a usable threshold. Re-run this audit as more
   public-era slates settle; require a stable lift before a hit-rate-adjacent
   claim (and even then, **no win-rate claim** — see §18).
3. **Reconcile the daily targets with the volume caps** as an explicit operator
   decision (raise `totalMax`/per-section caps vs. accept fewer cards). Raising
   caps increases market concentration given only 4 MLB markets.

When those land, the safe live increment is **narrow**: the $100 Bank Builder
default (already true), pure tested helpers (`getL5HitCount`, `getL10HitCount`,
`hasMinimumRecentGames`, `isAmericanOddsAtMostMinus150`, `getRiskV2Eligibility`,
`getBankBuilderV2Eligibility`) reading the **fixed** board-sourced series, and
display labels — all behind honest empty states, targets-as-targets, no padding.

---

## 17. Risks and limitations

- **Truncation bug** (above) — the single biggest correctness risk.
- **Small samples** for the high-signal rules; one slate swings the rate.
- **Selection bias** — the 166-leg "baseline" is already model-selected legs
  (legs that made optimizer slips), so 52% is a *post-selection* baseline; the
  true universe baseline may differ.
- **Push handling** — strict "X/5" treats pushes as non-hits; most MLB lines are
  `.5` (push-free), but integer lines can push.
- **NBA ordering unverified** — NBA fails L5/L10 closed here; a live v2 covering
  NBA needs the NBA board ordering verified first.
- **Greedy feasibility is heuristic** — a lower-bound estimate, not the
  production selector.
- **Cap/target tension** — ~15 cards needs relaxed caps → more concentration.

---

## 18. What must NOT be claimed publicly

- **No** claim that v2 improves hit rate / win rate (no settled v2 evidence
  exists; the signal is small-sample and parlays compound risk).
- **No** banned betting copy (lock, guaranteed, free money, risk-free, can't
  miss, easy win/money, no-brainer, sure thing, sharp money; avoid user-facing
  "safe/safety" except CSS `safe-area-inset-bottom`).
- **No** use of `edgePct`/`confidence` as quality signals.
- L5/L10 are **transparency**, not predictions. Daily counts are **targets**.
- June-1 stays historical; June-2 not settled early.

---

## 19. Next steps

1. **PR A (this):** ship the shadow script + this spec + doc cross-references.
   **No live behavior change.**
2. **Do NOT open the live-implementation PR (PR B).** Evidence is shadow-level:
   data-plumbing blocker + thin samples + cap conflict.
3. **Follow-up (separate, evidence-gated):** fix the `recentSeries` truncation
   at the pipeline source (+ regenerate), re-run this audit on a larger settled
   sample, and bring the cap-vs-target reconciliation to the operator.
4. Re-run `npx tsx scripts/shadow-parlay-methodology-v2.mjs` after each new
   settled slate; revisit the verdict when L5 5/5 / Low samples are adequate.

*Canonical references: `MODEL_AUDITS_INDEX.md`, `MODEL_AND_OPTIMIZER.md`,
`PRODUCT_REQUIREMENTS.md`, `PRODUCT_UX_AND_SPORTS_PROJECTION_AUDIT_2026-06-02.md`,
`HANDOFF_2026-06-02_PRE_METHODOLOGY_V2.md`. Script:
`app/scripts/shadow-parlay-methodology-v2.mjs`.*
