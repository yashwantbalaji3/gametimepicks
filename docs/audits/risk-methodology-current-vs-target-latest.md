# Risk Methodology — Current vs Target (2026-06-05)

> What assigns Low/Medium/High/Longshot, current Low criteria vs the user's
> intended policy, and the implemented fix. No projection/grading math change.

## Where risk is assigned
- **Pipeline** `pipeline/parlay_optimizer.py`:
  - `PUBLIC_RISK_SECTION_SPECS` — risk SECTION = **combined American odds band**
    (low < +300, medium 300–599, high 600–999, longshot ≥ 1000) + leg-count band.
  - `generate_public_risk_sections` — builds each section's cards from the leg pool.
- **Display** `app/src/lib/published-cards.ts` + `parlay-volume-discipline.ts` —
  picks/caps which generated cards render. Does NOT re-classify risk.
- **Grading** `byPublicSection` / `bySportBucket` — grades exactly the generated
  publicRiskSections. (So display must not diverge — risk must be fixed at generation.)

## Current LOW criteria (before fix)
- Combined 2–3-leg American odds **< +300**. That's it.
- **No** per-leg odds floor (plus-money legs allowed).
- **No** per-leg recent-form requirement (L10 ignored).
- **No** trust/staleness guard (stale or missing form allowed).
- Market exclusions: only the global supported-market gate.
- Exposure: same-game cap (2) + downstream diversity caps; not risk-specific.

## Target LOW policy (user)
- Per-leg **L10 hit rate ≥ 80%** (over the last 10 games).
- Strongly prefer **negative odds / high implied probability**; plus-money legs
  should not be Low unless strict exceptional rules pass.
- **Fail closed** when recent form is missing or untrusted (e.g. stale).
- Consider all methodology factors (form, odds, model prob, market, exposure,
  data completeness) — but **no public "V2" labels or edge claims**.

## Implemented fix (`low_risk_leg_eligible`, pipeline, future-slate)
A leg may enter LOW only if ALL hold:
1. Supported Over/Under prop with a known line.
2. **Trusted, non-stale form** — when dated `recentGames` exist, the latest game
   must be within 21 days of the slate (catches NBA's stale regular-season logs).
   When only `recentSeries` exists (MLB daily source), trust defers to (3).
3. `recentSeries` has **≥ 10** values and **L10 ≥ 80%** for the chosen side
   (pushes excluded). Missing/short series → fail closed.
4. **Price floor**: odds ≤ **-150**, OR between -150 and +110 with the stricter
   **L10 ≥ 90%**. Plus-money beyond +110 is never Low.

Medium / High / Longshot are unchanged (higher-variance legs still flow there).
No padding — a thin eligible pool yields fewer real Low cards. This is a
**curation/classification** change, not a projection/scoring/grading change.

## Mapping factors → where used
| factor | used in LOW gate? |
|--------|-------------------|
| L10 / L5 recent form | **yes** (L10 ≥ 80%, trust/staleness) |
| odds / implied prob | **yes** (price floor) |
| model probability | indirectly (drives the leg's eligibility upstream) |
| market type | yes (supported-market gate upstream) |
| player/game exposure | yes (downstream diversity caps, unchanged) |
| sport context | yes (NBA staleness via dated provenance) |
| data completeness | **yes** (fail-closed on missing/short series) |
| pending/scratch/DNP | upstream R1–R5 guardrails (unchanged) |

*Future-slate. June 5 needs regeneration (paid) to reflect — not run here.*
