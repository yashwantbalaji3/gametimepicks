# Handoff — 2026-09-26, Saturday afternoon (the day before NFL Week 4's Sunday)

**Terminal state:** `SUNDAY READY · ALL SEVEN MERGED · THE ARRIVALS FIX VERIFIED ON BOT-PRODUCED ARTIFACTS`.
Repository recovered, Sunday's slate verified. **I spent no credit**, and the scheduled pre-slate
capture did: the ledger moved **394 → 472 of 1,160** at 16:49Z (78 credits, 318 rows, 18 requests),
which is the authorized `nfl-event-window` odds step on its normal cadence — captures also ran
09-24, and twice on 09-25. **Phase H is untouched at 0 of 90.** No registry, model promotion,
policy constant, secret or provider plan changed. Nothing published to a reader changed.

Supersedes [`OVERNIGHT_HANDOFF_2026-09-26.md`](./OVERNIGHT_HANDOFF_2026-09-26.md) for state;
that document's §D–§G are still the reference for the Sunday mechanics and the standing gates.

---

## A · Tomorrow still depends on the same two commands

```bash
node app/scripts/ops/nfl-lifecycle-trace.mjs --date 2026-09-27
node app/scripts/ops/odds-credit-position.mjs
```

Verified twice today (15:54Z and 16:56Z), unchanged both times:

```
SLATE: IN_FLIGHT — 14 game(s): 0 clean, 14 in flight, 0 needing attention
  every game: ✓ BOARD (4 published families) · ✓ LIVE_ARTIFACT phase PRE, frozen 2026-09-25T18:25:54Z
  spent 472 / ceiling 1,160 · remaining 688 · Phase H 0 of 90
```

⚠ **The two trace runs were before the 16:49Z capture and read 394.** The number above is the
position after it. A handoff that states a ledger position it measured an hour earlier is how the
next session reconciles against the wrong baseline.

**The morning baseline is saved** at
[`evidence/nfl-trace-2026-09-27-morning.txt`](./evidence/nfl-trace-2026-09-27-morning.txt); §I of the overnight handoff still describes the acceptance
(`CLEAN` for every expected game after reconciliation) and the `nfl-live-props` fallback.

⚠ The overnight handoff's move #1 — `gh workflow run nfl-event-window.yml -f skip_odds=true` —
**already ran** today at 13:44Z and succeeded, including step 21 which hosts the CANONICAL
promotion. The ledger is byte-identical after it, so `skip_odds` did its job.

---

## B · 🔴 The quality gate was blocking every PR, and that is the thing to merge first

```
nfl/index.html: 631KB exceeds the 600KB budget
```

**#694 touches no rendered code — an ops script, a module, a test — and failed at the identical
byte count.** Reproduced on a clean `origin/main` build: 631KB. Nothing in any diff caused it; the
slate filled and the page grew. This is the **third calendar-driven CI breakage in two days**,
after the homepage word ceiling (#692) and the Ask golden eval's pinned record.

**#695 fixes it** by mounting two below-the-fold blocks on scroll — the 45 ranked board rows
(chips stay eager) and the 16 schedule cards — measured **631 → 531KB**, 11% under a ceiling that
is **not raised**. Merge it before the other five.

⚠ **Headroom is 11% and this lever is nearly spent.** The page is 251KB of DOM against 302KB of RSC
flight, and `DeferUntilVisible` still ships every deferred child in the flight. The next lever is
the architecture change `/build/custom`'s note already describes, not a fourth deferral.

⚠ **The first cut of #695 wrapped the whole boards component and a guard caught it** — it took the
team chips and the search box with it, and `BUILT · the NFL hub's ranked boards can be filtered`
went red with *"the NFL hub renders 0 controls for 22 clubs"*. That guard is right. Weight is not a
reason to lose an affordance.

---

## C · The six open PRs, in merge order

**Merged:** `#695` (`8359240dcc`, 17:05Z), `#696`, `#697`. The gate is open and `origin/main` is
merged into every branch below.

**#695 verified on Production**, not just in CI — `/nfl` serves **534KB** against the 600KB
ceiling, both placeholders present, the filter chips and search box still server-rendered, and all
45 board rows' props still in the RSC flight (`providerEventId` ×45, `playerId` ×53, Jonathan
Taylor and Puka Nacua among the names). **No record is hidden**, on the live site.

All merged. Verified per PR with `state` / `mergedAt`, not from a listing — see C2.

| # | what | merged |
|---|---|---|
| 695 | `/nfl` page weight — unblocked the gate | 17:05Z · **verified on Production** |
| 696 | Engine V2A current-role audit (docs) | 17:12Z |
| 697 | higher-level products audit (docs) | 17:12Z |
| 694 | measure opportunity conservation on the published board | 17:24Z |
| 698 | check whether the learning policy did what it says it did | 17:31Z |
| 700 | the ESPN ↔ FPL crosswalk candidates | 17:41Z |
| 693 | the arrivals strip may not contradict the board above it | 17:49Z · **verified on bot artifacts** |
| 699 | this handoff | — |

### ⚠ C2 · #693 was CLOSED, unmerged, by nobody who meant to

At 17:12:09Z — one second after #696 merged and two before #697, same actor (the account, which is
also the `gh` token identity), **no comment, branch intact, CI green**. `mergedAt: null`. The
founder confirmed it was accidental and it has been reopened.

I noticed only because a `gh pr list --limit 6` happened to make the gap visible between #694 and
#487. The repository's own rule is *"verify merged is not being confused with deployed"*; extend it
one step — **check `state` and `mergedAt` per PR, never infer from a listing**, and re-check after
any batch merge.

### C4 · #693 VERIFIED ON BOT-PRODUCED ARTIFACTS, after the merge

`nfl-event-window` dispatched with `skip_odds=true` (run `36260408088`, success). **Step 9, the
only credit-bearing step, SKIPPED** — the ledger is 472 before and after, Phase H still 0 of 90.
Main is now `fa11b7cdd8` and the boards are the bots', not mine.

| | before | after the bots ran |
|---|---|---|
| contradictions on the Sunday slate | 28 across 13 games | **0 across 0** |
| genuine unplaced movers still shown | 24 | **24** — not over-filtered |
| boards carrying `arrivalsShadowed` | 0 of 48 | 15 of 48 |
| the P693 LIVE guard | vacuous (0 armed) | **armed · 15 of 48 · 6 pass** |

And the ownership split held: every Sunday game still reads `✓ LIVE_ARTIFACT phase PRE, frozen
from 2026-09-25T18:25:54Z` — the same frozen instant as this morning — with the slate at
`IN_FLIGHT · 14 games · 0 needing attention`.

### C3 · #693 pre-verified against the canonical producer, then reverted

Run locally on the branch to prove it before relying on a post-merge dispatch; the generated
artifacts were reverted and the board tree is byte-identical to before (`c117819b`), because a
regenerated NFL artifact comes from the bots.

| | baseline | after the producer ran |
|---|---|---|
| contradictions on the Sunday slate | **28 across 13 games** | **0** |
| genuine unplaced movers still shown | 24 | **24** — not over-filtered |
| arrivals removed by the rule | — | 30 |

The diff across 16 boards is 32 insertions / 600 deletions and touches only `generatedAt`,
`arrivalsShadowed` and the `newArrivals` rows. **No `players` row, no `families` entry and no
`live-props` file changed** — the frozen / live / canonical ownership split is intact.

---

## D · What was found, in order of how much it matters

### D1 · 🔴 The hole in the current-role engine is `STARTER`, not "new signings"

No NFL artifact carries a depth-chart position, a starter/reserve flag or an expected snap share.
`role-evidence`'s whole vocabulary is `ACTIVE_UNCERTAIN` (2,190), `QUESTIONABLE` (55), `OUT` (105);
`ACTIVE_EXPECTED` is documented and never reached. Two symptoms of one absence:

- a mover has no observed role at his new club, falls out of the pool, and lands in a side box;
- with no concept of who starts, **three Cleveland quarterbacks hold 243% of Cleveland's pass
  attempts** on a board published for tomorrow.

**The source for the second is already in the repository** —
`data/internal/research/nfl/depth-charts/`, free, keyless, 5,493 timestamped QB snapshots.

⚠ **That is not a reopening of §10.** The historical QB study stays `REJECTED` (win head) and
`UNEVALUATED / DATA-INTEGRITY REFUSAL` (pregame margin). Capturing a depth chart *forward* is
point-in-time by construction — a different claim, for correctness rather than calibration.
Neither verdict is relabelled; the one permitted look is unspent.

### D2 · Opportunity is not conserved, and nothing was measuring it

38 of 78 published team-pools on tomorrow's slate exceed the opportunity that exists:
`passAttempts` max **2.433**, `carries` max **1.844**, `targets` max 1.222. The forecast runs with
`shrinkK: 0` deliberately, the board's roster gate removes rows, and **a gate does not reconcile
what is left** — SF's survivors happen to sum to 0.985. Luck, not a rule. #694 measures it;
renormalising is a model promotion and is left alone.

### D3 · 🔴 No leg in the higher-level products has a probability

371 optimizer legs today: `projection` 371/371, `edgePct` 371/371, **`probability` 0/371** — and
none on any card or settled row. So §13's correlation framework has no marginals, §28's joint
calibration has nothing to bucket, and §12's `ProductEligibleLeg` cannot be populated as specified.
**Every published Bank Builder and Moonshot probability is a de-vigged market price.**

### D4 · 🔴 The selector promotes two signals it has measured as harmful

`learningPolicyApplied: true` beside *"confidence … excluded from ranking"* and *"edge … not used
to promote"*. Neither is true of the same file's numbers. **Across all 89 committed optimizer
artifacts, 72 carry an unhonoured claim — 135 in total, first on 2026-06-10.** The repository's own
`_sgp_leg_quality`, written after a 0-23 run, already penalises edge and drops the confidence
label — and is wired only to the SGP/NBA paths. #698 makes this a standing check.

**And it is the steady state, not a drift** — measured by month with the merged checker:

| | | | | |
|---|---|---|---|---|
| 2026-05 | 2026-06 | 2026-07 | 2026-08 | 2026-09 |
| 0 of 6 | 9 of 18 | 8 of 10 | **29 of 29** | **26 of 26** |

Intermittent from June, **continuous since August**. Every card published in the last two months
came from a scorer whose artifact says two of its inputs were removed and did not remove them.

### D5 · The records, measured

| | |
|---|---|
| Parlay Lab MLB | 21–82, ROI −5.4% · `high` tier **6.8 points under its price**, ROI −41% · `low` 0-for-4 in 38 days |
| Parlay Lab NFL / multi-sport | **never settled a card**; today's pool is 371 legs, all MLB |
| Bank Builder | **37–36** over 73 bets — a coin flip; its +15,890 ladder headline is a June 5-from-5 run on **NBA and World Cup** |
| Moonshot | **0–7** lifetime, publishing daily, record unmoved since 2026-07-06 |

⚠ Moonshot's `freshness: "fresh"` **is not a defect** — it answers "is there a card for today?" and
there is. Behind it: the lifecycle store settled two cards on 08-17 and deliberately did not write
them to the money record. Sound reasoning; the consequence is that **no surface shows the product
has been running**. Same shape as `nightly-settle`.

### D6 · Smaller, and true

- **MLB identity is discarded, not absent.** `playerId: null` on 100% of published predictions and
  0 of 1,191 prop rows — but the optimizer resolves a real StatsAPI id on **371 of 371**.
- **MLB's current-role contract is the best in the product** and should be the template: completeness
  levels, lineup source, starter flags, honest reader-facing notes.
- **EPL carries a limitation sentence that is no longer true** — *"No injury or suspension feed
  exists here."* One does (FPL, free, keyless). The gap is the identity join.
- **`sport-schedules` has been red 7 of the last 12 days** on one honest EPL refusal (openfootball
  publishes md6 as a single provisional kickoff slot). NFL captures succeed and commit. Not a
  Sunday risk, but a red run nobody reads is a red run that stops being read.

---

## E · Founder gates opened today (nothing is blocked on me)

1. **Renormalising a gated share pool** — a model promotion affecting every published number.
   Recommendation: measure a full week first; #694 emits the series.
2. **Publishing one starter per pool** — structurally model-neutral, but it removes rows a reader
   sees today. Recommendation: **yes, after Sunday**, never before.
3. **Parlay Lab's `high` tier** — 6.8 points under its price over 34 cards, −41% ROI. Withdraw the
   rung, mark it unvalidated, or hold it until the rebuild.
4. **Parlay Lab's `low` tier** — 4 cards in 38 days, no wins. Either §30's no-play rule is working
   exactly as intended or the rung is mis-specified; n=4 cannot tell them apart.

The four standing gates from the overnight handoff (live player-prop odds, MLB finals backfill, the
homepage non-prediction trim, P305 soccer totals) are unchanged and untouched.

---

## F · The next session's first four moves

1. **Merge 693, 694, 698 and 699 on green.** 695/696/697 are already in; main is already merged
   into each remaining branch.
2. **Run the Sunday trace** against the live slate through the day; after the night game settles and
   the reconciliation window closes, a `CLEAN` line for fourteen games is the acceptance.
3. **Do not force Phase H.** One probe, on the first run finding a game genuinely in progress. A
   pregame-only verdict closes the lane for 3 credits and that is the result.
4. **After Sunday**, the highest-value structural work is D1 — publish one starter per pool from the
   depth-chart source already committed. It is the largest single conservation violation and it
   needs no new provider, no credits and no model promotion.

⚠ **Do not start the higher-level product rebuild before recording what the model predicted.**
Every number in D5 measures the *market's* probability. Until a settled card carries the model's
own probability per leg, no further auditing can separate the selector's contribution from the
price it inherited — and a V2 built without it will be unmeasurable in exactly the same way.

---

## G-0 · ⚠ The browser pane cannot verify anything gated on IntersectionObserver

Worth its own heading because it nearly produced a false rollback. After merging #695 I went to
watch the deferred boards mount and they did not — still "Loading the ranked boards" after
scrolling them to centre with a real 1280×900 viewport. React *had* hydrated (40 of 40 interactive
nodes carried fibers).

**The control settled it.** `/mlb`'s `DeferUntilVisible`, shipped since Phase 5F and untouched
today, behaved identically. A direct probe then showed why: an IntersectionObserver on a fixed,
on-screen 200×200 div with `rootMargin: 800px` **never fires in the pane at all** — it does not
composite, so no callback runs.

**Verify a deferral by fetching the HTML and asserting the children's props are still in the RSC
flight**, which is what §C records for Production. Do not read a browser-pane negative on
IO-gated content as a defect, and run the control first.

## G · Three mistakes I made today, recorded because the patterns recur

- **My conservation audit joined raw team abbreviations** and reported WSH and LAR as `NO_JOIN` with
  40 unjoined rows — *a defect in the audit, presented as a defect in the board*. It now imports the
  board's own `nflverseTeam`. **Two normalisers, one rule.**
- **I nearly reported MLB's midday `prop-derived` lineups as a defect.** Three completed slates show
  confirmed orders arrive. A pregame state is not a gap.
- **I called MLB identity absent when it is discarded**, and overstated a tier-label problem with a
  wrong denominator (57 of the 67 that carry a token, not of 126). Both corrected in #696/#697.
