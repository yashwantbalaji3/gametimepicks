# Program 235 — resume state

**Entry** `9f5ecbf3e` · **current tip** `4c9cdd180`, pushed.
Money `portfolio.json md5 affe6b21071f2b3be96bb2774eb347c3` and
`bank-builder-locks.json md5 cb80473f88f3cb5f67208fa568925295` unchanged. Both stashes and
founder-owned `vp/` untouched. **No paid call in this program.**

## Done

| release | outcome | commits |
| --- | --- | --- |
| A | replay harness over the real settlers; found an all-push card that pended forever; End Zone Vault covered separately; `--dry-run` added to a settler that had none | `7fa36c9c7` `511f171e5` `4ca211d47` |
| B | `scripts/ops/run-job.sh` — the local half the leaked watcher needed; remote half reused unchanged | `b639c5d40` |
| C | forecast history recovered (P234 named the wrong fixture); `/epl` archive un-orphans every played fixture | `8694e8624` `cf5f81524` |
| D | all 40,072 settled model picks reachable and filterable, reconciled to the published aggregate | `66928794a` |
| E | odds authorization expiry enforced; two mis-traced workflows corrected; `ACQUISITION_UNAUTHORIZED` | `fb5d43184` |

## Next executable action — Release F

Start with the finding already recorded: **the EPL learning report lags its own grades.** Twice in
two programs the control plane refused to build because the artifact said 23/18 (then 24/19) while
the ledger recounted one more. `epl-settle.yml` does regenerate it, but grades arriving through a
different job's results capture leave it stale until settle next runs — and that regeneration step
is `|| echo "::warning::"`, so it can also fail softly. Decide whether the regeneration belongs to
whichever job writes a grade.

Then F's own scope: each active product's page showing its current card or an explicit
no-card/pending state, and slip-level results kept separate from leg-level and from the model-pick
ledger.

**G** (forward evaluation) and **H** (four-sport journey verification) are untouched.

## Do not repeat

- **A test must not write to the repository.** Two did: a smoke test re-stamped a settlement receipt,
  and the recovery rerun test rewrote `recovered.json`. Both settlers/tools now take an isolation
  flag (`--app-root`, `--repo-root`, `--out`, `--dry-run`).
- **CI clones at depth 1.** Two Release C tests read committed revisions and failed there while
  passing locally. Detect a shallow clone and skip with a reason; keep the artifact-only assertions
  carrying the weight.
- **Trace the caller, not the filename.** `nfl-odds-capture.yml` and `ufc-odds-refresh.yml` are
  dispatch-only tools; the scheduled callers are `nfl-event-window.yml` and `ufc-fight-week.yml`.
- **Enforce every half of an operative term.** The NFL receipt's expiry had two conditions and only
  the numeric one had code.
- **A repointed guard can become vacuous.** An unparsed authorization refuses every call, which
  silently satisfied a ceiling test. Assert the fixture is valid before asserting what it refuses.
- Run the gate through `scripts/ops/run-job.sh` — the receipt is the completion signal.

## Founder decisions outstanding

| token | what it unblocks | note |
| --- | --- | --- |
| `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` | NFL odds acquisition | a renewal is an edit to the receipt's **Expiry** row, not a code change |
| `MOONSHOT_REPAIR_PAUSE_OR_RETIRE:<branch>` | Moonshot disposition | unchanged |
| `CONSOLE_REDEPLOY:RUN` | protected console | unchanged |

UFC and EPL acquisition are **already authorized, recurring and active** — no token needed, and the
NFL receipt explicitly cannot fund either.
