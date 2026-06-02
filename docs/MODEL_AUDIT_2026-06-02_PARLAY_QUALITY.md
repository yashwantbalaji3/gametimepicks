# Model Audit — Parlay Quality (2026-06-02)

> **Observational audit + a proposed, conservative quality-gate plan.**
> Nothing in here is wired into live selection. It documents how the
> pipeline works today, what June 1 (1W/47L) actually revealed across the
> 5-day public era, and a tested, reversible plan to make suggestions more
> disciplined. **No same-slate leakage. No fabricated data. No "70% / can't
> miss" claims.** May 25/26 public rates are excluded throughout.

---

## PART A — How the pipeline works today (PHASE 1 audit)

### A1. Settlement / grading (`nightly-settle`, 07:00 UTC = 3 AM ET)
Pure **post-hoc audit trail**. Legs graded by exact `(playerId, market, side,
line)` match → slip status is **all-must-win** (any leg loss ⇒ loss; any
unresolved ⇒ pending, never forced to loss; push handling excludes pushes
from the denominator). Free public APIs; in-progress games refused at
source; idempotent. **Settlement never writes back to projections or the
optimizer** — there is zero feedback loop today.

### A2. Projection model (`morning-projections`, 13:30 UTC = 9:30 AM ET)
MLB + NBA only. Per-leg inputs: player stats, `recent10` game logs (DNP
guards), The Odds API lines/odds, per-market consensus, and a calibration
factor → `edge%`, `confidence`, `projection`. Markets: NBA `PTS/REB/AST`;
MLB `batter_hits / batter_total_bases / batter_hits_runs_rbis /
pitcher_strikeouts`.

### A3. Optimizer + public risk sections (the core of this audit)
- **Public sections are defined ONLY by combined American odds + leg
  count:** Low `< +300` (2–3 legs), Medium `+300…+599` (3–4), High
  `+600…+999` (4–5), Longshot `≥ +1000` (5–6).
- **Every public-section leg passes only the *Aggressive* eligibility
  gate** (`min edge 1pp`, **any** confidence, anomalies allowed ≤1, no
  `playerId` required, **any** MLB market). ⇒ **"Low Risk" is a payout-class
  label, not a quality tier.** A Low-Risk leg can be exactly as low-quality
  as an Aggressive one.
- Within-slip caps: no duplicate players; **same-game ≤ 2**; same-team
  (Conservative 1 / Balanced 2 / Aggressive 3); volatile-MLB ≤ 3; anomaly
  ≤ 1. A market-diversity re-rank bonus exists but caps aren't per-section.
- **No per-section MLB market allowlist** (Conservative profile restricts to
  `[batter_hits, batter_total_bases]`; public sections accept *any* market).
- **Hard-coded 4 slips per section/sport** — no dynamic cap-down when the
  quality pool is thin ⇒ undersized sections get padded with weak fallback
  cards.
- **`app/src/lib/leg-quality-gates.ts` already defines `PROPOSED_SECTION_LEG_GATES`**
  (Low=Conservative gate, Medium=Balanced, High=Aggressive+1.5pp edge,
  Longshot=Aggressive) — **marked "NOT ENFORCED"**, requiring out-of-sample
  confirmation + a pinning test + operator approval before wiring in.
  `PUBLIC_SECTION_LEG_GATE_TODAY = PROFILE_LEG_GATES.aggressive` confirms the
  current loose behavior.

### A4. Bank Builder (paper)
`selectPlus100BuilderSlip` picks a **pending, fully-unsettled** slip nearest
`+100` from the published pool; honest empty state when none qualifies.
Never shows settled legs. Paper-only.

### A5. Learning / audit loop — observational, **not consumed**
`audit_daily.py → audit_signal_policy.py → audit/policy.json`. Computes
per-market/profile/sport hit rates over a **rolling prior-day window**
(no same-day leakage by construction) and "confirms" demotion signals after
3+ days. **The optimizer never reads `policy.json`** — market weights are
**hard-coded** in `parlay_optimizer.py` (`MARKET_STABILITY_WEIGHT`). The
`/results` UI renders signals as **"confirmed-not-consumed."** So even a
confirmed `batter_total_bases` demotion is **not applied** today.

**Net:** the quality-gate and learning-consumption *infrastructure exists*
but is intentionally inert pending approval. This audit is the approval
package.

---

## PART B — June 1 failure analysis (PHASE 2)

All numbers from `optimizer-graded/*.json`; public era only (May 27 →
June 1); May 25/26 excluded.

### B1. June 1 headline
- **Slips: 1 W / 47 L = 2.1%** (0 pending). Every optimizer profile 0-for-8.
- **Slip-legs: 47 / 152 = 30.9%** — vs the **full board's 49.67%**. The
  optimizer's *selected* legs underperformed the board badly, driven by
  **`batter_hits` slip-legs at 18% (board 53%)**.

### B2. Cross-era (the part that separates variance from structure)
| Date | #slips | slip% | leg% | Low | Med | High | Long |
|------|-------:|------:|-----:|----:|----:|-----:|-----:|
| 05-27 | 32 | 31% | 61% | 57% | 43% | 21% | 0% |
| 05-28 | 114 | 21% | 55% | 39% | 13% | 9% | 0% |
| 05-29 | 48 | 5% | 60% | 17% | 0% | 0% | 0% |
| 05-30 | 115 | 7% | 46% | 10% | 11% | 3% | 0% |
| 06-01 | 48 | 2% | 31% | 0% | 7% | 0% | 0% |

### B3. Structural findings (recurring — NOT one-day overfit)
1. **Volume is too high.** 32–115 slips/day. Publishing 100+ mostly-losing
   parlays is undisciplined regardless of any single result.
2. **Heavy "Over" + same-market stacking ⇒ correlated downside.**
   **71–88% of legs are "Over"**; on June 1, **42 of 48 slips stacked ≥2
   legs of the same market**. Slips fail *together* far worse than
   independence predicts: on the cold days, **actual slip% (4% / 7% / 2%)
   vs independence-expected ~18–21%.** When offense is down league-wide,
   correlated Overs all miss at once. *This is the central parlay-construction
   flaw.*
3. **`batter_total_bases` is recurringly weak** in slip-legs (10 / 29 / 36 /
   58 / 27%) — consistent with the audit policy now flagging it.
4. **"Low Risk" oversells.** Ordering is roughly right (Low > High most
   days) but the *absolute* Low-Risk hit rate averages ~25% over 5 days —
   the label implies a safety it does not deliver (because Low inherits only
   the Aggressive per-leg gate; see A3).
5. **June 1 = variance × fragility.** Leg rate 31% (vs typical 55–60%) was a
   genuinely cold low-offense slate, **amplified** by the Over-correlation +
   volume structure into a 2% slip day. The fix is discipline, not chasing
   hit-rate.

---

## PART C — Proposed quality-gate plan (PHASE 3) — **NOT yet implemented**

Conservative, testable, reversible. Each rule uses **only pregame leg
attributes or prior-settled-slate audit** — never same-day results.

### C1. Rules (each independently toggleable + tested)
1. **Fewer slips, honestly.** Replace the hard-coded "4 per section" with a
   dynamic cap: publish only slips that clear the section gate; if a section
   yields `< target`, **show fewer cards + an honest "quality-gated" note**
   rather than padding with weak fallbacks. Empty section ⇒ honest empty
   state.
2. **Per-section leg-quality ladder (wire in `PROPOSED_SECTION_LEG_GATES`).**
   Low = Conservative gate, Medium = Balanced, High = Aggressive+1.5pp,
   Longshot = Aggressive. Makes "Low Risk" mean conservative-grade legs.
3. **Decorrelate slips:**
   - Same-game cap **→ 1** for Low/Medium (keep ≤2 for High/Longshot).
   - **Same-market cap per slip** (Low ≤1, Medium ≤2) — stops 3× `batter_hits`
     Over stacks.
   - **Same-direction (Over/Under) cap** for Low/Medium so a slip can't be
     all-Overs (the correlated-downside driver).
4. **Per-section MLB market allowlist + volatile cap.** Low: `batter_hits`
   only; Medium: `+ batter_total_bases / H+R+RBI`; High/Longshot: all four.
   Volatile-MLB ≤1 for Low/Medium.
5. **Bank Builder:** draw only from the **strictest (Low) gated pool**; 2
   legs preferred; target **+100…+140**; no plus-money leg unless no
   alternative; never settled legs (already true); honest empty state when
   nothing qualifies.
6. **Weak-market suppression — PROPOSE ONLY.** Consuming `policy.json`
   confirmed demotions (e.g., `batter_total_bases` 0.80) would require your
   **explicit approval** + the documented promotion path. **Not in this
   plan's wiring** — documented as the next, separately-approved step.

### C2. Files (when approved)
- `app/src/lib/leg-quality-gates.ts` — already has the gates; add slip-level
  decorrelation helpers (same-market / same-direction caps) + tests.
- `app/src/lib/parlay-risk-sections.ts` — section selection consuming the
  gates.
- `pipeline/parlay_optimizer.py` / `pipeline/snapshot_optimizer.py` — wire
  per-section gates + caps into `generate_public_risk_sections` (Python is
  the live path).
- `app/src/lib/parlay-suggested.ts` — Bank Builder strict-pool selection.
- Tests alongside each.

### C3. Safety, leakage, testing, rollback
- **No same-slate leakage:** gates read pregame attributes only; suppression
  (deferred) reads prior-settled rolling windows that exclude the same day.
- **Implementation order (lowest-risk first):** (1) pure helpers + unit
  tests; (2) a **shadow-audit script** that re-runs section selection on
  already-settled slates and reports old-vs-new slip counts + selected-leg
  hit rate (proves the gate improves quality / reduces volume *without*
  using same-day data); (3) honest UI empty-state/metadata; (4) wire into
  the live optimizer + Bank Builder **only after** the shadow audit + tests
  pass and you approve.
- **Rollback:** every gate is a config constant behind a flag; revert the
  wiring commit to restore today's behavior.
- **Tests:** leg-gate thresholds, per-section selection, decorrelation caps,
  Bank Builder strict pool, no-same-slate-leakage, empty-state, "no
  fabricated recent10/odds" guards.

### C4. Honest expectations
This will **reduce** the number of suggestions and will **not** guarantee
any hit rate. The goal is fewer, higher-conviction, decorrelated slips and
truthful empty states — not a number we cannot promise.

---

*Audit date 2026-06-02 ~05:10 ET. Latest settled 2026-06-01. No code wired;
this document is the review package for the PHASE 4 implementation, which is
paused pending approval.*
