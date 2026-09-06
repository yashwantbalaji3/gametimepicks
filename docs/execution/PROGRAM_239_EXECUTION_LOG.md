# Program 239 · End-to-end product completion

Start `77d493387` · baseline ET 2026-09-06 17:15 / UTC 21:15Z.
P238's snapshot verified: CI **green on `f65de51c8`**, which is an ancestor of this tip; production
had advanced to `c1fc2195` on bot work, integrated. Protected money unchanged:
`affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295`. Two stashes, `vp/` intact.

## Release A — the contradiction, resolved

Both P238 sentences were true; they described **different stores**.

| Store | Holds | Date |
|---|---|---|
| `mr-dub/daily-portfolio.json` | the four ACTIVE lanes, $250 exposure | **2026-09-06** |
| `moonshot-lane/active.json` | the Moonshot **ladder** ($25→$1,000 progression) | 2026-08-17 |
| `methodology/launch/dual-bank-builder-active.json` | the Bank Builder **ladder** | 2026-08-17 |

"Four ACTIVE lanes" is the daily generated view. "Moonshot publication blocked" is the ladder, whose
generator (`activate-moonshot-candidates.mjs --apply`) is still refused pending multi-lane exposure
accounting. Neither sentence was wrong; neither was complete.

### What $250 actually is

`build-mr-dub-ledger.mjs` — the only writer of the protected bankroll — **never reads
daily-portfolio.json**. Verified by grep and by the unchanged hashes. So $250 ($200 Bank Builder +
$50 Moonshot, 2 lanes each) is isolated paper exposure inside the daily view, with no authority over
protected money and no path into it. It is not double-counted: each lane contributes its own seed
once, and the products block sums to the same total.

### Disposition of the four lanes, stage by stage

| Stage | Verdict |
|---|---|
| Generated | **Yes** — daily-products 17:39Z from the live team-market pool |
| Activated | **Yes** — `status: active`, eligibility passed, all legs pre-event at selection |
| Exposed in paper accounting | **Yes, in the daily view only** — $250, no protected-money authority |
| Delivered publicly | **Yes** — "Seattle Mariners to win" and "Los Angeles Dodgers to win" are on the live /bank-builder |
| Accepted by a settler | **NO — and this was the defect** |

### The defect: four published cards nothing could grade

    market=Moneyline    settleable=false   player=""   gamePk=""
    market=Total Runs   settleable=false   player=""   gamePk=""

Every leg of all four cards. The only settler wired to `daily-portfolio` grades **player props** by
looking a name up in a box score; a team leg has no player, and its id carries the board's
content-derived `gameId` (`35ced11ee1bb21f179e3ac5a39a75fd2`) rather than a numeric gamePk. Each leg
would have come back "player absent from the official box score (possible scratch)" — a wrong reason
— and the cards would have sat pending for ever.

This is my own defect from Program 236: that program gave the products a team-market pool and left
them on a player-prop settler. It is precisely the failure class P236 existed to fix, reintroduced by
P236's own repair, and it would have stranded the first cards these products ever published.

### The repair

`mlb-team-market-grading.mjs` grades moneyline, total runs and run line from the committed StatsAPI
linescore cache — the same free source `build-mlb-product-settlement.mjs` already uses. The join is
team names plus the slate date, because the leg carries no gamePk. **A doubleheader is refused, not
guessed**: two games sharing a date and both team names cannot be told apart, and grading a card
against the wrong game is worse than leaving it pending.

Wired into the existing scheduled settler, so no new caller was created. The same run now reports the
true reason:

    Bank Builder A: Seattle Mariners to win (mlb_moneyline) → — PENDING
      (no linescore for Athletics @ Seattle Mariners on 2026-09-06)

Also fixed there: the all-push card verdict fell through to permanent `pending`, the third copy of a
rule already repaired in the Parlay Lab settler (P235) and the ladder settler (P236). This was the
last one carrying it.

12 tests, 7 mutation-probed (doubleheader taken silently, join ignoring the date, moneyline ignoring
the picked side, total compared to the wrong number, run line dropping the handicap, an unfinished
game graded anyway, a team not in the game graded) — every break caught. The live test grades all 16
published legs against synthetic finals on their own real shapes, so it cannot pass on an empty
population.

Gate: SUCCESS 213s · 5421 unit · 458 rendered.

## Release C — the daily chain, proven

### The trust boundary on the new trigger

A `workflow_run` job runs the DEFAULT branch's workflow file with `contents: write`. The producer is
dispatchable, so a run started from any other branch would have chained into a privileged consumer.
The job now also requires `workflow_run.head_branch == default_branch`. The producer has no
`pull_request` trigger, so a fork cannot reach it at all — that half was already closed; this closes
the in-repository half.

The consumer never executes anything from the triggering run: no artifact download, no `ref:` from
the trigger payload. It checks out the default branch and reads one committed JSON artifact, which
the pool gate validates for date, sport, schema, population and freshness before generation. Three
tests pin all of it.

### End to end, on the real settler

`daily-chain.test.mjs` runs `scripts/settle-mlb-player-props.mjs` itself — the script `nightly-settle`
invokes — in a child process against a disposable repo-shaped store, through a narrow `--app-root`
seam. Every fixture carries the leg shape the generator actually writes, because that shape is what
defeated settlement.

| Scenario | Proven |
|---|---|
| Winning card | settles `won`, exposure released to 0 |
| One losing leg | whole card `lost` |
| Unfinished game | holds `pending`, stays active, keeps its $100 |
| All-push card | `push` with the seed returned — not permanent pending |
| Replay | a second run moves nothing, and does not re-stamp `settledAt` |
| Two lanes | settle independently; one won, one lost, no overwrite |
| Doubleheader | holds, and says why |
| Dry run | decides everything, writes nothing |
| Fixture root | the real portfolio is byte-identical afterwards |

Nine scenarios, five mutation-probed (team-market branch removed → 6 failures, all-push back to
pending, exposure kept after settlement, doubleheader taking game one, dry run writing anyway) — all
caught.

Gate: SUCCESS 212s · 5433 unit · 458 rendered.
