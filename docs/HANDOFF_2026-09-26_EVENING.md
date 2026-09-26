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

**§5.2 is enforced structurally, not by discipline.** `railStateOf` cannot return a result state
outside `FINAL_CANONICAL`, proved across 1,344 input combinations each carrying a SETTLED/HIT
settlement so the finality check is the only thing holding the result back. The component has no
branch that decides a win, so a colour cannot get ahead of the truth.

**A contract gap the UFC work found:** `FINAL_AWAITING_SETTLEMENT`. Between a provider's "Final" and
the canonical result there is a real interval that had no word — a finished bout rendered
"Live — unresolved" and a completed game's yardage rendered "Currently above line", both describing a
present that has ended.

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
4. **Wire the rail to a route** — it is built, tested and rendered, and nothing imports it. That is a
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
