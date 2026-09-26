# Sunday Operator Checklist — the live chain, end to end

**Scope:** the NFL **live** chain — pregame board → live artifact → live observation → provisional
final → canonical final → Results. The pregame side (identity, rosters, injuries, participation,
boards) is [`NFL_EVENT_DAY_RUNBOOK.md`](NFL_EVENT_DAY_RUNBOOK.md) and is unchanged by this page.

**Everything here is read-only and free.** No command on this page calls a provider or spends a
credit. The two that can spend are named in §4 and they decide for themselves.

---

## 0 · The one command

```bash
node app/scripts/ops/nfl-lifecycle-trace.mjs
```

It traces today's slate through all six stages and exits `1` if anything needs attention. Pin a date
or an instant when you are asking about the past — a trace of a past Sunday must not change because
it is read on a Tuesday:

```bash
node app/scripts/ops/nfl-lifecycle-trace.mjs --date 2026-09-27
node app/scripts/ops/nfl-lifecycle-trace.mjs --date 2026-09-27 --now 2026-09-27T21:30:00Z
node app/scripts/ops/nfl-lifecycle-trace.mjs --event 401872953 --json
```

### Reading it

| mark | state | what it means |
|---|---|---|
| `✓` | `OK` | the stage happened and is internally consistent |
| `·` | `NOT_YET` | legitimately empty **at this point in the lifecycle** |
| `✗` | `MISSING` | expected by now and absent — **act** |
| `!` | `INCONSISTENT` | present but contradicts another stage — **act** |

⚠ **`NOT_YET` is not a warning.** A healthy Sunday morning is every game `IN_FLIGHT` with four dots.
Reporting that as a failure is how an operator learns to ignore the output, and then skips a real
`✗`. `NO_GAMES` is likewise a result, not a gap — most days of the week have none.

Exit codes: `0` clean, in flight, or no games · `1` attention · `2` the trace could not run.

---

## 1 · Before kickoff (any time Sunday morning)

```bash
node app/scripts/ops/nfl-lifecycle-trace.mjs
node app/scripts/ops/odds-credit-position.mjs
```

Expect every game `IN_FLIGHT`, with `BOARD ✓` and `LIVE_ARTIFACT ✓ phase PRE`.

**`BOARD ✗ MISSING` on a kicked-off game is the worst finding on this page** — that game has no
pregame record at all, so nothing downstream of it can ever be honest. Nothing is repairable after
kickoff: a board generated post-kickoff is refused by contract and the trace will call it
`INCONSISTENT` if one appears. Record it and let the game go untracked.

`odds-credit-position.mjs` should read `766` remaining and `0` of the `90`-credit Phase H budget,
with **in-play player props: no**. It refuses rather than guesses if any of those cannot be read.

---

## 2 · During the games

The producer owns the lifecycle; the cron only supplies a dense stream. Re-run the trace whenever
you want a picture. Two findings matter:

- **`LIVE_ARTIFACT ✗` — "still says PRE N minutes after kickoff".** The workflow ran and the artifact
  was not refreshed. Check `nfl-live-props` runs; a dispatch is safe and free:
  ```bash
  gh run list --workflow=nfl-live-props.yml --limit 5
  gh workflow run nfl-live-props.yml
  ```
- **`LIVE_OBSERVATION ✗` — "kicked off, refreshed, and not one live value landed".** The artifact is
  being written and the provider is giving nothing back. This is the failure mode that looks
  healthiest from the outside, which is why it has its own stage.

A game whose board published **no** family will show `LIVE_OBSERVATION ✓ "zero live values is
correct, not a gap"`. That is honest: there is nothing to track.

---

## 3 · After the games — the part that used to be invisible

A finished game does **not** reach its terminal state on its own clock alone:

```
LIVE → FINAL_PROVISIONAL → (3h reconciliation window) → FINAL_CANONICAL → stop
```

The window buys a late stat or a late correction somewhere to arrive. While it is open,
`FINAL_CANONICAL ·` is correct. Once it closes the artifact is promoted — **fetch-free**, because
promotion is a statement about the clock and the recorded first-final instant, not about the game.

`nfl-event-window.yml` sweeps daily. If you want it now:

```bash
cd app && node scripts/nfl/capture-live-props.mjs --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --promote-only
cd app && node scripts/nfl/settle-nfl-live-props.mjs --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --write
```

Both are free and idempotent. Then re-run the trace: a completed game should read **CLEAN**, six
ticks.

> ⚠ **This state had never once been reached.** Until 2026-09-26 the producer polled a finished game
> only while its window was OPEN and stamped whatever the clock said at that same instant — so every
> moment that would have written `CANONICAL` was a moment nothing was written. Every NFL prop
> settlement in the repository was permanently `PROVISIONAL`. `finalityAt` was correct and
> unit-tested; the composition was the defect. If you see `FINAL_CANONICAL ✗ "window closed … still
> provisional"`, the promotion sweep has not run — it is not a grading problem.

---

## 4 · The two commands that can spend

Both are hosted in `nfl-live-props.yml`, both are bounded by the ledger rather than by the cron, and
**neither should be forced by hand**:

| | |
|---|---|
| `probe-nfl-live-odds.mjs` | one 3-credit call, once ever, on the first run that finds a game genuinely in progress. A no-op afterwards whatever its verdict. |
| `capture-nfl-live-odds.mjs` | refuses until the probe has PASSED; enforces its own ~30-minute interval against the last recorded call; stops at 90 Phase H credits. |

⚠ **Do not re-probe to get a better answer.** One probe is the authorization. If it returns
pregame-only, the lane closes for 3 credits and that is the result.

⚠ **Live player props are not authorized** and are not affordable — a 15-minute cadence is ~3,060
credits per Sunday against 766 remaining. `odds-credit-position.mjs` prints `in-play player props:
no` for exactly this reason.

---

## 5 · What a good Sunday looks like

```
SLATE: IN_FLIGHT — 14 game(s): 0 clean, 14 in flight, 0 needing attention     ← morning
SLATE: IN_FLIGHT — 14 game(s): 0 clean, 14 in flight, 0 needing attention     ← during
SLATE: CLEAN     — 14 game(s): 14 clean, 0 in flight, 0 needing attention     ← next morning
```

If the last line is `CLEAN`, the real games moved cleanly from pregame through live, provisional
final and canonical final to Results, and you have the receipt without a single ad hoc shell command.

---

## 6 · Known limits of this page

- It covers **NFL** only. MLB's lifecycle is separate and its live lane is documented elsewhere.
- `RESULTS ✓` means the event is carried on the public results surface. It does not audit the
  *content* of a week report — [`NFL_CORRECTIONS_RUNBOOK.md`](NFL_CORRECTIONS_RUNBOOK.md) owns that.
- The trace reads committed artifacts. A locally-generated artifact that was never committed will
  make the trace look healthier than production is. When in doubt, check `git status`.
