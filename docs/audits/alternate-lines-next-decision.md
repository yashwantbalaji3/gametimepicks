# Alternate Lines — Next Decision

> Decision memo after the 2026-06-04 MLB shadow spike (10 credits). Finding:
> alternate markets exist but are **one-sided Over-only ladders** (two-way 0/428,
> de-vig blocked, not launch-eligible). Raw data is local-only/gitignored.

## The question
Now that we know the current provider's MLB alternate props are one-sided, what
do we do next?

## Options

1. **Do not pursue one-sided alternates (status quo).**
   - Keep the tooling + findings; surface nothing. Zero further spend.
   - Honest: one-sided rungs can't be de-vigged → can't clear the launch gate.

2. **Search for a two-way alternate source first** (research, then maybe a small
   approval-gated probe).
   - Only path to a *validated* alternate edge. May still come back one-sided.
   - Cost: research is free; a probe is a separate ≤50-credit approval.

3. **Display-only ladder, no edge claim.**
   - Show the Over ladder (line → odds → payout) with strictly neutral copy
     ("higher line / longer odds / bigger payout"), anchored on the de-vigged
     **main** line. No "safe/better/guaranteed". No validated-edge claim.
   - Needs no de-vig of the rungs; it's a UX decision, not a model change.

4. **Raw-implied calibration study (one-sided), explicitly weaker than de-vig.**
   - Compare Over-rung hit rate to *raw* (vig-inclusive) implied. Useful as a
     diagnostic only; the vig makes it a biased, conservative baseline — **not** a
     market-beat claim and **not** a launch path.

5. **Spend another small spike on markets 3+4** (`pitcher_strikeouts_alternate`,
   `batter_hits_runs_rbis_alternate`) **only if you want characterization.**
   - Very likely one-sided too (same provider pattern) → unlikely to change the
     conclusion. Not recommended unless you specifically want them mapped.

## Recommendation
- **Do not launch alternate lines.** (One-sided → de-vig blocked → fails the gate.)
- **Investigate a two-way source first** (Option 2, research stage — free). Only
  if a genuine paired-odds source is identified should a further paid probe be
  considered (separately approved, ≤50 credits).
- If the product goal is simply *more options for users* rather than a validated
  edge, **Option 3 (display-only ladder, neutral copy)** is the lowest-risk way
  to use what we already have — but that is a deliberate UX decision, not a v2
  launch, and must carry no edge/"safe"/"better" language.
- **Do not** spend on markets 3+4 right now (Option 5) — low information value.

## Guardrails carried forward
- No de-vig claim on one-sided rungs. No "safe"/"better hit rate"/"guaranteed".
- Any future fetch is paid → STOP-and-ask. Raw responses stay gitignored.
- Alternate lines stay out of official projections/optimizer/Suggested Parlays
  until a two-way source clears the hardened gate + operator approval.

*Decision memo only. No public change; nothing wired.*
