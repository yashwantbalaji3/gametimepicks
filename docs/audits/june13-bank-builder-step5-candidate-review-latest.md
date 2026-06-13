# Bank Builder Step 5 candidate review — June 13

State: $3,623.97 · 4-0 · Step 5/5 · target $10,000. Required combined ≥ +176 (decimal ≥ 2.759).
Preference (NOT a mandate): 2 legs, 1 NBA + 1 World Cup, ideally Brazil vs Morocco.

## Candidate order evaluated
1. **NBA + Brazil WC** — FAIL. No June-13 World Cup data exists (no `API_FOOTBALL` key). No
   Brazil odds/model probability → leg cannot be sourced without fabrication.
2. **NBA + any June-13 WC** — FAIL. Same: zero June-13 WC odds/projections.
3. **WC + MLB** — FAIL. No June-13 WC data; June-13 MLB is schedule-only (no odds/model).
4. **NBA + MLB** — FAIL. June-13 MLB board has a real schedule but NO odds/model probabilities
   (dry-run skipped the paid fetch). An MLB leg with no real odds/model cannot clear the gates.
5. **Any cross-sport 2-leg** — FAIL. Only NBA has real odds/model for June 13; no second
   real-odds cross-sport leg exists.
6. **No card → Step 5 Review Pending.**

Additional: an NBA-only 2-leg card (both legs from Game 5) violates the no-same-game-correlation
gate and is not ladder-valid.

## Decision: REVIEW PENDING (no card)
- Brazil leg existed? No (no June-13 WC data).
- NBA leg existed? Yes (real odds/model — but it has no eligible cross-sport partner).
- Card cleared? No.
- Rejection reason (one line): only NBA has real June-13 odds/model; the only possible second
  legs (WC, MLB) lack real odds, so no compliant cross-sport ≥+176 card can be built, and an
  NBA-only card fails the correlation gate.

`/bank-builder` keeps the honest "Step 5 review pending · Review final step" panel (PR #467).
No card invented. Bank Builder state unchanged.

## Unblock path
A second sport's real June-13 odds+model (WC via an API_FOOTBALL key, or MLB via a paid
non-dry-run odds run) giving a non-correlated cross-sport leg at the required combined price.
