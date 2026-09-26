# Engine V2A — current roster & role coherence

**Audit date:** 2026-09-26 · **main:** `1676900fc9` · **Production:** `1676900fc9` (built 15:12Z)
**Scope:** NFL, MLB, EPL, UFC. Read-only measurement against committed artifacts. No model,
registry, threshold, policy constant or credit path was changed to produce it.

> The founder's framing: *a recent signing is shown in a historical-information section while the
> public copy says the player's prior-team history is not part of the game's projection.* That is
> the symptom. This audit went looking for the hole behind it.

---

## 0 · The finding in one paragraph

The hole is not "new signings". **It is `STARTER`.** No NFL artifact in this repository carries a
depth-chart position, a starter/reserve flag or an expected snap share — the words do not appear in
`role-evidence`, whose entire vocabulary is `ACTIVE_UNCERTAIN` (2,190 rows), `QUESTIONABLE` (55) and
`OUT` (105). Everything else follows from that one absence, and it is visible from two directions at
once:

- **from the new-signing side** — a mover has no observed role at his new club, so he falls out of
  the pool and into a side box;
- **from the depth-chart side** — with no concept of who starts, *every* quarterback on a roster
  carries the share his own history earned him, so three Cleveland quarterbacks between them hold
  **243% of Cleveland's pass attempts** on a board published for tomorrow.

Both are the same missing field. Fixing the second is the cheaper and more consequential half, and
**the source for it is already in the repository**: `data/internal/research/nfl/depth-charts/`, free,
keyless, 5,493 timestamped QB snapshots, acquired by a script this repo already owns.

---

## 1 · What each sport's simulation actually knows

The §8.1 field list, scored against what is in a committed artifact today. `~` = present but coarse
or unjoined.

| field | NFL | MLB | EPL | UFC |
|---|:--:|:--:|:--:|:--:|
| stable participant identity | ✓ | **✗ on the published path** | ✓ | ✓ |
| current team | ✓ | ~ | ✓ | n/a |
| roster status | ✓ | ~ | ~ | ✓ |
| availability (injury/suspension) | ~ | ~ | **✗** | ✗ |
| expected active / inactive | ✗ | ~ | ✗ | ✗ |
| depth-chart / lineup position | **✗** | ✓ | ~ | n/a |
| starter / reserve | **✗** | ✓ | ~ | n/a |
| expected snaps / PAs / minutes | ✗ | ✓ | ✗ | n/a |
| expected touches / opportunity | ~ prior only | ✓ | ✗ | n/a |
| high-leverage role (RZ / set piece) | ✗ | ~ | ✗ | n/a |
| role confidence | ✗ | ✓ | ✗ | ~ |
| role freshness | ~ artifact-level | ✓ | ✓ | ✓ |
| source lineage | ✓ | ✓ | ✓ | ✓ |
| uncertainty stated to the reader | ~ | ✓ | ✓ | ✓ |
| current opponent | ✓ | ✓ | ✓ | ✓ |

**MLB is the strongest current-role implementation in the product and should be the template.**
Its prediction artifact carries `completeness.level`, `awayLineupSource`/`homeLineupSource`,
`hasAwayStarter`/`hasHomeStarter`, `startedBeforeGeneration` and reader-facing notes such as
*"PIT lineup padded: 8/9 batters have a posted line and the rest are at replacement level; PIT have
not posted a batting order yet, and this refreshes hourly until they do."* That is exactly the
contract §8.2 asks for, already shipped, in one sport.

---

## 2 · NFL — measured

### 2.1 The arrivals contradiction (fixed, PR #693)

`deriveNewArrivals` asks `role-shares-v1/current.json` (generated 2026-09-09) whether the model can
place a player; the board projects from the weekly share-level forward forecast (generated
2026-09-22). Two producers, two cadences, one question asked of the wrong one.

**28 of 52 arrivals on the 2026-09-27 slate, across 13 of 14 games**, were listed as movers the model
cannot place *while carrying a full projection on the same page* — Mike Evans, Stefon Diggs, Keenan
Allen, Travis Etienne Jr., Kyler Murray among them. Each row carried, in a `PUBLIC_DERIVED` artifact:

> his role at SF is unobserved, so **he is NOT in this game's simulated team numbers**

False for all 28. Fixed by asking the board's own published rows, which is the only pool that can
answer a question about the board. The **24 genuinely unplaced movers still appear** and their note
is now true.

### 2.2 Opportunity is not conserved (measured, PR #694)

A `share` is a fraction of a team opportunity pool, so Σ over the rows a reader sees has a ceiling
of 1. Nothing computed it. On tomorrow's 13 boards / 78 published team-pools:

| pool | n | min | med | max | over-allocated |
|---|---|---|---|---|---|
| `passAttempts` | 26 | 0.590 | 0.998 | **2.433** | 10 (38%) |
| `carries` | 26 | 0.665 | 1.113 | **1.844** | 19 (73%) |
| `targets` | 26 | 0.681 | 0.946 | 1.222 | 9 (35%) |

**38 of 78 over-allocated.** The worst are quarterback rooms — CLE Σ2.433 (3 QBs), MIN Σ2.274 (3),
LV Σ1.827 (2), IND Σ1.714 (3). This is the starter hole, priced.

**Why it drifts, and why it is nobody's bug.** The forecast runs with `shrinkK: 0` — deliberately;
it is the candidate the P300 second look scored — so a departed player's share never fades. The
producer says so itself. The board then applies a roster gate, which is the right fix in the right
place (52 rows dropped on one event, Brandon Lloyd last played 2014, Mario Manningham 2013). **But a
gate removes rows; it does not reconcile what is left.** SF's survivors happen to sum to 0.985 —
luck, not a rule.

### 2.3 Availability is three coarse states, 94% of them the least informative one

`ACTIVE_UNCERTAIN` 2,190 · `QUESTIONABLE` 55 · `OUT` 105. `ACTIVE_EXPECTED` is in the documented
vocabulary and is **never reached**, for a stated and correct reason: game-day actives publish ~90
minutes pre-kickoff and no authorized source carries them. The artifact is honest about this. It is
still the case that the simulation's answer to "will he play, and how much" is *unknown* for 94% of
players.

---

## 3 · MLB — measured

**Identity is the gap on the published path — and it is a PATH, not the sport.** Every published
MLB player prediction carries `playerId: null` and `team: ""` — 65 of 65 on 2026-09-26, and 7/7,
15/15, 20/20 on the three prior days. Upstream of it the props feed is **1,191 rows, 0 with any
player id**, `team: null`, `opponent: null`; its `id` is a hash of `gameId:market:name:line` — a
row key, not an identity.

⚠ **CORRECTION to my own first reading of this.** I wrote that MLB has no stable participant
identity. That is too broad: the parlay optimizer's leg pool carries a real StatsAPI `playerId` on
**371 of 371** rows for the same slate. So the identity exists in this product and one branch of
it throws the identity away. That is a better problem to have than an absent one, and a different
fix — join the published path to the producer that already resolves it, rather than build a
resolver. See `PARLAY_LAB_METHODOLOGY_AUDIT.md` §7.

A canonical store exists — `data/internal/platform/v1/players/MLB.jsonl.gz`, 747 players keyed
`mlb-player-<statsapi id>` — but:

- exact normalised-name join covers **191 of 209** distinct prop names (91%); 18 unresolved, and
  they are genuine absences (Justin Verlander among them), not accent noise — the store is
  incomplete for a full season's player population;
- **`currentTeamId` is null for all 747**, so even a perfect name join yields no current team.

**Lineups are fine and were nearly mis-reported.** Today's slate reads 25 of 26 team-slots
`prop-derived` and 11 of 13 `degraded` — which looks alarming at midday and is not: checking three
completed slates shows confirmed orders do arrive (09-25: 22 of 34 slots `confirmed`). The midday
state is the correct pregame state and the artifact says so.

---

## 4 · EPL — measured

Honest, well-labelled, and carrying a limitation sentence that is **no longer true as written**:

> "No injury or suspension feed exists here, so an unavailable player can still appear in a
> conditional list."

An official feed *does* exist — the Premier League's own FPL API, free and keyless, measured at
667/667 coverage. What does not exist is the **identity join** between it and this ESPN-keyed corpus
(292 exact / 375 unresolved at last measurement). The accurate sentence is *"an official
availability feed exists but is not yet joined to this corpus's identities"*, and the difference
matters because the current wording implies a provider gap that was closed.

Otherwise: `playerId` present ✓, `lineupState` per fixture ✓, `withLineup: 0 / awaitingLineup: 10`
stated ✓, and conditional rows correctly framed as *P(scores | he starts)* rather than a start claim.

---

## 5 · UFC — measured

Structurally the healthiest, because the bout **is** the unit: `red`/`blue` with stable
`athleteId`s means §8.4's rule ("fighter A's role is defined by the actual current opponent") holds
by construction. `scheduledRounds` (3 vs 5) ✓, `titleFight` ✓, `last5` with dates ✓ (layoff
derivable), `unmodelledReason` ✓.

Absent: short-notice / replacement flag, weigh-in and weight-miss, cancellation state. A late
replacement is represented correctly **only if the capture re-runs** — `ufc-fight-week` did run
today at 14:47Z, so the cadence exists; what is missing is a field saying *this is a replacement*,
which §8.5 needs in order to widen the distribution for it.

---

## 6 · What can be fixed structurally — no model-promotion gate

These change *which rows publish* or *what a page claims*, not what a number is.

1. ~~**Arrivals contradiction**~~ — **done, PR #693.**
2. ~~**Conservation measurement**~~ — **done, PR #694.** Measurement only; renormalisation is §7.
3. **Publish one starter per pool.** The nflverse depth-chart source is already acquired and
   committed (`2026-a2bcbdd515d45fc2.json`, 5,493 timestamped QB snapshots, free, keyless). Gating
   which quarterback reaches a board is a **publication rule**, not a numerical change, and it
   removes the single largest conservation violation. ⚠ **Not to be shipped before Sunday's live
   acceptance** — it changes published boards.
   ⚠ **This is not a reopening of §10.** The historical QB-availability study is `REJECTED` (win
   head) and `UNEVALUATED / DATA-INTEGRITY REFUSAL` (pregame margin) because 2022–24 depth charts
   had no defensible capture-before-kickoff timestamp. Capturing a depth chart *forward*, before
   kickoff, is point-in-time by construction — a different claim, for a different purpose
   (correctness, not calibration). Neither verdict is relabelled and the one permitted look stays
   unspent.
4. **MLB player identity.** Join props to `platform/v1/players/MLB` as a **reviewed crosswalk** —
   never a permanent fuzzy join (§9.1's rule applies to MLB exactly as to EPL). Unresolved ⇒ marked
   unresolved and visible, never silently attached. 91% is the starting coverage, not the target.
5. **MLB `currentTeamId`.** Populate from StatsAPI, or state that the store does not carry it.
6. **Correct the EPL limitation sentence** (§4). A stale limitation is a claim.
7. **UFC replacement / short-notice / weight flags.** Capture-side; no model consumes them yet, so
   adding the field is inert until one does — which is the right order.

## 7 · What requires backtesting and preregistration

1. **Renormalising a gated share pool.** Changes every published number on every board. Needs a
   preregistered bar, walk-forward, and a founder decision. Note the choice is not obvious: scaling
   survivors to Σ=1 asserts the roster gate found *everyone*, which §2.2 shows it does not.
2. **Numerical role conditioning for a new arrival** (§8.6.B) — how much of a prior-club rate
   transfers. Do not invent a coefficient because it sounds intuitive.
3. **Role uncertainty widening a distribution** (§8.5). Currently no artifact carries a role
   confidence to widen *with*; build the field first, calibrate second.
4. **Consuming availability as a model term.** Distinct from using it as a publication gate, and
   subject to §10's standing verdicts.

## 8 · Research plan for numerical role conditioning

Registration first, per §27, and none of it is started:

1. **Population** — every player-game 2014–2025 whose club changed since his previous appearance,
   excluding preseason.
2. **Frozen input** — `player-events-v1` partitions, pinned by the `contentHash` accounting the
   scoring-bridge receipt already enforces.
3. **Hypothesis** — a prior-club share, shrunk by a transfer coefficient γ and widened by a
   role-uncertainty term, beats both (a) zero-evidence exclusion, which is today's behaviour, and
   (b) unshrunk carry-over.
4. **Walk-forward** — fit γ on 2014–2021, apply once to 2022–2025.
5. **Metrics** — MAE and calibration on the mover rows *only*; and, as a joint bar, the conservation
   Σ of §2.2, because a candidate that fixes movers by inflating the pool has not fixed anything.
6. **Stop condition** — fails if it does not beat exclusion on both, or if it pushes median Σ further
   from 1 than today's 1.113 on carries.

---

## 9 · Public forecasts affected today

| surface | affected | nature |
|---|---|---|
| NFL player boards, 2026-09-27 | 13 of 14 games | arrivals contradiction — **fixed #693**, artifacts correct at the next event window |
| NFL player boards, 2026-09-27 | 38 of 78 team-pools | opportunity over-allocated — **measured #694**, numbers unchanged pending §7.1 |
| NFL player boards | 24 movers | genuinely unplaced; correctly shown as history, honestly framed |
| MLB player predictions | 100% of rows | identity dropped on the published path (the optimizer resolves it) |
| EPL player projections | all fixtures | limitation sentence overstates the provider gap |
| UFC bouts | none measured | no current-state defect found |

**Nothing in §2.2 changes a published number**, and nothing in this audit was fixed by editing a
generated artifact — #693 changes a producer, and its boards correct themselves at the next window.

---

## 10 · Mistakes made producing this audit, recorded because the pattern recurs

- **My conservation audit joined raw team abbreviations** and reported WSH and LAR as `NO_JOIN` with
  40 unjoined rows — *a defect in the audit, presented as a defect in the board*. The board is
  ESPN-keyed (`WSH`, `LAR`), the forecast nflverse-keyed (`WAS`, `LA`). It now imports the board's
  own `nflverseTeam` rather than restating it. **Two normalisers, one rule.**
- **I nearly reported MLB's midday `prop-derived` lineups as a defect.** Checking three completed
  slates showed confirmed orders arrive. A pregame state is not a gap.
- **I wrote that MLB has no stable participant identity.** The published predictions path drops
  it; the parlay optimizer resolves a real StatsAPI id on 371 of 371 rows for the same slate. An
  absent capability and a discarded one need different fixes, and I had named the wrong one.
- **I first read the SF board as inflating survivors** because Σ receptions ≈ a full team total.
  It does not: `predictAllocation` folds the residual into `other`. The real defect was the
  *opposite* shape — the pool is over-subscribed before the gate, not renormalised after it.

---

## 11 · Founder gates opened by this audit

1. **Renormalising a gated share pool** (§7.1) — a model promotion affecting every published number.
   Recommendation: measure for a full week first; #694 emits the series.
2. **Publishing one starter per pool** (§6.3) — structurally model-neutral, but it removes rows a
   reader sees today. Recommendation: **yes, after Sunday**, never before.
