# Learning notes — after the 2026-05-29 settlement

**Scope:** results-only. This note records what the *already-graded*
public-era record (2026-05-27 → 2026-05-29) actually shows and the
honest takeaways for the model loop. It does **not** re-grade anything,
**does not** touch any pregame suggestion for these or any other slate,
and makes **no** promotion/demotion decision. Every number below traces
back to `app/public/data/parlays/optimizer-summary.json`, regenerated
from JSONL by the nightly grader — see `docs/MODEL_LEARNING_LOOP.md` §1.

> The public era starts **2026-05-27** (`public-parlay-era.ts`).
> Pre-era slates (05-25, 05-26) are excluded from every figure here and
> from the `/results` UI; they stay on disk only as an internal archive.

---

## 1. Public-era record (matches the live `/results` hero)

All graded optimizer slips, decisive-only denominator
(pushes/pending excluded):

| Date  | W | L | Pending | Decisive | Slip hit rate |
|-------|---|---|---------|----------|---------------|
| 05-27 | 10 | 21 | 1 | 31 | 32.3% |
| 05-28 | 24 | 87 | 3 | 111 | 21.6% |
| 05-29 |  2 | 38 | 8 | 40 | 5.0% |
| **Era** | **36** | **146** | **12** | **182** | **19.8%** |

The era line (36-146, 182 decisive, 19.8%) is exactly what the Results
hero renders. These are **multi-leg parlays**, so a low slip-level hit
rate is structurally expected — but 19.8% is below what the combined
odds in these lanes need to clear over time. We state that plainly; we
do not dress it up.

## 2. Public risk-section slips (what Suggested mode actually showed)

The table above counts *every* graded optimizer slip, including
internal lanes. The curated **public** risk-section slips — the ones a
visitor saw under Low / Medium / High / Longshot in Parlay Lab
Suggested mode — are a smaller set. Where the pipeline recorded them
section-wise:

**2026-05-28** (`byPublicSection`):

| Section | W | L | Decisive | Hit rate |
|---------|---|---|----------|----------|
| Low | 2 | 1 | 3 | 66.7% |
| Medium | 1 | 2 | 3 | 33.3% |
| High | 0 | 4 | 4 | 0% |
| Longshot | 0 | 4 | 4 | 0% |

**2026-05-29** (`byPublicSection`):

| Section | W | L | Decisive | Hit rate |
|---------|---|---|----------|----------|
| Low | 1 | 2 | 3 | 33.3% |
| Medium | 0 | 1 | 1 | 0% |
| High | 0 | 2 | 2 | 0% |
| Longshot | 0 | 3 | 3 | 0% |

> **05-27 gap (honest):** the pipeline did not persist a
> `byPublicSection` block for 05-27 — that date has `{}`. The Results
> page already handles this by falling back to its loader-side
> classifier, but the *section-level* learning signal below only draws
> on 05-28 and 05-29.

## 3. Sport-bucket split

`bySportBucket` for the two dates that carried it:

| Date  | NBA | MLB | Mixed |
|-------|-----|-----|-------|
| 05-28 | 4-0 (100%) | 0-16 (0%) | 1-13 (7.1%) |
| 05-29 | — (no NBA-only) | 1-8 (11.1%) | — |

---

## 4. Honest takeaways (no action taken on any pregame slate)

1. **Risk ordering held on 05-28.** Hit rate decreased monotonically
   Low → Medium → High → Longshot (66.7% → 33.3% → 0% → 0%). That is
   the *direction* the risk labels promise, which is a good
   directional-honesty check. But each section had only 3–4 decisive
   slips — far too small to claim the labels are calibrated. 05-29 is
   mostly zeros on equally tiny samples.

2. **MLB dragged both days.** 05-28 NBA legs went 4-0 while MLB-only
   parlays went 0-16 and Mixed went 1-13; 05-29 was an MLB-weighted
   slate that went 1-8. Across this window MLB parlays underperformed
   NBA badly. This is a *recorded observation*, not a model change —
   any MLB market de-weighting must go through the documented
   rolling-window demotion path (`MODEL_LEARNING_LOOP.md` §3), not a
   reaction to two slates.

3. **05-29 was a thin, weak, MLB-heavy slate.** 40 decisive at 5.0%
   with 8 pending (DNP / box-score lag). One bad slate on a small
   sample; we neither over-react to it nor hide it.

4. **Sample is still well below every promotion gate.**
   `MODEL_LEARNING_LOOP.md` §7 requires 100+ decisive per lane and 200+
   decisive overall before any public hit-rate claim. The era total is
   182 decisive overall and far fewer per section/lane. **Conclusion:
   no promotion, no demotion, copy stays "experimental · publicly
   tracked."**

## 5. What this note explicitly does NOT do

- It does not re-grade or "fix" any settled slip — a loss stays a loss.
- It does not change any market weight, threshold, lane, or pregame
  suggestion for 05-27/05-28/05-29 or any future slate.
- It does not feed final results back into same-slate suggestions.
- It does not claim the model improved; the era hit rate is recorded as
  it is.

## 6. Follow-ups to watch (not committed here)

- Keep accumulating decisive slips toward the §7 thresholds before any
  calibration claim.
- If MLB underperformance persists across the documented rolling window
  (not two slates), evaluate a market de-weight through the normal
  audit-policy path with explicit operator approval.
- Backfill a `byPublicSection` block for 05-27 in a future grader run so
  the section-level signal isn't missing a day.
