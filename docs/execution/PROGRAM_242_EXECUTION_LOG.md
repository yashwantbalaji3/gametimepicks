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

## Phase 4 · publication chain (Sep 7)

- 13:30Z morning-projections cron did not fire (drift beyond envelope) — the publication
  watchdog (P215 machinery) detected it and DISPATCHED morning-projections at 16:42Z; projections
  committed 16:44Z (`338f89230`). Natural remedy evidence: the watchdog's first live catch.
- Downstream (mlb-daily-production → daily-products workflow_run) being observed.
