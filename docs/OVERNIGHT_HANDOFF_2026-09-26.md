# Overnight handoff — 2026-09-26 (the Sunday before NFL Week 4)

**Terminal state:** `NFL LIVE ENABLED ON PRODUCTION · LIFECYCLE COMPLETE FOR THE FIRST TIME`.
Seventeen PRs merged (#674–#690), one open and CI-running (#691). **No live-odds credit has been
spent** — the ledger is unchanged at 394 of 1,160 and Phase H stands at 0 of its 90-credit budget.
No registry, model promotion, policy constant, secret or provider plan changed.

---

## A · What tomorrow depends on, in one command

```bash
node app/scripts/ops/nfl-lifecycle-trace.mjs
node app/scripts/ops/odds-credit-position.mjs
```

The full page is [`SUNDAY_OPERATOR_CHECKLIST.md`](SUNDAY_OPERATOR_CHECKLIST.md). Read §1 and §3 of it
before touching anything tomorrow. `NOT_YET` is not a warning; `NO_GAMES` is a result.

---

## A2 · NFL live is verified live — and `/live` is deliberately NOT widened

Production is on `e19b5cb71c` (built 2026-09-26T09:14Z). Verified against the deployed gateway, with
both controls:

```
GET /api/live?sport=nfl&eventId=401872953  → real NFL state: ATL @ GB FINAL 35–14, espn-public  ✓
GET /api/live?sport=nba&eventId=1          → {"unavailable":true,"reason":"UNSUPPORTED_SPORT"}   ✓
```

⚠ **Where NFL live surfaces, and where it must not.** It surfaces on the NFL board/report pages via
`useLiveEvent`. The `/live` hub still reads "Today's **MLB** games" and "Live beta · MLB" — that is
**correct and intentional**, per the founder's instruction not to silently widen `/live` or `/my`
merely because NFL live is enabled. A next session seeing MLB-only copy on `/live` should not "fix"
it; widening that hub is a separate decision.

Note the gateway answers with the whole NFL slate rather than the one requested event — that is the
memoised shape the CDN caches by request URL, not a bug.

---

## B · The two defects that mattered most, and neither had a failing test

**1 · `FINAL_CANONICAL` had never once been reached.** The lifecycle is documented as
`LIVE → FINAL_PROVISIONAL → (3h window) → FINAL_CANONICAL → stop`, but both clocks were the same
clock: the producer polled a finished game only while `finalityAt` said PROVISIONAL, and stamped
whatever it said at that same instant. Probed against the one completed game — window−1min
`poll=YES` stamping PROVISIONAL, window+0min `poll=no` stamping CANONICAL. The reachable set was
`{PROVISIONAL}`, permanently, for **every NFL prop settlement in the repository**.

`finalityAt` was correct and unit-tested. The **composition** was the defect, which is exactly why
nothing caught it — and is the generalisable lesson: *a state machine whose transition condition is
also its polling condition has no transition.*

**2 · A forecast was gradeable where it was never published.** `settle()` graded `forecastResult`
from any frozen line without consulting the family's publication state. On **tomorrow's** boards
`player_pass_yds` is ESTIMATE and 28 of its entries carry a line anyway — the odds capture buys
prices per market and never asks a model verdict. The only reason nothing had been graded was that
the one completed game's four ESTIMATE rows happened to have no line. Luck, not a rule.

Both fixed in #691, with ten mutation probes including all four plausible half-fixes.

---

## C · Three things I got wrong, recorded because the pattern recurs

- **A vacuous read almost became a finding.** My first lifecycle trace compared the board's family
  **object** to the string `"PUBLISHED"` and reported "no family cleared its bar" on all sixteen games
  of a healthy slate. A guard that reads the wrong shape does not fail — it passes and answers a
  different question.
- **An over-strong verdict, withdrawn.** It flagged a live *value* on an unpublished family as
  INCONSISTENT. The public board already carries every family's projection with its state label, so
  family state gates what a **page** may claim, not what an artifact may carry. The presentation rule
  is where it belongs (#690).
- **My own credit readout failed open.** Wrong field name → "ceiling UNKNOWN" → "paid calls remain
  permitted", because `ceiling != null` guarded the comparison. Now each unreadable input refuses on
  its own.

---

## D · ⚠ THE REAL SUNDAY RISK: two workflows have never had a scheduled run

| workflow | crons | scheduled runs ever |
|---|---|---|
| `nfl-event-window` | daily 14:30/15:00/21:00Z + Fri/Sat/Sun 13:00Z | delivering (late, as always) |
| `nfl-kickoff-refresh` | `*/30 9-22 * * 0` and Mon/Thu | **none — dispatch only** |
| `nfl-live-props` | `*/15 13-23 * * 0`, Mon/Thu tails | **none — dispatch only** |

Both were merged after last Sunday's slate, so **tomorrow is the first time either cron has ever
fired.** Their one dispatch each succeeded and committed nothing, correctly: no game was live.

This is not a defect and there is nothing to fix tonight — but it is unproven, and this repository's
measured cron delivery is 1h40m to 4h55m late. `nfl-live-props` is designed for that (it relies on a
dense *stream*, not punctual slots, and the producer decides what is live from the schedule), which
is the reason to expect it to work rather than a proof that it will.

**If nothing has published by ~18:30Z:** `gh run list --workflow=nfl-live-props.yml` and then
`gh workflow run nfl-live-props.yml`. A dispatch is free and idempotent.

**A second gap, already closed:** a Sunday-night game finishes ~04:00Z Monday and its reconciliation
window closes ~07:00Z — after `*/15 0-4 * * 1` ends. That is why the CANONICAL promotion sweep lives
in `nfl-event-window.yml` (daily) and not in the live workflow, and why it walks every committed
artifact rather than only games inside the 8-hour live window.

---

## D2 · Tomorrow has two neutral-site internationals, and they found a P0

`BAL VS DAL` at the **Maracanã** (20:25Z) and `IND VS WSH` at **Tottenham** are written by ESPN with
`VS`, not `@`. Four places split that label on `@` and each broke differently — worst of them, the
Phase H probe's join returned false, so the **one authorized 3-credit call** could have been spent on
a game it then could not find and closed the lane on a string format. Fixed in #691 with one shared
rule, and the away-first ordering is now a test over the committed capture rather than a comment.

**Checked and NOT a defect** — the weather lane. Both venues are correctly geocoded (Rio and London),
`public-view.mjs` drops a weather-null row, and nothing false is published. But the "outside the US
gets no forecast" rule is enforced by the National Weather Service returning 404 rather than by the
`country: "non-US"` field the table already carries, and `NO_FORECAST` therefore cannot be told apart
from "NWS was down for a US stadium". Verified live: Rio 404, London 404, Highmark 200. Deliberately
**not** changed hours before a live slate — spawned as its own task.

---

## D3 · ⚠ `nightly-settle` has been discarding computed settlement since 09-24

Not an NFL lane, and not touched tonight — it needs a decision on the money path. Diagnosed precisely:

| date | runs |
|---|---|
| 09-19 → 09-23 | 3–5 per day, **all success** |
| 09-24 | 1 success, **4 failure** |
| 09-25 | 1 success, **3 failure** |
| 09-26 | 1 success so far |

The failing step is *Rebuild the canonical Results projection*, and its refusal is **correct**:

> `REFUSED: 2026-09-25.json exists and DIFFERS from this run. A dated projection is not rewritten
> silently.`

Four cron slots write one dated projection. The first slot writes it; if settlement advances between
slots — a late game finalising, a doubleheader, a catch-up settle — a later slot computes a different
answer for the same ET date and write-once refuses. The rule is deliberate and money-protective, and
the step says in its own comment not to make it `continue-on-error`.

⚠ **The bug is what the refusal takes with it.** `Commit and push if results changed` is step 30 and
has no `always()`, so it is skipped — and steps 5–23 (Parlay Lab ledger, MLB prop settlement, Bank
Builder ladder, the Rule S fold, the portfolio roll, the model-results index) had already computed
into the working tree. That is the built-but-never-published shape, again.

⚠ **And the obvious fix is wrong.** `always()` on the commit would also skip past the *health gate* at
step 25, whose whole job is to abort a publish on stale or non-reconciling data. Whether a
partially-updated tree is a legitimate commit at all is a founder/operator question. Spawned as its own
task with the full diagnosis, including the specific thing to measure: whether the work self-heals via
the catch-up path (a publication lag) or is permanently lost.

---

## D4 · 🔴 The homepage was 62 words over its first-viewport ceiling — PR #692

**This blocked every PR's quality gate**, and NFL going live is why. Measured by building `origin/main`
in a clean worktree, because my first instinct was that my own branch had caused it:

| | busiest | non-lane | fixture lanes | started chips | vs ceiling 1,820 |
|---|---|---|---|---|---|
| `origin/main` | **1,882** | 1,427 | 386 | 69 | **62 over** |
| after #692 | **1,795** | 1,340 | 386 | 69 | 25 under |

`main` was six words *worse* than the branch I was blaming. Nothing editorial changed: the dated-ahead
reads panel, previously near-empty, filled with ten NFL rows whose descriptors are the longest on the
page (`Sun, Sep 27 · NFL · Game winner · SEA @ WSH · projected 26–20 · total median 46` — fourteen words
before the probability, 21.75 words per row measured).

⚠ **#692 is the reversible fix, not the one the guard asks for.** Its message says trim
*non-prediction* words and it is right — the footer (170), primary nav (149), "How it works" (53) and
the launchpad subtitle (58) are where the slack is. `UPCOMING_READS_SHOWN = 6` deletes no sentence and
is one constant to revert. **Which public sentences to cut instead is a founder call** (see §G).

⚠ **Headroom is 25 words.** Thin, on a guard that measures whatever the calendar produces. Tomorrow's
*today* panel will itself fill with NFL rows. Expect this to speak again — and the rule is trim, never
raise.

### D4b · And a second calendar-driven breakage in the same PR

The Ask golden eval typed records that move. `res-06` asserted `"32–27"`; Thursday's game graded, NFL
became 32–28, and a case whose subject is *"does the answer state the record"* failed on a record that
had simply moved. All seven hard gates passed — a soft failure still exits 1.

⚠ **The dangerous half was `mustNotMention`.** `res-01` (Bank Builder 37–36) and `res-02` (Moonshot
4–35) were not failing yet, but their refusals — 42–36, 47–36, 4–42 — were hand-derived *from* the
correct record to catch an era boundary crossed silently. When a card settles the composite moves and
the wrong foldings move with it, and a stale `mustNotMention` **does not go red; it stops catching
anything.** A guard that decays into a no-op is worse than one that fails.

All three now derive from the artifact `getForecastRecord` reads, through its own `recordLabel` rule.
Probed by simulating a Bank Builder win: the refusals followed to 43–36 / 48–36 in lockstep.

**The pattern to carry forward:** two of tonight's CI breakages were data-driven, not code-driven, and
both blocked every merge. A date- or record-pinned expectation plus a scheduled producer is a time bomb;
derive the value or assert the shape.

---

## E · Phase H — armed, bounded, and not forced

| | |
|---|---|
| in-play authorization | YES · `h2h`, `spreads`, `totals` (amendment 3) |
| in-play player props | **NO** — ~3,060 credits/Sunday against 766 remaining |
| probe | one 3-credit call, once ever, on the first run finding a game genuinely in progress |
| pilot | refuses until the probe PASSES · ~30-min interval enforced against the ledger · stops at 90 |
| spent so far | **0** |

**Verified as safe no-ops tonight**, run with no `ODDS_API_KEY` in the environment so a paid call was
impossible either way:

```
probe   → "NO LIVE NFL GAME at 2026-09-26T11:33Z — no credit spent."
           nearest kickoff: CAR @ CLE at 2026-09-27T17:00Z · armed, will fire on the next live run
pilot   → "NOT STARTED: no probe verdict on disk — the pilot begins only after the probe has run."
ledger  → 394 credits / 265 requests, identical before and after
```

Liveness is refused *before* the key is read, which is why the probe cannot misfire on a pre-kickoff run.

Both live in `nfl-live-props.yml` and bound themselves on the **ledger**, not on the cron — so a
15-minute schedule cannot overspend a 30-minute cadence and the repository's cron lateness cannot
either. **Do not re-probe for a better answer.** One probe is the authorization; a pregame-only
verdict closes the lane for 3 credits and that is the result.

---

## F · What the session closed

| # | lane | outcome |
|---|---|---|
| 674–681 | live-prop producer, frozen forecast, slate-date identity, live slot wiring, target source | shipped |
| 682 | **NFL live enabled on Production** (`LIVE_PUBLIC_SPORTS=mlb,nfl`) | shipped, survives bot deploys |
| 683–685 | live-odds audit, Phase H contract, bounded pilot + scheduled owner | shipped |
| 686 | MLB input reproducibility (lineage snapshot; 15/17 byte-identical on replay) | closed |
| 687 | Phase I — EPL availability | **already free and official; nothing to buy** |
| 688 | Engine V2 historical source search | **no defensible source — UNEVALUATED, not rejected** |
| 689 | cross-sport live capability matrix | measured; two traps found |
| 690 | P0 — a live value could attach to an ESTIMATE family | shipped |
| 691 | lifecycle trace · CANONICAL reachable · publication-gated grading · the `BAL VS DAL` P0 · fixture isolation | **open, CI running** |

---

## G · Open founder gates (nothing is blocked on me)

1. **Live player-prop odds** — costed at ~1,530–3,060 credits/Sunday. Recommendation stands: **no**.
   `LIVE_ODDS_DECISION_PACKAGE.md` has the numbers, including the correction that the operative
   ceiling is 1,160 (not the 3,000 a superseded receipt reported).
2. **MLB finals backfill** — a yes/no, unchanged.
3. **The homepage's non-prediction trim** (§D4) — which of the footer, primary nav, "How it works" or
   the launchpad subtitle gives up words. #692 bought 25 words of headroom mechanically without
   deleting a sentence; the durable answer is editorial.
4. **P305 soccer totals** — bars pass on four leagues but are REJECTED on a 1X2 ECE ceiling the
   control also fails. Decision pending; not touched tonight.

---

## G2 · Spawned rather than rushed

Two findings that are real but not NFL-live and not safe to change hours before a slate:

1. **`nightly-settle` discards computed settlement on a projection refusal** (§D3). Needs a decision on
   whether a partially-updated tree may be committed and whether the health gate can run first.
2. **The non-US weather rule is enforced by the NWS returning 404**, not by the `country` field the
   stadium table already carries — so `NO_FORECAST` cannot be told apart from "NWS was down for a US
   stadium". No false claim is published today.

---

## H · Explicitly not started, per instruction

Bank Builder V2 · Moonshot V2 · accounts · Ask rewrite · social cards · live prediction models · live
win probability · live player-prop pricing · any new paid provider · any destructive migration.

---

## I · The next session's first three moves

1. Merge #691 once CI is green, then **dispatch `nfl-event-window` once** to exercise the new
   promotion step in CI before tomorrow's games — it has only ever run locally.
2. Run the trace against the live slate and keep the morning output; it is the baseline the evening
   one is read against.
3. After the night game settles and the window closes, run the trace again. **A `CLEAN` line for
   fourteen games is the Sunday acceptance** — nothing else needs to be assembled by hand.
