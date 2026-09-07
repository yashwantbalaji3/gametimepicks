# Program 242 · execution log

Charter: restore the direct, end-to-end simulation/report experience (retire the
recording/presentation ceremony), complete the public experience, verify operations, and deliver
the public-launch readiness verdict. Targeted experience restoration — every P240/P241
correctness/settlement/date/risk-taxonomy/navigation fix is preserved.

## Phase 0 · task ownership (2026-09-06 → 07)

- Charter watcher table resolved: the P240 CI watcher (bm42ri0ar) closed green on `d5fdba87c`;
  the daily-products workflow_run watcher stayed armed into Sep 7 (see Phase 4); no other owned
  background processes beyond the session preview server (gtp-export, port 4173, still serving
  the built export for QA).

## Phase 1–2 · the restoration (commits `053ea6957` + guard rebase `848d87ca3`, pushed as `c2f6d2564`/`848d87ca3`)

Removed from every public mount (retained as DORMANT reference source with explicit headers):
- `GameSimulationRunner`: Generate card, locked preview pills, 10-second staged reveal
  (SIMULATION_MIN_DURATION_MS), phase machine, timers, presentation player mount — the
  precomputed dashboard renders immediately; the 460ms motion-gated entrance is all that remains.
- `WcSimulationRunner` (archived WC pages): same ceremony, same removal — report under the
  matchup hero. (No WC match route currently exports; the fix is dormant-safe.)
- Six pages de-launchered (epl match, today, results, nfl game, ufc, build); `?play=1`
  hand-offs removed from day-view; every ready state navigates directly to its full report.
- `SimulationStage` retained ONLY as the fast (150ms tick) refusal dialog for non-ready states.
- `presentation-launcher` / `presentation-player` / `simulation-animation`: DORMANT headers;
  nothing public imports them.

Guards rebased to the direct contract (charter rule: intentional interaction assertions updated,
financial/data invariants intact): game-simulation-reveal, simulate-gated-detail,
simulation-animation, simulation-dashboard, simulation-sport-dispatch, game-report-answer-first,
unified-report, wc-report-upgrade, wc-game-center, soccer-simulation-report-v2. Money md5s,
banned-copy scans, no-fabricated-run-count and determinism checks unchanged. e2e: the four P234
presentation specs replaced by `p242-direct-report.spec.ts` (per-sport direct journey + the
surviving honesty invariants on the page itself).

Two live guards rebased to reality rather than weakened (`848d87ca3`):
- sport-hub first-pitch guard derives its expectation from the same artifacts the label reads —
  mid-chain date-only rows are the honest state; a dropped or fabricated time still fails.
- presentation adapters suite loses its ≥2-sports liveness floor (the layer is dormant); content
  rules still run over whatever manifests build.

Gates: typecheck 0 · suite 5461/0 · build clean · suite:built 460/0 (twice: pre- and
post-rebase onto the Sep-7 morning-projections bot commit).

## Phase 2 verification (built export, browser)

- MLB `ath-vs-sea-2026-09-06`: full report in the first render — "Simulation complete" header,
  model/runs/freshness, headline, tabbed V2.5 report (Overview / Box score / Model vs market /
  Players & props / Methodology), paper-only footer. No button, no dialog, no wait. 0 console
  errors.
- MLB no-artifact game (`mil-vs-cin`): honest "Simulation not yet available" refusal, page intact.
- EPL match / UFC / NFL game pages: no Play CTA, no Generate, no dialog anywhere.
- `?play=1` absent from all 15 simulate-day links.

Out-of-scope finding flagged as its own task: 15 routes nest a second `<main>` inside the shell's
`main#main-content` (invalid nested landmarks; pre-existing, surfaced by Playwright strict mode).

## Phase 4 · publication chain (Sep 7) — full trace, two defects found and one fixed

1. 13:30Z morning-projections cron did not fire — the publication watchdog (P215 machinery)
   detected it and DISPATCHED morning-projections at 16:42Z; projections committed 16:44Z
   (`338f89230`). The watchdog's first live catch.
2. mlb-daily-production then never chained: GitHub suppresses `workflow_run` events from
   GITHUB_TOKEN-dispatched runs, so a watchdog-recovered morning can never complete the chain on
   its own; its own 14:15Z backstop cron also never fired today. Remedied by an operator
   dispatch at 17:58Z → SUCCESS in 8 minutes (day's guarded paid ingests, receipts clean).
3. daily-products then fired via `workflow_run` at 18:06Z — the FIRST natural workflow_run
   firing of this trigger (the P240 acceptance observation) — and FAILED its own
   produced-artifacts assert: the risk ladder found no candidate pool. Root cause: the
   watchdog's recovery dispatch hardcodes `skip_nba=true`, which skips the legacy
   snapshot_parlays step ("relies on NBA board" — a stale coupling to the retired NBA lane),
   and the ladder read only graded-today/legacy-snapshot. Bank Builder generated correctly;
   protected money byte-identical; the green-run guard did its job (a P230-class catch).
4. Fix `7be5ae4db`: the ladder's pool falls back to the same-day OPTIMIZER document (identical
   shape/publicRiskSections, written by every projections run) — verified locally with pinned
   --now (3/4 tiers carded, low honestly skipped; artifacts reverted, workflow owns refresh).
   Remaining recovery-path defects (non-chaining token dispatch, hardcoded skip_nba, stale NBA
   coupling in automation_projections.sh) flagged as their own follow-up task.
5. daily-products re-dispatched on the fixed tree: SUCCESS (`bbadd6745`). Then the ENTIRE chain
   fired naturally once the drifted crons landed: projections 18:18Z → production via
   workflow_run 18:24Z (`a6385eeb2`) → products via workflow_run 18:30Z SUCCESS (`b975ccdd9`,
   same 3-card ladder from the fixed pool) — the untouched-by-operator end-to-end observation.

## Phase 6 · QA matrix (final tree)

Full Playwright matrix — chromium + firefox-a11y + webkit-a11y, viewports per the p185/product
specs (mobile 360/390, tablet 768, desktop 1024/1440): **497 passed · 0 failed · 33
reality-typed skips** (empty-slate skips, honest by design). One flake fixed at its root
(p235 day-detail now polls the hydrating row count). CI quality-gate green on `1744061d8`.
Prod verified serving the P242 tree (`0cfe35ea4`, built 17:50Z): zero `?play=1` links, zero
Generate ceremony, direct reports rendering.

daily-products re-run on the fixed tree: SUCCESS (run 34151071094, network-free) → `bbadd6745`
committed the complete Sep-7 set — risk ladder (3 cards, low skipped with its labelled
substitute rule), daily portfolio, receipts, forward coverage. Prod redeployed and verified
serving it: Sep-7 ladder on /build, Sep-7 on /today and /bank-builder, zero ceremony on game
pages. Protected money byte-identical throughout.

## Final report (2026-09-07, ~14:45 ET)

### Verdicts

- **SIMULATION_RESTORATION_COMPLETE** — one click on any event lands on its full report,
  immediately, on every sport. The recording/presentation layer is unmounted everywhere public
  (runner, WC runner, six launcher pages, ?play=1 hand-offs); the SimulationStage survives only
  as the fast typed-refusal dialog. Verified in source guards, in the built export, in the
  three-engine browser matrix, and rendered on production.
- **PUBLIC_EXPERIENCE_COMPLETE** — the four-sport journey is coherent on prod: MLB direct tabbed
  report + honest no-artifact refusal; EPL exact-matrix forecast with no run-count claim; UFC
  card reads with per-bout anchors; NFL frozen-forecast labelling. A01–A24 stay resolved (their
  guards all run in the green suite); nav hierarchy: 7 desktop primaries, 5+more mobile,
  29-link site map — the full IA re-cut remains A22's own named release.
- **OPERATIONS_VERIFIED** (with one repaired defect and one named follow-up) — today's chain was
  traced live end-to-end: cron drift → watchdog's first live catch and dispatch → the
  workflow_run daily-products trigger's first natural firing → its green-run guard correctly
  failing a produced-nothing ladder → root-cause fix (`7be5ae4db`) → full regeneration and
  publication. Sep-7 cards are live; tonight's nightly-settle grading them is the next natural
  observation. Follow-up owned by its named task: the watchdog's recovery dispatch cannot chain
  downstream (GITHUB_TOKEN event suppression) and hardcodes skip_nba.
- **PUBLIC_READY** — gates: typecheck 0 · suite 5461/0 · build clean · built-HTML 460/0 ·
  e2e 497/0/0 across three engines · CI green · prod rendering the restored experience with
  today's products. Protected money untouched (md5s pinned in the suite).

### Should the founder send the link now?

Yes. The experience the founder asked to restore is live and verified on production: an event
click goes straight to the full report, today's products are published and dated today, the
results/records surfaces render the canonical accounting, and every honesty guard is green.
The named residuals (recovery-chain follow-up task, nested-main landmark cleanup, A22's IA
re-cut) are operator/polish work — none of them changes what a visitor sees on the journey.
Send https://gametimepicks.yashwantbalaji.com/ — /simulate and /today are the strongest first
clicks.

### Commits

`053ea6957` restoration · `848d87ca3` cadence/dormancy guard rebases · `1b241adde` scene-matrix
direct + log · `1744061d8` p235 poll · `7be5ae4db` ladder optimizer-pool fix. Zero provider
credits spent by this program (the day's paid ingests ran in their own guarded workflow).
