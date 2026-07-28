# Sprint 043 — Event Identity Enforcement & Multi-Sport Foundation

**Starting SHA:** `f0ea4639` · **Date:** 2026-07-28

Sprint 042 built an `EventIdentity` contract and proved it against real data. Nothing consumed it. This
sprint made it load-bearing, put a gate in front of publication, and measured what four sports can
actually support.

---

## 1. The publication gate (Phase 2)

Sprint 041 fixed the doubleheader resolver. It did not stop a corrupted mapping from being **written** —
the defect reached two user-facing surfaces before a cross-surface test noticed. A fix without a gate only
covers the failure you already found.

`pipeline/mlb/generate_mlb_board.py` now validates before it writes:

```python
assert_board_publishable(leans, date=date)
board_path.write_text(json.dumps(board_payload, indent=2))
```

The invariant is injectivity in both directions: a provider event id and a `gamePk` are one-to-one. Two
gameIds claiming one gamePk means one game's markets are joined to another game's model output; one gameId
claiming two gamePks is the reverse. Both raise `IdentityGateError` — raise, not warn. A warning here would
have been ignored on 2026-07-28 exactly as every other silent degradation in this pipeline's history was.

### Mutation proof

A guard never observed failing is not a guard. `test_MUTATION_reverting_the_resolver_trips_the_gate`
rewrites the **shipped source file on disk** back to last-write-wins, reloads the module, confirms the two
halves of the doubleheader collapse onto one gamePk, asserts the gate raises, restores the file, and
verifies the SHA-256 is byte-identical to the original.

Writing this test surfaced a real trap: `importlib.reload` rebinds `IdentityGateError` to a new class
object, so a module-level `from … import IdentityGateError` stops matching in `except`. The gate tests
would have passed for the wrong reason. They now reference the live module (`gmb.IdentityGateError`), with
a comment explaining why.

**Result:** 14/14 Python identity tests pass. `git diff` on the generator shows **+66 insertions, 0
deletions** — the mutation restored cleanly.

---

## 2. Historical audit (Phase 3)

The gate was run over all **58 committed boards** — no history rewritten.

| Status | Boards |
|---|---|
| CLEAN | 49 |
| EMPTY (no leans) | 6 |
| **COLLISION** | **3** |

| Date | Violations | Detail |
|---|---|---|
| 2026-05-23 | 1 | gamePk 824516 claimed by 2 provider events |
| 2026-07-22 | 2 | gamePk 823519 and 824732 each claimed by 2 |
| 2026-07-28 | 1 | gamePk 824489 claimed by 2 — the CLE@CIN doubleheader |

This is the significant part: **the Python gate independently reproduces the exact quarantine list Sprint
041 derived in TypeScript** — same 3 boards, same 4 collisions, from a separate implementation over the same
artifacts. Two independent derivations agreeing is stronger evidence than either alone.

No board dated after the fix landed collides.

---

## 3. Making identity load-bearing (Phase 1)

Consumers were joining artifacts with `new Map()` and `.set()`, which is last-write-wins and cannot see a
collision in **either** direction. `markets/load.ts:156` rebuilt precisely the dict that caused the original
defect.

`buildAliasIndex` (in `event-identity.ts`, sport-independent) tracks both directions and refuses any alias
touched by a many-to-one mapping:

```ts
const pkByGameId = buildAliasIndex<number>(
  leans.flatMap((l) => (l.gameId && l.gamePk != null ? [[l.gameId, l.gamePk] as const] : [])),
);
const gamePk = pkByGameId.resolve(gameId);   // null on collision — never a guess
```

It blocks **both** sides of a collision, not just the loser. On 2026-07-28 we cannot tell which provider
event was game 1, so resolving either would hand back a shared simulation. `null` surfaces as visibly
missing data; a plausible-but-wrong number is the more expensive failure, because nobody investigates it.

### The migration exposed a second surface

Migrating `markets/load.ts` alone **broke the cross-surface agreement test** — and correctly so. Market
Center began refusing `c869940458363d7a` while the Game Report still rendered `FULL_COMPARISON` for it. The
existing quarantine only covered game 1; game 2 had "won" the last-write-wins, so both surfaces previously
agreed on a value that was arrived at arbitrarily.

The fix was to make the report refuse the same mapping, not to widen the quarantine. `game-detail.ts` now
resolves through the same index, so one rule lives in one place. Both surfaces refuse together.

---

## 4. The sport-agnostic contract (Phase 4)

`app/src/lib/identity/sport-adapter.ts` defines `getEvents` / `resolveIdentity` / `getMarkets` /
`settleMarkets` / `validateEvent`, plus `CaptureProvenance`, `isLeakageSafe`, and `deriveReadiness`.

Each member exists because its absence caused a specific measured failure — documented in the file. The
contract is deliberately harsh: a single disqualifying fact caps a sport, and every threshold traces to an
observed defect rather than a preference.

`sport-adapter.test.mjs` feeds the **measured evidence from the multi-sport audit** through
`deriveReadiness` and asserts it reproduces the verdicts the audit reached independently. It does, for all
five rows. It also asserts that each individual degradation blocks `FULL_MODEL` — a contract that only
fails on combinations is not a gate.

---

## 5. Multi-sport readiness (Phases 5–6)

Full evidence in [`MULTISPORT_READINESS_AUDIT.md`](./MULTISPORT_READINESS_AUDIT.md).

| Sport | Verdict | Decisive fact |
|---|---|---|
| MLB | `HISTORICAL_ONLY` | All 4 modeled markets lose to the market over 18,659 leans |
| UFC | `SCAFFOLD_ONLY` | 0 backtestable bouts; 20 pregame lines ever captured; 10 rematch join collisions |
| Soccer (WC) | `HISTORICAL_ONLY` | 64-match backtest **loses** to closing market (Brier +0.0099); 2 settlement impls; 192/385 legs pending |
| Soccer (EPL/UCL/MLS) | `DISABLED` | Zero artifacts, zero code |
| NBA | `HISTORICAL_ONLY` | 3,635 settled outcomes but `fullyResearchEligibleDates: 0` |

The cross-cutting finding: **no sport enforces a per-row capture timestamp against event start.** The only
leakage-provable odds artifact in the repository is a 64-match 2022 World Cup internal reference file.

---

## What is proven

- A corrupted MLB board **cannot be written** — proven by mutating the real generator and observing the gate raise.
- The mutation restores byte-identically (SHA-256 asserted).
- Exactly 3 of 58 historical boards collide, confirmed by two independent implementations.
- Both the Market Center and the Game Report refuse the same corrupted mapping; the cross-surface test proves they agree.
- Every unaffected game on a collided date still resolves normally — the refusal is scoped, not blanket.
- The readiness contract reproduces the multi-sport audit's verdicts mechanically.
- Full suite **3190 tests / 3186 pass / 0 fail / 4 skip**; typecheck 0; build 0; Python identity 14/14.

## What remains unknown

- **Whether the 3 historical collisions corrupted settled money.** The boards are quarantined and the money
  hash is unchanged (`affe6b21…`), but no one has traced whether a settled leg on 2026-05-23 or 2026-07-22
  was graded against the wrong game. This is the highest-value unanswered question in the sprint.
- **Whether non-MLB pipelines have the same defect.** UFC's name-pair join is confirmed to collide on 10
  rematches; nothing has gated it. Soccer's `matchId` join was not audited for collisions.
- **Whether the gate holds under a real generation run.** It is proven against synthetic and historical
  data, not yet observed blocking a live pipeline run — because no live run has collided since it landed.
- **Whether `buildAliasIndex` refusing both sides is right for settlement.** For display, refusing is
  clearly correct. For a settled leg, refusing may be worse than a documented arbitrary choice. Not exercised.

## Recommended next sprint

**Trace the 3 historical collisions through to settlement.** The gate stops future corruption; it says
nothing about what already shipped. Determine whether any settled leg on 2026-05-23, 2026-07-22, or
2026-07-28 was graded against the wrong game, and record the answer either way — including "no money was
affected", which is a real finding.

Then extend `isLeakageSafe` to the MLB ingest boundary, since it is the prerequisite for every research
claim in every sport and MLB is the only sport close enough to satisfy it.
