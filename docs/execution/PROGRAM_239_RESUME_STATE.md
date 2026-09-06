# Program 239 · resume state

Start `77d493387` → tip `600ecacb8`. Protected money unchanged:
`affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295`.
Two stashes and untracked `vp/` preserved. **Zero provider credits spent.**

## Bank Builder and Moonshot — exact state

| Stage | State |
|---|---|
| Generated | **Yes** — 2026-09-06 17:39Z, four lanes from the live team-market pool |
| Activated | **Yes** — `status: active`, all legs pre-event at selection |
| Paper exposure reconciled | **Yes** — $250 = $200 BB + $50 Moonshot, isolated to the daily view; `build-mr-dub-ledger.mjs` never reads that file, so it has no protected-money authority |
| Publicly visible | **Yes** — "Seattle Mariners to win", "Los Angeles Dodgers to win" live on /bank-builder |
| Settlement-ready | **Yes, as of this program.** Before it, every leg graded `settleable=false` |
| Observed through a real transition | **Partially** — Bank Builder Lane B settled LOST against Toronto 1-6 in a temp store; the production write happens on tonight's cron |

Card ids: `bank-builder-lane-a-step-1`, `bank-builder-lane-b-step-1`,
`moonshot-lane-a-2026-09-06`, `moonshot-lane-b-2026-09-06`.

Evidence classes, kept apart:
* **Fixture-tested** — the nine daily-chain scenarios, run against the real settler in disposable stores.
* **Manually executed** — the real card graded against real StatsAPI results in a temp store; no production write.
* **Naturally scheduled** — not yet. `nightly-settle` 05:30/07:30 UTC settles ET-yesterday; tonight's run is the first that will settle a card these products generated.

## Pending acceptance events

1. **Tonight's `nightly-settle`** writes the first real settlement of a generated card.
2. **The `workflow_run` trigger** has still not been observed firing; its first exercise is the next
   `mlb-daily-production` completion.

## Not done

Releases **B, D, E, F, G, H** — prospective multi-lane ladder accounting, selection/payout policy,
remaining hub content, registry and cross-sport results, forward evaluation, and the visual/recording
acceptance pass.

The two ladder stores (`moonshot-lane/active.json`, `dual-bank-builder-active.json`) still sit on
2026-08-17 and their generator remains gated on multi-lane exposure accounting. That is a separate
publication path from the daily portfolio, which is live.

## Reproduction

    npx tsx --test app/src/lib/products/daily-chain.test.mjs            # 9 end-to-end scenarios
    npx tsx --test app/src/lib/products/mlb-team-market-grading.test.mjs
    npx tsx app/scripts/settle-mlb-player-props.mjs --date <D> --app-root <fixture>

## Founder decisions outstanding

Unchanged and unsynthesised: `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` ·
`CONSOLE_REDEPLOY:RUN`. Moonshot disposition settled (repair and resume); not re-asked.
