# Generation-Curation Stage 2 — Plan (2026-06-05)

> Design only. No implementation here. Builds on the Stage-1 branch
> `feature/generation-curation-public-risk-depth` (TARGET_PER_BUCKET 4→6 +
> `_SGP_MARKET_EXPOSURE_PENALTY` 0.08; June 5 sim: All 17→19, MLB 6→7). Goal:
> evaluate deeper curation that raises diverse published-card depth on
> supply-rich slates while staying grading-consistent. No paid API, no data edit.

## Why Stage 1 alone is modest on concentrated slates
Stage 1 deepens the per-bucket target and adds a market-concentration tiebreaker,
but `_select_diverse_sgp` runs AFTER `_build_section_slips_for_pool` has already
scored candidates — and on a slate whose top-scored eligible MLB slips cluster on
one market (June 5: `batter_hits_runs_rbis`), the deeper slots pull MORE of the
same market. Verified: even a 0.20 market penalty leaves June 5 displayed MLB at 7.
The diversity has to be injected EARLIER, at candidate generation, not only at the
final select step.

## Stage-2 options (evaluated, ranked by safety)
1. **Diversify the candidate source before the per-bucket cap (preferred).**
   Stratify `_build_section_slips_for_pool` so each market contributes a minimum
   share of CANDIDATES (when eligible candidates exist for it), before scoring
   trims. This widens the pool the selector chooses from without lowering the
   eligibility bar. Risk: low (still real eligible slips). Effort: medium.
2. **Per-market minimum only when quality score is close.** Reserve 1–2 slots per
   section for the best slip of an *under-represented* market, but ONLY if its
   score is within a small delta of the marginal accepted slip (e.g. ≤10%).
   Never ships a materially weaker slip. Risk: low–medium. Effort: medium.
3. **Separate quality and diversity tiers.** Fill the first K slots purely by
   score, then fill remaining slots by diversity among near-quality slips. Makes
   the trade-off explicit and tunable. Risk: medium. Effort: medium.
4. **"More generated cards" surface, separate from published cards (UI, not
   generation).** Expose a clearly-labeled, NON-graded "more model combinations"
   view distinct from the graded published cards. ⚠️ Grading-consistency caveat:
   it must be visibly separate and never counted in the published-card record.
   Risk: medium (UX + honesty). Effort: medium. Likely a later, separate PR.

## Grading consistency (hard requirement for options 1–3)
`publicRiskSections` is BOTH the displayed set and the graded set. Any Stage-2
change must keep that identity: more published cards ⇒ more graded cards, same
math. Option 4 is the only one that introduces a non-graded surface, and it must
be explicitly fenced off from the published-card record (a documented UX decision,
not a silent merge).

## Required tests (before any Stage-2 implementation)
- Candidate stratification adds market variety only from ELIGIBLE candidates
  (no fabrication, no eligibility-bar drop).
- Per-market minimum triggers only within the score-delta threshold.
- No duplicate slip IDs; All ⊇ children invariant holds.
- Short / concentrated supply still yields fewer real slips (no padding).
- Grading consistency: published set == graded set (for options 1–3).
- Deterministic output (same input → same selection).

## Future-slate validation
Re-run `audit-suggested-parlay-publishing-depth` before/after on the next
supply-rich slate (in-memory, no paid regen). Target: MLB toward 10–15 *with*
distinct-market count up, average accepted-slip score within a small delta of the
Stage-1 baseline. Document the score trade-off honestly.

## Why June 5 cannot honestly hit 10–15 MLB even with Stage 2
June 5's eligible high-quality MLB supply is genuinely market-concentrated
(`batter_hits_runs_rbis` dominant). Stage 2 helps slates that HAVE diverse
high-quality supply; it cannot manufacture diverse cards on a concentrated slate
without publishing lower-edge cards — which we do not do. The honest ceiling for a
concentrated slate stays below 10–15; the change raises the ceiling where supply
allows. June 5 production would only change with a paid regeneration (out of scope).

## Recommendation
Land Stage 1 first (it's a safe ceiling-raise + tiebreaker; future-slate only).
Evaluate Stage-2 **option 1** (candidate stratification) on the next 2–3 fresh
slates' data before implementing; keep option 4 (separate non-graded surface) as a
distinct UX decision for the user.

*Design only. No code/data/model/grading change in this doc.*
