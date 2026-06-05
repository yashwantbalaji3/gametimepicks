# Suggested-Parlay Depth Policy + June 5 Before/After (2026-06-05)

> Target: 3–5 real cards per risk per sport (NBA/MLB/Mixed) when supply supports
> it. Never pad/fabricate. In-memory simulation of the new Low-Risk gate on June
> 5's legPool — NO data written, NO paid regeneration.

## June 5 publicRiskSections by risk × sport — CURRENT vs PROPOSED
(Proposed = re-running `generate_public_risk_sections` with the new Low-Risk
form/price gate; per-bucket target 6 from #281.)

| risk | CURRENT (nba/mlb/multi) | PROPOSED (nba/mlb/multi) |
|------|------------------------|--------------------------|
| low | 4 / 4 / 4 | **0 / 6 / 0** |
| medium | 0 / 4 / 4 | 0 / 6 / 6 |
| high | 0 / 4 / 4 | 0 / 6 / 6 |
| longshot | 0 / 4 / 4 | 0 / 6 / 6 |

## What changed and why (honest)
- **NBA Low → 0.** Every NBA leg's recent form is stale regular-season data
  (latest 2026-04-12 — the provider season-type bug), so it fails the trust gate.
  This is correct fail-closed behavior, not padding-removal. Once the provider fix
  lands and a fresh slate generates with real playoff logs, NBA Low repopulates
  from legs with genuine ≥80% L10.
- **Mixed Low → 0.** A Mixed Low card needs a Low-eligible NBA leg; none exist
  (all NBA form stale). Mixed Medium/High still fill (6 each).
- **MLB Low = 6**, all genuinely conservative: e.g. Walton -158 (L10 80%),
  Wacha -120 (L10 90%, near-even exception), Gelof -155 (90%), Rafaela -182 (90%),
  Taveras -171 (80%). Plus-money / sub-80% legs are gone.
- **Keldon Johnson card no longer in Low** (stale form → excluded).

## Target (3–5/risk/sport) vs reality on June 5
- **MLB:** Low 6, Medium 6, High 6, Longshot 6 — meets/exceeds 3–5 (pre-display
  caps; #278 display caps then trim to the published view).
- **NBA:** 0 across all risks **for Low specifically** because form is stale;
  NBA cards only exist where form is trusted. Honest supply/data limit, not padding.
- **Mixed:** Low 0 (no eligible NBA leg), Medium/High/Longshot 6 each.

## Where shortfalls remain (honest)
1. **NBA recent-form is stale** (provider bug) → no trusted NBA form on June 5 →
   NBA/Mixed Low empty. Fixed in code for future slates; June 5 needs regen.
2. **MLB has no dated `recentGames` provenance** — trust currently defers to
   `recentSeries`. Adding MLB dated provenance (future pipeline work) would let
   the staleness guard cover MLB too.
3. June 5 itself won't change without a **paid regeneration** (STOP/approval).

## No padding / honesty
Sections that can't fill with trusted, qualifying real legs stay smaller (or
empty) with honest empty-state copy — never padded or fabricated.

*Simulation only. No generated data written. No projection/scoring/grading change.*
