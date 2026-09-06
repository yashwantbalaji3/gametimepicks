# Program 236 · resume state

Tip `9537811b5`. Start was `f7ece5e5d`.
Protected money unchanged throughout: portfolio `affe6b21071f2b3be96bb2774eb347c3`,
bank-builder-locks `cb80473f88f3cb5f67208fa568925295`. Two stashes and untracked `vp/` preserved.
Zero provider credits spent — every source used here is free StatsAPI or an already-committed artifact.

## Done

| Phase | State |
|---|---|
| A · lifecycle traced | Both products non-operating for three independent reasons; all three fixed. The recorded "no gamePk" cause was false and is corrected. |
| B · replay + settlement | 37 tests, all mutation-probed. Three cards stranded since 2026-08-17 graded from official box scores. |
| C · pool | Live MLB team-market pool, 45 legs where there were 0. Both products card at the generation hour. 28-leg defect bounded. |
| D · daily operation | Ladder settler scheduled nightly; both product pages render the settled record and ladder position. |

## Not done, and why

1. **Bank Builder / Moonshot money accounting stays frozen.** Settlement writes a prospective ledger
   (`public/data/products/lifecycle/`) rather than the two card stores, because
   `build-mr-dub-ledger.mjs` derives the protected bankroll from those and grading 2026-08-17 cards in
   place would restate financial history. The withheld write is named in every receipt. Unblocking it
   is a money-accounting decision, not an engineering one.

2. **Moonshot cannot publish to the paper ladder.** `activate-moonshot-candidates.mjs --apply` is
   deliberately refused: the Mr. Dub ledger models one active card, and two concurrent lanes would
   mis-account exposure. Generation and settlement are both repaired; publishing needs multi-lane
   exposure accounting built first. Stated publicly on /moonshot.

3. **Phases E–I not reached.** Registry gaps (MLB/NFL streams, mixed-sport population), cross-sport
   results detail for NFL/EPL/UFC, forward model evaluation, four-sport journey verification.

4. **The Moonshot payout ceiling is a leg cap, not a payout constraint.** `MOONSHOT_MAX_LEGS = 10`
   bounds an absurdity; a ten-leg lane can still quote a return well above the $1,000 ladder target,
   because +700 is a floor with no maximum beside it.

## Next actions

    # settle (dry run first — it is the default)
    npx tsx app/scripts/products/settle-ladder-cards.mjs
    npx tsx app/scripts/products/settle-ladder-cards.mjs --apply --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # generate at the scheduled hour, not the current one — the pre-event filter is real
    npx tsx app/scripts/activate-daily-portfolio.mjs --date <D> --now <D>T15:30:00Z

Observe a real scheduled run: `daily-products` at 15:30 UTC, `nightly-settle` at 05:30/07:30 UTC.
A manual run proves the transition logic; only the cron proves the deployed caller runs it.

## Founder decisions outstanding

* `AUTHORIZE:NFL:<scope>:<ceiling>:<expiry>` or `DEFER` — a renewal is an edit to the receipt's
  Expiry row, not code. Unchanged from P235.
* `MOONSHOT_REPAIR_PAUSE_OR_RETIRE` — **answered by this instruction: repair and resume.** Enacted as
  far as the gates allow; publishing remains blocked on multi-lane exposure accounting.
* `CONSOLE_REDEPLOY:RUN` — unchanged.

No token was synthesised from the charter.
