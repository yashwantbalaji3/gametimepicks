# Program 235 — execution log

Session 2026-09-05, from 17:32 ET (21:32 UTC). Entry `9f5ecbf3e`, resynced to `0dcdee367`.

## Baseline (≈10 min)

**Ancestry resolved.** `69bc2919c ⊂ ef2f1ea07 ⊂ 9f5ecbf3e ⊂ origin/main` — one strict linear chain,
no divergence, nothing to reset.

**P234's one open item is closed.** Its final report recorded CI on `ef2f1ea07` as *in progress*.
It has since completed **success**. Production serves `9f5ecbf3e`, which differs from `ef2f1ea07`
by two docs files and nothing else — verified by diff — so that green run covers the deployed code.
The single bot commit ahead touched 6 data files and **0** code files.

**Preserved:** both stashes; founder-owned `vp/` (7 untracked files, never committed); money
`portfolio.json md5 affe6b21071f2b3be96bb2774eb347c3` and
`bank-builder-locks.json md5 cb80473f88f3cb5f67208fa568925295`, both matching the P234 baseline.

**Registry gap found.** Six products are registered (`bank-builder`, `moonshot`, `end-zone-vault`,
`homer-nukes`, `ufc-cards`, `epl-cards`), but the lab ledger carries **five** streams (mlb, nfl,
ufc, epl, multi) and four ladder directories exist. MLB and NFL paper cards, and the mixed-sport
population, are produced and settled by the same owners as the registered pair without being
registered themselves. Carried as a finding; the settler covers them regardless (`LADDER_DIRS`).

## Release table

| release | starting evidence | owner | executable acceptance | status | next |
| --- | --- | --- | --- | --- | --- |
| A replay safety | P234 matrix row: PARTIAL, harness unbuilt | `settle-lab-cards.mjs`, `settle-nfl-experimental.mjs` | `npx tsx --test src/lib/products/replay-safety*.test.mjs` | **SHIPPED** `7fa36c9c7` `511f171e5` `4ca211d47` | extend to homer-nukes if its network dependence can be recorded |
| B process + gate | P234's leaked watcher | `scripts/ops/run-job.sh`, existing `watch-gate.sh` | `npx tsx --test src/lib/ops/job-status.test.mjs` | **SHIPPED** `b639c5d40` | — |
| C forecast history | P234 archive gap (Newcastle 11:30Z) | TBD | dated journey reaches a recovered report | NOT STARTED | inventory each sport's durable source |
| D full results explorer | P234 Release E/F | `results-explorer.tsx`, `card-math.mjs` | filter + drill-down reconcile to source | NOT STARTED | inspect model-pick detail coverage first |
| E odds + coverage | P234 `ACQUISITION_UNSCHEDULED` | `build-offered-window.mjs` | dry-run plan + receipts | NOT STARTED | authorization inventory |
| F daily products | Release A lifecycle | product pages | product card → settled record | NOT STARTED | — |
| G forward evaluation | P234 registrations | `evaluate-candidate.mjs` | reports INSUFFICIENT_SAMPLE until eligible | NOT STARTED | — |
| H four-sport journeys | P234 Release H | e2e specs | cross-engine + recording layouts | NOT STARTED | — |

## Release A — the replay harness, and a card that would have pended forever

`7fa36c9c7` · `511f171e5` · `4ca211d47`.

**The defect the harness found on its first run.** A card whose every leg PUSHES settled as
`pending` and stayed there. Pushes are filtered out of `decisive`, so an all-push card left that
array empty: not pending, no loss, and no winning leg to satisfy the win clause — so it fell through
to `pending`. Nothing would ever revisit it, because settlement targets ET-yesterday and the
completion rule only moves a card out of pending when a result *arrives*, and every result had
already arrived. It is the failure this file's own comments describe: gradeable, and sitting pending
forever while the published record computes over the cards that happened to settle.

An NFL tie on a two-way moneyline reaches it in one leg. **No live day had produced one**: zero push
legs exist across all 47 committed cards, so the fix rewrites no history and changes no settled
record — verified by dry-running three real dates before and after, identical.

**What makes it a test rather than a wrapper.** It invokes the real settler through its real entry
point in a child process with `--apply`; it asserts on BUSINESS STATE, never stdout or an exit code,
because a script can exit 0 having written the wrong receipt twice; and volatile stamps are excluded
by name, so "identical" is a claim about the record rather than the bytes.

Isolation is complete rather than nearly complete: the child's cwd is inside the store, which is what
isolates the loaders resolving from `process.cwd()` — the EPL results bridge among them.

| covered | |
| --- | --- |
| outcomes | win · loss · push · pending |
| replay | 3× same date · duplicate invocation · crash between write and acknowledgement |
| delivery | late · out-of-order · vanished source · corrected final (refused) |
| concurrency | two settlers racing one date |
| isolation | cross-product contamination · unreadable box score · no-card day |
| mutation | classifier forced to NO_CHANGE ⇒ the late completion stops working and the suite fails |

**End Zone Vault covered separately**, because its lifecycle is not the ladder's: repo-shaped store,
an accuracy ledger that can never move money, and a forecast-of-record rule (latest revision written
*before* kickoff) with no counterpart in the ladder. Fixtures are the repository's own committed
receipts, copied unchanged.

**One of my own assertions was vacuous.** "A missing result leaves the event ungraded" asserted on
`winnerHit`, a field the receipt does not have — the outcome lives under `grade`, provenance under
`lineage`. Every event returned `null`, so it was satisfied by nothing and would have passed even if
the settler had graded the whole day out of thin air. It now reads the real field and proves, in the
same test, that the fixture *with* results does grade.

**And the harness caught me too.** A smoke test confirming `--repo-root` had not changed default
behaviour re-stamped `generatedAt` on two committed artifacts. Grades were byte-identical — itself
evidence of content idempotency — but my clock had leaked into a real record and I reverted it. The
vault settler now has an opt-in `--dry-run`; the parlay settler already defaulted to dry, and that
asymmetry was the trap.

**Not covered, with reasons:** `bank-builder` and `moonshot` settle through
`scripts/automation_settle.sh`, a Python-pipeline wrapper requiring a venv and a repo-root `.git` —
a materially different lifecycle. `homer-nukes` grades from a live StatsAPI fetch. Both are recorded
as remaining rather than claimed.

## Release B — the helper existed; the local half did not

`b639c5d40`.

P163 built `watch-gate.sh` for remote runs and wrote the rules down in `docs/OPS_WATCHERS.md`. P234
leaked a watcher anyway — **not by breaking those rules, but by being outside them**. It waited on a
LOCAL `npm run gate`, for which no helper existed, so it hand-rolled a log grep. Three failures in
one line: the marker went to the command's stdout and never reached the file; the job had already
finished; and the foreground timeout stopped applying once the loop was backgrounded.

The remote half needed nothing and was reused. `scripts/ops/run-job.sh` is the local half, its
guarantees the inversions of those three failures:

- **completion is a receipt**, written last and atomically after a real exit code is collected — a
  truncated log cannot hide a status and a log containing "SUCCESS" cannot invent one (both tested);
- **the deadline is inside the wrapper** via `timeout(1)`, so backgrounding cannot defeat it, and
  where no `timeout` binary exists the receipt says `deadlineEnforced: false` rather than pretending;
- **a lost child is UNKNOWN, never SUCCESS** — defaulting a null exit code to zero is how a job that
  never ran reports as passing.

The decision layer is pure with an injected clock, so both timeout cases are proven in microseconds;
exactly one test lives through a real deadline, and it is two seconds.

**Dogfooded:** this release's gate ran through the wrapper — SUCCESS, exit 0, 195s,
`deadlineEnforced: true`, tested tree on the receipt, 5,279 unit and 444 rendered. Zero owned
processes at close.
