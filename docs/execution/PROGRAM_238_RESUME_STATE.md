# Program 238 · resume state

Start `4508228fb` → tip `f65de51c8`. **CI green on `f65de51c8`**; production serving `f65de51c`
(built 2026-09-06T20:31:23Z). Protected money unchanged:
`affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295`.
Two stashes and untracked `vp/` preserved. **Zero provider credits spent.** Zero owned processes.

## Observed today — not simulated, not manual

| | |
|---|---|
| `mlb-daily-production` | 17:04Z success → team-markets 17:05Z, 14 games |
| `daily-products` | 17:39Z success → **4 lanes ACTIVE**, $250 open exposure |
| `nightly-settle` | 11:42Z success → ladder settler ran, `0 settled · 3 held` |

Bank Builder A `+124`, B `+200`; Moonshot A `+1089` (4 legs), B `+9437` (8 legs).
This is the unattended scheduled operation P236 and P237 could only leave pending.

## Shipped

1. **Release A** — `daily-products` runs on `workflow_run` after its producer succeeds, gated on
   conclusion; cron kept as receipt-checked recovery; `pool-gate.mjs` validates date/sport/schema/
   population/provenance/freshness with named exits.
2. **Release B** — EPL forthcoming window (12 fixtures) exposed; MLB reads its own day.
3. Four defects that arrived with today's bot data: unscheduled index producer, UFC stale odds
   pointer, a presentation guard passing for the wrong reason, `md5` banned as a word.

## Not done

* **Releases C, D, F, G, H** — prospective multi-lane accounting, selection policy/payout bounds,
  registry and cross-sport results, forward evaluation, and the presentation/recording acceptance
  pass. Untouched this session.
* **The `workflow_run` dependency is shipped but not yet observed firing.** Its first natural
  exercise is the next `mlb-daily-production` completion. That is the exact pending acceptance event.
* **UFC odds for the current card.** `odds-latest` still describes the finished event; the next
  authorized capture is Tue/Thu/Sat 11:00 UTC. The state is now named (`NOT_YET`), not repaired —
  there is nothing to repair, only a window to wait through.
* **Moonshot publication** to the paper ladder remains blocked on multi-lane exposure accounting.

## Reproduction

    npx tsx app/scripts/products/check-pool-ready.mjs --date <D>     # 0 usable/empty, 20-23 refusal
    npx tsx --test app/src/lib/daily-portfolio/pool-gate.test.mjs \
                   app/src/lib/daily-portfolio/dependency-ordering.test.mjs
    npx tsx app/scripts/products/settle-ladder-cards.mjs             # dry run is the default

## Founder decisions outstanding

Unchanged and unsynthesised: `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` ·
`CONSOLE_REDEPLOY:RUN`. Moonshot disposition settled (repair and resume); not re-asked.
