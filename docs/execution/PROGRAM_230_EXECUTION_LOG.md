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

## Register

| Release | Commit | Rollback parent | State |
| --- | --- | --- | --- |
| R0 · leg reachability + payload | `a7cb3983b` | `35f39b56a` | shipped, gate pending |
| Incident · pre-hydration image failure | `7840eb69a` | `a7cb3983b` | shipped, gate pending |
| F1 · signature products under one lifecycle | — | — | ENGINEERING_OPEN |
| F2 · offered-window automation | — | — | ENGINEERING_OPEN |
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
