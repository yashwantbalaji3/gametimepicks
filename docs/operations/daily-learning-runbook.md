# Daily learning runbook

## What runs, when
After nightly settlement (NOT during morning generation):
1. settle games → 2. grade published cards → 3. `update-selection-learning.mjs`
→ 4. write `selection-policy-latest.json` + report → 5. commit.
Morning generation only **reads** the artifact (PR 4); it never writes it.

## Commands
```bash
cd app
# standard daily run (after settlement)
npx tsx scripts/update-selection-learning.mjs --through-date <latest-settled> --window 8 --write-report
# inspect without writing
npx tsx scripts/update-selection-learning.mjs --dry-run
# different window
npx tsx scripts/update-selection-learning.mjs --window 14 --write-report
```
If `--through-date` is omitted it auto-detects the latest settled date.

## Outputs
- `app/public/data/learning/selection-policy-latest.json` (+ `-<date>.json` snapshot)
- `docs/audits/daily-selection-learning-latest.md`

## Safeguards (already enforced by the script)
- Uses settled outcomes only; pending excluded; no same-day leakage.
- Wilson lower bound + shrinkage toward baseline; min sample before any change.
- `noLiveWire=true` when evidence is thin (<200 universe legs or <30 published) →
  optimizer keeps static fallback.
- Hard guards in the artifact cannot be loosened by learning.

## Wiring into CI (PR 3)
Add a step to the settlement workflow (`nightly-settle.yml`) AFTER grading:
```yaml
- name: Update selection-learning policy
  run: cd app && npx tsx scripts/update-selection-learning.mjs --write-report
- name: Commit learning artifact
  run: |
    git add app/public/data/learning/ docs/audits/daily-selection-learning-latest.md
    git diff --staged --quiet || git commit -m "auto: update selection-learning policy [skip ci]"
    # push with the same pull-rebase-retry pattern as morning-projections
```
Do NOT add it to `morning-projections.yml` (generation reads, never writes).

## Rollback / emergency conservative mode
- Restore a prior `selection-policy-YYYY-MM-DD.json` over `-latest.json`, or
- delete `selection-policy-latest.json` (optimizer falls back to static policy), or
- hand-edit `noLiveWire: true`.

## How the optimizer will consume it (PR 4, not yet wired)
Tightening overlay only: may downgrade a market vs static, never upgrade below the
static floor; applies `hardGuards` (card length, edge caps, odds bands, exposure
caps); logs `learningPolicyVersion`/`Date`/`policyApplied`; falls back on
missing/corrupt/`noLiveWire`. NBA stays blocked without a real stats provider;
UFC stays schedule-only.
