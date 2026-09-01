# Program 224 — overnight convergence train

## Release 0 — gate recovery

Entry: HEAD `19e49db4a` (the Moonshot truth release), 1 ahead of origin, clean worktree, money
`md5 affe6b21071f2b3be96bb2774eb347c3` unchanged, both pre-existing stashes untouched. Suite:
**5,378 tests, 17 failures**, identical across two runs and identical before/after the Moonshot
files — reproducible and none of them from that release.

The charter's instruction was to repair the rot first, commit it separately, and push a green
two-commit train. What follows is what the seventeen actually were.

### They were not all rot

Seven were genuine product or artifact defects that the calendar merely *exposed*. Those were fixed
at their owners, and the tests around them repointed rather than relaxed.

| # | Failure | Verdict |
|---|---|---|
| 1 | `season-context` expects `PRESEASON` | ROT — pinned a phase |
| 2 | `game-sim` expects `PRESEASON_CONSERVATIVE` | ROT — pinned a phase |
| 3 | `participation` expects preseason `ROLE_UNCERTAIN` | ROT — pinned a phase |
| 4 | `shadow-run` expects `ABSTAIN` on DET@CIN | ROT — pinned a phase |
| 5 | `adapters` expects ≥10 preseason events | ROT — pinned a slate size |
| 6 | `hub-slate-parity` "index publishes an anchor" | **DEFECT** — index anchor was null |
| 7 | `product-day` "an active window names its kickoff" | **DEFECT** — staleness guard blind |
| 8 | `product-eligibility` considered-count disagreement | **DEFECT** — stale artifact, workflow gap |
| 9 | `product-receipts` expects every lane `NO_PLAY` | ROT — `REFUSED` is the correct empty-window state |
| 10 | `ufc-prediction-engine` "same card" | **DEFECT** — check compared opaque ids as dates |
| 11 | `ufc-prediction-engine` "some fights have a named winner" | ROT — asserts prices exist |
| 12 | `ufc lane-status` selection missing | **DEFECT** — lane discarded the producer's refusal |
| 13 | `ufc page-self-consistency` no-vig caveat | ROT — demanded a now-FALSE denial |
| 14–16 | `sport-lab-cards` ×3 | ROT + **DEFECT** — nav-chrome trigger, RSC-payload match |
| 17 | `event-identity` `PARTIAL_PRESENTED_AS_COMPLETE` | **DEFECT** — vocabulary mismatch |

### The defects, and what they were

**The canonical NFL index published "1 scheduled upcoming" and "no next kickoff" at once.**
`nextKickoffUtc` was derived from the next *forecast* event, not the next *scheduled* one, so in
every gap between a settled slate and the next modelled one it went null while
`counts.scheduledUpcoming` beside it said 1. On 2026-09-01 the index's only event was **CHI @ TEN,
played and settled on 08-29**, while NE @ SEA (09-10) sat in the committed capture unnamed — and the
artifact's own note promises every surface may consume it verbatim. The next kickoff now comes from
the schedule, which is what the field name has always claimed; what we have *modelled* stays visible
and separate in `nextForecastUtc`. This is the Aug-29 "CHI @ TEN" audit lead, root-caused.

**`/today` advertised a finished game as an upcoming NFL slate.** P202 added "a PAST kickoff is not
upcoming" but asked the question of the *anchor*, so a **null** anchor read as "not passed" — and
null is exactly what the index published in this window. The page rendered *"1 games simulated ·
next kickoff unscheduled"* for CHI @ TEN, three days after it was played, with the real kickoff
scheduled. A detector that goes blind precisely when its subject appears is not a detector.
Staleness is now decided from the simulated slate's **own date**, which needs no anchor, and a quiet
window still names the next real event instead of going blank.

**A fix applied to one owner and not to its class.** `nfl-event-window.yml` was changed (citing the
2026-08-27 incident) so the index re-derives on *every* window, including empty ones. Product
eligibility and the run receipts both *consume* that index and both stayed inside the
`events != '0'` branch — so on a quiet day the index refreshed and they did not. Result:
`consideredEvents: 1, indexGeneratedAt: 2026-08-29T18:16:23Z`, three days stale, contradicting the
artifact it summarises. Both builders are local, deterministic and refuse rather than invent, so
they now run on every window too.

**The UFC lane asserted a ladder that does not exist.** The risk ladder had already fail-closed —
`state: "NO_PRICES"`, reason *"no price capture for this card; the newest snapshot covers a
different event"*, zero cards, no selection. The lane summary threw that answer away and published
`PUBLISHED_FOR_THIS_CARD` beside `carded: 0, selection: null`, because the only thing it checked was
that the dates matched. A state named for publication now requires a published card, and the
producer's own verdict is carried rather than replaced.

**One page said both "measured against the market" and "never compared against a price".** /ufc
renders *"since 2026-08-22 the model IS scored against the de-vigged line"* — true; the ledger holds
16 graded picks with the market's de-vigged probability alongside — while a hardcoded provenance
sentence in `top-reads.ts` still ended *"It has still never been compared against a price."* The
second half is now derived from that ledger. The block immediately below it in the same file already
carried the warning: **"A COUNT IN A SENTENCE IS DERIVED, NEVER TYPED."**

**The live-slate classifier spoke a vocabulary the engine does not.** Completeness levels are
`ready | degraded | unavailable`. The classifier accepted `"unavailable"` and `"partial"` — so the
`partial` arm was dead and **`degraded`, 300 of the 474 committed sims, fell through to
`PARTIAL_PRESENTED_AS_COMPLETE`**. It surfaced only when a degraded sim went unclaimed by a market
row: gamePk 823176. A first repair here read "anything not `ready`", which would have accepted
`{status: "complete", level: "full"}` as a declaration of partiality and let the exact mutation the
state exists to catch straight through; it is a closed set, and unknown vocabulary fails closed.

**Doubleheaders collided on slug.** `board-adapter.ts` built `${away}-vs-${home}-${date}` directly.
The public route has always disambiguated with the gamePk, so on a doubleheader day
`/games/mlb/<base>/` **is not a built page** — and the simulation artifact, the predictions artifact
derived from it, and every `href` and slate story built off those pointed at exactly that base.
2026-08-29 carried seventeen prediction rows over fifteen slugs. The rule now lives in one place
(`lib/mlb/public-game-slug.ts`) and both owners call it; non-colliding games keep their base slug, so
no existing URL changes. This is also why failure #17 read as a crash: a story looked its game up by
slug and got whichever twin came first — the one with `moneyline: null`.

### Two guards of my own that were wrong

Recorded because the same probe that caught them is the reason to keep running it.

- The /ufc caveat guard accepted a bare `"too few"`, which **every** per-fighter blurb on the card
  satisfies (*"3 tracked bouts — too few clear tendencies to call out"*): nine matches, none of them
  the caveat, and it passed on a page with the caveat deleted. Tightened to tie the smallness to the
  sample; the mutation probe then failed correctly.
- The `sport-lab-cards` built-export check scanned the **whole document**, where Next.js serialises
  its RSC payload — so it was satisfied by strings that never render. It also matched `&rsquo;` where
  the page emits `&#x27;`. It now reads `<main>` and decodes entities.

Both belong to one family with the nav-chrome triggers: `page.includes("Paper cards")` fired on the
shared navigation ("EPL Paper Cards", "UFC Paper Cards") on every route, so /ufc's branch ran on days
/ufc publishes no cards at all.

### Rot repaired without weakening intent

Every phase-pinned assertion became a phase-*derived* one, and the branch the calendar left behind
kept its coverage as a fixture rather than being deleted:

- `game-sim` gained `PHASE INVARIANCE`: the variant follows season type, and preseason is strictly
  nearer the coin than regular season.
- `season-context` gained `PHASE TRANSITION`: every member of the season-type map, plus a
  past-only window and an empty one.
- `participation` asserts per phase and keeps the claim true in **every** phase —
  `ACTIVE_CONFIRMED` is unreachable without an official actives source.
- `adapters` swapped a `>= 10` threshold for **conservation**: every committed row comes out as an
  event or a named quarantine. Strictly stronger, and it cannot rot.
- `product-receipts` now pins the distinction it was flattening: zero candidates is `REFUSED`, never
  `NO_PLAY` — *you cannot report "nothing qualified" having looked at nothing*, which is this
  workflow's own stated rule.
- `sport-lab-cards` pins the refusal it used to skip: a ladder with no cards is refused **even on its
  own date** — an empty scaffold is not a product.

---

## Release A — Homer Nukes integrity

The charter said treat this as a grader/identity incident until evidence proves otherwise. The
evidence proved otherwise, in the opposite direction to the one expected.

`record.json` — the canonical record — says **11 hits on 60 graded picks against 14.73 expected,
Brier 0.156**. The page said **0 of 70**.

The zero was structural. The page counted hits with `picks.filter(p => p.homered)` — a field the
settlement artifact has never written; it records `result: "hit" | "miss"` and `homeRuns`. So the
filter was always empty and the numerator always zero, for any results whatsoever, since the day it
was written. Every per-day row read zero too. The inline `{ homered?: boolean }` annotation is
optional, so nothing type-checked the page against its producer.

The denominator was wrong in the other direction: it counted all 70 PUBLISHED picks, including ten
with no official result yet. A pick nobody has graded is not a pick that missed.

**Understating a record is as false as overstating one, and harder to notice because it reads as
humility.** The settlement path was never broken; the page was mis-reading it.

The second sentence — "This board has no settled track record yet" — was typed into the generator
before any slate had settled and never revisited. It is now derived, by one rule that the generator
calls at write time and the board component calls at render time: a stored copy is a snapshot, and
yesterday's board must not keep asserting yesterday's record.

The published 2026-08-31 board was deliberately NOT regenerated to refresh its stamped sentence — a
dry run produces different picks now the season inputs have moved, so rewriting it would retroactively
alter a published forecast. Rendering from the live record fixes the page without touching what was
published.

Verified live: `11 of 60 picks homered across 14 slates`, and the derived blurb.

## Release B — event identity, run across every sport

`data/internal/audits/event-identity.json`, built by a runner that reads committed bytes and repairs
nothing. First run: **2,162 rows**. MLB FINDINGS — 8 slug collisions across three dates, all in
artifacts generated before the shared slug rule existed. NFL, UFC, EPL clean.

Those three dates are a frozen **shrink-only** exception list. A date may leave it; none may be added.
A new date failing the guard means the fix regressed, not that the list needs to grow.

A quiet sport reads `NO_EVENTS`, never `OK` — every check passes vacuously over an empty set, and
calling that a pass is how a detector goes quiet at exactly the moment a sport stops producing.
Unreadable artifacts are `UNKNOWN`, which outranks a known defect in the roll-up.

Runs nightly beside the other read-only audits, non-fatal, output committed — an audit computed and
not committed is not a receipt.

## Release D — receipt SLO across four sports

The instrument built to catch a dropped cron watched MLB and nothing else. Six owners became eleven:
`nfl-index`, `nfl-products`, `ufc-card`, `ufc-lane`, `epl-lane`.

**EPL is why the model needed a new capability rather than five more rows.** `epl-matchweek` runs
Thursday to Sunday. Given a daily expectation it would open an incident every Monday, Tuesday and
Wednesday — and a detector that cries wolf three days in seven teaches its reader to ignore it, which
is the same outcome as having no detector. `runsOnUtcDays` is declared on the owner; on a day it does
run, silence is still an incident.

All five carry `sport: null` deliberately: "no games today" must not excuse them. The NFL index froze
a day behind through four green runs in a quiet week, and the NFL product lanes publish their refusal,
which IS the receipt that the lane ran. Each is judged by AGE rather than existence, because these
artifacts are not date-partitioned and a file that stopped being rewritten would read as present
forever.

Also corrected: the `schedules` owner was labelled "(all sports)" while reading only the NFL capture,
so a dead MLB, EPL or UFC schedule lane would have been reported as healthy all-sports coverage.
