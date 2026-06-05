# Generation-Curation Design — deeper, more diverse publicRiskSections (2026-06-05)

> Design note for `feature/generation-curation-public-risk-depth`. Pipeline
> curation/selection change only — NO projection/scoring math change, NO grading
> change, NO generated data change. Future-slate behavior.

## 1. Current bottleneck
`pipeline/parlay_optimizer.py :: generate_public_risk_sections` caps each
(section × sport) bucket at `PUBLIC_RISK_SECTION_TARGET_PER_BUCKET = 4`, and
`_select_diverse_sgp` rewards only *brand-new* markets (binary `_SGP_FRESH_MARKET_BONUS = 0.05`)
with **no escalating penalty for market concentration**. With 4 slots and a
top-scored market that repeats, the surviving slips cluster on one market.
June 5: legPool has 240 MLB players / 4 markets, but publicRiskSections MLB =
16 slips dominated by `batter_hits_runs_rbis` → only 6 survive #278 display caps.

## 2. Proposed code change (smallest robust)
1. **`PUBLIC_RISK_SECTION_TARGET_PER_BUCKET: 4 → 6`** — more slots per
   section×sport so the rich supply can surface. Uniform across sports; NBA stays
   supply-limited automatically (the selector returns only what exists).
2. **Add an escalating market-concentration penalty** in `_select_diverse_sgp`,
   mirroring the existing player-exposure penalty:
   `_SGP_MARKET_EXPOSURE_PENALTY = 0.08`; subtract
   `0.08 × max(market_count[m] for m in slip_markets)` from the adjusted score.
   This spreads the extra slots across markets instead of repeating the
   highest-scored one. Keeps the existing fresh-market bonus.

## 3. Why this is NOT a projection/math change
`slip.score` (edge/quality) is untouched. `_select_diverse_sgp` only RE-ORDERS
already-eligible candidates (its docstring: "this selector only re-orders the
already-eligible candidates"; eligibility — edge, confidence, recent10, anomaly,
thin-pid, dup-player gates — is enforced upstream and unchanged). The new penalty
is a diversity *tiebreaker* among eligible slips, exactly like the existing
player/pair penalties. No probability, edge, or odds value changes.

## 4. Why grading consistency is preserved
`publicRiskSections` remains the single source of published cards AND the graded
set (`byPublicSection` / `bySportBucket` grade exactly what it holds). We add no
separate display-only/ungraded cards. More published cards simply means more
graded cards — same pipeline, same math.

## 5. Expected future-slate behavior
On a supply-rich slate (like June 5's profile): MLB published rises from ~6
toward ~10–15 with more distinct markets/players; Mixed rises modestly; NBA stays
honest to its slate (1-game days stay small). On thin slates, sections still
empty out — no padding (the selector returns only real eligible slips).

## 6. Risks
- Slightly lower average rank/score per published card (the diversity tiebreaker
  may swap a marginally higher-scored same-market slip for a fresher-market one).
  Mitigated: penalty (0.08) is small and only among eligible candidates; the
  honest least-negative fallback still never ships an ineligible slip.
- More cards = more graded slips → published-card sample grows (a feature, not a
  bug; improves Results signal over time).
- `test_market_diversity_does_not_force_inferior_legs` must still pass.

## 7. Rollback plan
Single-commit revert: restore `PUBLIC_RISK_SECTION_TARGET_PER_BUCKET = 4` and
remove `_SGP_MARKET_EXPOSURE_PENALTY`. No data migration (future-slate only).

## 8. Validation plan
- `pipeline/parlay_optimizer_test.py` — existing 89 tests stay green; add tests:
  target permits more when supply exists, never exceeds target, no dup slip IDs,
  market diversity improves, player/game caps respected, short supply → fewer,
  mixed-of-modeled allowed, unsupported excluded.
- Deterministic **in-memory before/after simulation** on June 5 (no paid regen,
  no data write) → `generation-curation-before-after-2026-06-05.md`.
- App audits: current-live-quality, coverage, count-consistency, v2 (unchanged).
- `python -m py_compile`, `npx tsc --noEmit`, `npm run build`.

## 9. Does June 5 production change immediately?
**No.** `PUBLIC_RISK_SECTION_TARGET_PER_BUCKET` is a generation-time constant; it
applies to the **next** `morning-projections` run. June 5's publicRiskSections is
already baked. Seeing the effect on June 5 specifically would require regenerating
June 5 (a paid Odds API dispatch) — out of scope unless separately approved. The
change applies automatically on the next fresh slate.

*Design only. No code changed yet in this note.*
