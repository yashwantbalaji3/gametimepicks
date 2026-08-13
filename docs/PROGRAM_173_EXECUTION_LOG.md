# Program 173 (revised) — NFL public-beta activation

**Window** 2026-08-13 14:26 → 15:10 ET (18:26 → 19:10 UTC) · **Start anchor** `23f0012b6`,
classified ANCESTOR (origin had advanced 14 commits on this program's own automation) ·
**Final HEAD** `c20a402d0` · **Time to first kickoff at launch** T‑4.4h ·
**Credits** 15 of 3,000 cumulative · **Protected money** untouched

## What NFL users can do now

Open `/nfl` and see, for all 9 preseason games: a **projected score**, a **win chance**, a
**total-points range**, and the **sportsbook consensus** beside it — every card marked
`EXPERIMENTAL`, with the honest limit in the lead copy rather than a footnote:

> *"this model forecast winners barely better than a coin flip when tested on a season it had
> never seen, so its win percentages sit deliberately close to even."*

Each forecast is frozen at generation with an immutable receipt and settles against the official
result. Player and touchdown markets remain withheld with typed reasons.

## The two-tier contract, honoured

Program 172 rejected this model against bars declared before testing. Program 173 publishes it
anyway — **as an experiment, not as a validated pick**. Those failed bars are carried verbatim in
the calibration receipt and remain the boundary for `VALIDATED_PICK`. Nothing was deleted, and no
bar was lowered.

| | P172 verdict | P173 launch state |
|---|---|---|
| Winner | ABSTAIN (0.6933 vs coin 0.6931) | PUBLIC_EXPERIMENTAL, win% held in 45–51% |
| Total | RESEARCH_ONLY | published as a range |
| Margin | RESEARCH_ONLY | published as a range |

Held-out logLoss after calibration: **0.6919 vs coin 0.6931** — a 0.0012 gain against the 0.010
the validated bar requires. Still experimental, and the receipt says so.

## Two engineering decisions worth recording

**The shrinkage had to be redesigned mid-build.** Shrinking the output *probability* toward 50%
produced a 50% win claim sitting beside a projected 19–18 scoreline — two numbers from one model
that contradict each other. Shrinking the *signal* instead (λ scales the Elo term inside the
margin mean, λ=0.25) keeps **one distribution**, so win %, score, margin and total are all
measured off the same simulation and cannot disagree. A sign-agreement check refuses to publish
any game where they still would.

**Interval widths were not inflated.** Leave-one-season-out coverage is 0.806/0.796 — nominal —
so the 0.688 observed on 2025 is one season landing wide (n=48), not a calibration defect.
Inflating σ until 2025 covered would be fitting the test set. k=1.00 stands and the shortfall
ships as a published limitation.

## Defect found and fixed: I destroyed the live market capture

At 16:03Z the P172-D duplicate-purchase breaker worked exactly as designed — and the run then
fell **through** to the artifact writer with zero rows, overwriting a good 9-event public capture
with `eventCount: 0`. The price table vanished from production `/nfl`, and the damage propagated:
the orchestrator read the emptied file and wrote current artifacts with `NO_MARKET` and null
settlement targets.

My P172 claim that "last-known-good is preserved structurally" covered the **failure** path and
never the **skip** path.

- **Restored** from the committed 15:31Z capture — real data, 9 events, all pre-kickoff.
- **Fixed twice**: a run that fetched nothing writes nothing; a run that would replace a non-empty
  capture with an empty one refuses. Both precede the writer; a regression guard pins the ordering.
- **Downstream fixed**: the orchestrator now selects the newest snapshot that *carries evidence* —
  an empty file is not more current than a full one.

## Guards: four of mine were wrong

Two guards fired falsely and two were too strict. All four were corrected rather than worked
around, because a sloppy guard pushes future authors to rename honest fields:

1. `edge` matched inside "l**edge**r" → word boundaries.
2. `total:` matched the model's own `muTotal:` climatology → market identifiers only.
3. A "no market-beating claim" check whose lookahead pointed the wrong way past its own denial.
4. Two artifact guards demanded that append-only history retroactively know what was learned
   later → they now police **current** truth (newest snapshot per event) and let history be history.

## Verification

Full serial suite **4,253 / 0 fail**; typecheck clean; built export shows the forecast section with
zero leakage (`out/data` = `build-info.json` alone); mobile 375px has no page overflow; the
event-window chain ran end to end in CI (run 31732183478) publishing 9 forecasts.

## GO / NO-GO

| Layer | State |
|---|---|
| Schedule, market view | **GO — live** |
| Team simulation | **GO — PUBLIC_EXPERIMENTAL** |
| Passing / rushing / receiving | NO-GO — role evidence + no offered market |
| Anytime TD | NO-GO — NO_MARKET from the authorized probe |
| End Zone Vault | NO_PLAY (evaluated, held) |
| Bank Builder / Moonshot | NFL excluded — experimental forecasts do not qualify a leg |
| VALIDATED_PICK, any market | NO-GO — bars unmet, and publication did not change that |

## Not done, stated plainly

Releases B (player projection publication), D (lean/grade policy), E (homepage/Today/Hub game
reports), F (Vault watchlist UI), H2 (versioned learning loop) and I (NFL console strip) were not
built in this window. The launch-critical path — a coherent, calibrated, frozen, settleable public
forecast before kickoff — was completed and shipped; the rest is next.

## Next five

1. Settle tonight's 9 forecasts after official finals (watch armed; separate experimental ledger).
2. Build the versioned learning loop: freeze v1, train v2 offline only on settled games.
3. Player projections with role gates (regular season, when participation evidence exists).
4. Game-report pages with score distribution and driver explanations.
5. NFL strip on the protected console.
