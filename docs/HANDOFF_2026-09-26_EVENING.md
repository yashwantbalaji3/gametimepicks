# Handoff — 2026-09-26, Saturday evening (the night before NFL Week 4's Sunday)

**Terminal state:** `SUNDAY READY · A SUNDAY-MORNING BLOCKER REMOVED · THE MULTI-SPORT LIVE CONTRACT
LANDED · TWO LIVE DEFECTS FOUND AND FIXED`.

I **spent no credit**: the ledger is `475 / 1,160` (685 left) and Phase H is untouched at `0 / 90`.
No registry, model promotion, policy constant, secret or provider plan changed. **Nothing published
to a reader changed** — every module below is unwired, and the NFL/MLB live gates are as they were.

Supersedes [`HANDOFF_2026-09-26_SATURDAY.md`](./HANDOFF_2026-09-26_SATURDAY.md) for state. Its §D
findings and §E gates are unchanged except where corrected below.

| | |
|---|---|
| `origin/main` | `ee3bf0bc54` |
| Production | `ee3bf0bc` — **identical** |
| Sunday slate | `IN_FLIGHT · 14 games · 0 clean · 0 needing attention` |
| Odds ledger | `475 / 1,160` · 685 remaining · **Phase H 0 / 90** |
| Merged today (evening) | `#701`, `#702` |
| Open | `#704` — five units, in CI |

---

## A · 🔴 Tomorrow morning's `git pull` was going to abort, and it no longer will

`nfl-lifecycle-trace.mjs` opens with "one question, asked of **committed artifacts only**". It then
reads a filesystem. On this machine those two facts disagreed:

> sixteen live-props artifacts sat **untracked** in the working tree, and **no commit in the
> repository's entire history has ever touched `app/public/data/nfl/live-props/`**.

The trace read them and reported `✓ LIVE_ARTIFACT phase PRE, frozen 2026-09-25T18:25:54Z` for all
fourteen Sunday games. **The morning handoff recorded that line as slate health.** Quarantining the
files and re-running the same command on the same commit gives `· LIVE_ARTIFACT not kicked off yet`
×14 — and the slate VERDICT is identical either way, so the acceptance was never at risk from the
reporting. The evidence behind the line was.

**The filenames were the real problem.** `nfl-live-props.yml` commits exactly these
`<eventId>.json` names, and all fourteen of tomorrow's event ids collided with a local file.
Reproduced in an isolated repo:

```
error: The following untracked working tree files would be overwritten by merge:
        app/public/data/nfl/live-props/401872949.json
Aborting
```

HEAD does not move. That is Sunday morning, on the documented operator command path, at the one
moment those artifacts are wanted.

**Done:** the files are quarantined (in a scratch directory, not deleted), and `#701` makes the
trace unable to repeat it — `liveCommitted: false` → `INCONSISTENT` with the reason and the pull
consequence; `null` (no git, a tarball) → NOT DETERMINED, behaving exactly as before, because an
unanswerable question must not accuse a real artifact. The settlement-ledger path gets the same
check as a banner.

⚠ **The producer is healthy and is NOT the finding.** `nfl-live-props.yml` only reached `main` at
`2026-09-25T22:03Z`, after Thursday's game, so its crons have **never had an opportunity to fire**.
Friday's single manual dispatch found no game in play and correctly committed nothing. **Tomorrow is
the first firing of that schedule in its history** — which is the thing to actually watch.

---

## B · The multi-sport live matrix, and why §8's instruction has the answer "none"

```bash
npx tsx app/scripts/ops/multisport-live-matrix.mjs --date 2026-09-27
SUMMARY: 15 published families · 7 product-eligible · 4 live-trackable today
```

The four are **NFL rushing yards, receiving yards, receptions, and UFC fight winner**. That is the
honest denominator for §28's terminal criteria.

### B1 · 🔴 MLB is the best live substrate in the product, and not one family is eligible

On engineering grounds MLB beats NFL. Across today's 569 board leans: `gamePk` **569/569**,
StatsAPI `playerId` **526/569**, a frozen line + book + capture instant on **569/569**, and
GameTimePicks' own `modelProbOver` on **523/569**.

All four markets are `DEMOTE_TO_MARKET_CONTEXT` — the model loses to the market on Brier **and** log
loss across 18,659 settled leans, with anti-calibrated gap buckets.

So the matrix reports **engineering readiness and product eligibility as separate columns**, because
they fail independently in both directions: MLB is ready and ineligible; NFL's anytime touchdown and
UFC's method are eligible and unmeasurable. A test asserts no `DEMOTE_TO_MARKET_CONTEXT` row can ever
be reported trackable, and the verdicts are **imported** from `model-calibration-status.ts` rather
than copied, so the audit cannot drift from the SoT.

### B2 · Three corrections to the morning's findings

- **§7's "four live NFL families" is three.** `anytime_td` is published and validated and is NOT
  live-measurable — TDs span six overlapping box-score columns and `scoringPlays[].athletesInvolved`
  is empty. That refusal is correct and is kept. But dropping the row answers *"where did my
  touchdown prediction go?"* with nothing, so it now renders as `NOT_LIVE_TRACKABLE`, distinct from
  `NO_MEASUREMENT` (which implies a number is still coming).
- **D3 understated its own defect.** "0 of 371 optimizer legs carry a probability" is true. The
  sharper truth: **371 of 371 upstream leans carry one**, and the projection step discards every one.
- **D6's "MLB identity is discarded"** is true of `predictions/` and all 1,191 `player-props/` rows
  (a player NAME and a hash `gameId`, joinable to nothing). It is **not** true of the board leans.

### B3 · One defect class, three instances this week

A projection step that narrows a record is where this product loses things:

| upstream has | downstream drops |
|---|---|
| board lean `modelProbOver` (371/371) | optimizer leg `probability` (0/371) |
| optimizer StatsAPI `playerId` (371/371) | published prediction `playerId` (0%) |
| board `markets[].market` line + both prices + `capturedAt` | tracked row `frozenLine: null`, `frozenProjection` null on 34/34 |

---

## C · 🔴 Ask publishes a fabricated settlement claim (fixed)

Asked *"has Derrick Henry already hit his receiving yards line tonight?"*:

```
He has already hit it — that leg is a winner.        verified: true
```

Verification **passed because the sentence carries no number**. The numeric gate had nothing to
check, the link gate had no link, and neither the wagering nor the expected-value list contains this
shape. Ask has **no per-leg live tool at all**, so no correct answer to that question exists today.

Fixed with `ASK_FORBIDDEN_LIVE_SETTLEMENT_COPY`, deliberately narrow — "already decided" locutions,
not the words `won` or `hit`, which a settled record legitimately uses. 833/833 checks across 117
cases pass with it in, so it costs no existing answer.

⚠ **And six of the eight eval cases I first wrote were vacuous, which is how the defect was found.**
Making the fake provider fabricate an answer for each, only two of eight failed: the fake ROUTER
sends the rest to SITE_HELP and the text never reaches the writer. They are kept as the weaker thing
they are, with a note. The real guards are `mut-19..22`, which force the claim through the writer.

§11.4's seven uncovered classes are now cased: unavailable player, current role / new signing, stale
artifact, frozen sportsbook provenance, simulation explanation, `NO_MEASUREMENT`, provider delay.

---

## C2 · Three more defects, and one founder recommendation corrected

### 🔴 Founder gate #2's prerequisite is a refresh job, not a publishing decision

§E gate #2 and §F move #4 both recommend publishing one starter per pool after Sunday "from the
depth-chart source already committed". Measured against tomorrow's real slate — 28 team-board
questions across all fourteen games:

| freshness bound | resolved |
|---|---|
| 3 days | **0 / 28** |
| 7 days | **0 / 28** |
| 14 days | **0 / 28** |
| 30 days | 28 / 28 — and 30 days is not a bound on a weekly role |

Every snapshot is **18.3 days old**. The newest is `2026-09-08`, which predates three games,
`acquire-depth-chart-research.mjs` appears in **no workflow**, and the artifact has **one commit**
in the repository's history. ⚠ It is also **quarterbacks only** — the snapshot field is literally
`quarterbacks` — so it can resolve ONE pool, not "one starter per pool". That pool is the right one
(the 243% Cleveland violation is a quarterback problem), but the scope is narrower than the
recommendation implies.

The consumer is built and shadow-only. It enforces point-in-time reading — no bound, however
generous, can reach a snapshot from after the instant asked about, which is the leakage guard the
rejected historical QB study lacked — and its staleness bound **throws if omitted**, because a
default is where an 18-day-old answer gets returned to a caller who never thought about it.

### `sport-schedules` was red 8 of 14 days because the source was behaving normally

openfootball publishes a matchday as one placeholder kickoff slot until broadcasters assign times.
The capture correctly refuses to publish a placeholder as a schedule, and **every other capture in
those runs succeeded** — 30/30 EPL teams, 563 players, NFL, NBA and UFC all fine. A correct,
recurring refusal was reddening the whole workflow.

It now warns, via an exit code exactly one path produces (`EXIT_SOURCE_PROVISIONAL = 3`); every
other refusal still writes to the file that decides the run's colour, and the gate is untouched.
⚠ My first test executed an inline COPY of the workflow shell, so deleting the line that makes a
real refusal fail the run changed nothing. It extracts the branch from the workflow file now.

### A live bout found what two fixtures could not

The UFC adapter was verified against a scheduled card and a completed card, both fine. Tonight's
card went live and the first bout produced `round=R0  clock="-"` — ESPN reports `period: 0` and a
dash for a bout that has started but whose first round has not begun. **A row that says R0 is worse
than a row that says nothing: it looks like a measurement.** Both are null now, pinned by a third
fixture that only exists while a card is running.

Everything else was right on live data first time: `fight_winner` and `fight_rounds` read
MEASURED → LIVE_UNRESOLVED, `fight_method` NOT_LIVE_TRACKABLE, and no winner was read from a bout
in progress.

---

## C3 · 🔴 §18 measured, and deliberately NOT fixed tonight

`nightly-settle` fails **10 of its last 20 runs**, every time on:

> `A dated projection for <date> already exists and differs from this run. The write-once rule
> refused it and wrote nothing.`

It runs four times a day. The first run writes the dated projection; runs 2–4 recompute one that
legitimately differs (more games have settled), the write-once rule correctly refuses, and **the
step exits 1**. The commit step at line 715 has **no `if: always()`** — so every settlement computed
in steps 149–607 (MLB props, the Bank Builder ladder, Moonshot, the protected-record fold, the daily
portfolio, the selector shadow, picks-vs-outcomes, the risk ladder, Homer Nukes, paper cards,
prediction history, the model-results index) is computed and discarded.

That is §18's defect exactly, and it is the same shape as the `sport-schedules` finding above: a
correct refusal reported as a failure. **I did not change it.** The boundary touches money ledgers
and the protected record, and `nightly-settle` fires at 01:17 ET Sunday — hours before the
acceptance. §27 P1 #18 makes the fix conditional on isolation from Sunday risk, and it is not.

**The design, for after Sunday:** give the write-once refusal its own exit code, exactly as the EPL
provisional refusal now has, and let the workflow treat "already published, and this run's
recomputation is not a restatement anyone asked for" as a warning that does not skip the commit —
while any other projection failure still fails the run. §18's own words: preserve write-once
integrity, distinguish publish refusal from invalid settlement, and never a blind `always()`.

A separate, smaller crash in the same workflow WAS fixed, because its outcome is unchanged:
`update-selection-learning.mjs` threw `RangeError: Invalid time value` for EPL, whose ledger dates by
`kickoffUtc` and carries no `date` key at all — two ledger schemas, one reader. It refuses with the
cause now, at the same exit code; MLB still exits 0 with a byte-identical policy.

---

## D · What landed, by section

| § | unit | state |
|---|---|---|
| — | the Sunday shadow guard | **merged `#701`** |
| §6 | sport-neutral `LiveTrackedPrediction` + NFL adapter | **merged `#702`** |
| §5 | the progress rail, verified at 375px | `#704` |
| §8/§9 | the multi-sport live matrix | `#704` |
| §9 | UFC adapter + ESPN MMA normaliser, replayed on a completed card | `#704` |
| §13/§14 | Recommendation Receipt + ProductEligibleLeg V2 | `#704` |
| §11 | Ask settlement-copy guard + 12 eval cases | `#704` |
| §12.1 | depth-chart consumer + the founder-gate measurement (shadow) | `#704` |
| §18 | `sport-schedules` provisional refusal; the selection-learning crash | `#704` |
| §9 | the live-bout `R0` / placeholder-clock fix, and one REAL bout through its whole lifecycle | `#704` |
| §15 | the correlation taxonomy (step 3 — the last pure-definition step) | `#704` |

**§5.2 is enforced structurally, not by discipline.** `railStateOf` cannot return a result state
outside `FINAL_CANONICAL`, proved across 1,344 input combinations each carrying a SETTLED/HIT
settlement so the finality check is the only thing holding the result back. The component has no
branch that decides a win, so a colour cannot get ahead of the truth.

**A contract gap the UFC work found:** `FINAL_AWAITING_SETTLEMENT`. Between a provider's "Final" and
the canonical result there is a real interval that had no word — a finished bout rendered
"Live — unresolved" and a completed game's yardage rendered "Currently above line", both describing a
present that has ended.

---

## D2 · §9 is proved on a real bout, not on fixtures

Tonight's card ran while this was being built. The SAME bout was captured at three moments, none of
which is reconstructable once a card is over:

```
21:0xZ   state in   · period 0 · clock "-"     walkouts — NOT started
21:1xZ   state in   · period 1 · clock 3:58    under way
21:2xZ   state post · period 1 · clock 1:02    finished, R1, winner by athlete id
```

🔴 **The first is a defect two fixtures could not find.** ESPN reports `state: "in"` for a bout that
has not started — for ten minutes, across two different pre-bout statuses ("Pre-fight", then
`STATUS_FIGHTERS_WALKING`). The first cut rendered `R0` with a dash for a clock, and a row that says
R0 is worse than a row that says nothing: it looks like a measurement. This is the rule
`mlb-statsapi.mjs` already keeps for StatsAPI's "Warmup". The general rule is **structural** — a
bout in progress is always in some round — because two different pre-bout names appeared in eight
minutes.

**And the rule that matters held at every step.** At provider FINAL, ESPN names the winner by
athlete id and the product does not say the prediction hit:

| | `fight_winner` | `fight_rounds` / `fight_method` |
|---|---|---|
| provider FINAL | `FINAL_AWAITING_SETTLEMENT`, result **null** | `FINAL_NO_MEASUREMENT` |
| with a settlement | `FINAL_CANONICAL` · HIT · `FINAL_WIN` | still **null** — no sideways leak |

## D3 · §13 → §14 → §15 now exist as one chain, all shadow

The receipt records what the model said; ProductEligibleLeg answers whether a leg may be
considered and why not; the taxonomy answers what a card may not assume is independent. **None of
them selects, scores, or produces a joint probability** — there is no coefficient anywhere, because
a label cannot be multiplied and a ρ can.

Three of §15's nine kinds are undetectable from a receipt (game script, weather, lineup) and are
**named on every answer, including an allowed one**. `NONE_OBSERVED` is not independence.

---

## D4 · Launch Integrity P0s — four public defects, each with a root cause the prose did not name

§5 of the continuation prompt says reproduce before patching. It earned its place four times: every
observation was real, and not one root cause was what the report described.

### 🔴 §3.3 · a finished game said LIVE on every NFL prediction row

Reproduced on the real component with a real committed board row. The tag read
`settled || noMeasure ? "Final" : "Live"`, so a game the PROVIDER had called final rendered as LIVE
until settlement ran — the final whistle to the nightly settle, **hours**, on the surface tomorrow's
acceptance is watched from. It now reads `Final · result pending`, with no colour and no outcome
word, and a finished game no longer carries "4Q · 0:00".

### 🔴 §6 · Results contradicted its own correct arithmetic

`batter_hits` is `total 197 · 100–76 · pushes 0 · voids 21 · rate 56.8%`. The page printed
"100–76 · **197 dec** · 56.8%", so a reader dividing 100 by 197 gets 50.8% and concludes the rate is
broken. **It is not** — the data reconciles at every level (headline, byMarket, byConfidence all
satisfy `total = W+L+P+V`). The component rendered `b.total` under the label "dec". Three of four
markets affected.

⚠ And `MlbBucket` had **dropped `voids`** — the producer always wrote it, the type never declared
it, so **44 voided rows** were unrenderable. Fourth instance this session of the same
narrowing-projection shape.

### 🔴 §7 · the slate's clock was stamped on forecasts it did not produce

The artifact's top-level `generatedAt` is **not every game's generation time**. When a later run
happens after a game's first pitch the producer carries that game's pregame forecast forward
verbatim, and a carried game keeps NO per-game timestamp. So the 21:24Z slate stamp appeared beside
three games with 20:05–20:10Z first pitches, correctly flagged `startedBeforeGeneration: false` —
"Simulated 5:24 PM · pregame", a clock from after kickoff on a forecast made before it.

⚠ **The producer was never the problem** and an instant comparison is worse, not better: my first
fix labelled those three genuine pregame forecasts "after first pitch". Four typed states now, all
read from the artifact — `PREGAME_CARRIED` prints no time at all, because the time is not ours.

### 🔴 §9 · a refused live feed turned every started game back into "Scheduled"

`derivePresentationState` returned `PRE` for both "live is off" (honest) and "we asked and were
refused" (not). On a first load during an outage the hub has no envelope for any game, so a game
that started two hours ago read "Scheduled".

⚠ **Both hooks were already right** — neither clears its last good payload on a refusal or a throw,
so a mid-session outage never blanked anything. Only the never-succeeded case regressed, and that
is now `Status unknown`. The hub's grouping memo also had to gain `unavailable` as a dependency, or
the fix would never have reached the screen.

---

## D5 · Sunday's producer, dry-run against tomorrow's real slate

`nfl-live-props.yml` fires on its own schedule for the first time in its history tomorrow. Run in
`--dry-run` against the committed boards, it works and writes nothing:

```
as of 2026-09-27T17:05Z    9 games covered
as of 2026-09-27T21:00Z   13 games covered
as of 2026-09-28T01:00Z   14 games covered      ← the whole slate
each game: PRE · 47–70 rows · 0 with a live stat · 0 settled
```

Coverage ramps with the kickoff windows exactly as it should, and `git status` over the artifact
paths is clean afterwards.

---

## E · Defects I wrote and caught, recorded because the patterns recur

- **A fabricated line.** The rail's first cut read `line ?? modelPrediction` and said
  `CURRENTLY ABOVE LINE` — inventing a sportsbook line out of a model output on every row with no
  purchased price. A band now gets band words.
- **A one-board audit.** The matrix took whatever `readdirSync` returned first and presented it as
  "the NFL state", reporting `player_rush_yds` as ESTIMATE while all fourteen boards publish it. A
  test now fails if the slate size is 1.
- **A probe on the wrong field.** I read `competitor.athlete.id` on the ESPN MMA payload, found null,
  and was one step from recording "UFC has no stable live identity". The id is `competitor.id`, one
  level up, present in PRE as well as POST. The fixture keeps asserting the nested id is absent.
- **Browser verification found three things unit tests did not** — a terminal market rendering the
  join's internal `1` beside a fighter's name, `104 / 96 hi` leaking internal shorthand, and the
  round printed twice. All three are pinned by tests written *after* the screenshot.
- **A guard that read the explanation instead of the thing, three times.** An inline COPY of
  workflow shell; `/kickoffUtc/` matched against a comment; `|| true` matched against the comment
  saying the workflow uses no `|| true`. All three now strip comments or extract the real branch.
- **A fixture that made its own assertion vacuous.** My provider-FINAL row had `period: null`, and
  the guard it tested is `f?.period != null` — so it passed whether or not the guard existed.
- **A regex that matched the wrong number.** The empty-cohort assertion searched the whole page for
  `/0\.0%/` and matched the headline's "50.0%".
- **A vacuous detector, three hours old.** `DETECTABLE` claimed same-team and opposing-side
  correlation were detectable while the receipt carried neither `team` nor `opponent` — both of
  which were already in every optimizer leg. The same narrowing-projection defect I had just
  documented, in my own new code. Every "detectable" claim is now backed by a case that makes it
  fire.
- **A stacked PR auto-closed** when I deleted its base branch on merge, and GitHub will not reopen a
  PR whose base is gone. Same accident as `#693` yesterday. **Merge stacked PRs base-first and
  retarget the child before deleting anything.**

---

## F · The next session's first four moves

1. **Merge `#704` on green**, then run the Sunday trace through the day. After the night game
   settles and the reconciliation window closes, a `CLEAN` line for fourteen games is the acceptance.
2. **Watch `nfl-live-props.yml` fire for the first time ever** (Sundays `*/15 13-23`, then
   `*/15 0-4` Monday). Its crons have never run. If it commits, `git pull` and re-run the trace —
   which will now say `✓ LIVE_ARTIFACT` from *committed* evidence, and mean it.
3. **Do not force Phase H.** One probe, on the first run finding a game genuinely in progress.
4. **Fix §18's publication boundary** (see §C3) — it is designed, measured and deliberately unmerged.
5. **Refresh the depth charts** before reopening founder gate #2 (see §C2).
6. **Wire the rail to a route** — it is built, tested and rendered, and nothing imports it. That is a
   public-behaviour change and the NFL live gating is a founder area, so it is the first thing to
   put in front of the founder rather than the first thing to merge.

⚠ **Still do not start the higher-level product rebuild.** §13's receipt now exists and records what
the model said; it does not make a demoted market usable. The two problems are independent:
recovering the discarded probabilities would not make MLB legs eligible, and validating a market
would not help while the plumbing still drops the number.

---

## G · Founder gates

Unchanged from the morning handoff (share renormalisation · publishing one starter per pool ·
Parlay Lab's `high` and `low` tiers), plus:

5. **Wiring the live rail to a public route**, which turns an unwired module into public behaviour.
6. **MLB player-prop recalibration** — the matrix makes the block explicit and standing. The audit's
   own recommendation (widen sigma / shrink toward the market / isotonic on settled leans) is the
   only path that changes the "4 live-trackable" number for MLB.
