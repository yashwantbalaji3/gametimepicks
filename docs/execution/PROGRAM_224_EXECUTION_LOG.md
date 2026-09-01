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
