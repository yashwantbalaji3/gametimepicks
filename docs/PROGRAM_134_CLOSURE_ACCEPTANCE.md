# Program 134 — Closure & Overnight Acceptance

**Session: 2026-08-04 21:49 ET / 2026-08-05 01:49 UTC.** Baseline HEAD `7217e572` (anchor
CURRENT) → `origin/main` was **7 bot commits ahead**, fast-forwarded to `d98b9473`. No active or
queued writer. Dirty tree is `vp/` only — cowork-owned, and Program 134 staged/committed **zero**
`vp/` paths.

## Classification: `PROGRAM_134_OPEN_PENDING_OVERNIGHT`

Not closed. The completion gate requires the **Aug 4 population to reconcile through the deployed
code path**, and the authoritative settlement owner (`nightly-settle`, 01:30/03:30 ET) has not run
yet. All 15 games have started (last first pitch 01:40 UTC), so the acceptance is genuinely
wall-clock pending. Two evidence gaps are also now recorded as open rather than claimed.

---

## Phase B — Aug 3 board divergence: RESOLVED, no protected incident

The prior report substituted "the identity digest is the real invariant" for the byte hash. That
substitution is **withdrawn**; here is the byte-level authority instead. The board has exactly
**three** versions, every one written by the scheduled `morning-projections` workflow:

| commit | committed (ET) | full sha256 | generatedAt | rows |
|---|---|---|---|---|
| `541ff6cc` | 08-03 00:34 | `d2e81ca342aa15b298fd16fe3feb9f2eb197650462cd5436d5ac82e584bebf41` | 04:34:02Z | 211 |
| `ab8ffc5f` | 08-03 12:04 | `7d54aee717bea203d99c743097557d2bd7dfe5cb430edf4ab137d6acf2401fb6` | 16:03:45Z | 211 |
| `fb8a51f0` | 08-03 16:49 | `5d123d81a4efbfae7f394968f5645dbcef598fe2496a5a5890e1879ed57aee2c` | 20:48:26Z | 211 |

**Answering the prompt's question directly:** the 16:49 ET version *is* `5d123d81…`, and it has
been current ever since — including at the 23:38 ET handoff. `d2e81ca3…` was never an
authoritative *manifest* value; it was the first version, recorded in a document I wrote at
10:20 ET and already corrected in-place at 12:45 ET when I found the pipeline had legitimately
regenerated. **No manifest changed hands and nothing was rewritten.**

**Every regeneration was pregame.** First pitch 22:40Z; generations at 04:34Z, 16:03Z, 20:48Z.
No post-freeze, post-first-pitch, or unprovenanced byte change → **not** `BLOCKED_PROTECTED`.

### Semantic diff (whole-row, all material fields)

- Identity set and row count **identical across all three** (211, digest `5e69fa7b…` unchanged).
- **v1→v2:** only `capturedAt` moved (04:34 → 16:03) — the restamped-cache defect.
- **v2→v3:** `capturedAt` **returned to 04:34** — my provenance fix (`95d05491`) working on a real
  0-credit cache-served regeneration — **plus exactly one row changed materially.**

### The one changed row, stated plainly

`ec933bb8…-Brenton_Doyle-batter_hits-0.5`

| field | v2 (12:04) | v3 (16:49) |
|---|---|---|
| lean | `Under` | **`Pass`** |
| projection | 0.61 | `None` |
| confidence | `Medium` | `insufficient_data` |

The model **withdrew** a prediction pregame. Settlement then correctly counted it as no-play. It
is permitted by the current contract (pregame regeneration is allowed while the whole slate is
pregame) and it moves toward *less* claim, not more. But it is real: a user reading the board at
13:00 ET saw an active Under that was gone by 17:00. **This is precisely what the append-only /
freeze architecture exists to eliminate**, and it belongs on the record rather than in a footnote.

## Phase C — settlement ownership: "ran once" was WRONG

Both runs wrote settlement truth. The corrected, mechanically supported statement:

> Aug 3 settlement executed **twice** — `8ab89fd8` (03:59 ET) and `76bee2bd` (06:11 ET) — and the
> second run **converged idempotently on identical truth**.

| field | run 1 | run 2 |
|---|---|---|
| settled / decisive | 190 / 173 | 190 / 173 |
| wins / losses / pushes / voids | 71 / 102 / 0 / 17 | 71 / 102 / 0 / 17 |
| hitRate · unavailable · finalGamesSettled | 0.4104 · 6 · 7 | 0.4104 · 6 · 7 |

Identical id set, **zero outcome flips, zero duplicate ids** in the final ledger. The huge
line-diff (~47k) is whole-file re-serialization, not re-grading — which is exactly why a diff
size must never be read as evidence of change.

**Accounting:** 173 decisive + 17 void + 15 no-play + 6 unavailable = **211** ✓ · LAD @ CHC zero ·
patch population zero. Second persistence proof `8ab89fd8` carries real diffs for all three
research paths (57/4/75 lines).

## Phase D — signature-state is NOT user-facing (correction)

`grep` for `deriveSignatureState` / `SIGNATURE_STATES` across `app/src` → **zero consumers**
outside the module and its own test. No route or component renders it.

**Reclassified: internal infrastructure.** The prior "user-facing improvement shipped" claim is
withdrawn and corrected in `PROGRAM_134_AUG4_AUTONOMY_PROOF.md`.

**Not wired now, deliberately:** all 15 games are in progress and the overnight chain has not run.
The program's own rule forbids new UI during a live-data mutation window. **Open Program 134 gap**
for the next safe window (after settlement completes and before the next slate generates).

## Phase E — watchdog: deployed, not production-proven

`scripts/cron_watchdog.sh` (+ `_test.sh`), `WATCHDOG_STATE` introduced in `7217e572`. Taxonomy as
implemented: `BOARD_MISSING` · `REFRESH_MISSING` · `REFRESH_COMPLETE` · `NO_MARKET_EXTERNAL` ·
`ACTIVE_WRITER` · `RECOVERY_ALREADY_ATTEMPTED`. Human decision line remains first (`head -1`
compatibility asserted).

**No workflow step consumes the machine-readable line yet** — today its only consumer is the
operator reading the run log. And the last watchdog run (16:25Z / 12:25 ET) **predates** the
deploy of `7217e572` (19:08Z), so the new taxonomy **has never executed in production**.
Correctly classified deployed-but-not-production-proven.

## Phase F — pre-settlement bank (Aug 4)

| item | value |
|---|---|
| board sha256 | `a638a49bf838dfee26fa4579ad1ecc634e214a0d42e1deaff4eebb831fa6e750` |
| identity digest | `bd09287d825b11b53679589a5f34aa6c37c69354071ec1b7a35e51d027d143c9` |
| rows / unique ids / events | **678 / 678 / 15** |
| capturedAt span | 15:47:23Z–15:47:28Z (earliest first pitch 22:35Z) |
| patch population | **0** |
| credits | 19,161 → 19,101 (60 by automation, **0 by me**) |
| ledger sha256 | `d5a988f7c1a81e05c4d0c6d1a010b0f36412410e3ec58e35aeb293881f427c2a` |
| contract sha256 | `a150a387c9f8f7b352cff97eb93230870af02aeb54d439856d1a4890d80091c4` |

**Predicted split from the board itself: 82 no-play → expect settled + unavailable = 596.**
Acceptance identity to verify after the run:

```
settled + no_play + unavailable == 678     and     reconciles=YES
```

This is the first settlement to run with the reconciliation accounting shipped today, so it is
also the production proof for that code path.

## Protected state (unchanged, full)

| artifact | sha256 |
|---|---|
| `mr-dub/portfolio.json` | `ea249d6616b5ee92656529a0b5dcf48645eb879ade3f38e7607e0deaf59e1c0d` |
| `mr-dub/bank-builder-locks.json` | `909ad63bfd5b12c006e66320e2a7779d14258fe5161ae4cf67e1286465a4745e` |

md5 `affe6b21071f2b3be96bb2774eb347c3` / `cb80473f88f3cb5f67208fa568925295` · **19–14 ·
$19,065.40** · `vp/` untouched.

## Open gaps blocking `PROGRAM_134_CLOSED`

1. **Overnight Aug 4 settlement acceptance** — wall-clock, 01:30/03:30 ET.
2. **Signature-state has no UI consumer** — internal only; wire in the next safe window.
3. **`WATCHDOG_STATE` unconsumed and never executed in production** — proven only by tests.
