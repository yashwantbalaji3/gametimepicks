# v1.7 — Shadow integrity audit (Phase 7.1 · Lane C, 2026-09-22)

**Verdict:** the shadow code holds every invariant it owns; the *system* around it did not. Two defects would
have stopped the shadow from ever judging a real slate once the branch is pushed, and one grading rule
overstated a payout. All three are fixed on this branch (no policy constant, no live selector, no registry
status touched). Status stays `SHADOW_RUNNING · NOT ADOPTED`.

**Evidence base.** Code: `app/src/lib/products/selector/{policies,select,shadow}.mjs`,
`app/scripts/products/{build-selector-shadow,grade-selector-shadow,build-product-eligible-legs}.mjs`,
`scripts/ci/commit-generated.sh`, `.github/workflows/{daily-products,nightly-settle}.yml`. Artifacts:
`data/internal/products/selector-shadow/{2026-09-21.json,state.json,ledger.json}`,
`data/internal/products/eligible-legs/2026-09-21{.json,.manifest.json}`, `data/internal/mlb/linescores/`.
Runs (GitHub Actions, `main`, which does **not** yet carry the v1.7 steps — the branch has 13 commits
`origin/main` lacks and was never pushed, per `docs/V17_RELEASE_HANDOFF.md` §6):

| Workflow | Run id | Conclusion | Event | Created (UTC) |
|---|---|---|---|---|
| daily-products | 35630419737 | success | workflow_run | 2026-09-21 17:11:33 |
| daily-products | **35630279965** | **failure** | schedule | 2026-09-21 17:10:16 — commit step: "push never landed after 5 attempts" (see W1 in `docs/V17_WORKFLOW_AUDIT.md`) |
| daily-products | 35627497078 / 35623677988 / 35617556783 | success ×3 | workflow_run | 2026-09-21 16:44 / 16:08 / 15:14 |
| nightly-settle | 35622690908 / 35616398705 / 35605166440 / 35590104804 | success ×4 | schedule | 2026-09-21 15:59 / 15:04 / 13:22 / 10:41 (crons are 05:17–09:37 — every slot ran 3–6 h late, P253 class) |
| nightly-settle | 35514217414 | success | schedule | 2026-09-20 13:40 |

No daily-products or nightly-settle run exists yet for 2026-09-22 (checked 06:15Z). **What the workflows will
do:** on `main` as deployed, nothing shadow-related. Once this branch lands: nightly-settle grades the
2026-09-21 cards as soon as its own linescore fetch writes `linescores/2026-09-21.json` (the file did not
exist at audit time, so the ledger honestly shows 6 pending / 0 decided); daily-products publishes the
2026-09-22 shadow day at its own `NOW`, after `check-pool-ready.mjs` confirms `team-markets/2026-09-22.json`
(which did not exist at 06:15Z — the paid ingest writes it ~10:00Z, see the capture times below).

## Invariant table

| # | Invariant | Status | Evidence | Fix |
|---|---|---|---|---|
| I1 | First publication wins | **VIOLATED at the system level** (HOLDS in the builder) | Builder: `build-selector-shadow.mjs:41-42` exits 0 when `<date>.json` exists; `--force` refused once graded (`:43`). But `nightly-settle.yml` (pre-fix lines 309-317) published the shadow for `ROLL_DATE` at 01–06 ET, when `mlb/team-markets/<ROLL_DATE>.json` does not exist yet: every capture this week was written 09:39–10:51Z (`team-markets/2026-09-16..21.json` `generatedAt`), by mlb-daily-production which runs *after* nightly-settle in the chain (`nightly-settle.yml:67-69`). Every shadow policy pools `mlb-only` (`policies.mjs:33,40`), so that day file would be `INSUFFICIENT_CANDIDATES` ×12, and the 10:57Z daily-products run would then print "already published — first publication wins" (`build-selector-shadow.mjs:42`). The 2026-09-21 file escaped only because it was seeded by hand at the real instant (`asOf 2026-09-21T10:57:00Z`, `generatedAt 2026-09-22T04:57:30Z`). | (a) `nightly-settle.yml`: the roll-time `build-product-eligible-legs` + `build-selector-shadow` calls removed; the step now only grades. (b) `build-selector-shadow.mjs`: refuses to publish (exit 0, `INPUTS_MISSING` line, nothing written) when `team-markets/<date>.json` is absent — a missing slate is never a no-play. Dry-run proof: `--date 2026-09-22 --now 2026-09-22T06:00:00Z` → `INPUTS_MISSING … not published`; `--date 2026-09-21` → `already published … nothing rewritten`. |
| I2 | No day-file rewrite after publication (and a re-run/retry re-publishes nothing) | **UNENFORCED on the commit path** (HOLDS in the scripts) | Builder never rewrites (`:42`); grader rewrites only `lane.graded` / `lane.completed` (`grade-selector-shadow.mjs:41-49`). Workflows never pass `--force` (pinned by `adoption-gate.test.mjs` "source scan: the workflows … never pass --force"). But daily-products commits through `scripts/ci/commit-generated.sh` with `GENERATED_PATHS` containing `data/internal/products/` (`daily-products.yml:353`), whose conflict rule is "this (later) run's copy kept" (`commit-generated.sh:31-38`): an add/add conflict on `selector-shadow/<date>.json` between a daily-products run and any other writer would have replaced the first publication with the later copy. Re-runs of daily-products are otherwise safe: workflow_run fires it ~5×/day (five runs on 2026-09-21), each re-run sees the committed day file and exits. | `commit-generated.sh`: `PROTECTED_RE` now also matches `data/internal/products/selector-shadow/` — a conflict there aborts the rebase and fails loud, nothing forced. Pinned by `app/src/lib/ops/commit-generated.test.mjs` W2 (the first publication on origin is byte-identical after the refused run). The report (`docs/V17_SHADOW_REPORT.md` §4) now compares each day file's publication fingerprint (grading fields excluded) to its first-commit content: 2026-09-21 = `INTACT` (first commit `e3f9c4b5c`, sha256 `74a69ef19a6adb54…` both then and now). |
| I3 | Grading uses canonical final truth | HOLDS | `grade-selector-shadow.mjs:24` reads only `data/internal/mlb/linescores/<date>.json`; `shadow.mjs:17-25` grades a leg only when `isFinal && Number.isFinite(homeRuns) && Number.isFinite(awayRuns)`, else `pending`; an unknown market key is `pending`, never guessed (`:24`). Field names verified against the real file (`linescores/2026-09-20.json`: `gamePk/isFinal/homeRuns/awayRuns`, 15/15 final) with a live probe: PHI 7 @ NYM 2, home moneyline → `lost`. A postponed game reported "Final" without scores (memory: StatsAPI postponed fixtures) stays pending because the runs are not finite. | — |
| I4 | Pending / void / push semantics | **VIOLATED (one case)** → fixed | won carries payout: `shadow.mjs advancePosition` (`payout = stake × decimal`, skips cleared rungs); lost → seed (`:43`); push holds step and stake (`:44`); pending holds the lane: `build-selector-shadow.mjs:51` marks the lane `held` while `positions[lane].pending`, and `select.mjs:114` returns `LANE_HELD`. **Defect:** a card graded `won` with one pushed leg (`gradeCardFromLinescores` → `won` when the rest won, `shadow.mjs:29-32`) rolled on the card's FULL published decimal — the pushed leg's price was never removed, overstating the payout (a $100 card at −110 won / +150 push rolled to $477 instead of $190.91). No card had been graded, so no ledger row was affected. | `shadow.mjs settledDecimal(legs, legGrades)` (push pays 1.0; refuses a grade array that does not match the legs); `grade-selector-shadow.mjs` rolls on the settled decimal and records `graded.settledDecimal` + `graded.payout`. Test: `shadow.test.mjs` "settled decimal …" (7 assertions incl. the ladder consequence). |
| I5 | State / rung roll-forward deterministic | HOLDS | Grader walks day files in sorted order, lanes A then B (`grade-selector-shadow.mjs:27,34-35`); `advancePosition` is a pure function of (policy, position, status, stake, decimal); `bestJointPByStep` is appended at publication, capped at 30 (`build-selector-shadow.mjs:61`); MS-C4 cadence reads `lastPlaced` from state (`:52`). A graded lane is never re-graded (`:37 !x.graded`), so a grade can never flip. | — |
| I6 | Control and candidates read the SAME time-locked universe | HOLDS (persistence gap closed) | One `buildEligibleLegs({date, now})` + one `guardLegs(...,{asOf: NOW})` (`build-selector-shadow.mjs:45-46`); the same `kept` array is passed to every policy (`:53`). Time-lock: `contract.mjs:168-169` refuses prices captured after `asOf` (`PRICE_CAPTURED_AFTER_AS_OF`) or older than 12 h (`LEG_BOUNDS.maxPriceAgeMs`, `:81`); `:176-177` refuses started / inside-cutoff events. **Gap:** `eligible-legs/<date>.json` is rewritten by every daily-products run with a later `--now` (`build-product-eligible-legs.mjs:118`, no first-wins guard), so the persisted "universe" file can drift from what the frozen shadow day was judged on; the day file recorded only `eligibleLegs: 18`. | Day file now carries `universe: { legIds (sorted), sha256 }` of the guarded pool (`build-selector-shadow.mjs`), so the universe every policy ranked over is reproducible and a divergence is visible. The 2026-09-21 file predates this and shows `not recorded` in the report. |
| I7 | Every card carries policy id + hash and source receipt refs | HOLDS | `policies.mjs:64-68` — id = `name@sha256(JSON(policy+ladder))[:12]`; every lane receipt carries it (`select.mjs:111`), e.g. `BB-C1@b66731b335c2`, `MS-C4@5da8e43d1124` in the 2026-09-21 file; every leg copies `sourceReceiptRefs` (`select.mjs:162`), e.g. `["mlb/team-markets/2026-09-21.json","mlb/statsapi-schedule/2026-09-21.json"]`, plus `capturedAt 2026-09-21T10:51:25.815Z` ≤ `asOf 10:57:00Z`. `state.json` pins each policy's id at seed (`build-selector-shadow.mjs:36`). | — |
| I8 | The seeded day is honest about being seeded | HOLDS, now labelled | `2026-09-21.json`: `asOf 10:57:00Z`, `generatedAt 2026-09-22T04:57:30Z` — built ~18 h after the instant it claims, from the archived capture (time-locked inputs, so no outcome can leak into the selection, but not a forward observation by the preregistration's own standard). | `docs/V17_SHADOW_REPORT.md` labels it `RETROACTIVE` and reports the gate twice: all days, and forward days only (generatedAt within 60 min of asOf). The ledger is unchanged. |
| I9 | The gate never mutates live ownership | HOLDS | `adoptionGate` returns `{state, reasons, measured, note}` only (`shadow.mjs:69-76`); `LIVE_POLICY`, `POLICIES`, `SHADOW_POLICIES` are frozen. Source scan (`adoption-gate.test.mjs`): no shadow module/script references `daily-portfolio.json`, `activate-daily-portfolio`, `selection-policy`, `bank-builder-locks`, `mr-dub/portfolio.json`; every `fs.writeFileSync` in the three scripts targets `path.join(DIR, …)` (= `selector-shadow/`) or `docs/V17_SHADOW_REPORT.md`; the pure modules import no `node:fs`. | — |

## Settlement disagreement check

`mr-dub/settled/<date>.json` legs join to shadow legs on `(matchup, selection)` — both sides print
`"Away @ Home"` / `"Team to win"`, `"Team ±1.5"`, `"Under 9.5"` (verified on `settled/2026-09-06.json` and the
shadow's `displayMatchup`/`displaySelection`). Legs both graded: **0** today (nothing graded yet). The
report re-runs the join nightly.

## What still needs a founder or a later look

- The 2026-09-21 cards are pending until nightly-settle fetches `linescores/2026-09-21.json`; nothing here
  fabricates that grade.
- daily-products fires on every mlb-daily-production completion (5× on 2026-09-21). The shadow day is
  written once; `eligible-legs/<date>.json` and `products/availability/<date>.json` are rewritten each time
  with a later `asOf`. The public availability page therefore shows the *latest* universe, the shadow the
  *first*. Recorded, not changed: the public artifact is meant to be current, the shadow is meant to be frozen.
- Earliest 20 decided lane-days is unchanged (`docs/V17_FORWARD_SHADOW_RECEIPT.md` §5) — but only now
  reachable, since the roll-time publication would have produced zero decided lane-days for the rest of the season.
