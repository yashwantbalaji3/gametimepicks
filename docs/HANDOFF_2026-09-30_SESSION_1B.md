# Handoff: 2026-09-30, Session 1B

**Scope:** same-day Results restatements, the Sep 23 backfill, and postponed-game identity.

This is a point-in-time snapshot. For current truth, read the repo, `/data/build-info.json` and `gh pr list`. It continues [`HANDOFF_2026-09-30_SESSION_1.md`](./HANDOFF_2026-09-30_SESSION_1.md), which had three open founder decisions. All three were authorized and are done.

## F1: append-only same-day Results restatements (#858)

The first nightly-settle slot on #854 code (2026-09-30 16:03Z) reproduced the remaining class: daily-products advances the risk ladder and lab ledger between slots, so the later slot was refused. V18 §9.3 named "a `--restate` flag that records the restatement". This PR implements that flag; the contract is now in V18 §5a.

| Situation | Result |
|---|---|
| No original for the date | Write `<date>.json`, opened `wx` so it can never overwrite. |
| Same history as the effective state, or only owner stamps differ | No-op. Nothing dated is written. |
| History differs, and nightly-settle passes `--restate` | Append `<date>.r<N>.json`: the full projection plus a `restatement` block (`restates`, `previousEffective`, `restatedAt`, `changedOwners`, `changedCells` before/after, `addedCells`). |
| A cell vanished, a closed-history record moved (`LEGACY_ERAS`/`SUPERSEDED`; keyed on **era**, since a "FROZEN" lab stream only means "not live today"), or the restatement chain is broken | Refused, exit 1, red. Operator decision. |

- **The resolver.** `readEffective` (`src/lib/results/projection-revisions.mjs`) returns the effective projection for a date. Every consumer (/results, `current-record`, Ask) reads `latest.json`, which always equals that effective projection.
- **History is compared in cellId order.** The builder emitted cells in graded-picks key order; test 8 caught it.
- **First real restatement:** `2026-09-30.r2.json`, created by the canonical projection run in #861. It records the fold plus the day's model-health, risk-ladder and lab-ledger advancement. The original `2026-09-30.json` is byte-identical.

## F2: authorized Sep 23 backfill (#861, founder GO with a corrected +5-row expectation)

Only canonical owners wrote this data:
1. `settle-mlb-player-props.mjs --date 2026-09-23 --apply` (catch-up, using #855 identity).
2. `fold-protected-era.mjs --apply`.
3. The derived producers, exactly as the workflows run them: `build-master-ledger`, `build-paper-track-record`, `derive-cycle-table`, `build-results-projection --restate`, `build-admin-status`.

| | Before | After |
|---|---|---|
| 09-23 Moonshot A · TOR @ BAL Over 7 | pending | **LOST**, actual 6 (gamePk 824785) |
| Lane A / 09-23 receipt record | pending / 0-3, 1 pending | lost / 0-4 |
| Protected fold | through 09-22, halted at 09-23 | through **09-29** |
| Bankroll | $15,990.40 | **$15,340.40** |
| Record | 37-36 | **42-41** |
| Crown | $20,465.40 | unchanged |
| ledger / daily-summary rows | 49 / 40 | 54 / 45 |

- **The −$650:**
  - 09-23: −$250 (Bank Builder 0-2, plus Moonshot A — this leg — and Moonshot B lost);
  - 09-24, 09-25, 09-26: −$125 each;
  - 09-27: −$25.
- **09-28 and 09-29** fold at Δ0 with no money row, because nothing placed settled on those days. That rule is `foldLedgerRows`. The Session 1 handoff's "+7" was wrong.
- **Checks:**
  - The Protected-Ledger invariant passes before and after.
  - The health gate is HEALTHY (20 passed).
  - Re-running the settler and the fold with `--apply` is a byte-identical no-op.
- **CI caught a gap.** The first data commit left four derived owners stale. The guards were right; the fix was to regenerate them with their own producers.
- ⚠ **Execution note.** The auto-mode permission classifier refused to run the writers before the founder's explicit GO, even in a disposable worktree. The evidence was therefore computed in memory from the pure fold library, and the writers ran only after the GO.

## F3: postponed-event identity and receipt identity (#859)

- **New receipt legs store identity:**
  - `gamePk`, proven by the join or by the #855 resolver, and never recorded for an unproven doubleheader;
  - `eventId` and `startUtc`, using the portfolio's existing field names.
- **The write-once "identical" check compares outcomes.** Legacy receipts stay legacy-shaped, and a changed outcome is still refused.
- **`resolveLegGameIdentity` prefers a stored gamePk.** Otherwise it uses the #855 slate proof. There is still only one resolver.
- **A postponed game settles on its makeup.** A proven gamePk with no final on its date grades on exactly **one later final of the same gamePk and the same teams**. It never matches by teams + date. There is no new outcome vocabulary.
- **No history change.** A catch-up dry-run over every September receipt changed only the authorized 09-23 leg.
- **Remaining gap.** Player-prop legs identify their game by the portfolio's `eventId`, which the settler treats as the gamePk. That is unchanged here.

## UX continuity (#860)

- **UX-2 shipped.** The home and /today recap now says "Latest settled cards · Sunday, September 27" when its day is not yesterday, instead of "How Sunday went" next to "Settled · Sep 29".
- **UX-1 not changed.** The bottom bar lights MENU on /today and /live because of the documented P243 charter-E rule. Deciding which bar item owns those routes is a founder nav decision, and the founder deferred it.

## Nightly-settle runtime

- **#854 proof.** The 16:03Z post-merge slot refused on class C, as predicted. Its base file also still carried the pre-#854 model-health snapshot.
- **F1 proof.** #861's canonical projection run appended r2 instead of refusing.
- **Next check:** 2026-10-01, from 05:17Z onward. The first slot writes `2026-10-01.json`; any later slot after daily-products should append `2026-10-01.r2.json` and stay green.

## Founder decisions still open

- **UX-1:** which bottom-bar item owns /today and /live (nav charter E), or a sixth item.

## DP

No tasks assigned; onboarding only.

## Next recommended fresh session

The dedicated Ask session. Its findings are in §5 of the Session 1 handoff.
