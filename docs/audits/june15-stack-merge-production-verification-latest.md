# June 15 — stack merge + production verification

## Merge
The PRs were **stacked** (#490 ← #491 ← #492 ← #493), so the #493 branch was a superset of
all four. Retargeted #493 → `main` and **squash-merged the whole stack as one commit**
(`a96f550` — "Merge World Cup + Parlay Lab + Dual Bank Builder stack (#490–#493)").
#490/#491/#492 **closed as superseded** (their content landed in the combined merge; branches
deleted). #493 **MERGED**. This guarantees #493's corrected lanes are the final state and no
World Cup / API-Football / Parlay Lab work was lost. main base was `cd225d0` (an automated
"morning projections" commit); the stack was based on it, so the merge was CLEAN.

## Final Dual Bank Builder (Run #2, Step 1, pending) — production-verified
- **Lane A** (lower-variance): Iran or Draw (double chance, −600) + Troy Johnston Over 0.5 hits (−163) = **$100 → $188**.
- **Lane B** (higher-return): Mike Trout Under 1.5 hits (−269) + Samad Taylor Over 0.5 hits (−176) = **$100 → $215**.
- No old #492 legs (Uruguay or Draw / Alec Burleson / Otto Lopez / Pavin Smith); **no Over 1.5 hits**.

## Production verification (gametime-picks.vercel.app)
- All routes 200: `/ /today /world-cup /games /picks /parlay-lab /build /bank-builder /results /methodology`.
- Bank Builder: Run #1 completed ($10,376.17 / 5–0) + Dual Step 1 live (lanes above), step ladder.
- Parlay Lab rename live (nav + page title). WC stale "164 props" gone.
- Integrity (prod JSON): Run #1 $10,376.17 / 5-0 / completed; UFC 250 final / ML 6–1.
- Browser (merged main, mobile 375px + desktop): lanes + ladder render, no overflow, 0 console errors.
- Tests 917 pass, tsc clean, build clean (186 pages).

## Settlement
Lanes remain **pending** — not graded (events not final). Checklist:
`docs/audits/dual-bank-builder-step1-settlement-checklist-latest.md`.

## Honest limitations
World Cup player-prop layer remains the documented next increment (gated `integration_pending`).
Custom domain (gametimepicks.yashwantbalaji.com) not verified — not confirmed active for this project.
