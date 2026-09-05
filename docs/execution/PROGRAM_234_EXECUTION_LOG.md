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

### Correction — Release B's tip was red in CI, and I called it green

`e355a092d`'s commit message reports "5157 unit ... all green". That was true of a tree I had
already edited past. I ran the unit suite, then added the `?play=1` handler — whose comment contained
the words "static-export-safe" — then built, ran the browser specs and the *rendered* suite, and
committed. The banned-copy guards are phase-1 unit tests: they never saw the tree I pushed.
`\bsafe\b` matches across a hyphen, so five of them failed, along with two control-plane tests that
had drifted on the afternoon's EPL settlements.

CI run `33981089047` on `e355a092d`: **failure**, 9 failing tests. Every one is fixed in
`178d0f47c`, whose full `npm run gate` was green locally on the exact committed tree and whose CI run
`33982736245` is **success**. Production covers the fixed tip.

The process fix is one line: run the gate *after* the last edit and immediately before the commit,
not before the last edit. A suite result is about a tree, not about a session.

### Open finding — a flaky guard on the deploy gate

`founder-token-boundary.test.mjs` failed twice in four local `suite:built` runs, both times with
`ENOENT` from `readdirSync` **mid-walk** on a date-based route directory that exists before and
after (`out/results/date/2026-07-31`, then `out/mlb/board/2026-08-06`). It passes on three
consecutive isolated runs and passed on the immediate re-run, and it passed in CI on both tips. I did
not touch it, and no test in the corpus removes anything under `out/`.

Not fixed, deliberately: the cause is unidentified, and a resilient walker that swallowed a vanished
entry would convert an unknown concurrency signal into silence on a boundary guard that scans the
public export for founder gate tokens. Recorded with its reproduction rather than guessed at.

## Release D — recording mode, and the flake that had been hiding in the gate

`b11c51070` (mode) · `f2a4ec509` (the three board types).

**What a reader gets.** The same player, re-composed into a crop they can screen-record: 9:16, 4:5
and 16:9, a three-second countdown, Start replays from chapter one, and after that the pointer never
moves again. Every control sits **outside** the capture rectangle — measured in coordinates by the
browser suite, not asserted in prose — while the event, its date, the readiness label, the domain and
the paper-only disclosure stay inside it, where they cannot be cropped away from the statistics they
qualify.

Three composition defects, each found by looking at the frames rather than the DOM:

| defect | fix |
| --- | --- |
| the first 9:16 cut was a third empty black — header pinned top, numbers floating mid-frame | header and body are one centred block; the sport's own scene (aria-hidden, motion-gated) fills tall crops behind the text without adding a claim |
| 16:9 **clipped its dense chapters silently** — content hidden, no scrollbar, nothing to say anything was missing | landscape had width nobody was using: rows in two columns, and the closing chapter puts its scene beside its rows |
| type sized for a desktop panel, not a phone-sized recording | larger in a recording |

**The three board types.** Today's Top 10 (`/today`), a published parlay card (`/build`) and a
results recap (`/results`). Each refuses the overstatement available to it: a six-pick board has six
rows and a sentence about the other four; a card shows its combined price *with* the tier's own
record beside it and states that its legs are not independent; a recap carries period, population,
record and denominator, and reads "unavailable" rather than 0% at zero decisive.

**A number that was exactly double.** The first live recap read "14-70 across 84 decided" beside a
page showing "7-35 · 42 decisive". The read model emits a whole-stream row **and** a row per tier
within it, and I had summed both — a total pooled with its own parts. It now refuses a mixed-
granularity set rather than choosing a level, because choosing would be the same guess that produced
the wrong number. Only putting the two numbers side by side caught it.

**THE FLAKE, DIAGNOSED.** `founder-token-boundary` had failed three times in six gate runs with
ENOENT partway through walking a directory that existed before and after, passed in isolation every
time, and passed in CI. The cause: `suite-phases.test.mjs` proved "no export ⇒ the rendered phase
refuses" by **renaming `app/out` aside and back** — while the seventy sibling guards that read `out/`
ran in the same parallel batch. For the length of one spawn the export vanished underneath them.

The runner now takes `--app` and the refusal is proven against a scratch tree, so no test moves the
artifact its siblings are reading. Three consecutive clean rendered runs where two of the previous
six had failed. **The guard was never the problem and was not touched.**

## Release E — the record can be asked about a period

`d211a1036`.

The first question was whether a date filter would be honest at all. P233's five ledgers are
**aggregates**: `lab-ledger.json` holds one record per stream and none of the cards behind it, and a
date control over an aggregate narrows the label without narrowing the number.

Dated detail exists for exactly one population. `lab-settled/<date>.json` carries every card that
settled that day, and summed it reproduces the published ledger **exactly** — 6-31 MLB across all
four of its tiers, 0-2 UFC, 1-2 EPL. That reconciliation is a test, and the whole feature rests on it.
Model picks publish 60 sampled rows against 37,958 counted, so they get **no** date control and a
sentence saying why.

**The defect caught while building it:** a 7-day headline of 3-10 sat directly above per-sport rows
reading 6-31 from the all-time ledger, with nothing on screen saying they counted different periods.
Same cards for both now, and a test asserts they sum.

Shipped honest by construction: a reversed range refuses rather than widening to all time; an empty
period reads "no card in this selection", never 0%; a trailing `+n` marks unsettled cards that are in
no rate; mixed-sport cards are their own population; the date basis (the cohort's publication day,
not whichever leg settled first) sits beside the control that depends on it; and every populated
grid cell opens the slips behind it, each carrying date, tier, legs, price, result and slip id.

## Release F — a trend that cannot flatter the record

`65767a9d6`. Day-by-day and cumulative views over exactly the selected cards, with the numbers behind
them in a readable table.

- a day with nothing on it is a **marked gap** with no rate — at 0% it would draw a loss nobody took,
  and skipped it would compress three quiet weeks into one bad afternoon;
- columns are drawn at the height of their **decided sample**, so a one-card day cannot look like a
  trend, and the cumulative rate is pooled from running sums. The unit fixture is chosen so the two
  methods **disagree** (averaging days → 50%, pooling counts → 10%), because one where they agree
  proves nothing;
- pending outcomes are in no decisive denominator anywhere;
- the chart carries its own caution: a rising line is not evidence the model learned.

**The client-bundle wall, hit a second time.** Importing the series function into the explorer pulled
`node:fs` into the browser bundle and failed the export build — the same class as `READY_STATES` in
Release C. The pure card math now lives in `lib/results/card-math.mjs` with no fs anywhere in its
import graph, re-exported from the loader module so there is still one definition of each rule.

## Releases G, H, I, J

### G — a deadline nothing was scheduled to meet · `52f432c6f`

Sixteen NFL events sat `NOT_YET_CAPTURED` — "scheduled, and our acquisition for it has not run yet"
— each advertising a `nextDeadlineUtc` of tomorrow 15:00Z. **There is no NFL acquisition.**
`nfl-odds-capture.yml` is `workflow_dispatch` only, carries no cron, and last ran 2026-08-13. The
15:00Z came from a literal in the builder; `ufc-odds-refresh.yml` was the same with 13:00Z invented
for it.

That reads as *wait* when the truth is *gated on a decision nobody has taken*. The cadence is now
derived from the workflow that would perform the capture: no cron ⇒ no deadline, and the event is
typed `ACQUISITION_UNSCHEDULED` — distinct from schedule-only, no-market and stale-price, which is
the separation the charter asks for.

**Verified, not built:** 72-hour forward coverage is already met wherever supply exists (EPL looks
96h ahead and found all three fixtures in that window; NFL 336h; UFC through the next card with
nothing skipped). MLB's `PUBLISHED: 0` in the committed matrix was a **timing snapshot** — the
window ran 15:20Z, the slate landed 16:21Z. A fresh run reads 13 published.

### H — a candidate cannot promote itself · `69bc2919c`

The comparison already existed; the **governance** did not. A registration freezes candidate
version, training cutoff, feature sources, eligibility, metric, minimum sample, coverage floor and
required margin. `decide()` is pure — no clock, no files — so a cohort always reproduces its verdict,
and it refuses in five distinct ways.

The honesty it is built around: **the isotonic result was already known.** A preregistration written
today for a window already scored would be choosing terms to fit the answer. So a registration
carries a state, and a `PRIOR_OBSERVATION` can never earn a promotion however good its numbers are.
Both live verdicts are refusals, and both are published on `/results/model-audit`:

| registration | verdict | why |
| --- | --- | --- |
| `mlb-isotonic-2026-08` (prior observation) | **INCONCLUSIVE** | Brier improved 0.0086, past the 0.005 bar — the number cleared and the process did not |
| `mlb-isotonic-2026-09-forward` (preregistered) | **WINDOW NOT OPEN** | its window opens 2026-09-06; the condition to run it is stated |

"Not yet" and "contaminated" were one verdict at first. Both refuse and produce no metric, but they
call for different actions, so they no longer share a word.

### I — two claims that had outlived their evidence · `0caaefa34`

The UFC card artifact still emitted "our authorisation to buy odds covers NFL only". A UFC receipt
exists and `odds-latest.json` sits in the same directory. `/ufc` had **already** been corrected for
printing that sentence above the prices it denied — but on the page, so the producer went on
emitting it and every consumer inherited a contradiction the page had shed. The replacement states
what the document contains rather than what the project may buy, and a guard pins that as a rule.

`/nfl/game/[eventId]` was generated for every published forecast and **nothing linked to it**. The
hub now lists them, each labelled with where that game stands. Its guard scans the built export, not
the source, because a link behind an unsatisfied condition passes a source check and fails a reader.

### J — the sport filter did not filter · `ef2f1ea07`

Release E's per-sport table ignored the sport selector: choosing NFL still listed MLB, EPL and UFC
beneath a headline that had narrowed to NFL. **Every one of my date tests ran with "all sports"
selected**, so none exercised narrowing; P233's empty-combination guard did, and failed. A second
regression in the same area hid streams with nothing graded, so an empty stream read as an absent
one.

The player now runs on WebKit and Firefox as well as Chromium, at 360/390/768/1024/1440/1920 with
real heights. Both of its known failure shapes are engine-sensitive and invisible from source.

## Departmental matrix

| department | state | evidence |
| --- | --- | --- |
| Simulation player (4 sports) | **DONE** | 8 chapters MLB, sport-native EPL/UFC/NFL adapters; 20 browser assertions; live on production |
| Recording mode | **DONE** | 9:16 / 4:5 / 16:9, countdown, controls measured outside the crop; 8 assertions |
| Board presentations | **DONE** | Top 10, published parlay, results recap on `/today`, `/build`, `/results`; 15 unit assertions |
| Results by date | **DONE** | per-card rows reconcile with the ledger stream-and-tier; 11 browser assertions |
| Trends | **DONE** | daily + cumulative, gaps not zeroes, pooled from sums; 8 browser + 10 unit |
| Offered-window coverage | **DONE** | `ACQUISITION_UNSCHEDULED`; 72h coverage verified met |
| Model evaluation | **DONE (system); candidate REJECTED/INCONCLUSIVE)** | the outcome is a refusal, which is a valid outcome |
| Navigation findings | **DONE** | UFC producer claim; NFL orphan route |
| Cross-browser / responsive | **DONE** | 542 browser tests, 3 engines; 321 accessibility |
| Product lifecycle replay | **PARTIAL** | offered-window and settlement verified; a full idempotent replay harness per product was not built |
| NFL odds authorisation | **BLOCKED — founder** | `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER`; now correctly typed rather than reported as pending |
| Moonshot disposition | **BLOCKED — founder** | `MOONSHOT_REPAIR_PAUSE_OR_RETIRE:<branch>` |
| Protected console redeploy | **BLOCKED — founder** | `CONSOLE_REDEPLOY:RUN`; boundary intact, 404 on public |
| NBA | **NOT APPLICABLE** | off-season; typed `NO_EVENTS`, no model project opened |
