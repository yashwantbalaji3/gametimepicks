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

## Register

| Release | Commit | Rollback parent | State |
| --- | --- | --- | --- |
| R0 · leg reachability + payload | `a7cb3983b` | `35f39b56a` | shipped, gate pending |
| Incident · pre-hydration image failure | `7840eb69a` | `a7cb3983b` | shipped, gate pending |
| F1 · signature products under one lifecycle | `79f0e4192` (+`0a81e4290`) | `16f92755a` | shipped — ALL_GOVERNED |
| F2 · producer assertions + offered window verified | `4dcb41cef`, `47033c203` | `02f796e33` | shipped |
| F3 · settlement + independent ledgers | — | — | ENGINEERING_OPEN |
| G · Top Picks, tier matrix, builder | — | — | ENGINEERING_OPEN |
| K1 · protected command center | — | — | ENGINEERING_OPEN |
| I · public information architecture | — | — | ENGINEERING_OPEN |
| J · sport scenes, responsive, a11y | — | — | ENGINEERING_OPEN |
| L · model + publication governance | — | — | ENGINEERING_OPEN |
| M · convergence + production proof | — | — | ENGINEERING_OPEN |

**FOUNDER_GATED:** NFL paid odds renewal (P171 receipt expired by its own terms — no cron added, no
paid call made); Moonshot (`MOONSHOT_REPAIR_PAUSE_OR_RETIRE`).

**Classification: MATERIAL_PROGRESS** — executable engineering rows remain.

## Suites at close of R0

| Gate | Result |
| --- | --- |
| typecheck | clean |
| phase 1 · unit + contract | 639 files → pass |
| build | clean export |
| phase 2 · rendered guards | 66 files → pass |
| browser matrix (Chromium/WebKit/Firefox) | 467 passed, 0 failed, 27 skipped |
| `/build/custom` weight | 705 KB / 1400 KB budget |
