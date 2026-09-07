# Program 240 · execution log

Charter: Fable 5 cold start · NFL Week 1 end-to-end + four-sport readiness (Sep 7–13 window,
extended to full official NFL Week 1) + navigation/scene/results consistency.

## Baseline (2026-09-06 22:10 ET / 2026-09-07 02:10 UTC)

- Ancestry: P239 tip `d344129ee` → **+11 bot commits** (all `[skip ci]` auto) → `8c640e790`
  = local = origin = **production** (Vercel built 2026-09-07T01:17Z, verify:deployment OK).
  No reset; bot work preserved by fast-forward.
- Protected money: `app/public/data/mr-dub/portfolio.json` = `affe6b21071f2b3be96bb2774eb347c3`,
  `bank-builder-locks.json` = `cb80473f88f3cb5f67208fa568925295` — **both match** reported values.
- Stashes: 2, untouched. Untracked `vp/` files: present, untouched, never committed.
- Four Sep-6 daily cards (`bank-builder-lane-a/b-step-1`, `moonshot-lane-a/b-2026-09-06`)
  all `status: active`, `settlement.status: pending`. $250 paper exposure isolated as reported.
- **Pending acceptance 1**: first production settlement of generated cards —
  `nightly-settle` 05:30 UTC (~3h away at baseline). Will observe in-session.
- **Pending acceptance 2**: `daily-products` `workflow_run` trigger. Verified it has NEVER
  fired naturally — and could not have: the trigger reached the default branch at 21:31Z
  (`4bb8bae06` push), AFTER today's producer completed (~17:04Z). First natural exercise is
  the next `mlb-daily-production` completion (~14:15+ UTC Sep 7). Not broken; not yet observable.
- The 16:26Z `workflow_run` run is the OLDER morning-projections → mlb-daily-production chain,
  not this trigger.
- **Live incident (noisy detector, P233 class)**: `epl-matchweek` failed 3 consecutive runs
  (17:11, 17:25, 22:49Z). Odds capture correctly SKIPPED — "no kickoff within 30h (next
  2026-09-12T14:00Z). Nothing bought." — but `assert-run-produced` still unconditionally
  demands `epl/odds/latest.json` < 90 min fresh. Asserting a state the producer legitimately
  never emits during a fixture gap. Will fail every run until ~Sep 11. Fix queued (Release C).
- `mlb-lineup-refresh` 22:10Z failure was transient; 3 consecutive successes after.
- EPL/UFC authorization ledgers exist (`data/internal/research/odds/{epl,ufc}/`); terms to
  re-verify in Release C. NFL P171 expired per P227; newer receipt to check in Release B.
- Zero provider credits spent this session.

## Plan (dependency order, shippable slices)

- **A** Coverage matrix: four sports × (Sep 7–13 + full official NFL Week 1), event-level,
  reusing offered-window owner (`app/src/lib/offered-window/`). Parallel audit now.
- **B** NFL Week 1 end-to-end (schedule→identity→model→forecast→report→hub→settle path).
- **C** MLB/EPL/UFC upcoming coverage + epl-matchweek detector fix.
- **D** Production product cycle: observe tonight's settle, reconcile ledgers/ladders,
  multi-lane cycle accounting.
- **E** Selection registry + cross-sport results history.
- **F** Homepage/navigation consistency pass.
- **G** Sport scenes + recording readiness.
- **H** Forward evaluation eligibility + operational closeout.
