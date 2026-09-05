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

## Release B — the reveal is a presentation, not a ten-second wait

`f7a47c5d1` → `e355a092d` (pushed after rebasing over six bot commits).

**What a reader gets.** One click on a `/simulate` card lands on the game report with a bounded
frame already open: eight chapters, ~45 seconds of auto-play, the pointer can stay still throughout,
and the full report is one control away at every moment. It replaces a reveal that held every reader
for a fixed **ten seconds** of animation before showing a dashboard that had been in the page all
along — the charter's own instruction is not to make people wait through theatrical computation to
reach an available result.

**The manifest is a projection and nothing else.** `lib/simulate/presentation/` carries every figure
from `fullGameSim` / `prediction`; it recomputes nothing, so "the screen equals the report" is
provable by identity rather than by running the same arithmetic twice and hoping. It refuses to
build when the two artifacts stamp different `artifactHash` values, and when `reconciled.ok` is
false. A run count appears only where `allowsRunCountClaim` permits it.

**No LOADING state, deliberately.** The charter lists one; the data is already in the page, so a
progress bar here would be the ceremony this release removes. Every other state is implemented and
the machine refuses what it should: a second START returns the same object (no second clock), NEXT
at the last chapter reaches COMPLETED rather than an index nobody wrote, and an action carrying a
different `eventId` is dropped.

**Two defects the browser caught that no DOM assertion would have.**

| defect | why source inspection would have missed it |
| --- | --- |
| the site footer painted over Skip / Back / Pause | the buttons were present, visible and enabled the whole time — the frame was inside the report's stacking context, where `z-50` on a descendant cannot beat a sibling of its ancestor. Portalled to the body. |
| the totals histogram was empty | the artifact's bins are objects (`{value,label,count,probability}`), not numbers. Read as numbers they became a row of zeroes. **My own test looped over the empty array and passed** — it now asserts the bar count before the contents, and is mutation-probed. |

The `?play=1` deep link puts the trailing slash **before** the query, because `trailingSlash: true`
answers `/games/mlb/x?play=1` with a 308 that discards the query — this project has lost query
intent to that redirect before.

## Release C — four sports, four different honesty problems

`178d0f47c`. EPL, UFC and NFL now open the same frame from their own pages through sport-native
adapters, and `/simulate` deep-links every ready sport rather than only MLB.

**UFC is not winner-only.** The charter said it was, on the strength of an earlier review. The
artifact disagrees: `card-latest.json` publishes `winner`, `method` and `rounds`, all three carrying
a `PASS` verdict and held-out evidence over 3,557 fights. Method and round chapters are therefore
shown — gated on those verdicts in code, not on my reading of them.

**One sentence is deliberately NOT carried.** Every other limits row repeats its artifact's own
words. `model.notModelled.moneyline` still reads "our authorisation to buy odds covers NFL only",
which expired: a UFC odds receipt exists, `/ufc` shows posted prices, and the model has been scored
against the de-vigged line since 2026-08-22 — `/ufc` already carries a long comment about having
once printed that same expired sentence directly above the prices it denied. Reprinting it inside a
persuasive frame would reintroduce the contradiction. A test pins the omission. **The producer still
emits it; that is a real finding and it is open.**

**NFL had no live slate, so the adapter is proven on a frozen artifact.** `NO_ACTIVE_SLATE` is a
real state, and an adapter proven only against a live slate is proven never. The committed settled
preseason game (CHI @ TEN, 2026-08-29) presents in the **past tense** under its true event date with
`archived` readiness. My first version refused started games outright, which confused "cannot
forecast this now" with "cannot display what we forecast then" — the frozen pre-event forecast is
exactly what an audit needs. `BASELINE_ONLY` stays `degraded`: an animation cannot promote a shared
prior into a measured one.

**Three defects found while wiring.**

| defect | fix |
| --- | --- |
| the histogram caption was hardcoded in the player: "Total runs · share of simulated games" — printed under an **EPL goals** chart, wrong unit and a trial-count claim for a model that solves an exact matrix | captions belong to the adapter; a cross-sport test now fails any claim of simulated trials whose provenance carries no run count |
| the EPL limits chapter said "Nineteen graded matches" as a literal — four settled the same afternoon | carries the producer's own track-record sentence, passed from the page that already prints it |
| a client component importing `READY_STATES` from `day-view` pulled `node:fs` into the browser bundle and failed the export build | constant moved to a filesystem-free module, re-exported from `day-view` so there is still one definition |

**A guard failed because the product improved, and the producer was wrong.** Today's settlements
took EPL to 23 graded matches, past the calibration blocker's `< 20` threshold, so the blocker
vanished — while its gate stage stayed UNPROVEN and still listed in `gate.remaining`. The lane
reported a stage nobody was blocked on. Two things were wrong: the threshold measured **graded**
matches when the stopping rule needs **paired** ones (18 of 30), and a blocker was allowed to
disappear while its stage remained. The blocker is now derived from the stage and can only clear
when the stage is proven; its state still moves from REALITY_GATED to ENGINEERING when the sample
arrives, which is the distinction the guard exists to protect. **Producer fixed, guard kept,
mutation-probed** — deleting the guard would have been the easy read of "it fails on an honest state".

Gate green at both releases: typecheck, 5,173 unit, 442 rendered, 12 browser assertions.
Money `md5 affe6b21071f2b3be96bb2774eb347c3` unchanged.

### Open findings carried forward

| finding | where it belongs |
| --- | --- |
| `card-latest.json` still emits the expired "covers NFL only" sentence | producer fix — Release I |
| `/nfl/game/[eventId]` is an **orphan route**: nothing in the built export links to it | navigation — Release I |
