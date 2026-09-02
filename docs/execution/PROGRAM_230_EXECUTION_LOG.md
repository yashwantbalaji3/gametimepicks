# Program 230 — end-to-end product completion train

Session 2026-09-01, 18:50 ET (22:50 UTC) → open. Entry `3096263eb`, fast-forwarded to
`35f39b56a` (eight routine bot commits, clean ancestor). Money `md5 affe6b21071f2b3be96bb2774eb347c3`
unchanged; both pre-existing stashes and founder-owned `vp/` untouched; **no paid calls**.

## Phase 0 — reconciliation

The handoff's SHA wording resolved rather than repeated. P229 reported production `a44e6e63b`
"exact" against a close HEAD of `3096263eb`; those cannot both be true. `a44e6e63b` is the parent of
`3096263eb`, which is a docs-only commit — so production served an **ancestor**, and the close tip
was never deployed on its own. Since then bot commits carried main forward and production's build
marker reports `35f39b56ad84ef415878f15b1623e7cb18989e01`, byte-equal to local HEAD and origin/main.
Production is **exact** as of entry, and the word is now earned rather than asserted.

| Item | State at entry |
| --- | --- |
| local / origin / production | all `35f39b56a` — equal, verified from `/data/build-info.json` |
| protected money | `affe6b21071f2b3be96bb2774eb347c3`, unchanged |
| stashes | 2, both pre-existing, preserved |
| `vp/` | untracked, untouched |
| phase 1 suite | 5047 tests, 0 fail |
| owned processes | none |

## Release 0 — the legs the page counted and could not reach

P229 closed the payload; it did not establish that a reader can open one of the legs it compacted.
The answer was no, in two places at once.

`/build/custom` mounts two leg surfaces, each with its own **undisclosed** cap. The marketplace
renders 60 per sport and then prints `+N more eligible legs` as inert text — no search, no
pagination, no reveal. The builder pool was truncated by `out.slice(0, 180)` with nothing on the
page saying so. On the 2026-09-01 slate that is **373 eligible legs, 211 reachable, 162 unreachable
anywhere** — 43% — under a heading that says "Legs (373)".

### The cap was compensating for a wasteful row

61% of every `BuildLeg` was derived strings shipped beside the atoms they derive from:

| field | cost @180 legs | why it need not travel |
| --- | --- | --- |
| `slipLeg` | 57.6 KB | re-ships player/market/side/line/odds/matchup already present |
| `photo` | 26.0 KB | a pure function of `playerId` |
| `label` · `searchKey` · `sublabel` | 19.5 KB | string concatenations of the same atoms |
| `marketLabel` · `sportLabel` · `gameLabel` | 5.1 KB | a duplicate and two lookups |

Atoms cost **294 B/leg against 1010**, so the full 373-leg pool serializes to 107 KB where the capped
180-leg pool cost 177 KB. Removing the waste removes the reason for the cap: every priced leg became
reachable and the page got **smaller** — 1071 KB → **705 KB** against an unchanged 1400 KB budget,
53% below the 1497 KB pre-fix baseline. This is P229's own defect class in the second surface on the
same page.

Data and DOM are now separated rather than conflated: the filtered set holds every matching leg so
search and filters can find any of them, and only the rendered window grows on request. The count
reports the match total, never the window.

**Derivation is not compression.** `hydrateBuildLeg` is pure and total — same atoms in, byte-identical
`BuildLeg` out. Rounding was measured and **rejected**: trimming `edge` to two decimals changed 19
rendered strings, and a projection that alters a displayed value is a different page, not a smaller
one.

### What the guards hold

Conservation (every priced leg reachable exactly once), a refusal that the 180 cap cannot return,
lossless hydration, settlement identity preserved for a leg past position 180, and the corruption
cases the charter names — duplicate identity, detail mismatch, a compact row that cannot hydrate, an
out-of-scope search. Both conservation and refusal mutation-probed by reintroducing the cap.

Browser: 15 assertions on Chromium, WebKit and Firefox — reveal, search for a tail leg **by canonical
leg id** rather than a display string, draft seeding, refresh, back/forward, and a 390 px viewport
with a 44 px target and no horizontal overflow.

Two guards pinned pre-refactor symbol names. Both were **repointed, not weakened**: the
model-probability thread now spans two modules and both halves are pinned, plus a new assertion that
neither may reconstruct it from a price.

## Incident — image fallbacks that could never fire

The P214 identity fixture was failing on `/`, `/simulate/` and `/ufc/`: 42 MLB team logos and 12 UFC
portraits surviving as native broken-image icons. **Not caused by Release 0** — the quality gate last
ran on `a44e6e63b` and has not run on any of the nine commits since, so this arrived with data and
sat undetected. That is P224's bot-commit rot class recurring, and it is why a green history did not
mean a green product.

Every one of those components already had a correct `onError`. They could not have passed. The site
is `output: "export"`, so the browser fetches images while parsing SSR HTML, long before the React
bundle loads; an image that fails in that window fires `error` at a node with no handler, and the
event neither queues nor replays. React hydrates, attaches `onError`, and waits for something that
already happened.

The fix asks the element instead of waiting for the event. A ref callback runs during the commit that
attaches `onError`, so the windows tile exactly — `complete && naturalWidth === 0` catches what fired
early, `onError` catches the rest, and a not-yet-started lazy image reports `complete === false` so it
is never mistaken for a failure. One owner, wired at all five components that render a remote `<img>`,
including two the fixture does not exercise: fixing the class only where the fixture caught it would
have left the same bug in two more places.

The source guard first passed **vacuously** — scanning for the bare identifier matched the leftover
import, so a component whose `ref` had been deleted reported as covered. It now requires the wiring.
Both detectors mutation-probed.

## F1 — every signature product under one lifecycle

Four products sat PARTIAL, each missing only `lifecycle`. The check behind that dimension was a regex
over the state machine's own source for the quoted product id, so the distance between "Homer Nukes
has a lifecycle contract" and "somebody typed homer-nukes" was a pair of quotes. F1 was one string
edit from closing. The registry that permits that had to go first, or F1's acceptance test is a
formality.

Membership now costs an owner for the producer, selection gate, freeze boundary, settlement adapter,
ledger and receipt. The refusals are the point: a missing owner throws by name; a product without
settlement cannot register at all (the unfalsifiable-record shape); two products claiming one record
throw; a duplicate id cannot replace the first. A further guard checks every declared owner
**resolves on disk** — it caught six paths in my own first draft that I had guessed rather than
verified.

### What each migration actually required

**End Zone Vault.** Its builder returns `NO_VAULT` and appends a `NO_PLAY` entry when there is no
upcoming event — it evaluates every window, exactly as its docstring says. But it lived inside a
workflow step gated on `events != '0'`, so in exactly the windows where "nothing to evaluate" *is*
the evaluation, it never ran. `nfl-event-window` reported **success nine times between 08-30 and
09-01** and the ledger gained an entry on none of them. There is no failed run object to find; the
absence of a receipt was the only evidence and nothing was looking for it.

**Homer Nukes** is a calibration product, and needed a new state. Its record holds `gradedPicks`,
`predicted`, `actual` and `brier` and no stake at all — a board of ~25% probabilities is *supposed*
to miss most of them, so five picks with one homer is a well-calibrated day, not a loss. Choosing
`SETTLED_WIN` or `SETTLED_LOSS` would mint a verdict the product never computes, and that verdict
would then be summable with the money products' records. `SETTLED_RECORDED` is the honest answer:
graded, not won or lost, progressing nowhere because there is no bankroll. The registry declares
`ledgerKind` so this is a property of the product, not a habit of whoever wires it.

**UFC and EPL cards.** The inventory was checking `ufc/graded-picks.json` as evidence these products
have a ledger — but that is the model's fight-winner pick record, belonging to a *different* product.
The cards' record is the Parlay Lab ledger. That exposed the ledger rule as too crude: it compared
paths, and the lab ledger is one artifact holding five genuinely separate streams. The rule now
enforces record **identity** (path + stream); same artifact different streams is permitted, same
stream still refused. Refusing a correct registration is how a rule gets loosened until it stops
catching the wrong ones.

Both ladders are event-driven, so most days carry no card. "No UFC event on 09-01 — the ladder is
published for 09-05" is a refusal naming where the next card is; only a ladder that does not exist
*and* has no forward card is an incident.

### A defect in my own wiring, caught by a guard I wrote

The receipt writer passed **one** `lockAt` — the daily-portfolio's activation stamp — to every
product in the loop, so Homer Nukes reached ACTIVE on Bank Builder's freeze time. A freeze boundary
borrowed from another product is not a freeze boundary, and ACTIVE is precisely the state that must
not be reachable without one.

**Coverage: ALL_GOVERNED, open gaps 4 → 0.** Moonshot remains `PAUSED_FOUNDER` on its exact token.

## F2 — a green run that produced nothing

The offered-window matrix already reconciles all five sports and balances: MLB 15/15 published, UFC 7
published + 7 refused, NFL 2 `NOT_YET_CAPTURED`, EPL 1 forecast-ready, NBA off-season — every sport
`conserved: true`, zero owed, zero findings. That half of F2 was closed by P226; **verifying it was
the work, not rebuilding it.**

The other half was not closed. `assert-run-produced` exists because a step's exit code answers "did
the command return zero" rather than "did the product do its work", and it was wired into three
workflows. Three of the six governed products could return zero having written nothing —
`nfl-event-window` (which did, nine times), `mlb-daily-production`, and `nightly-settle`.

The cron watchdog cannot catch this class by design: it asks which **runs** exist, and in every case
the runs existed and were green. That is the charter's "detected without querying workflow-run
existence" — the only question that separates them is whether the artifact is on disk, written
*during* the run.

Rather than three edits somebody must remember to repeat, the rule is a property of being governed: a
guard walks the registry, finds the workflow running each producer, and fails naming any product
whose workflow would not notice it producing nothing. It also checks `RUN_STARTED` is stamped before
use — an unset value makes `--since` compare against the empty string, so the assertion passes on an
artifact of any age. Coverage that proves nothing is worse than none, because it reads as done.

The guard found a true fact I had to **classify rather than fix**: Moonshot's producer is a library
module with no schedule. That is its founder gate, already reported as its missing `automation`
dimension. The registry now carries `founderGate`, with a test pinning the exemption to exactly
Moonshot and exactly its token so it cannot quietly widen.

## F3 — the tier rows did not sum to the record they sat under

MLB's Parlay Lab record published `returned: 22.62` while its four tier rows summed to 22.61. One
cent — and exactly the kind of discrepancy that makes a published record impossible to check by
hand, which is the only way most readers will ever check it. Every bucket rounded its own `returned`
from its own unrounded accumulation, tiers and record independently; rounding independently is not
rounding once. The tiers round first and the record is now the sum of the published tiers, so the
arithmetic a reader can do is the arithmetic that produced the total.

A second hole in the same loop: a card whose tier had no bucket was skipped for the tier and still
counted in `overall`, so the rows would silently stop summing with nothing to say so. The builder now
refuses and names the card.

The guard holds W+L+P against the cards staked, checks the published hit rate and ROI agree with the
published counts, and refuses a rate over zero decisive cards or an ROI over zero stake. It also
holds **no combined total**: no top-level key sums the five streams, and no top-level scalar happens
to equal that sum under another name. A calibration ledger may publish no stake, payout, returned,
ROI or profit — Homer Nukes' record must not become summable with the money products' one artifact
down.

`byTier` ships as an object; the array reading yields `[]` and would pass every sum vacuously.

## G — the MLB tier grid was resolved on UFC's cron

`build-tier-grid.mjs` builds all five sports and was scheduled only by `ufc-fight-week` and
`epl-matchweek`. So MLB's four-tier grid was evaluated at another sport's cadence, and its published
state tracked what time that cron happened to fire:

| generated | state |
| --- | --- |
| 08-27 22:44Z · 08-30 23:20Z · 08-31 22:58Z | PUBLISHED · 16 cells |
| 08-26 13:58Z · 09-01 15:25Z | NOT_ELIGIBLE · 0 cells |

On 09-01 it refused with *"no price capture for 2026-09-01 yet … only 0 priced games"* while the
board carried **373 priced legs across 15 games**, captured at 17:50Z. The refusal was accurate at
15:25 and never re-asked — and a stale refusal is indistinguishable from a considered one. Both say
"not eligible"; neither says when it last looked.

MLB now re-resolves its grid inside `mlb-daily-production`, after its own prices land, and that
workflow is re-dispatched by the afternoon top-up. The generator is network-free, so this costs
nothing and no credits. Re-resolved against today: **NOT_ELIGIBLE / 0 cells → PUBLISHED / 16 cells**,
4 filled, bronze correctly using its labelled substitute rather than a widened band.

## L — the calibration verdicts were checked against each other, never against the data

Seven guards already protect the recalibration decision. Every one compares committed constants to
other committed constants. None compared them to the ledger — and `MLB_MARKET_CALIBRATION` is a
hand-maintained table stamped `2026-07-21` over 18,659 leans, while the ledger has since grown past
35,000 rows through 08-31.

The evidence has not moved, and that is now a measurement rather than an assumption:

| market | n | model Brier | market Brier | overconfidence |
| --- | --- | --- | --- | --- |
| pitcher_strikeouts | 1,781 | 0.2736 | 0.2453 | 14.6pp |
| batter_hits | 14,703 | 0.2432 | 0.2354 | 6.8pp |
| batter_total_bases | 6,616 | 0.2609 | 0.2405 | 12.0pp |
| batter_hits_runs_rbis | 12,920 | 0.2632 | 0.2475 | 10.2pp |

The engine runs the real audit rather than reading a cached summary, because a contradiction engine
fed a committed artifact is checking one constant against another again. The two directions are not
symmetric: a market claiming `PUBLIC_MODEL_OK` that loses fails hard; a demoted market that starts
winning also fails, but the message says to run the **preregistered** promotion protocol rather than
edit the verdict — a bar chosen after seeing the result is not a bar.

## Guards that were vacuous when first written

Three of my own, each caught by its own mutation probe rather than by review:

1. the `node:fs` contract scan matched the **import line** left behind after the wiring was deleted;
2. the tier-grid workflow scan matched `build-tier-grid.mjs` inside the **comment explaining the
   defect**, so deleting the step left the guard green — the same class this repository has now
   recorded seven times, in YAML this time;
3. the R0 browser spec pinned a **history-stack shape**, reporting a legitimate engine difference as
   a product regression; the first repair then over-stepped the page, because `page.url()` is read
   before the navigation it follows has settled.

A guard that has never failed has not been shown to work.

## Register

Entry `35f39b56a` → close **`5d0cdeaea`**. Production serves `b11633bb0` (origin/main, one routine
bot commit past the close tip); `5d0cdeaea` is a **proven ancestor** — stated as ancestry-covering,
not as equality. Covering gate **run 33576857188 → success**.

| Release | Commit | Rollback parent | State |
| --- | --- | --- | --- |
| R0 · leg reachability + payload | `dd22fd0a1` | `35f39b56a` | shipped · verified in production |
| Incident · pre-hydration image failure | `e1210c42b` | `dd22fd0a1` | closed |
| F1 · lifecycle registry | `0a81e4290` | `16f92755a` | shipped |
| F1 · all products governed | `79f0e4192` | `0a81e4290` | shipped · ALL_GOVERNED |
| F2 · producer assertions | `4dcb41cef` | `02f796e33` | shipped |
| F3 · ledger reconciliation | `aa9699db0` | `d5d4bd29b` | shipped |
| G · tier-grid cadence + freshness | `f19027941` | `acc2c9f4e` | shipped |
| L · calibration contradiction engine | `a8a4479d1` | `fe3ccbc7e` | shipped |
| K1 · protected operator command center | — | — | **ENGINEERING_OPEN** |
| I · public information architecture | — | — | **ENGINEERING_OPEN** |
| J · sport scenes, responsive, a11y | — | — | **ENGINEERING_OPEN** |

### Sports — offered window, 2026-09-01

| sport | state | offered | disposition | conserved |
| --- | --- | --- | --- | --- |
| MLB | COMPLETE | 15 | 15 published | ✅ |
| NFL | COMPLETE | 2 | 2 not-yet-captured | ✅ |
| UFC | COMPLETE | 14 | 7 published · 7 refused | ✅ |
| EPL | COMPLETE | 1 | 1 forecast-ready | ✅ |
| NBA | NO_EVENTS | 0 | off-season by the league's own schedule | ✅ |

32 events, **0 owed, 0 findings**.

### Products — lifecycle, 2026-09-01

| product | coverage | lifecycle | ledger kind |
| --- | --- | --- | --- |
| Bank Builder | GOVERNED | NO_PLAY | money |
| Homer Nukes | GOVERNED | ACTIVE | calibration |
| End Zone Vault | GOVERNED | **INCIDENT** | money |
| UFC cards | GOVERNED | NO_PLAY | money |
| EPL cards | GOVERNED | NO_PLAY | money |
| Moonshot | PAUSED_FOUNDER | NO_PLAY | money |

**ALL_GOVERNED · 0 open coverage gaps.**

The Vault's INCIDENT is real and stays open: 2026-09-01 genuinely has no ledger entry, because the
step that would have written one was skipped by the `events != '0'` gate before the fix landed. The
cause is closed and the assertion is in place; the row clears when the next `nfl-event-window` run
produces an entry. **Backfilling those days would be fabrication.**

## Remaining partition

| class | rows |
| --- | --- |
| INCIDENT | End Zone Vault 08-30 → 09-01 — cause fixed, clears on the next run |
| ENGINEERING | K1 · I · J |
| FOUNDER | NFL paid-odds renewal (P171 expired by its own terms) · Moonshot (`MOONSHOT_REPAIR_PAUSE_OR_RETIRE`) |
| EXTERNAL | none |
| REALITY | NFL 2 events not-yet-captured · EPL single fixture in window · NBA off-season |

**Classification: MATERIAL_PROGRESS.** Three executable engineering rows remain, so the law does not
permit COMPLETE.

## Integrity at close

| item | state |
| --- | --- |
| money `mr-dub/portfolio.json` | `affe6b21071f2b3be96bb2774eb347c3` — unchanged |
| pre-existing stashes | 2, both preserved |
| founder-owned `vp/` | untouched — no `vp/` path in any commit this session |
| working tree | clean |
| paid calls | **none**; no odds/credit/spend artifact touched |
| owned processes / watchers | 0 |

## Suites at close

| gate | result |
| --- | --- |
| typecheck | clean |
| phase 1 · unit + contract | 647 files → pass |
| phase 2 · rendered guards | 66 files → pass |
| browser matrix · Chromium / WebKit / Firefox | 467 passed · 0 failed · 27 skipped |
| CI quality-gate `5d0cdeaea` | run 33576857188 → **success** |
| `/build/custom` in production | **531.8 KB** / 1400 KB budget |
