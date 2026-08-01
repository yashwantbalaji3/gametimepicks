# Multi-Day Operating Proof (Lane G — checkpoints defined; banked passively)

Two clean daily cycles are already banked (July 30 proven cycle; July 31 generation + stamping +
alerting through this evening). The next two checkpoints bank passively — **no session stays
open for wall-clock**; each is one command with expected states.

## Checkpoint α — Aug 1 morning (after nightly settle + morning generation)

```bash
cd /Users/yashwantbalaji/Downloads/gametimepicks && git pull --ff-only && cd app && node scripts/public-beta-observe.mjs
```
Expected: newest settled **2026-07-31** · lineage acceptance **PROVEN_STAMPED** on the July-31
settled population (first settled native-provenance proof → complete
`JULY31_SETTLED_PROVEN_STAMPED_ACCEPTANCE.md`) · newest board **2026-08-01** fully stamped ·
deployment CURRENT · protected hashes MATCH · duplicate frozen at 17:16:04Z.

## Checkpoint β — Aug 1 ~16:00 ET (first scheduled top-up decision + watchdog day one)

```bash
gh run list -R yashwantbalaji3/gametimepicks --workflow=mlb-afternoon-topup --limit 1
gh run list -R yashwantbalaji3/gametimepicks --workflow=cron-watchdog --limit 1
```
Expected: top-up run concluded `success` with a decision line (SKIP at 0 credits on a covered or
early-slate day; RUN inside budget only on an all-pregame gap slate → append result to
`TOPUP_CREDIT_EFFICIENCY_REPORT.md`); watchdog `success` with `SKIP primary already ran` (or a
labeled WARNING alert if it genuinely recovered a miss).

## Incident posture (unchanged, now complete)

Every scheduled writer alerts on failure (5/5 + WARNING sentinels); a failed top-up cannot touch
the base board (dispatch-only + slate gates); a stale public contract blocks publish
(health-gate proven); recovery is single-writer serialized (`daily-lifecycle` dispatch). Failed
patch materialization blocking publish is part of the Lane-B rollout acceptance on the first
patch day.
