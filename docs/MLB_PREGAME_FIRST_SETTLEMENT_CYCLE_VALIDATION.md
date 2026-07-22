# MLB Pregame — First Automatic Settlement-Join Cycle Validation (2026-07-22)

Validation of the first automatic settlement-join cycle for the internal pregame research archive. No modeling, no public output, no Bank Builder / Moonshot / product / official-settlement / record / money change. Money md5 `affe6b21071f2b3be96bb2774eb347c3` unchanged throughout.

## Headline

**The automatic cycle now runs correctly end-to-end — after fixing two defects found during this validation.** But the *settled* cycle has **not produced any settled-eligible rows yet**, because the only date with pregame market capture (2026-07-22) **is not final** — first pitch is ~13 h out. This is honest and expected, not a defect.

## 0-1. Precheck / drift

- Start HEAD `c2428491` → final HEAD `58836bd9` (a CI metadata commit on top; my source/test/doc commits are `443da2fc`, `e1f3f633`, + this doc). All refs (`main`, `june30-reset`) aligned.
- Money md5 `affe6b21071f2b3be96bb2774eb347c3`; record 19-14; bankroll $19,065.40; crown $20,465.40; exposure $0 — all unchanged.
- Drift: every CI commit is path-scoped under `data/internal/mlb/pregame-archive/` (0 files outside; 0 money/public); safe to fast-forward.

## 2. CI workflow runs

The join step ran **automatically** for the first time in scheduled cron run **29890569309** (2026-07-21 04:15 UTC, on c2428491) — the first automatic settlement-join cycle. Runs reviewed:

| run | trigger | headSha | join step | commit step | settled |
|---|---|---|---|---|---|
| [29890569309](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29890569309) | **schedule** | c2428491 | ✓ 11 joined / 21 pending | **ABORTED** (defect #1) | 0 |
| [29890751977](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29890751977) | dispatch | c2428491 | ✓ | **ABORTED** (defect #1) | 0 |
| [29891008512](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29891008512) | dispatch | 443da2fc | ✓ | ✓ **persisted 58 files** (fix #1) | 0 |
| [29891531225](https://github.com/yashwantbalaji3/gametimepicks/actions/runs/29891531225) | dispatch | e1f3f633 | ✓ 12 joined / 20 pending | ✓ **persisted 57 files** (both fixes) | 0 |

Confirmed: join used `--lookback 3`; player-prop cap 3 enforced; credit floor held; all steps `continue-on-error` (non-blocking); metadata commit path-scoped + size-guarded + money-safe (money md5 unchanged at every bot commit).

## Defects found and fixed (Section 11)

**Defect #1 — commit-guard false-positive (BLOCKING).** The metadata commit step's abort-guard used a bare token `settlement`, which false-matched the legitimate internal path `.../pregame-archive/settlement-joins/`. Every CI commit carrying join files aborted "out-of-scope paths staged — committing nothing" → CI persisted **nothing** (artifact-only). **Root cause:** the `settlement-joins/` path (added when the join pipeline shipped in c2428491) collided with the `settlement` token added in the earlier commit-hardening. **Fix (443da2fc):** drop the bare `settlement` token; keep `settled_leans` (the real official settlement file). The `OFF` check already blocks anything outside the archive dir, so official settlement / money / public / product paths stay blocked. **Regression test:** commit-persistence guard #9 (settlement-joins allowed; settled_leans / portfolio / public/data / out / bank-builder still blocked). **Confirmed:** run 29891008512 committed 58 files including settlement-joins.

**Defect #2 — non-idempotent lean merge.** The join's market-lean merge overrode carried-forward leans with freshly-gathered ones unconditionally. A re-run whose captured data is *older* than the committed lean regressed it (older odds/timestamp) and rewrote the file. Surfaced by a local re-run: 13 pending 2026-07-22 games rewrote with no state change. **Fix (e1f3f633):** `mergeLeanKeys()` keeps the **latest capturedAt** per key — an older capture never regresses a newer carried lean; a re-run with same-or-older data is a true no-op. Production CI (forward-only) was unaffected; this makes idempotency robust. **Regression test:** guard #15 (stale capture ignored; fresher capture updates; self-merge no-op). **Confirmed:** local re-run now writes 0 for pending 2026-07-22.

## 3. Official July-22 game statuses (StatsAPI, never inferred from elapsed time)

**2026-07-22: 0 / 17 final** — all `Preview / Scheduled`. Every archived 2026-07-22 game has a freeze + a join file + carried market rows, all `pending`.
2026-07-21 (context, has no market capture): 12 Final, 1 Live/In Progress, 2 Postponed (postponed stay pending, never a loss).

## 4-7. Per-game joins, grading, non-settled reasons

- Join files: freezes/snapshots **immutable** (freeze 822787 sha256 `15bbcfb633…` unchanged; 0 freezes/snapshots modified). Every market row traces to a carried key; every contextual row to a freeze family. Ineligible rows stay ineligible.
- Team-market + player-prop grading is verified against the canonical `mlb-markets.ts` (parity guard) and against a real box score (822787 TOR 2 – TB 12: Gausman 10 outs / 1 K / 4 ER; Rasmussen 15 outs / 5 K / 2 ER). **On real settled data the grader has not yet run** — 2026-07-22 is pending — so grading correctness rests on the 15 guard tests + verified contextual joins until the games finalize.
- Non-settled reasons: **608 market rows all `game_pending`** (2026-07-22 not final); 0 ambiguous / unsupported / unavailable / ineligible-graded. Contextual: 41 linked (2026-07-21 final games), rest pending.

## 8. Research-gate progress (exact, before → after)

| metric | before | after |
|---|---|---|
| datesCollected | 2/30 | 2/30 |
| settlementJoinDates | 2026-07-21, 2026-07-22 | same |
| gamesFinal / gamesPending | 9 / 23 | 12 / 20 |
| marketRows (joinRows) | 396 | 608 |
| **settledEligibleRows** | **0/500** | **0/500** |
| push / ambiguous / unsupported / ineligible | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| contextualRowsJoined | 32 | 41 |

Gate **NOT met** (expected). Binding constraint: settled-eligible rows — a date needs pregame market capture **and** final games; 2026-07-22 (the only market date) is not final.

## 9-10. Idempotency, immutability, persistence

- **Idempotency:** after fix #2, re-running the join writes 0 for stable pending games; only genuinely newly-final games update. Final games are terminal (not re-fetched without `--refresh-final`).
- **Immutability:** freeze/snapshot hashes unchanged; the join writes only `settlement-joins/`.
- **Persistence:** largest join file 117,504 B (< 128 KiB guard); 0 files over cap; raw/normalized odds stay gitignored → artifacts; only small join metadata is committed. No row loss.
- **Money/public isolation:** money md5 unchanged at every commit; no public-source change (the only `out/` byte delta, ath-vs-az 718091→718606, is the site's pre-existing date-aware "Latest slate" freshness rendering after the ET date rolled past midnight — the build-relevant source is byte-identical between c2428491 and now, so no code of this mission touched public output).

## 12. Verdict

```
GREEN — the pipeline can continue unattended.
```
Two blocking/robustness defects were found and fixed; the automatic cycle now captures, joins, audits, and durably commits path-scoped, money-safe metadata. It will auto-grade to settled-eligible rows via the `--lookback 3` CI window once 2026-07-22 is final. **Caveat:** no real settled-eligible row exists yet (games pending), so real settled-grading is proven only by guard tests + verified contextual joins — re-confirm after 2026-07-22 finalizes.

## 13. Gates

tsc CLEAN · 2,380 tests pass · build 0 · forensic MATHEMATICALLY PERFECT · health HEALTHY · internal-leak scan (settlement-joins / pregame-archive / FINAL_PREGAME_FREEZE all 0 in out/) · fake-claim clean · product-eligibility scan clean · route smoke all pass · Bank Builder / Moonshot / official settlement unchanged · World Cup archived.

## 15. Remaining limitations + next recommendation

- **First settled-eligible rows require 2026-07-22 to be final** (~2026-07-23 early UTC). The scheduled cron (`--lookback 3`) will re-grade it automatically; confirm the first non-zero `settledEligibleRows` in `status/latest.json`, then continue toward the 30-date / 500-row gate.
- 2026-07-21 has no market capture (paid capture began 2026-07-22), so its final games yield contextual rows only (0 settled).
- **Next recommendation:** let the pipeline run unattended; after 2026-07-22 finalizes, re-run this validation focused on the first *settled* rows (grading correctness on real official outcomes, push handling, ambiguous/unavailable diagnosis). No modeling until the gate is met **and** founder approval.
