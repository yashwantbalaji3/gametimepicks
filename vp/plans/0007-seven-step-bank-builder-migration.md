# Plan 0007 — Safe 7-step Bank Builder ladder migration (LADDER_V2 → live)

**Maintained by:** Claude Code · **2026-07-07** · requested by Yash in the *Bank Builder Consistency Audit + Fix* mission (final-report item 18).
**Numbering note:** the mission called this "Plan 0006", but `vp/plans/0006-overnight-july7-settlement.md` already exists — this is filed as **0007** (next free number). It is the same artifact the mission asked for.

**Status:** NOT STARTED — this is the *plan only*. **Do not begin implementation without explicit owner approval.** The 7-step ladder stays **preview-only** (governed by ADR-0006) until every phase below is green.

---

## 0. Why this plan exists (the finding)

During the 2026-07-07 consistency audit we confirmed **Option C**: the live product runs the **5-step** ladder; the **7-step** "profit-locking" ladder is a **methodology preview with no settlement support**. Evidence:

- **Live 5-step engine** — `src/lib/bank-builder-ladder.ts` (`BANK_BUILDER_LADDER`, `BANK_BUILDER_STEP_COUNT = 5`, $100 → $10,000) is consumed by the **settlement + accounting + generation** path: `src/lib/settlement/daily-portfolio-settle.ts`, `src/lib/bank-builder-progression.ts`, `src/lib/daily-portfolio/bank-builder-generation.ts`, `src/lib/bank-builder/public-dual-ladder.ts`, `scripts/build-bank-builder-ledger.mjs`, `scripts/build-public-bank-builder.mjs`.
- **7-step V2 policy** — `src/lib/methodology/ladder-policy.ts` (`bankBuilderStepPolicy`, `V2Step` dollar-schedule) is consumed **only** by `src/components/bank-builder/ladder-v2.tsx` (display) and two of its own tests (`ladder-visibility.test.mjs`, `methodology/ladder-policy.test.mjs`). **Zero settlement, accounting, generation, or ledger consumers.** It cannot grade or move money today.

**The gap is not cosmetic.** The live settlement model (`classifyLaneTransition`) moves money on only two events:
- **loss → `stop`** (drop the $100 seed, bankroll −$100),
- **won-final-rung → `complete`** (operator-defined banking, itself not yet a tested auto-step).
A win on a non-final rung is **`advance`**: the *whole* roll carries forward, **no money is realized**.

The 7-step ladder introduces settlement concepts the live engine does not implement:
1. **Partial cash-out / lock on a win** — at Step ≥ 3, extract `cashOutPct` (25% → 40%) of the *winnings* to banked profit on every win, not just at completion. **This is a brand-new money-movement event.**
2. **Dynamic roll-forward stake** — the next step's stake is `payout − lock`, i.e. path-dependent, not a fixed rung `start`.
3. **"Safe under target" advance** — a card may settle *below* the exact rung target (`minAcceptablePayout`, ≥ 60% of the intended edge) and still advance.
4. **7 rungs** with a strictly-non-increasing multiple from Step 3 and per-step market/leg tightening (`RiskBand`).
5. **Progressive `cumulativeLocked`** banked profit — the canonical ledger, `verify-money-integrity`, and `forensic-money-audit` currently assume money moves **only** on seed-drop and completion.

**Migrating means changing the settlement engine and the money gates — not swapping a component.** That is why it is gated. This plan makes the change safe.

---

## Guardrails (restated, binding for every phase)

- **No canonical money change** until the flip step (Phase 7), and only then behind a full green gate run + owner sign-off. `md5 public/data/mr-dub/portfolio.json` must stay **`b7c35f72cdc4a58db353c3c1d34a31c4`** through Phases 1–6.
- **No model-weight changes** (sample still too small; separate concern from ladder shape).
- **Recommend-not-approve, operator-gated** (ADR-0007): the migration must not auto-apply money; card approval stays manual.
- **Shadow-first**: the 7-step engine settles in a *shadow ledger* that touches **no canonical file** until it has independently reproduced a full lane cycle and reconciled to the penny.
- **One truth**: while preview-only, every live surface keeps saying **5-step**; the 7-step stays labelled *preview / not on the live product* (as shipped 2026-07-07). No half-migrated state may reach production.
- **Never deploy red.** Definition of done for every phase = all gates green: `verify-money-integrity` · `forensic-money-audit` · idempotence · `health-check` · `tsc` · full `*.test.mjs` suite · `npm run build` · production smoke 9/9.

---

## PHASE 1 — Lock the spec (docs-only, no code)

Write `docs/BANK_BUILDER_7STEP_SETTLEMENT_SPEC.md` — the single source of truth the engine will implement. Must nail down, unambiguously:

1. **The dollar schedule** — reconciled `V2Step[]` (roll / target / targetMultiple / lock / rollForward / cumulativeLocked / minAcceptablePayout / maxLegs) for all 7 steps, copied verbatim from `ladder-policy.ts` **and reconciled against the canonical bankroll math** (Σ lock + final payout, seed-recovery step, freeroll point). State the completed-ladder realized total explicitly.
2. **Win-with-lock money mechanics** — exact formula for banked-profit increment on a Step ≥ 3 win, what rolls forward, and how a partial ("safe under target") win is treated (advance vs. hold).
3. **Loss mechanics** — seed drop identical to v1 ($100), and what happens to already-locked profit from earlier steps on a later-step loss (it stays banked — define this precisely; it is the whole point of "profit-locking").
4. **Void / push / pending** — unchanged `hold` semantics.
5. **Dual-lane interaction** — Lane A and Lane B remain two independent attempts at the *same* 7-step ladder (no risk modes). Define completion banking for a lane and how two lanes' locks aggregate.
6. **Reconciliation invariants** — the exact equations `verify-money-integrity` and `forensic-money-audit` must enforce post-migration (every lock is traceable to a settled winning step; bankroll = base ± seeds ± locks ± completions).

**Accept:** spec reviewed; internal math reconciles; no code touched; money-md5 unchanged.

---

## PHASE 2 — Promote the policy to a settlement-grade module (pure, no wiring)

- Move / re-home the 7-step policy from `src/lib/methodology/ladder-policy.ts` into a settlement-owned pure module (e.g. `src/lib/bank-builder/ladder-v2-policy.ts`) **or** export a stable, versioned interface the settlement engine can import without pulling in "methodology/display" concerns. Keep the methodology page importing the same source (no display change).
- Add a `BANK_BUILDER_V2_STEP_COUNT = 7` constant and a `resolveLadderStepV2(rollState)` that mirrors `resolveLadderStep` but is **path-dependent** (takes the current roll + banked-lock state, not just a bankroll scalar).
- **Pure only**: no `node:fs`, no fetch, no money mutation.
- Unit tests: every step's `rollForward === target − lock`; `cumulativeLocked` is a running Σ; multiplier strictly non-increasing from Step 3; `minAcceptablePayout` ≥ 60%-edge; completed-ladder realized total matches the Phase-1 spec to the cent.

**Accept:** new tests pass; `tsc` clean; **no settlement/accounting/ledger file imports it yet**; money-md5 unchanged.

---

## PHASE 3 — Extend the settlement engine (behind a version flag, shadow output only)

- In `src/lib/settlement/daily-portfolio-settle.ts`, generalize `classifyLaneTransition` and the step-settlement path to a **`ladderVersion: "v1" | "v2"`** parameter. `v1` behaviour is byte-identical to today (default). `v2` adds:
  - `won` on a non-final rung → `advance-with-lock`: compute `lock` + `rollForward` from the V2 policy, emit a **banked-profit delta** and the next-step stake.
  - `won` "safe under target" (payout ∈ [minAcceptable, target)) → still `advance-with-lock` (define per Phase-1 spec).
  - `won` final rung → `complete` with the Step-7 full lock.
  - `lost` → `stop`, seed −$100, **earlier locks retained**.
- **Output goes to a shadow structure only** — a new field / new artifact (`public/data/mr-dub/bank-builder-v2-shadow.json`) that is **not read by any canonical gate or UI**. The canonical `portfolio.json` path still runs v1.

**Accept:** v1 path unchanged (prove via existing settlement tests, byte-diff of canonical artifacts); new v2 unit + fixture tests green; money-md5 unchanged.

---

## PHASE 4 — Shadow reconciliation (the safety proof)

- Replay a **full synthetic lane cycle** (Step 1 → 7 wins, plus representative loss-at-Step-N and safe-under-target cases) through the v2 engine into the shadow ledger.
- Add a **shadow money-integrity check** (mirrors `verify-money-integrity` + `forensic-money-audit`) that reconciles the shadow ledger to the penny against the Phase-1 spec.
- Run the shadow settlement over **real settled history** (the June–July WC lanes) in parallel with v1 and produce a diff report: where would v2 have banked profit v1 did not, and confirm no v2 path ever produces an impossible bankroll.

**Accept:** shadow reconciles perfectly; diff report reviewed by owner; canonical money-md5 still unchanged. **This is the go/no-go gate for touching real money.**

---

## PHASE 5 — Generation + proposal + accounting (still shadow, dynamic stake)

- Teach `src/lib/daily-portfolio/bank-builder-generation.ts` and the proposal engine (`bank-builder-proposal.ts`) to shape a card for the **v2 step's dynamic stake + market/leg constraints** (2–3 legs early, 2 + narrower markets from Step 3, per `RiskBand`) — **under the version flag, defaulting to v1**.
- Extend `accounting.ts` exposure so a v2 active card reports its dynamic stake as `exposure.core` (the consistency fix from 2026-07-07 already routes `/bank-builder` to `exposure.core`).
- Update `public-dual-ladder.ts` + `build-public-bank-builder.mjs` to be able to emit a v2 public state **into the shadow artifact only**.

**Accept:** generation/accounting v2 tests green; v1 outputs byte-identical; money-md5 unchanged.

---

## PHASE 6 — UI truth-swap prep (guarded, not yet flipped)

- The live `ladder-v2.tsx` display already exists and is labelled *preview / v1-live settlement*. Add a single **`BANK_BUILDER_LADDER_VERSION` feature constant** (default `"v1"`). All surfaces (`/bank-builder` ClimbHero, `/today`, `/methodology`, `/ops`, `/mr-dub`) read step count + copy from this constant so the "one truth" holds **automatically** whichever version is live.
- Pre-write the copy for both states so the flip is a one-line constant change, not a copy hunt. While `"v1"`: everything says 5-step, 7-step stays labelled preview (unchanged from 2026-07-07).
- Update `ladder-visibility.test.mjs` + `bank-builder-consistency.test.mjs` to assert **consistency as a function of the version constant** (whatever the live version, every surface agrees; the other version is preview-only).

**Accept:** with the constant `"v1"`, production is byte-identical to today; tests assert cross-surface agreement parametrically; money-md5 unchanged.

---

## PHASE 7 — The flip (owner-gated, single reversible change)

Only after Phases 1–6 are green **and** a fresh full gate run **and** explicit owner approval:

1. Choose the **cutover boundary**: the flip must happen only when **both lanes are stopped / complete** (no in-flight v1 roll to reinterpret). Confirm current lane state first.
2. Flip `BANK_BUILDER_LADDER_VERSION` to `"v2"` (and the settlement `ladderVersion` default). This is the **only** behavioural change in the commit.
3. Regenerate the daily products + public state; the first v2 card is a fresh Step-1 $100 seed on each lane — **no historical bankroll is retro-graded** (history stays as it settled under v1; the canonical ledger appends, never rewrites).
4. Run every gate. Money-md5 **will** change on the first v2 settlement — that is expected and must be accompanied by a green `verify-money-integrity` + `forensic-money-audit` that now enforce the v2 invariants, and a recorded new canonical md5 in the money memory.
5. **Rollback**: flipping the constant back to `"v1"` restores v1 behaviour for all *future* cards; any v2 cards already settled remain in history (as they legitimately happened). Document this in the flip commit.

**Accept:** all gates green under v2; every surface says 7-step consistently; new canonical md5 recorded + owner-approved; smoke 9/9; a one-line rollback documented.

---

## What this plan deliberately does NOT do

- No model-weight / market-reliability retuning (separate ADR; sample too small).
- No auto-apply of money or auto-approval of cards (ADR-0007 stays).
- No retroactive re-grading of settled v1 history.
- No "half-migrated" production state — the version constant guarantees all-or-nothing at the UI, and the shadow ledger guarantees all-or-nothing at settlement.

## Rough effort

Phase 1 ≈ 0.5 day (docs). Phases 2–3 ≈ 1–2 days (the real settlement work + tests). Phase 4 ≈ 1 day (the reconciliation proof — do not rush this). Phases 5–6 ≈ 1 day. Phase 7 ≈ 0.5 day + owner review. **Total ≈ 4–5 focused days, gated at Phase 4.** The reconciliation proof (Phase 4) is the load-bearing safety step; everything before it is reversible and money-neutral by construction.
