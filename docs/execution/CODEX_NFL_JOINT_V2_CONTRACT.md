# NFL joint simulation v2 — correctness contract before implementation

This is a private-research successor to P249, not a modification of the published marginal champion or of the historical v1 receipt. No public promotion is authorized by passing correctness tests alone.

## Defects to reproduce

1. Multiple passers receive fractional passing touchdowns in individual draws.
2. The named passers divide all receiving yards after normalizing away unallocated passer attempts.
3. Receiving touchdowns can be assigned without a reception; rushing touchdowns without a carry.
4. Unallocated touchdowns are not typed and therefore cannot reconcile to total receiving/passing touchdowns.
5. The v1 tests do not expose passing attempts, completions or typed touchdowns for a per-draw cross-check.

## Candidate scope

Keep the existing fitted game environment and volume models. Couple realized completed-pass opportunities to discrete passer attempts; use explicit other-passer/receiver/rusher buckets. Assign TDs only to eligible realized opportunities, preserve count integrality, and record unmet offensive-TD demand rather than fabricating a player touch. Carry unspecified scoring points as unspecified; do not call them a validated field-goal or defensive-TD simulation. Preserve v1 source and receipts for reproducibility.

## Correctness acceptance

The candidate consumes the existing accepted fit's target-share deflation unchanged, including its explicit unallocated remainder. This is fit-parameter parity, not a newly tuned gamma. Invalid deflation refuses.

Every draw: nonnegative integer attempts/catches/carries/TDs; completions <= attempts; receptions <= targets; receiving TDs <= receptions; rushing TDs <= carries; sum QB gross yards including other = sum receiving yards including other; sum passing TDs including other = sum receiving TDs including other; named+other allocations reconcile; offensive TDs plus conversions plus unspecified points equals team score. Two-passer, missing-starter, zero-catch, zero-carry, no-named-passer and partial-roster fixtures must run. Input ordering must not affect seeded output. Duplicate identities/nonfinite inputs must refuse. Identical seed/inputs replay exactly.

## Evaluation and publication boundary

Use the existing chronological population contract and identical-point comparison. Preserve v1/champion evaluations; v2 must write a separate private artifact. Report missing predictions and sample intersections explicitly. Reused 2025 evaluation is a development comparison, not a fresh holdout; registered 2026 forward evaluation remains untouched. Retain existing family bars (including simple-baseline comparisons, coverage, calibration and non-inferiority) without post-result relaxation. A correctness-only repair does not establish better predictive accuracy or complete public support for all props.

No change to bankrolls, provider permissions, event locks, accepted public model identities, settlement history or P250 UI is part of this initial slice.

## Upstream diagnostic and declared adapter (before full-population rerun)

The first 200-draw diagnostic matched only 735/9583 champion points: 333 team simulations refused overfull QB mass, 137 carry mass and 48 target mass. Preserve that diagnostic separately. The constructor estimates conditional historical role rates independently; they are not a coherent current lineup. The next development comparison explicitly projects overfull family weights proportionally onto unit mass, leaving underfull families and their OTHER remainder intact. Record every adjustment. This is a changed modeling assumption, not an accuracy fix, and does not establish a starter. Run the complete identical population before interpreting metrics. No public promotion follows from this adapter or a reused development set.

## Depth-chart conditioner — declared before its first evaluation

The reconciled 1000-draw candidate still loses passing to simple baselines (MAE 78.472 versus 70.352 share-volume; passing-TD log loss 0.7259 versus 0.5932 training rate). New evidence: nflverse's 2025+ depth-chart archive has timestamped ESPN identities and pregame 2025 coverage. Use the latest team snapshot STRICTLY BEFORE kickoff, no older than 168 hours, exactly one rank-1 QB, and only when that identity exists in the prior-only candidate roster with QB evidence. Allocate the existing training-derived starter share 0.9577 to that QB and proportionally allocate no more than 0.0423 to named other QBs; retain absent backup mass as OTHER. Other families remain unchanged. Missing/stale/ambiguous/no-roster-match cases keep the v2 baseline and emit the reason. No population selection based on this depth lookup: still score all identical champion points. Conditioner identity is nfl-joint-depth-v1, engine remains nfl-joint-sim-v2. The archive is acquired retrospectively, not a live 2025 forecast receipt. This is reused-development evidence, never a fresh holdout or automatic promotion. No fitting or parameter grid on 2025.

Sources: https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html and https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html. Acquisition preserves source hash, raw compressed bytes and timestamped snapshots privately.

First depth-run plumbing diagnostic applied zero of 570 decisions because external numeric ESPN IDs did not match the corpus's `nfl-athlete-<ESPN id>` namespace. Correct that explicit prefix mapping, preserving source ID and corpus ID in each decision; do not join by fuzzy names or retune parameters. The zero-application result remains a diagnostic, not evidence the depth hypothesis failed.
