# Program 172 — MLB + NFL operations and signature-product activation

**Window** 2026-08-13 08:57 → 09:45 ET (12:57 → 13:45 UTC) · **Start anchor** `d69bfa59d`,
classified **ANCESTOR** (origin had ADVANCED two commits ahead on my own P171 automation;
fast-forwarded, nothing reset) · **Final HEAD** `e1304cc5a` = origin/main ·
**Production** `97c4d83f` (one release behind by deploy timing) · **Worktree** clean, single
checkout · **Owned watchers at report time** 1 (morning-chain cadence, bounded) ·
**Protected money** untouched

## What a user and an operator can do now

**Public:** `/nfl` states, in plain English derived from a receipt, that GameTimePicks does not
publish preseason predictions — *"it picked winners no better than a coin flip (0.6933 against a
coin's 0.6931)… the bars were not lowered afterwards"* — beside 9 games of attributed sportsbook
prices. Every legacy link resolves again.

**Operator:** one protected screen shows nine health lanes, each derived from a named artifact,
worst-first, with `UNKNOWN` wherever evidence is missing. One dated receipt per day says whether
each signature product *held* or *never ran* — a distinction the site could not previously make.

## The central finding: the preseason model was rejected

Program 172 asked whether NFL could advance from prices to a published simulation tonight. I
built the model properly and the answer is **no**, on evidence:

| Head | Held-out 2025 preseason (48 games) | Bar (declared before the test) | Verdict |
|---|---|---|---|
| Winner | logLoss 0.6933 · coin 0.6931 · ECE 0.154 | beat coin by ≥0.010, ECE ≤0.05 | **ABSTAIN** |
| Total | MAE 8.286 · v1 8.862 | beat v1 by ≥2.0 points | **RESEARCH_ONLY** |
| Margin | MAE 11.872 · pick'em **11.813** · cov80 0.688 | ≤ both baselines, cov ∈[0.72,0.88] | **RESEARCH_ONLY** |

The bars sit **above** the data load in the source, and a guard pins that ordering. The fitted
Elo discount came out **negative (−0.25)**: in preseason the stronger regular-season team wins
slightly *less*. That is noise, and the model refuses to trade on it. Preseason totals swing
39.7 / 34.9 / 41.0 by season, so even the 3.9-point out-of-domain bias v1 carries is not
correctable stably enough to clear a 2-point bar. **No bar was relaxed after seeing results.**

## Release register

| Release | Commit | Outcome |
|---|---|---|
| B · preseason model | `1c94b18b2` | **REJECTED on declared bars** (the honest outcome) |
| C · derived public states | `33383b54c` | SHIPPED — `/nfl` states derive from receipts |
| D · credit contract | `ab4210e7b` | SHIPPED — one cumulative allowance, typed results, dup breaker |
| K · redirect fixes | `37b1af0d9` | SHIPPED — both inherited failures fixed + root-cause guard |
| E/F/G · product receipts | `97c4d83f6` | SHIPPED — ran on its first scheduled execution |
| J · executive health | `e1304cc5a` | SHIPPED |

## Cadence — no incident, and I did not race it

GitHub's scheduler runs this repo **1.0–1.5h late consistently** (yesterday: daily-products cron
12:10Z → ran 13:41Z). Today daily-products landed **13:41Z**, matching that envelope exactly. I
set the bounded window at cron + 2h rather than cron, watched with one bounded watcher, and
**did not dispatch** — a manual dispatch at 13:20Z would have raced a writer that was about to
start on its own. morning-projections (board writer) remains inside its window.

**MLB chain verdict: intact.** 2026-08-12 completed and settled cleanly; today's stages are
sequenced behind the board, which has not published yet. That is timing, not breakage.

## The hash question, resolved

The briefing asked me not to conflate `50c21e28…` and `affe6b21…`. They are **different files**,
and one of them is not immutable at all:

| md5 | File | Status |
|---|---|---|
| `affe6b21071f2b3be96bb2774eb347c3` | `mr-dub/portfolio.json` | **PROTECTED** — CI hashes it before/after every run |
| `cb80473f88f3cb5f67208fa568925295` | `mr-dub/bank-builder-locks.json` | **PROTECTED** — same guard |
| `50c21e28d7ccb3d9f3d3ee7465a1189d` | `mr-dub/daily-portfolio.json` *as of an earlier date* | **NOT immutable** — the official daily writer rewrites it each morning (today `e8e4d9ac…` for 2026-08-13) |

Treating the third as protected would have made every normal daily run look like a violation.
Protected facts re-verified: **19–14 · $19,065.40 · crown $20,465.40 · exposure $0**.

## Credits

**12 of 3,000 — unchanged.** Program 172 spent nothing: the only NFL question this window could
ask (are player markets open?) was already answered NO_MARKET by P171's probe, and the charter
forbids re-asking an unchanged question. The allowance is now explicitly **one cumulative ceiling
across P171–172**, so a second program cannot mint a second 3,000.

## Defects found

1. **Moonshot policy fork** — the dormant `activation-rules.ts` band (+600..+2000) is *not* what
   runs; `laneEligibility` uses +700 with no upper bound. Recorded, both numbers pinned, the
   dormant module labelled. I did **not** silently reconcile them: that would move real
   activation behavior on evidence I was not asked to re-derive.
2. **Two redirect tests were stale, not broken routes** — `/parlay-lab` was repointed when
   `/picks` retired; `/sports` was deliberately revived as a page. Root cause: the e2e table was a
   hand-maintained duplicate of routing truth. Now derived from source and checked in the fast
   suite, plus no-void and no-chain guards.
3. **`publicActivation` written as a sentence** instead of the literal `"OFF"` — would have passed
   every activation check silently. Caught by its own guard.
4. **Concurrent suite runs produce spurious failures** (memory-documented); a serial re-run was
   clean at 4,242/0.

## GO / NO-GO

| Layer | Decision | Missing evidence |
|---|---|---|
| MLB chain | **GO** (protected, verified) | — |
| NFL schedule + prices | **GO — live** | — |
| NFL preseason team sim | **NO-GO** | a model that clears its bars; this one did not |
| NFL regular-season sim | **REALITY_GATED** | September kickoff |
| Passing / rushing / receiving / TD | **NO-GO** | participation evidence + an offered market (probe: none) |
| Bank Builder / Moonshot | **REALITY_GATED** | today's MLB board (INPUTS_MISSING, not a no-play) |
| End Zone Vault | **NO-GO** | evaluated and held: NO_PLAY with reasons |

## Next ten

1. Observe morning-projections; confirm the board lands and the receipt flips off INPUTS_MISSING.
2. NFL settlement watch fires 2026-08-14 ~14:30Z (armed, exact trigger committed).
3. Set `OPS_WEBHOOK_URL` (founder) — failures are Actions-tab-only today.
4. Resolve the Moonshot band fork deliberately, with evidence.
5. Re-probe NFL player markets at regular-season open.
6. Model QB in-game exits, then re-evaluate passing interval coverage.
7. Reconcile Mr. Dub lifetime record vs Bank Builder unit ladder as explicit version scopes.
8. Prune the dead `bank-builder/` file families (Jun 11–16) still on disk.
9. Fix `admin/status.json.lastSettlement` — it reads World-Cup scope and is 37 days stale while
   MLB settles nightly.
10. Add the Today-queue and sprint lanes to the Command Center.
