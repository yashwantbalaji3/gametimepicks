# Program 238 · Current publication and product completion

Start `4508228fb` · baseline ET 2026-09-06 16:00 / UTC 20:00Z.
P237's SHAs resolved: quality-gate on its final tip **succeeded at 06:42Z**; `8398c11e0` is an
ancestor of this tip; production had since advanced to `4508228f` on bot work, integrated here.
Protected money unchanged: `affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295`.
Two stashes and untracked `vp/` preserved. Zero provider credits spent.

## Triage — the products published today, unattended

The first thing to establish was what actually happened rather than what was expected:

| | |
|---|---|
| `daily-products` | ran **17:39Z**, success |
| `mlb-daily-production` | ran 16:26Z and **17:04Z**, success |
| `nightly-settle` | ran 09:32Z and **11:42Z**, success |
| step "Settle the Bank Builder ladder and Moonshot lane" | **success** — `0 settled · 3 held`, idempotent as designed |

And the published state at 20:00Z:

    date 2026-09-06 · bankroll 19065.4 · openExposure 250
      bank-builder-lane-a-step-1  active  2/2 legs  +124
      bank-builder-lane-b-step-1  active  2/2 legs  +200
      moonshot-lane-a-2026-09-06  active  4/4 legs  +1089
      moonshot-lane-b-2026-09-06  active  8/8 legs  +9437

This is the observed unattended operation P236 and P237 could report only as pending. Both products
generated real qualifying cards on the cron, and the settler ran on its own cron and correctly
settled nothing because there was nothing new to settle.

### Current-state matrix

| Sport | Scheduled | Captured | Model output | Product state |
|---|---|---|---|---|
| MLB | 14 games | team-markets 17:05Z | 15 game reports, 14 presentable | 4 lanes ACTIVE |
| EPL | matchweek priced | ladder PUBLISHED, 2 fixtures | forecasts published | via Parlay Lab |
| UFC | 13 bouts, `SCHEDULED_CARD` | **odds are for the previous event** | 11 of 13 bouts have a read | card-level |
| NFL | preseason archive | none — allowance lapsed | none | blocked, named |

## Release A — the race is closed at the trigger, not at the timer

    mlb-daily-production  cron 14:15 UTC   writes mlb/team-markets/<date>.json
    daily-products        cron 15:30 UTC   reads it

Measured write times: **16:50Z** (Sep 5) and **17:05Z** (Sep 6) — both after the consumer's nominal
hour. Cards appeared only because the consumer was also late: 17:29 and 17:39. Margins of 39 and 34
minutes, twice, from two independent timers drifting the same way. P237 made a bad draw *visible*;
this makes it impossible.

`daily-products` now runs on **`workflow_run`** after `mlb-daily-production` completes, gated on
`conclusion == 'success'` — a `completed` event fires for failure and cancellation too, so a producer
that wrote nothing cannot start the consumer. The cron survives as bounded recovery and first checks
the dated receipt, so a recovery cannot duplicate a generation that already succeeded.

`pool-gate.mjs` checks more than existence: right date (an old file must never satisfy today), right
sport, parseable, non-empty or validly empty, every game carrying the `commenceTime` the pre-event
filter needs, and inside a 12h freshness bound. A producer run that goes green with an empty
unintended output fails it. Named exits: 20 missing, 21 wrong date, 22 malformed, 23 stale; 0 for a
usable pool or a legitimately empty slate.

16 tests across the gate and the ordering, 6 mutation-probed (workflow_run removed, producer
conclusion unchecked, recovery guard dropped, gate moved after generation, gate stops calling the
validator, wrong-date check removed) — all caught. No YAML parser: `js-yaml` is not a dependency, so
ordering is asserted by byte offset, as P235 settled.

## Four defects that arrived with today's data

**A producer with a strict contract and no caller.** `build-model-results-index.mjs` (P235) refuses
to write unless its detail reconciles with `graded-picks.json` exactly — and was scheduled by
nothing. Grading ran nightly and moved the aggregate; the index did not, so its own guard began
failing on a stale artifact. Regenerated (40,679 rows, reconciling) and now runs in `nightly-settle`
after grading, which is the job that changes the numbers it derives from.

**A "latest" pointer to a finished event.** `card-latest.json` rolled to *Noche UFC: Silva vs.
Delgado* (event 600060772, 13 bouts) while `odds-latest.json` still held the completed *Hooker vs.
Parnasse* (600059993, 10 bouts) — the odds capture runs Tue/Thu/Sat and had not reached the new card.
Every bout id in one was absent from the other, so every join came back empty; only that accident
kept a finished event's prices off a page about an upcoming one. `odds-cover-card.mjs` names three
states — COVERS, NOT_YET, DRIFT — and a mismatched *event id* is NOT_YET, a legitimate window, not
the defect the drift guard exists to catch. This join had already been repaired twice for the same
confusion; collapsing the window into drift turns a correct quiet state into a red gate.

**A guard that passed for the wrong reason.** The presentation revision test picked "the first game
carrying both fields", which today was the one game of fifteen whose simulation is `unavailable`
because first pitch preceded generation. It refused for *that* reason, the assertion that it refuses
passed, and the hash check was never reached. It now selects a game that presents cleanly and asserts
that it does before tampering.

**A word that is not a hash.** The public-export guard banned bare `md5`, and today's new EPL
fixtures shipped the canonical event id `epl:premier-league:2026-09-18:2026-27:md5:brentford-v-chelsea`
— an id-scheme segment label, on four correct public pages. Narrowed to exclude colon-delimited
segments while still catching the word in prose and both protected hashes literally. A first attempt
banned any bare 32-hex run, which was worse: this repository uses content-derived 32-hex ids as
public game identity, so it failed on legitimate gameIds across the build. A known-negative test now
pins both the identifier and the gameId so the pattern cannot widen back.

**Zero is an answer.** The hub summary returned its empty reason and *no counts*, so a period with
nothing scheduled printed no numbers and a reader could not tell "we looked and there are none" from
"this section did not render". EPL hit it the moment its matchweek rolled past.

Gate: SUCCESS 207s · 5407 unit · 458 rendered.

## Release B — the forthcoming window was invisible

`/epl` reported **0 scheduled** at 20:00Z while twelve Premier League fixtures sat on the schedule
for the following weekend. The adapter read only `loadEplForecasts()`, which returns the CURRENT
forecast set — legitimately empty once a matchweek has kicked off (0 rows, generated 17:27Z). A
published forecast is not the only thing worth showing; the fixture is.

The hub now merges the schedule spine (`eplUpcoming`, which already excludes the schema sample) for
forthcoming fixtures, deduped against forecast rows, each carrying no read and saying why:

    EPL "Next fixtures" Sat, Sep 12 – Sat, Sep 19 — 12 scheduled · 0 with a report · 0 with a read
       Sat, Sep 12 · 10:00 AM ET  Crystal Palace v Ipswich Town   forecast not published yet
       Sat, Sep 12 · 10:00 AM ET  Liverpool v Fulham              forecast not published yet

Scheduled, forecast and reportable stay three numbers. Four mutation probes (fixtures dropped,
unforecast rows given links, dedup removed, started fixtures leaking into forthcoming) all caught.

MLB now reads its own day correctly — `"Sun, Sep 6" · 15 scheduled · 14 with a read · 13 started`.

Gate: SUCCESS 211s · 5409 unit · 458 rendered.
