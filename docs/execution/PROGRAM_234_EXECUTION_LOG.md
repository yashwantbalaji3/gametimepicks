# Program 234 — execution log

Session 2026-09-05, from 12:54 ET (16:54 UTC). Entry tip `dd068e5c5`, fast-forwarded to
`641ba8732` (three bot commits: EPL matchweek refresh, morning projections, MLB daily slate).
Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged; both pre-existing stashes and founder-owned
`vp/` untouched.

## Phase 0 — the two close SHAs are one lineage, not a contradiction

`de298affe` ⊂ `dd068e5c5` ⊂ `origin/main`. P233's execution log and resume state name `de298affe`
because that was the tip when its suites ran; its final chat named `dd068e5c5` because the log and
resume file were themselves committed afterwards. Both are real, the second is the child of the
first, and nothing needs reconciling beyond saying so. CI run 33976600582 was green on `de298affe`;
production has since covered both (GitHub Production deployments `de298affe` 16:10:04Z,
`dd068e5c5` 16:09:06Z).

Stale row corrected: `PROGRAM_233_ACTION_PLAN.md` still labels Release B **NEXT**. B and C both
shipped — the resume state and the live `/results` explorer say so. Corrected in place; the releases
were not rebuilt.

## Release A — the EPL pre-event question, answered on durable receipts

**Verdict: pre-event artifact AND public delivery verified.** The strongest of the four outcomes the
charter allows, and it is not an inference from a green job.

The fixture is **Newcastle United v Bournemouth**, kickoff `2026-09-05T11:30:00Z`. It is absent from
today's public artifact because that artifact is a CURRENT index which retires started events — the
exact trap the charter names. Three durable sources answer instead:

| dimension | evidence | when | margin |
| --- | --- | --- | --- |
| forecast existed | `data/internal/research/epl/forecasts/snapshot-202609042247.json` — `CURRENT_PRE_EVENT`, `model.probs` home 0.656127 / draw 0.176773 / away 0.167099 | 2026-09-04T22:47:54Z | 12h42m pre-kickoff |
| it was public | `git show 4068acace:app/public/.../forecasts/latest.json` — `public: true`, the row carries `probs` | 2026-09-04T22:47:59Z | 12h42m pre-kickoff |
| it was delivered | GitHub Production deployment `6278982872`, sha `e319935c1`, status **success** — and that tree's `latest.json` still carries the 11:30Z row with probabilities | 2026-09-05T08:36:32Z | **2h53m pre-kickoff** |

The delivery link is what a successful job alone could not prove. It holds because these deployment
records are demonstrably the thing the domain serves: production's own `/data/build-info.json`
reports commit `641ba8732` built 16:23:03Z, and the Production deployment record for that same sha
was created 16:31:16Z — records are written at build completion, so a `success` row for a sha means
that sha reached production. `[skip ci]` suppresses GitHub Actions only; the host still builds.

P233 saw the 12:55Z run and reasonably suspected a miss. What it actually saw was the *dated* file
`forecasts/2026-09-05.json` being created for the first time at 12:56:51Z — after kickoff. The
pre-event delivery rode on `latest.json`, which nothing reads a date out of.

**Archival gap recorded, not fixed here.** `forecasts/2026-09-05.json` never contained the 11:30Z
fixture, so the dated archive under-reports the day's real coverage by one fixture. No surface reads
the dated files (`forecast-view.ts` reads `latest.json` exclusively — verified), so nothing a reader
sees is wrong today; the receipt for that fixture lives in git history and the internal snapshot.
Nothing was backdated and nothing was regenerated post-kickoff.

### The publication predicate, narrowed

P233's `published: Boolean(set.public) && Boolean(r.probs)` is right in principle — publication is
the presence of the numbers, not a state name — and had one hole left: **a truthy object is not a
forecast**. `{}`, `{home: null, ...}` and `{home: NaN, ...}` are all truthy and would each have
reported a fixture PUBLISHED with nothing to print. Same shape as the de-duplicator that once
returned a truthy object where a boolean was expected.

`src/lib/offered-window/forecast-publication.mjs` now asks whether the row carries a distribution a
reader could be shown: three finite numbers in [0,1] summing to one. Checked against every committed
row first — **54/54 probability-carrying rows pass** (observed sums 0.999999–1.000001, hence the
1e-3 tolerance), 28/28 withheld rows fail. A stricter rule that refused honest rows would send the
whole sport back to WORK_OWED, so the test asserts both sides.

Deliberately **not** added here: a pre-event check on `published`. `classifyEvent` already returns
STARTED before it considers `published`, so a post-start regeneration cannot be typed PUBLISHED.
Duplicating it would fail honest rows carried forward after kickoff — the guard-deletes-itself
pattern.

The test is data-driven rather than a grep of the builder's source, and it was **mutation-probed**:
reverting the predicate to `Boolean(probs)` fails 2 of its 5 tests; restored, 5/5. Offered-window
suite 25/25, typecheck clean.
