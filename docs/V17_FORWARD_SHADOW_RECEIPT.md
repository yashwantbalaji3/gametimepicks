# v1.7 — Forward shadow receipt (Phase H)

**Status:** `SHADOW_RUNNING` — no public selection has changed. **Adoption:** `NOT_YET`.
**Registered:** 2026-09-22, before the first forward product date the shadow judges (2026-09-22 ET).
**Ledger:** `data/internal/products/selector-shadow/ledger.json` (rebuilt nightly) · day files `<date>.json` ·
positions `state.json`. **Code:** `app/src/lib/products/selector/{policies,select,shadow}.mjs`,
`app/scripts/products/{build-selector-shadow,grade-selector-shadow}.mjs`.

## 1. Frozen forward policy (exact ids — the hash is the JSON of the policy and its ladder)

| Product | Role | Policy | Policy id (see `policies.mjs`, `policyId()`) |
|---|---|---|---|
| Bank Builder | control | BB-LEGACY | `BB-LEGACY@<hash>` — the live selector's rules as data |
| Bank Builder | shadow, primary | **BB-C1** | safest-fit Lane B at the rung's own price |
| Bank Builder | shadow, secondary | **BB-C2b** | BB-C1 + relative no-play floor (0.90 × best of the last 7 days at that rung; min 3 days) |
| Moonshot | control | MS-LEGACY | `moonshot@2` as data |
| Moonshot | shadow, primary | **MS-C1** | MS-LEGACY + floor 0.20 / 0.32 (final) |
| Moonshot | shadow, secondary | **MS-C4** | MS-C1 + one placement per lane per 3 days |

Frozen with them: eligibility version = ProductEligibleLeg v1 (`contract.mjs`, registry-derived, gate F1
policy `ADMITTED_PENDING_FOUNDER_DECISION`); no-play reason codes (`select.mjs NO_PLAY`); leg-count rules
(BB 2–4, MS 2); concentration policy (forbid same event / same entity / opponent; record family, cross-sport,
overlapping start); odds requirement (owned price captured before the as-of instant, −650..+400, ≤12 h old);
settlement semantics (won carries real payout, lost restarts at seed, push holds, pending holds the lane).

## 2. How it runs

- `daily-products` (11:41 UTC) and the `nightly-settle` roll-forward both publish the shadow for the product
  date **at the same instant the live product publishes**; the first publication of a date wins and is never
  rewritten (the S7 lesson).
- `nightly-settle` grades shadow cards from the committed official linescores; pending is never a loss.
- Every day file carries every policy's card or its `NO_QUALIFYING_PLAY` reason, the receipt (policy id,
  as-of, pool size, constructions considered / reaching / concentrated, probability basis), and the
  availability summary for every sport.

## 3. Observation condition (preregistered, `shadow.mjs adoptionGate`)

A shadow policy becomes **eligible for an adoption receipt** when all hold: ≥ 20 decided lane-days;
per-step survival ≥ the control's; published on ≥ 50% of the control's placed days; zero guard failures.
The gate never adopts. The adoption receipt (§J3) is written by hand and must state what improved, the
sample, what did not improve, uncertainty, known limitations, and why the policy is safer or more useful.

## 4. Observed dates

| Date | Note |
|---|---|
| 2026-09-21 | seeded from the real publication instant (10:57Z): 3-game slate; every policy placed Lane A at +139 / +300 and declined Lane B (`CONCENTRATION_TOO_HIGH`: only one game left, every reaching construction shared it) |

## 5. Next decision

- **Condition:** the gate reports `ELIGIBLE_FOR_ADOPTION_RECEIPT` for BB-C1 or the MLB season ends
  (regular season 2026-09-27; the shadow keeps running through the postseason's thinner slates, where
  `INSUFFICIENT_CANDIDATES` is the expected state).
- **Earliest plausible date:** 20 decided lane-days at two lanes a day is ~10 product days → 2026-10-02 if
  every day places, later in the postseason.
- **What would stop it:** a guard failure (`guardLegs` refusing a leg the artifact called eligible), a day
  file rewritten after publication, or a settlement disagreement with `mr-dub/settled/<date>.json` on a leg
  both graded.
