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
| C forecast history | P234 archive gap (Newcastle 11:30Z) | `recover-forecast-history.mjs` | recovered fixture reachable from `/epl` | **SHIPPED** `8694e8624` | generalize to MLB/NFL/UFC if their sources show the same shape |
| D full results explorer | P234 Release E/F | `build-model-results-index.mjs`, `model-results-explorer.tsx` | index reconciles with `graded-picks.json`; drill-down serves | **SHIPPED** `66928794a` | extend beyond MLB when another sport publishes per-row detail |
| E odds + coverage | P234 `ACQUISITION_UNSCHEDULED` | `p171-authorization.mjs`, `acquisition-cadence.mjs` | expired receipt refuses without spending | **SHIPPED (engineering)** `fb5d43184` · **ACQUISITION_ACTIVE for UFC/EPL, GATED for NFL** | founder renewal for NFL |
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


## Release C — the archive gap was real, and it was not the one that was reported

`8694e8624`.

**P234 named the wrong fixture.** Newcastle v Bournemouth is in `2026-09-03.json` and
`2026-09-04.json`: the dated files are named by GENERATION date, not kickoff date, so a fixture
forecast the evening before appears under that evening's file. Its page has been reachable
throughout, and retirement of started events behaved correctly. A test proves that rather than
repeating the claim.

**The real gap is a schema transition.** Nine dated rows carry full probabilities and no `slug`,
because the producer had not started emitting one; `loadEplForecastArchive` keys on `slug && probs`,
so they sit in the file and are absent from the product. Eight reappear in later dated files. One
does not: Arsenal v Coventry City kicked off at 19:00Z on 2026-08-21 and the next dated file was
written at 23:51Z. Its forecast was public with probabilities in three committed revisions, the last
**42 minutes before kickoff**, and it had no report page.

The repair regenerates nothing. It recovers the AUTHENTIC slug from the committed public revision
carrying the same canonical `eventId` and carries the forecast through byte-identical; a row whose
slug appears in no such revision is left missing, because deriving one from the event id would
produce a plausible string that was never published. Forecast creation, slug publication and the
repair are three fields, and tests pin that the recovered forecast predates its kickoff, equals its
source, can never shadow a dated row, reruns identically, and leaks no private payload.

Dry run reports recoverable / already represented / conflicting / unavailable — today **1 / 8 / 0 / 0**.

**It stopped one step short at first.** The recovered page existed and nothing linked to it — the
orphan-route class P234 closed for `/nfl/game`. `/epl` now carries an archive of every fixture ever
forecast, labelled as past, which un-orphans all of them at once. Guard scans the built export and
is mutation-probed.

## Release D — 40,072 settled picks, of which 60 were reachable

`66928794a`.

`graded-picks.json` counts 40,072 graded model picks and publishes 60. The rest were never missing —
they sit one row per pick in the per-date calibration files — but nothing could reach them: the
export prune keeps only data files the shipped output names, and it considers only `.json`, so not
one `.jsonl` had ever survived a build.

**The reconciliation is the feature**, so the producer refuses without it: the detail must reproduce
the published aggregate exactly — 19,015 wins, 18,943 losses, 2,114 pushes, 37,958 decisive — and
exits 2 when it does not.

Architecture forced by the deployment: the page carries a compact per-day summary (~19KB) with each
partition's URL, which is enough for every filter and headline without a fetch **and** is what keeps
the prune from deleting the 85 partitions. `model-index.json` itself is a build-time input, named by
nothing shipped, and is correctly pruned — verified 404 on production while every partition serves.

`edgePct`, `confidence` and the source path are stripped in the PRODUCER, so a reader opening the
JSON sees what the page sees. The browser suite proves the market families exactly **partition** the
whole rather than overlapping it.

## Findings carried forward

- **Registry gap.** Six products are registered; the lab ledger carries five streams and four ladder
  directories. MLB and NFL paper cards and the mixed-sport population are produced and settled by the
  same owners without being registered.
- **EPL learning report lags its own grades.** Twice in two programs the control plane refused to
  build because the artifact said 23/18 (then 24/19) while the ledger recounted one more.
  `epl-settle.yml` does regenerate it, but grades arriving through a different job's results capture
  leave it stale until settle next runs — and that regeneration step is `|| echo "::warning::"`,
  so it can also fail softly. A Release F question.
- **Not covered by the replay harness, with reasons:** `bank-builder` and `moonshot` settle through a
  Python-pipeline shell wrapper requiring a venv; `homer-nukes` grades from a live StatsAPI fetch.


## Release E — the other half of the founder's sentence had no code behind it

`fb5d43184`. **No paid call. No token synthesized.**

### Authorization inventory (from the committed receipts, not from memory)

| sport | scope | ceiling | markets | expiry | recurring | spend | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NFL | `americanfootball_nfl` | 3,000 | team + props + anytime-TD | **Program 171 close OR the ceiling** | program-scoped | 69 / 3,000 | **GATED — lapsed** |
| UFC | `mma_mixed_martial_arts` | 500 | `h2h` only | the ceiling | **yes** — fight-week Tue/Thu/Sat 07:00 ET | 20 / 500 | **ACTIVE** |
| EPL | `soccer_epl` | 500 | 1X2 + totals | the ceiling | **yes** — ≤3 captures per matchweek | (own ledger) | **ACTIVE** |

### I mis-traced two workflows in P234

It mapped NFL to `nfl-odds-capture.yml` and UFC to `ufc-odds-refresh.yml`, found no cron in either,
and reported both as `ACQUISITION_UNSCHEDULED`. **Both are dispatch-only tools.** The jobs that run
are `nfl-event-window.yml` (3 crons, `capture-nfl-odds.mjs --authorized`) and `ufc-fight-week.yml`
(4 crons at Tue/Thu/Sat 11:00 UTC — the exact cadence the UFC receipt authorizes). Naming a workflow
after a sport does not make it the job that runs. A guard now binds the mapping to evidence: the
named workflow must exist **and** invoke that sport's capture script.

### The expiry term was parsed by nothing

`Expiry | Program 171 close OR the 3,000-credit cumulative ceiling, whichever first` — two
conditions, of which only the numeric one ever had code. Nothing overspent (69 of 3,000 across 107
requests); the founder's own end condition was simply unread, and the only thing stopping recent
calls was an empty event window.

A program-scoped expiry cannot be evaluated from the receipt, and inferring it from the running
session's name would be the script deciding its own authorization — so it fails closed and names the
renewal. **UFC and EPL expire at their ceilings alone and stay authorized**, which a test pins: this
must not disable two live recurring acquisitions to fix a third.

An expired allowance exits **0** with `AUTHORIZATION_EXPIRED`, not 2. A malformed receipt is a broken
file and should fail loudly; a lapsed one is a decision owed, and a scheduled workflow going red
three times a week for a state nobody can fix by rerunning it is as unreadable as one permanently
green. Verified live: refuses, spends nothing, ledger unchanged at 69.

`ACQUISITION_UNAUTHORIZED` joins the window vocabulary, distinct from `UNSCHEDULED` because the
remedies differ. NFL's 16 events now carry it.

### Five guards were repointed, and one was about to pass vacuously

They used the live receipt as a fixture while testing scope, ceiling, floor and fail-closed parsing —
none about expiry. Repointed to a renewed fixture. One asserted a call is refused before the ceiling
is crossed, which **an unparsed authorization satisfies trivially**; it now asserts the fixture
parses first, and that a call inside the ceiling is still allowed.

### ENGINEERING_COMPLETE vs ACQUISITION_ACTIVE

- **UFC · ACQUISITION_ACTIVE** — recurring, authorized, scheduled, 20/500 spent.
- **EPL · ACQUISITION_ACTIVE** — recurring, authorized, scheduled.
- **NFL · ENGINEERING_COMPLETE, ACQUISITION_GATED** — the capture, ledger, ceiling guard and clean
  refusal all work; the allowance is lapsed. Needs `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or
  `DEFER`. **A renewal is a founder edit to the receipt's Expiry row, not a code change** — a test
  proves a ceiling-only expiry restores authorization with nothing else altered.
